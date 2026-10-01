// Metrics for evaluating seamless transfer of items across the warehouse (used for reporting):
// node research/reportTransitions.js (print results and save to DB: ResearchResult 'transition_report')
// - Silence at the boundary of two consecutive songs = silence at the end of the previous song + silence at the beginning of the next song: BEFORE (play
// file) vs. AFTER (trimStart/trimEnd → 0 when preloaded).
// - Loudness difference between two adjacent songs (|ΔLUFS|): BEFORE vs. AFTER volume balance. Only DOWN big cards
// about -16 LUFS (same as packages/client/src/audio/transitionPlan.ts gainFor), the small article remains the same.
// - Percentage of songs that reliably measure beats (can use AutoMix to track beats).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Song = require('../src/modules/songs/Song')
const { saveResult } = require('../src/modules/research/researchStore');;

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
  // Order as stock list (newest first) — consecutive pairs same as when user plays "all songs".
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
