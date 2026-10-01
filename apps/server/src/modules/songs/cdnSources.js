const crypto = require('crypto');
const { mintToken } = require('hugo-stream');

// Multi-CDN: GET /api/songs/:id/playback returns the SIGNED URL of the same song on EVERY enabled CDN;
// The client chooses the CDN itself according to the measured latency and switches CDN when it fails (createSteering of hugo-stream).
// The server only signs — does not decide which CDN to use, because only the client can measure its own network.
//
// CDN_URLS="cloudflare=https://cdn.example.com,bunny=https://hugo.b-cdn.net" (order = initial priority)
// BUNNY_TOKEN_KEY=<Token Authentication Key of pull zone>
//
// Each CDN has a token type:
// cloudflare — My worker (apps/edge/src/index.js) checks the hugo-stream token at ?token=;
// Workers automatically attach tokens to sub-URIs when returning the HLS playlist.
// bunny — Bunny Authentication Token V2 (HMAC-SHA256, "HS256-", base64url). HLS uses "directory
// token" embedded in the PATH (/bcdn_token=…/hls/<id>/master.m3u8) for hls.js to resolve the URL
// The relative segment still holds the token — the same reason the Worker signs with the hls/<id> prefix.

function parseCdns(raw = process.env.CDN_URLS || '') {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i).trim(), base: pair.slice(i + 1).trim().replace(/\/$/, '') };
  }).filter((c) => c.name && /^https?:\/\//.test(c.base));
}

// Same expiration frame as mintToken (rounded to 5 minutes): Preload URL is the same as broadcast URL → cache can be reused.
const windowExp = (token) => Number(token.split('.')[0]);

/** Sign Bunny URLs according to the official algorithm (BunnyWay/BunnyCDN.TokenAuthentication, nodejs/token.js). */
function signBunny(base, path, key, expires, { directory = null } = {}) {
  const signaturePath = directory || path;
  const signingData = directory ? `token_path=${directory}` : '';
  const token = 'HS256-' + crypto.createHmac('sha256', key)
    .update(signaturePath).update(String(expires)).update(signingData)
    .digest('base64url');
  if (directory) {
    return `${base}/bcdn_token=${token}&token_path=${encodeURIComponent(directory)}&expires=${expires}${path}`;
  }
  return `${base}${path}?token=${token}&expires=${expires}`;
}

// R2 key (audio/x y.mp3) → fragment-encoded URL path (/audio/x%20y.mp3).
const urlPath = (key) => '/' + key.split('/').map(encodeURIComponent).join('/');

/** Source list in default priority order: [{ cdn, file, hls }]. */
async function playbackSources({ fileKey, hlsKey }, cdns = parseCdns(), bunnyKey = process.env.BUNNY_TOKEN_KEY) {
  const mint = (key) => mintToken(key, process.env.JWT_SECRET);
  const out = [];
  for (const c of cdns) {
    if (c.name === 'bunny') {
      if (!bunnyKey) continue; // no key configured → does not give a solid 403 URL
      const exp = windowExp(await mint(fileKey || hlsKey));
      const hlsDir = hlsKey ? `/${hlsKey.replace(/[^/]+$/, '')}` : null;
      out.push({
        cdn: c.name,
        file: fileKey ? signBunny(c.base, urlPath(fileKey), bunnyKey, exp) : null,
        hls: hlsKey ? signBunny(c.base, urlPath(hlsKey), bunnyKey, exp, { directory: hlsDir }) : null,
      });
    } else {
      // My worker (or any CDN that uses the same token type ?token=).
      out.push({
        cdn: c.name,
        file: fileKey ? `${c.base}${urlPath(fileKey)}?token=${encodeURIComponent(await mint(fileKey))}` : null,
        hls: hlsKey ? `${c.base}${urlPath(hlsKey)}?token=${encodeURIComponent(await mint(hlsKey))}` : null,
      });
    }
  }
  return out;
}

module.exports = { playbackSources, parseCdns, signBunny };

if (require.main === module) (async () => {
  const assert = require('assert');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'self-check';
  // Vector generated using Bunny's official code (signUrl, nodejs/token.js) with key "test-key".
  assert.strictEqual(
    signBunny('https://hugo.b-cdn.net', urlPath('audio/a b.mp3'), 'test-key', 1790000000),
    'https://hugo.b-cdn.net/audio/a%20b.mp3?token=HS256-m-ADQjyChStz2piKifIRHsAwOUkf-sp52eHbNWLBGPs&expires=1790000000',
  );
  assert.strictEqual(
    signBunny('https://hugo.b-cdn.net', '/hls/abc/master.m3u8', 'test-key', 1790000000, { directory: '/hls/abc/' }),
    'https://hugo.b-cdn.net/bcdn_token=HS256-_EBhgeKbuZEWz3qRnRwIW8UOrz73TfNtuyFWmzA3zUk&token_path=%2Fhls%2Fabc%2F&expires=1790000000/hls/abc/master.m3u8',
  );

  const cdns = parseCdns('cloudflare=https://cdn.x/, bunny=https://hugo.b-cdn.net, bad, x=ftp://no');
  assert.deepStrictEqual(cdns.map((c) => c.name), ['cloudflare', 'bunny']);
  const src = await playbackSources({ fileKey: 'audio/a.mp3', hlsKey: 'hls/abc/master.m3u8' }, cdns, 'k');
  assert.deepStrictEqual(src.map((s) => s.cdn), ['cloudflare', 'bunny'], 'giữ thứ tự ưu tiên');
  assert.match(src[0].file, /^https:\/\/cdn\.x\/audio\/a\.mp3\?token=\d+\./);
  assert.match(src[1].hls, /\/bcdn_token=HS256-[\w-]+&token_path=%2Fhls%2Fabc%2F&expires=\d+\/hls\/abc\/master\.m3u8$/);
  assert.strictEqual((await playbackSources({ fileKey: 'audio/a.mp3' }, cdns, '')).length, 1, 'thiếu khoá Bunny → bỏ Bunny');
  assert.strictEqual(src[0].hls.includes('master.m3u8'), true);
  console.log('cdnSources self-check: ok');
})();
