// Multi-CDN steering: ranking, EWMA, circuit breaker, exploration, probes.
import assert from 'node:assert/strict';
import { createSteering, ORIGIN } from '../src/index.js';

let t = 0;
const s = createSteering({ now: () => t, rand: () => 0.99, explore: 0.1, openBaseMs: 1000, openMaxMs: 8000, probeEveryMs: 5000 });

// 1. No measurements yet: keep the server's order, origin after every healthy CDN.
assert.deepEqual(s.rank(['edge', 'mirror']), ['edge', 'mirror', ORIGIN]);

// 2. Measurements decide: the faster CDN moves up.
s.success('edge', 900); s.success('mirror', 200);
assert.deepEqual(s.rank(['edge', 'mirror']), ['mirror', 'edge', ORIGIN]);

// 3. EWMA: one slow outlier does not flip the ranking.
s.success('mirror', 2000); // 200·0.7 + 2000·0.3 = 740 < 900
assert.equal(s.rank(['edge', 'mirror'])[0], 'mirror');

// 4. Circuit breaker: a failing CDN drops behind origin, and comes back when the circuit closes.
s.failure('mirror');
assert.deepEqual(s.rank(['edge', 'mirror']), ['edge', ORIGIN, 'mirror']);
t += 1001;
assert.equal(s.rank(['edge', 'mirror'])[0], 'mirror', 'back after 1 s open');

// 5. Repeat failures double the open time, up to a ceiling.
s.failure('mirror'); s.failure('mirror');
assert.equal(s.snapshot().mirror.openUntil - t, 4000, '3rd failure in a row: 1 s · 2² = 4 s');
for (let i = 0; i < 5; i++) s.failure('mirror');
assert.equal(s.snapshot().mirror.openUntil - t, 8000, 'ceiling 8 s');
s.success('mirror', 100);
assert.equal(s.isOpen('mirror'), false, 'a success closes the circuit');

// 6. Everything tripped, origin too: still return every path (retrying beats stopping), earliest to close first.
s.failure('edge'); t += 10; s.failure('mirror'); s.failure(ORIGIN);
assert.deepEqual(s.rank(['edge', 'mirror']), ['edge', 'mirror', ORIGIN]);

// 7. Exploration: rand < explore swaps the top two healthy CDNs.
let t2 = 0;
const e = createSteering({ now: () => t2, rand: () => 0.01, explore: 0.1 });
e.success('a', 100); e.success('b', 500);
assert.deepEqual(e.rank(['a', 'b']).slice(0, 2), ['b', 'a']);

// 8. Active probes: at most once per period per CDN, never while its circuit is open.
let t3 = 10_000;
const p = createSteering({ now: () => t3, probeEveryMs: 5000 });
assert.equal(p.claimProbe('a'), true);
assert.equal(p.claimProbe('a'), false);
t3 += 5000;
assert.equal(p.claimProbe('a'), true);
p.failure('b');
assert.equal(p.claimProbe('b'), false);

console.log('steering: ok');
