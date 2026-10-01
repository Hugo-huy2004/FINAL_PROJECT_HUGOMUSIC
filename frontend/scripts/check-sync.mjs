// Mô phỏng khớp nhịp nhiều máy: node scripts/check-sync.mjs
// Cam kết cần giữ: từ giây thứ 4 (hết segment HLS đầu) hai máy lệch nhau < 20 ms tới hết bài.
import assert from 'node:assert/strict';
import { controlStep, newSyncCtl, SYNC } from '../src/utils/audio/syncController.ts';

// Số ngẫu nhiên có hạt giống — lần chạy nào cũng ra cùng kết quả.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const uni = (a, b) => a + (b - a) * rnd();

function device(kind) {
  return {
    pos: 0, rate: 1, pendingRate: null, rateAt: 0, frozenUntil: -1, seekTarget: 0,
    ctl: newSyncCtl(),
    clockErr: uni(-0.006, 0.006),                 // sai số đồng hồ so với server (lọc RTT nhỏ nhất)
    skew: uni(-50e-6, 50e-6),                    // đồng hồ phát nhạc chạy nhanh/chậm
    noise: kind === 'web' ? 0.003 : 0.008,        // nhiễu khi đọc vị trí
    seekCost: kind === 'web' ? [0.15, 0.5] : [0.4, 1.5],
    catchUpErr: 0.12,                             // sai số của "chi phí vào nhạc" đã học
  };
}

function run(kinds, T = 60, dt = 0.01) {
  const devs = kinds.map(device);
  for (const d of devs) d.pos = uni(-0.8, 0.8);    // mỗi máy vào trễ/sớm khác nhau
  let worstAfter4 = 0;
  const samples = [];
  for (let t = 0, tick = 0; t < T; t += dt, tick++) {
    for (const d of devs) {
      if (t < d.frozenUntil) continue;             // đang tua: đứng yên chờ nạp
      if (d.frozenUntil > 0 && t >= d.frozenUntil) { d.pos = d.seekTarget; d.frozenUntil = -1; }
      if (d.pendingRate !== null && t >= d.rateAt) { d.rate = d.pendingRate; d.pendingRate = null; }
      d.pos += dt * d.rate * (1 + d.skew);
    }
    // Vòng điều khiển mỗi PERIOD_MS, mỗi máy tự đo so với mốc (theo đồng hồ của nó).
    if (tick % Math.round(SYNC.PERIOD_MS / 1000 / dt) === 0) {
      for (const d of devs) {
        if (d.frozenUntil > 0) continue;
        const expected = t + d.clockErr;
        const drift = d.pos - expected + uni(-d.noise, d.noise);
        const a = controlStep(d.ctl, drift);
        if (a.seek) {
          const cost = uni(...d.seekCost);
          d.frozenUntil = t + cost;
          d.seekTarget = t + cost + d.clockErr + uni(-d.catchUpErr, d.catchUpErr);
          d.rate = 1;
        } else if (Math.abs(a.rate - (d.pendingRate ?? d.rate)) > 1e-4) {
          d.pendingRate = a.rate;
          d.rateAt = t + 0.05;                     // lệnh đổi tốc độ có tác dụng sau ~50 ms
        }
      }
    }
    if (t >= 4) {
      const gap = Math.max(...devs.map((d) => d.pos)) - Math.min(...devs.map((d) => d.pos));
      worstAfter4 = Math.max(worstAfter4, gap);
      if (tick % 10 === 0) samples.push(gap);
    }
  }
  return { worstAfter4, samples };
}

const all = [];
let worst = 0;
for (let i = 0; i < 500; i++) {
  const r = run(i % 2 ? ['web', 'native'] : ['native', 'native', 'web']);
  worst = Math.max(worst, r.worstAfter4);
  all.push(...r.samples);
}
all.sort((a, b) => a - b);
const pct = (p) => (all[Math.floor(p * (all.length - 1))] * 1000).toFixed(1);
console.log(`sync sim: median ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · worst ${(worst * 1000).toFixed(1)} ms (sau giây thứ 4)`);
assert.ok(worst < 0.02, `worst gap after 4 s = ${(worst * 1000).toFixed(1)} ms ≥ 20 ms`);
console.log('sync self-check: ok');
