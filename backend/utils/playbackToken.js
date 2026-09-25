const crypto = require('crypto');

/**
 * CỔNG KÝ HỢP NHẤT CHO MỌI LUỒNG PHÁT NHẠC
 *
 * Mọi byte nhạc (qua Worker CDN hay proxy Node) chỉ được phục vụ khi kèm một
 * token do backend cấp ở GET /api/songs/:id/playback. Token cho phép nghe trọn
 * bài, cả HLS lẫn file gốc.
 *
 * Ai được cấp: thành viên đã đăng nhập; khách chưa đăng nhập được nghe trọn
 * GUEST_FREE_SONGS bài khác nhau mỗi ngày, sang bài kế tiếp thì bắt buộc đăng
 * nhập (guestMayPlay). Việc đếm nằm ở MÁY CHỦ — sửa JS ở trình duyệt không
 * lấy thêm được token.
 *
 * Ký theo TIỀN TỐ tài nguyên: một bài HLS gồm hàng chục đoạn .ts mà hls.js
 * phân giải URL đoạn theo đường dẫn tương đối, nên ký theo `hls/<songId>` cho
 * phép gắn cùng một token cho mọi đoạn của bài đó.
 *
 * Định dạng: <exp>.<sig>   sig = HMAC-SHA256("<prefix>|<exp>"), exp = giây Unix.
 *
 * Worker có bản cài đặt song song bằng Web Crypto (worker/src/index.js).
 * Chạy `node utils/playbackToken.js` để tự kiểm tra.
 */

const TTL_SECONDS = 300;
const GUEST_FREE_SONGS = 3;
const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET chưa được cấu hình');
  return s;
}

/** audio/x.mp3 -> audio/x.mp3 ; hls/<id>/low_003.ts -> hls/<id> */
function prefixForKey(key) {
  const hls = /^(hls\/[^/]+)\//.exec(key);
  return hls ? hls[1] : key;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

/**
 * exp làm tròn lên mốc TTL kế tiếp: mọi lần cấp trong cùng một khung 5 phút cho
 * ra CÙNG một token, nên URL tải trước (prefetch) trùng khớp URL phát thật và
 * trình duyệt dùng lại được. Token vì thế sống 5–10 phút.
 */
function mintToken(key) {
  const exp = (Math.floor(Date.now() / 1000 / TTL_SECONDS) + 2) * TTL_SECONDS;
  return `${exp}.${sign(`${prefixForKey(key)}|${exp}`)}`;
}

/** true nếu token hợp lệ, còn hạn và đúng key. */
function verifyToken(key, token) {
  if (!token || typeof token !== 'string') return false;
  const [expStr, sig, extra] = token.split('.');
  if (!sig || extra !== undefined) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  const expected = Buffer.from(sign(`${prefixForKey(key)}|${exp}`));
  const got = Buffer.from(sig);
  // So sánh thời gian hằng định để không lộ thông tin qua thời gian phản hồi.
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// ponytail: đếm trong bộ nhớ của một tiến trình Node, theo IP. Chạy nhiều tiến
// trình thì chuyển sang Redis (SADD + EXPIRE); nhiều người chung một IP (NAT)
// dùng chung hạn mức.
const guests = new Map(); // ip -> { songs: Set<songId>, resetAt }

/** Khách ở `ip` có được nghe `songId` không. Nghe lại bài đã tính thì không trừ lượt. */
function guestMayPlay(ip, songId, now = Date.now()) {
  let g = guests.get(ip);
  if (!g || g.resetAt <= now) {
    if (guests.size > 10000) for (const [k, v] of guests) if (v.resetAt <= now) guests.delete(k);
    g = { songs: new Set(), resetAt: now + GUEST_WINDOW_MS };
    guests.set(ip, g);
  }
  if (g.songs.has(songId)) return true;
  if (g.songs.size >= GUEST_FREE_SONGS) return false;
  g.songs.add(songId);
  return true;
}

module.exports = { mintToken, verifyToken, prefixForKey, guestMayPlay, TTL_SECONDS, GUEST_FREE_SONGS };

if (require.main === module) {
  const assert = require('assert');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'self-check';
  const full = mintToken('audio/a.mp3');
  assert.strictEqual(verifyToken('audio/a.mp3', full), true);
  assert.strictEqual(verifyToken('audio/b.mp3', full), false, 'token is bound to its key');
  assert.strictEqual(mintToken('audio/a.mp3'), full, 'same window -> same token (prefetch reuse)');
  assert.strictEqual(verifyToken('hls/abc/low_007.ts', mintToken('hls/abc/master.m3u8')), true, 'one token covers every segment');
  const [, sig] = full.split('.');
  assert.strictEqual(verifyToken('audio/a.mp3', `1.${sig}`), false, 'expired');
  assert.strictEqual(verifyToken('audio/a.mp3', `${full}.x`), false);

  const t0 = 1_000_000;
  for (const id of ['s1', 's2', 's3']) assert.strictEqual(guestMayPlay('1.1.1.1', id, t0), true);
  assert.strictEqual(guestMayPlay('1.1.1.1', 's4', t0), false, 'bài thứ 4 phải đăng nhập');
  assert.strictEqual(guestMayPlay('1.1.1.1', 's2', t0), true, 'nghe lại / xin token mới giữa bài không trừ lượt');
  assert.strictEqual(guestMayPlay('2.2.2.2', 's4', t0), true, 'đếm riêng từng IP');
  assert.strictEqual(guestMayPlay('1.1.1.1', 's4', t0 + GUEST_WINDOW_MS), true, 'sang ngày mới thì tính lại');
  console.log('playbackToken self-check: ok');
}
