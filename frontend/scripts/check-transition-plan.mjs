// Tự kiểm bộ lập kế hoạch chuyển bài: node scripts/check-transition-plan.mjs (Node ≥ 23 chạy thẳng .ts)
import assert from 'node:assert/strict';
import { planTransition, gainFor, TARGET_LUFS } from '../src/utils/audio/transitionPlan.ts';

const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const song = (t, extra = {}) => ({ duration: 200, transition: t, ...extra });

// Âm lượng: bài to bị hạ về mức chuẩn, bài nhỏ không bị khuếch đại, chưa phân tích thì hạ vừa.
near(gainFor({ lufs: TARGET_LUFS }), 1);
near(gainFor({ lufs: -8 }), Math.pow(10, -8 / 20));
assert.equal(gainFor({ lufs: -24 }), 1);
assert.ok(gainFor(undefined) < 1);

const a = song({ trimStart: 0.5, trimEnd: 196, bpm: 120, beatOffset: 0.6, beatConfidence: 0.5, outroStart: 188 });
const b = song({ trimStart: 1.2, bpm: 122, beatOffset: 1.35, beatConfidence: 0.5 });

// Liền mạch: bắt đầu sát điểm hết nhạc thật (bỏ 4 s im cuối), bài sau bỏ im đầu.
let p = planTransition(a, b, 'gapless', 6);
near(p.at, 196 - 0.12); assert.equal(p.nextStart, 1.2); assert.equal(p.kind, 'gapless');

// Crossfade: kết thúc đúng lúc hết nhạc.
p = planTransition(a, b, 'crossfade', 6);
near(p.at + p.fadeMs / 1000, 196); assert.equal(p.fadeMs, 6000);

// AutoMix: vào ở outro, rơi đúng phách, độ dài = số nguyên ô nhịp, bài sau vào đúng phách đầu.
p = planTransition(a, b, 'automix', 6);
assert.equal(p.kind, 'beatmatch');
near(((p.at - 0.6) / 0.5) % 1, 0, 1e-6);            // đúng phách
near((p.fadeMs / 1000) / 2 % 1, 0, 1e-6);            // bội số ô nhịp (4 × 0,5 s)
assert.ok(p.at <= 188 && p.at + p.fadeMs / 1000 <= 196 + 1e-6, JSON.stringify(p));
assert.equal(p.nextStart, 1.35);

// Lệch tempo nhiều → chỉ 1 ô nhịp.
p = planTransition(a, song({ bpm: 150, beatOffset: 0.2, beatConfidence: 0.5 }), 'automix', 6);
assert.equal(p.fadeMs, 2000);

// Tempo nửa nhịp (61 ≈ 122/2) vẫn coi là khớp → fade nhiều ô nhịp, không phải 1 ô.
p = planTransition(a, song({ bpm: 60.5, beatOffset: 0.3, beatConfidence: 0.5 }), 'automix', 6);
assert.ok(p.fadeMs > 2000, JSON.stringify(p));

// Không đủ dữ liệu nhịp → crossfade thường.
assert.equal(planTransition(song({ trimEnd: 190 }), b, 'automix', 6).kind, 'crossfade');

// Cùng album → luôn liền mạch; bài quá ngắn → liền mạch.
assert.equal(planTransition(song({}, { albumKey: 'x' }), song({}, { albumKey: 'x' }), 'automix', 6).kind, 'gapless');
assert.equal(planTransition({ duration: 2 }, b, 'crossfade', 6).kind, 'gapless');

console.log('transition plan self-check: ok');
