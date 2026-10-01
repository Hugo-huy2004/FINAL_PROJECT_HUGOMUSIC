const assert = require('assert');

// Điểm xếp hạng một bài = trộn lượt nghe TRÊN HUGO MUSIC với độ phổ biến TOÀN CẦU (lượt tải bản phát
// hành trên archive.org, chia đều cho số bài gốc của bản đó → ước lượng từng bài).
// Cả hai đi qua log (log1p) rồi chia cho giá trị lớn nhất trong nhóm đang xếp → 0..1: một bản phát
// hành cực nổi (hàng trăm nghìn lượt) không át hết, và một lượt nghe thật trên Hugo vẫn có trọng lượng.
// Trọng số mặc định ưu tiên hành vi nghe thật trên nền tảng (0,6) hơn số liệu bên ngoài (0,4).
const WEIGHTS = { local: 0.6, global: 0.4 };

// Khoảng thời gian → trường số liệu toàn cầu tương ứng của archive.org.
const GLOBAL_FIELD = { 7: 'week', 30: 'month', 0: 'total' };
const globalFieldFor = (days) => GLOBAL_FIELD[days] ?? (days <= 7 ? 'week' : days <= 30 ? 'month' : 'total');

// Ước lượng lượt toàn cầu cho MỘT bài từ số liệu cấp bản phát hành.
function perTrack(stats, field, trackCount) {
  const n = stats?.[field];
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / Math.max(1, trackCount || 1);
}

// rows: [{ id, local, global }] → cùng mảng kèm `score`, sắp giảm dần (bằng điểm: local cao hơn trước).
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
