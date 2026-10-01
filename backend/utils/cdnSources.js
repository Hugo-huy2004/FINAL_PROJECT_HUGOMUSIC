const crypto = require('crypto');
const { mintToken } = require('./playbackToken');

// Multi-CDN: GET /api/songs/:id/playback trả về URL ĐÃ KÝ của cùng một bài trên MỌI CDN đang bật;
// client tự chọn CDN theo độ trễ đo được và chuyển CDN khi lỗi (frontend/src/utils/cdnSteering.ts).
// Server chỉ ký — không quyết định dùng CDN nào, vì chỉ client mới đo được đường mạng của chính nó.
//
//   CDN_URLS="cloudflare=https://cdn.example.com,bunny=https://hugo.b-cdn.net"   (thứ tự = ưu tiên ban đầu)
//   BUNNY_TOKEN_KEY=<Token Authentication Key của pull zone>
//
// Mỗi CDN một kiểu token:
//   cloudflare — Worker của mình (worker/src/index.js) kiểm chữ ký HMAC của utils/playbackToken.js ở ?token=;
//                Worker tự gắn token vào các URI con khi trả playlist HLS.
//   bunny      — Token Authentication V2 của Bunny (HMAC-SHA256, "HS256-", base64url). HLS dùng "directory
//                token" nhúng trong ĐƯỜNG DẪN (/bcdn_token=…/hls/<id>/master.m3u8) để hls.js phân giải URL
//                đoạn tương đối vẫn giữ token — cùng lý do Worker ký theo tiền tố hls/<id>.

function parseCdns(raw = process.env.CDN_URLS || '') {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i).trim(), base: pair.slice(i + 1).trim().replace(/\/$/, '') };
  }).filter((c) => c.name && /^https?:\/\//.test(c.base));
}

// Cùng khung hết hạn với mintToken (làm tròn 5 phút): URL tải trước trùng URL phát → dùng lại được cache.
const windowExp = (token) => Number(token.split('.')[0]);

/** Ký URL Bunny theo thuật toán chính thức (BunnyWay/BunnyCDN.TokenAuthentication, nodejs/token.js). */
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

// Khoá R2 (audio/x y.mp3) → đường dẫn URL đã mã hoá từng đoạn (/audio/x%20y.mp3).
const urlPath = (key) => '/' + key.split('/').map(encodeURIComponent).join('/');

/** Danh sách nguồn phát theo thứ tự ưu tiên mặc định: [{ cdn, file, hls }]. */
function playbackSources({ fileKey, hlsKey }, cdns = parseCdns(), bunnyKey = process.env.BUNNY_TOKEN_KEY) {
  const out = [];
  for (const c of cdns) {
    if (c.name === 'bunny') {
      if (!bunnyKey) continue; // chưa cấu hình khoá → không đưa ra URL chắc chắn 403
      const exp = windowExp(mintToken(fileKey || hlsKey));
      const hlsDir = hlsKey ? `/${hlsKey.replace(/[^/]+$/, '')}` : null;
      out.push({
        cdn: c.name,
        file: fileKey ? signBunny(c.base, urlPath(fileKey), bunnyKey, exp) : null,
        hls: hlsKey ? signBunny(c.base, urlPath(hlsKey), bunnyKey, exp, { directory: hlsDir }) : null,
      });
    } else {
      // Worker của mình (hoặc CDN nào dùng cùng kiểu token ?token=).
      out.push({
        cdn: c.name,
        file: fileKey ? `${c.base}${urlPath(fileKey)}?token=${encodeURIComponent(mintToken(fileKey))}` : null,
        hls: hlsKey ? `${c.base}${urlPath(hlsKey)}?token=${encodeURIComponent(mintToken(hlsKey))}` : null,
      });
    }
  }
  return out;
}

module.exports = { playbackSources, parseCdns, signBunny };

if (require.main === module) {
  const assert = require('assert');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'self-check';
  // Vector sinh bằng code chính thức của Bunny (signUrl, nodejs/token.js) với key "test-key".
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
  const src = playbackSources({ fileKey: 'audio/a.mp3', hlsKey: 'hls/abc/master.m3u8' }, cdns, 'k');
  assert.deepStrictEqual(src.map((s) => s.cdn), ['cloudflare', 'bunny'], 'giữ thứ tự ưu tiên');
  assert.match(src[0].file, /^https:\/\/cdn\.x\/audio\/a\.mp3\?token=\d+\./);
  assert.match(src[1].hls, /\/bcdn_token=HS256-[\w-]+&token_path=%2Fhls%2Fabc%2F&expires=\d+\/hls\/abc\/master\.m3u8$/);
  assert.strictEqual(playbackSources({ fileKey: 'audio/a.mp3' }, cdns, '').length, 1, 'thiếu khoá Bunny → bỏ Bunny');
  assert.strictEqual(src[0].hls.includes('master.m3u8'), true);
  console.log('cdnSources self-check: ok');
}
