// Cloudflare Worker phục vụ file nhạc/ảnh bìa thẳng từ R2 qua CDN toàn cầu.
//
// Vì sao cần: trước đây mọi byte nhạc phải đi qua backend Node
// (controllers/songController.js -> streamSong), nên nhạc không bao giờ được
// cache ở edge và server Node là nút thắt cổ chai. Worker chạy ngay tại PoP
// gần người nghe (Cloudflare có PoP ở Hà Nội và TP.HCM), đọc thẳng R2 qua
// binding nên không tốn egress và không cần ký request S3.
//
// Quy ước prefix key trong bucket:
//   audio/*    - file gốc      — cần token phát
//   hls/*      - HLS đa tier   — cần token phát (backend/pipeline/jobs/HlsJob.js)
//   covers/*   - ảnh bìa, công khai
// Token do backend cấp (GET /api/songs/:id/playback); luật cấp và định dạng ở
// backend/utils/playbackToken.js — file này là bản cài song song bằng Web Crypto.
//
// Header CORS ở đây cũng xử lý luôn lỗi ORB của Chrome — lý do trước đây phải
// proxy qua Node (xem ghi chú trong songController.js).

const SERVED_PREFIXES = ['audio/', 'covers/', 'hls/'];
// Key có hậu tố ngẫu nhiên nên nội dung không bao giờ đổi -> cache vĩnh viễn.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };
}

// --- CỔNG KÝ HỢP NHẤT --- (xem backend/utils/playbackToken.js)
function prefixForKey(key) {
  const hls = /^(hls\/[^/]+)\//.exec(key);
  return hls ? hls[1] : key;
}

async function hmacBase64Url(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let bin = '';
  new Uint8Array(sig).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Cùng ngữ nghĩa với verifyToken ở backend: token "<exp>.<sig>" còn hạn, đúng key.
async function verifyPlaybackToken(key, token, secret) {
  if (!token || !secret) return false;
  const [expStr, got, extra] = token.split('.');
  if (!got || extra !== undefined) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = await hmacBase64Url(`${prefixForKey(key)}|${exp}`, secret);
  if (expected.length !== got.length) return false;
  // So sánh theo thời gian hằng định: không thoát sớm khi gặp ký tự khác nhau.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// "bytes=1000-2000" -> { offset, length } cho R2 binding.
// Trả null nếu không parse được để rơi về trả nguyên file thay vì lỗi.
function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;

  if (startRaw === '' && endRaw === '') return null;
  // "bytes=-500" = 500 byte cuối file
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

// Đọc qua R2 binding KHÔNG tự đi qua cache edge của Cloudflare — header
// Cache-Control chỉ bảo trình duyệt cache, còn edge thì không. Nếu không tự
// cache thì mỗi lượt nghe đều kéo từ R2 gốc, tức là mất đúng lợi ích lớn nhất
// của CDN (người nghe thứ hai ở cùng thành phố vẫn phải đi vòng ra R2).
//
// Khoá cache là URL KHÔNG kèm query: ?token= là quyền truy cập (đã kiểm tra ở
// trên), không phải nội dung. Để token trong khoá thì mỗi token 5 phút là một
// khoá mới, cache gần như không bao giờ HIT.
//
// Cache luôn lưu bản 200 đầy đủ: cache.put ném lỗi với phản hồi 206, nên cách
// cũ (lưu từng khoảng byte) chưa từng lưu được gì — mà <audio> luôn gửi Range.
// cache.match nhận header Range và tự cắt ra 206 từ bản đầy đủ.
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

    // Ảnh bìa công khai; nhạc luôn cần token. Thẻ <audio>/expo-av không gửi
    // được header Authorization nên token đi qua query string.
    if (!key.startsWith('covers/') && !(await verifyPlaybackToken(key, url.searchParams.get('token'), env.JWT_SECRET))) {
      return new Response('Đăng nhập để nghe bài này', { status: 401, headers: corsHeaders() });
    }

    // Playlist HLS: gắn token vào mọi URI con (playlist biến thể, segment), để
    // BẤT KỲ trình phát nào (hls.js, AVPlayer, ExoPlayer) cũng mang token đi tiếp
    // mà không cần hook từng request. Nhỏ và mang token nên không cache ở edge.
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
    // Cache API không có tác dụng trên *.workers.dev (cần tên miền riêng). Ở đó bỏ
    // hẳn cache để khỏi đọc thừa cả tệp từ R2 chỉ để lưu vào một cache không tồn tại.
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
      // Người nghe nhận ngay khoảng byte họ cần; bản đầy đủ được kéo về cache
      // ở nền để các request Range tiếp theo (tua, người nghe khác) đều HIT.
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
    // Tách đôi luồng (tee) vì một ReadableStream chỉ đọc được một lần.
    const [toClient, toCache] = object.body.tee();
    ctx.waitUntil(cache.put(cacheKey, new Response(toCache, { status: 200, headers: fullHeaders() })));
    return new Response(toClient, { status: 200, headers });
  },
};
