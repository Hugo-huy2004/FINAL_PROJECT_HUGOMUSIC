// Kiểm bộ điều hướng multi-CDN (src/utils/cdnSteering.ts): node scripts/check-cdn.mjs
import assert from 'node:assert/strict';
import { createSteering, ORIGIN } from '../src/utils/cdnSteering.ts';

let t = 0;
const s = createSteering({ now: () => t, rand: () => 0.99, explore: 0.1, openBaseMs: 1000, openMaxMs: 8000, probeEveryMs: 5000 });

// 1. Chưa có số đo: giữ thứ tự của server, origin đứng sau mọi CDN khoẻ.
assert.deepEqual(s.rank(['cloudflare', 'bunny']), ['cloudflare', 'bunny', ORIGIN]);

// 2. Số đo quyết định: bunny nhanh hơn → lên đầu.
s.success('cloudflare', 900); s.success('bunny', 200);
assert.deepEqual(s.rank(['cloudflare', 'bunny']), ['bunny', 'cloudflare', ORIGIN]);

// 3. EWMA: một lần chậm đột xuất không lật ngay bảng xếp hạng.
s.success('bunny', 2000); // 200·0,7 + 2000·0,3 = 740 < 900
assert.equal(s.rank(['cloudflare', 'bunny'])[0], 'bunny');

// 4. Circuit breaker: bunny lỗi → xuống sau origin; hết hạn ngắt → trở lại.
s.failure('bunny');
assert.deepEqual(s.rank(['cloudflare', 'bunny']), ['cloudflare', ORIGIN, 'bunny']);
t += 1001;
assert.equal(s.rank(['cloudflare', 'bunny'])[0], 'bunny', 'hết 1 s ngắt thì dùng lại');

// 5. Tái phạm liên tiếp → thời gian ngắt gấp đôi, có trần.
s.failure('bunny'); s.failure('bunny');
assert.equal(s.snapshot().bunny.openUntil - t, 4000, 'lỗi thứ 3 liên tiếp: 1 s · 2² = 4 s');
for (let i = 0; i < 5; i++) s.failure('bunny');
assert.equal(s.snapshot().bunny.openUntil - t, 8000, 'trần 8 s');
s.success('bunny', 100);
assert.equal(s.isOpen('bunny'), false, 'thành công thì đóng mạch');

// 6. Mọi CDN lẫn origin đều ngắt: vẫn trả đủ danh sách (thử lại còn hơn dừng phát), CDN hết ngắt sớm nhất lên trước.
s.failure('cloudflare'); t += 10; s.failure('bunny'); s.failure(ORIGIN);
assert.deepEqual(s.rank(['cloudflare', 'bunny']), ['cloudflare', 'bunny', ORIGIN]);

// 7. Khám phá: rand < explore → đổi chỗ hai CDN khoẻ đứng đầu.
let t2 = 0;
const e = createSteering({ now: () => t2, rand: () => 0.01, explore: 0.1 });
e.success('a', 100); e.success('b', 500);
assert.deepEqual(e.rank(['a', 'b']).slice(0, 2), ['b', 'a']);

// 8. Đo chủ động: tối đa 1 lần / chu kỳ mỗi CDN, không đo CDN đang ngắt.
let t3 = 10_000;
const p = createSteering({ now: () => t3, probeEveryMs: 5000 });
assert.equal(p.claimProbe('a'), true);
assert.equal(p.claimProbe('a'), false);
t3 += 5000;
assert.equal(p.claimProbe('a'), true);
p.failure('b');
assert.equal(p.claimProbe('b'), false);

console.log('cdn steering self-check: ok');
