const assert = require('assert');

// Ranking score for a song = mix of HUGO MUSIC streams with GLOBAL popularity (stream downloads
// published on archive.org, divided equally by the number of original articles of that version → estimate each article).
// Both go through log (log1p) and then divide by the largest value in the group being sorted → 0..1: one copy
// Extremely popular actions (hundreds of thousands of plays) don't overwhelm them all, and a real listen on Hugo still has weight.
// The default weighting favors real listening behavior on the platform (0.6) over external metrics (0.4).
const WEIGHTS = { local: 0.6, global: 0.4 };

// Time period → archive.org's corresponding global metrics field.
const GLOBAL_FIELD = { 7: 'week', 30: 'month', 0: 'total' };
const globalFieldFor = (days) => GLOBAL_FIELD[days] ?? (days <= 7 ? 'week' : days <= 30 ? 'month' : 'total');

// Estimate global views for ONE article from release-level metrics.
function perTrack(stats, field, trackCount) {
  const n = stats?.[field];
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / Math.max(1, trackCount || 1);
}

// rows: [{ id, local, global }] → same array with `score`, descending (equal to score: local is higher than before).
function rank(rows, weights = WEIGHTS) {
  const maxLocal = Math.log1p(Math.max(0, ...rows.map((r) => r.local)));
  const maxGlobal = Math.log1p(Math.max(0, ...rows.map((r) => r.global)));
  const norm = (v, max) => (max > 0 ? Math.log1p(v) / max : 0);
  return rows
    .map((r) => ({ ...r, score: weights.local * norm(r.local, maxLocal) + weights.global * norm(r.global, maxGlobal) }))
    .sort((a, b) => b.score - a.score || b.local - a.local || b.global - a.global);
}

function selfCheck() {
  assert.strictEqual(globalFieldFor(7), 'week');
  assert.strictEqual(globalFieldFor(0), 'total');
  assert.strictEqual(globalFieldFor(14), 'month');
  assert.strictEqual(perTrack({ week: 14 }, 'week', 9), 14 / 9);
  assert.strictEqual(perTrack({}, 'week', 9), 0);
  assert.strictEqual(perTrack({ total: 100 }, 'total', 0), 100, 'không có số bài → coi là 1');

  const r = rank([
    { id: 'hugo-hit', local: 20, global: 0 },
    { id: 'world-hit', local: 0, global: 26000 },
    { id: 'both', local: 10, global: 5000 },
    { id: 'none', local: 0, global: 0 },
  ]);
  assert.strictEqual(r[0].id, 'both', 'phổ biến ở cả hai nguồn đứng đầu');
  assert.strictEqual(r[r.length - 1].id, 'none');
  assert.ok(r.find((x) => x.id === 'hugo-hit').score > r.find((x) => x.id === 'world-hit').score, 'nghe thật trên Hugo nặng hơn');
  assert.deepStrictEqual(rank([{ id: 'a', local: 0, global: 0 }]).map((x) => x.score), [0], 'toàn số 0 không chia cho 0');
}

module.exports = { globalFieldFor, perTrack, rank, selfCheck };

if (require.main === module) {
  selfCheck();
  console.log('ranking score self-check: ok');
}
