// Self-check the transfer plan: node scripts/check-transition-plan.mjs (Node ≥ 23 runs straight .ts)
import assert from 'node:assert/strict';
import { planTransition, gainFor, TARGET_LUFS } from '../src/audio/transitionPlan.ts';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const song = (t, extra = {}) => ({ duration: 200, transition: t, ...extra });

// Volume: loud songs are lowered to the standard level, small songs are not amplified, not analyzed, then lowered to medium.
near(gainFor({ lufs: TARGET_LUFS }), 1);
near(gainFor({ lufs: -8 }), Math.pow(10, -8 / 20));
assert.equal(gainFor({ lufs: -24 }), 1);
assert.ok(gainFor(undefined) < 1);

const a = song({ trimStart: 0.5, trimEnd: 196, bpm: 120, beatOffset: 0.6, beatConfidence: 0.5, outroStart: 188 });
const b = song({ trimStart: 1.2, bpm: 122, beatOffset: 1.35, beatConfidence: 0.5 });

// Seamless: start close to the end of the real music (skip the last 4 seconds of silence), the next song skips the first silence.
let p = planTransition(a, b, 'gapless', 6);
near(p.at, 196 - 0.12); assert.equal(p.nextStart, 1.2); assert.equal(p.kind, 'gapless');

// Crossfade: ends right when the music ends.
p = planTransition(a, b, 'crossfade', 6);
near(p.at + p.fadeMs / 1000, 196); assert.equal(p.fadeMs, 6000);

// AutoMix: enters the outro, falls on the correct beat, length = integer number of bars, next song enters on the first beat.
p = planTransition(a, b, 'automix', 6);
assert.equal(p.kind, 'beatmatch');
near(((p.at - 0.6) / 0.5) % 1, 0, 1e-6);            // right beat
near((p.fadeMs / 1000) / 2 % 1, 0, 1e-6);            // bar multiples (4 × 0.5 s)
assert.ok(p.at <= 188 && p.at + p.fadeMs / 1000 <= 196 + 1e-6, JSON.stringify(p));
assert.equal(p.nextStart, 1.35);

// Much tempo difference → only 1 bar.
p = planTransition(a, song({ bpm: 150, beatOffset: 0.2, beatConfidence: 0.5 }), 'automix', 6);
assert.equal(p.fadeMs, 2000);

// Half-beat tempo (61 ≈ 122/2) is still considered matching → fade many bars, not 1 bar.
p = planTransition(a, song({ bpm: 60.5, beatOffset: 0.3, beatConfidence: 0.5 }), 'automix', 6);
assert.ok(p.fadeMs > 2000, JSON.stringify(p));

// Not enough beat data → normal crossfade.
assert.equal(planTransition(song({ trimEnd: 190 }), b, 'automix', 6).kind, 'crossfade');

// Same album → always seamless; The article is too short → seamless.
assert.equal(planTransition(song({}, { albumKey: 'x' }), song({}, { albumKey: 'x' }), 'automix', 6).kind, 'gapless');
assert.equal(planTransition({ duration: 2 }, b, 'crossfade', 6).kind, 'gapless');

console.log('transition plan self-check: ok');
