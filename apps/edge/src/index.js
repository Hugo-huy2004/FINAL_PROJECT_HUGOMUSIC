// Cloudflare Worker serves music/cover art files straight from R2 via global CDN.
//
// Why is it needed: previously every byte of music had to go through the Node backend
// (controllers/songController.js -> streamSong), so the music never works
// Cache at edge and server Node is the bottleneck. Workers run right at PoP
// close to the listener (Cloudflare has PoP in Hanoi and Ho Chi Minh City), read R2 straight through
// binding so it doesn't cost egress and doesn't need to sign the S3 request.
//
// Prefix key convention in bucket:
// audio/* - original file — needs playback token
// hls/* - Multi-tier HLS — needs broadcast token (apps/server/src/pipeline/jobs/HlsJob.js)
// covers/* - cover image, public
// Token issued by the backend (GET /api/songs/:id/playback), which decides who may listen; the format and
// its verification are hugo-stream's, shared with the server, so both sides can never disagree.
//
// The CORS header here also handles Chrome's ORB error — the previous reason
// proxy via Node (see note in songController.js).

import { verifyToken } from 'hugo-stream';

const SERVED_PREFIXES = ['audio/', 'covers/', 'hls/'];
// The key has a random suffix so the content never changes -> cached forever.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };
}

// "bytes=1000-2000" -> { offset, length } cho R2 binding.
// Return null if parsing fails to return the entire file instead of an error.
function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;

  if (startRaw === '' && endRaw === '') return null;
  // "bytes=-500" = last 500 bytes of file
  if (startRaw === '') {
    const suffix = parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const offset = parseInt(startRaw, 10);
  if (!Number.isFinite(offset) || offset >= size) return null;
  const end = endRaw === '' ? size - 1 : Math.min(parseInt(endRaw, 10), size - 1);
  if (end < offset) return null;
  return { offset, length: end - offset + 1 };
}

// Reading through R2 binding does NOT go through Cloudflare's cache edge — header
// Cache-Control only tells the browser to cache, but edge does not. If not self
// cache, each listen is pulled from the original R2, meaning the biggest benefit is lost
// of the CDN (the second listener in the same city still has to detour to R2).
//
// The cache key is the URL WITHOUT query: ?token= is the access right (checked in
// above), not the content. To keep the token in the lock, each token is 5 minutes long
// new key, cache almost never HIT.
//
// Cache always stores the full 200 version: cache.put throws an error with a 206 response, so there's a way
// old (save each byte range) never saved anything — but <audio> always sent Range.
// cache.match takes the Range header and cuts out 206 from the full version.
function cacheKeyFor(request) {
  const url = new URL(request.url);
  url.search = '';
  return url.toString();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    if (!SERVED_PREFIXES.some((p) => key.startsWith(p))) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    // Public cover photo; Music always needs tokens. The <audio>/expo-av tag did not send
    // has the Authorization header so the token goes through the query string.
    if (!key.startsWith('covers/') && !(await verifyToken(key, url.searchParams.get('token'), env.JWT_SECRET))) {
      return new Response('Login required to listen to this song', { status: 401, headers: corsHeaders() });
    }

    // Playlist HLS: attach token to every sub-URI (playlist variant, segment), to
    // ANY player (hls.js, AVPlayer, ExoPlayer) carries tokens forward
    // without hooking each request. Small and carries tokens, so it doesn't cache at the edge.
    if (key.endsWith('.m3u8')) {
      const obj = await env.BUCKET.get(key);
      if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders() });
      const q = `token=${encodeURIComponent(url.searchParams.get('token'))}`;
      const body = (await obj.text())
        .split('\n')
        .map((l) => (l.trim() && !l.startsWith('#') ? `${l.trim()}${l.includes('?') ? '&' : '?'}${q}` : l))
        .join('\n');
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { ...corsHeaders(), 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, max-age=60' },
      });
    }

    const cache = caches.default;
    const cacheKey = cacheKeyFor(request);
    // Cache API has no effect on *.workers.dev (needs separate domain). Leave it there
    // clear the cache to avoid reading the entire file from R2 only to save it to a cache that does not exist.
    const useEdgeCache = !url.hostname.endsWith('.workers.dev');
    if (useEdgeCache && request.method === 'GET') {
      const rangeReq = request.headers.get('Range');
      const hit = await cache.match(new Request(cacheKey, rangeReq ? { headers: { Range: rangeReq } } : {}));
      if (hit) {
        const h = new Headers(hit.headers);
        h.set('X-Edge-Cache', 'HIT');
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    const head = await env.BUCKET.head(key);
    if (!head) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }

    const headers = new Headers(corsHeaders());
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', head.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('ETag', head.httpEtag);
    headers.set('Cache-Control', CACHE_CONTROL);

    const rangeHeader = request.headers.get('Range');
    const range = rangeHeader ? parseRange(rangeHeader, head.size) : null;

    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(head.size));
      return new Response(null, { status: 200, headers });
    }

    headers.set('X-Edge-Cache', 'MISS');
    const fullHeaders = () => {
      const h = new Headers(headers);
      h.delete('X-Edge-Cache');
      h.set('Content-Length', String(head.size));
      return h;
    };

    if (range) {
      const object = await env.BUCKET.get(key, { range });
      if (!object) {
        return new Response('Not found', { status: 404, headers: corsHeaders() });
      }
      // The listener immediately receives about the bytes they need; The full version is pulled to cache
      // in the background so that subsequent Range requests (rewinds, other listeners) all HIT.
      if (useEdgeCache) {
        ctx.waitUntil(
          env.BUCKET.get(key).then((full) => full
            && cache.put(cacheKey, new Response(full.body, { status: 200, headers: fullHeaders() })))
        );
      }
      headers.set('Content-Length', String(range.length));
      headers.set(
        'Content-Range',
        `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`
      );
      return new Response(object.body, { status: 206, headers });
    }

    const object = await env.BUCKET.get(key);
    if (!object) {
      return new Response('Not found', { status: 404, headers: corsHeaders() });
    }
    headers.set('Content-Length', String(head.size));

    if (!useEdgeCache) return new Response(object.body, { status: 200, headers });
    // Split the stream in half (tee) because a ReadableStream can only be read once.
    const [toClient, toCache] = object.body.tee();
    ctx.waitUntil(cache.put(cacheKey, new Response(toCache, { status: 200, headers: fullHeaders() })));
    return new Response(toClient, { status: 200, headers });
  },
};
