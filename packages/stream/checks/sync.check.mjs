// Multi-device sync simulation. Promise kept: from second 4 (after the first HLS segment) devices stay < 20 ms apart.
// Plus the server clock: the lowest-RTT sample wins.
import assert from 'node:assert/strict';
import { controlStep, newSyncCtl, createServerClock, SYNC } from '../src/index.js';

// Seeded random numbers: every run gives the same result.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const uni = (a, b) => a + (b - a) * rnd();

function device(kind) {
  return {
    pos: 0, rate: 1, pendingRate: null, rateAt: 0, frozenUntil: -1, seekTarget: 0,
    ctl: newSyncCtl(),
    clockErr: uni(-0.006, 0.006),                 // clock error vs the server (after lowest-RTT filtering)
    skew: uni(-50e-6, 50e-6),                    // audio clock running fast/slow
    noise: kind === 'web' ? 0.003 : 0.008,        // noise when reading the position
    seekCost: kind === 'web' ? [0.15, 0.5] : [0.4, 1.5],
    catchUpErr: 0.12,                             // error of the learned start-up cost
  };
}

function run(kinds, T = 60, dt = 0.01) {
  const devs = kinds.map(device);
  for (const d of devs) d.pos = uni(-0.8, 0.8);    // every device starts early/late by a different amount
  let worstAfter4 = 0;
  const samples = [];
  for (let t = 0, tick = 0; t < T; t += dt, tick++) {
    for (const d of devs) {
      if (t < d.frozenUntil) continue;             // seeking: frozen while loading
      if (d.frozenUntil > 0 && t >= d.frozenUntil) { d.pos = d.seekTarget; d.frozenUntil = -1; }
      if (d.pendingRate !== null && t >= d.rateAt) { d.rate = d.pendingRate; d.pendingRate = null; }
      d.pos += dt * d.rate * (1 + d.skew);
    }
    // Control loop every PERIOD_MS; each device measures against the timeline by its own clock.
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
          d.rateAt = t + 0.05;                     // a speed change takes effect after ~50 ms
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
console.log(`sync sim: median ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · worst ${(worst * 1000).toFixed(1)} ms (after second 4)`);
assert.ok(worst < 0.02, `worst gap after 4 s = ${(worst * 1000).toFixed(1)} ms ≥ 20 ms`);

// Server clock: true offset +5000 ms; RTTs 80, 10, 40 → the 10 ms sample wins (error ≤ 5 ms).
let local = 0;
const rtts = [80, 10, null, 40];
const clock = createServerClock(async () => {
  const rtt = rtts.shift();
  if (rtt === null) return null;           // a failed ping is skipped
  local += rtt / 2; const server = local + 5000 + (rtt === 10 ? 3 : 30); local += rtt / 2;
  return server;
}, { now: () => local });
await clock.sync(4);
assert.equal(clock.now() - local, 5003, 'offset taken from the lowest-RTT sample');
console.log('sync: ok');
