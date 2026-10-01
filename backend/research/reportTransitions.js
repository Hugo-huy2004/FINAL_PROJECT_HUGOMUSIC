// Số liệu đánh giá chuyển bài liền mạch trên toàn kho (dùng cho báo cáo):
//   node research/reportTransitions.js   (kết quả in ra và lưu vào DB: ResearchResult 'transition_report')
// - Khoảng lặng ở ranh giới hai bài liền nhau = im cuối bài trước + im đầu bài sau: TRƯỚC (phát
//   nguyên tệp) so với SAU (cắt theo trimStart/trimEnd → 0 khi đã nạp sẵn).
// - Chênh độ to giữa hai bài liền nhau (|ΔLUFS|): TRƯỚC so với SAU cân âm lượng. Chỉ HẠ bài to
//   về -16 LUFS (giống frontend/src/utils/audio/transitionPlan.ts gainFor), bài nhỏ giữ nguyên.
// - Tỷ lệ bài đo được nhịp tin cậy (dùng được AutoMix canh phách).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Song = require('../models/Song')
const { saveResult } = require('../utils/researchStore');;

const TARGET_LUFS = -16;
const MIN_CONFIDENCE = 0.2;
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(2);
};
const summary = (arr) => ({ n: arr.length, median: pct(arr, 50), p95: pct(arr, 95), max: pct(arr, 100) });

(async () => {
  await connectDB();
  // Thứ tự như danh sách kho (mới nhất trước) — cặp liền nhau giống khi người dùng phát "tất cả bài hát".
  const songs = await Song.find({ status: 'published', 'transition.version': { $exists: true } })
    .sort({ createdAt: -1 }).select('duration transition').lean();
  const t = (s) => s.transition;
  const tail = (s) => Math.max(0, (s.duration || 0) - (t(s).trimEnd ?? s.duration ?? 0));

  const gapBefore = [];
  const loudBefore = [];
  const loudAfter = [];
  for (let i = 0; i + 1 < songs.length; i++) {
    const a = songs[i], b = songs[i + 1];
    gapBefore.push(tail(a) + (t(b).trimStart || 0));
    if (t(a).lufs != null && t(b).lufs != null) {
      loudBefore.push(Math.abs(t(a).lufs - t(b).lufs));
      loudAfter.push(Math.abs(Math.min(t(a).lufs, TARGET_LUFS) - Math.min(t(b).lufs, TARGET_LUFS)));
    }
  }
  const beats = songs.filter((s) => t(s).bpm && t(s).beatConfidence >= MIN_CONFIDENCE).length;

  const report = {
    analyzedSongs: songs.length,
    silenceAtBoundarySec: { before: summary(gapBefore), after: 'đã cắt theo trimStart/trimEnd (≈ 0 khi nạp sẵn kịp)' },
    loudnessJumpLU: { before: summary(loudBefore), after: summary(loudAfter) },
    beatTrackable: `${beats}/${songs.length} (${((100 * beats) / Math.max(1, songs.length)).toFixed(1)}%)`,
  };
  console.log(JSON.stringify(report, null, 2));
  await saveResult('transition_report', report);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
