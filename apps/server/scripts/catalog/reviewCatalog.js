// Browse music stores through 2 independent floors.
//
// FLOOR 1 — COPYRIGHT (hard gate: if it slides, it must be removed from the warehouse)
// CC and Public Domain music are REQUIRED to state the source + license when disseminating
// again, so this is a legal obligation, not a "beauty" criterion.
// - has traceable sourceUrl
// - has the licenseType looked up from the source metadata
// - has attribution (author credit)
//
// FLOOR 2 — PRODUCT QUALITY (scoring: failing must be corrected, not deleted)
// - reach the source quality ceiling (don't keep low copies when the source has better copies)
// - has a real cover photo, not the default one
// - there are categories
// - clean title/artist, no trace of file name left
//
// The two levels are separate because of different consequences: copyright failure must be deleted or failed
// quality must be added/reloaded. Merging them together will result in mistakenly deleting valid music.
//
// Use: node scripts/catalog/reviewCatalog.js

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const { saveResult, loadResult } = require('../../src/modules/research/researchStore');
const Song = require('../../src/modules/songs/Song');
const { reviewSong } = require('../../src/modules/songs/songReview');


async function main() {
  await connectDB();
  const songs = await Song.find({})
    .select('title artist sourceUrl licenseType licenseUrl attribution coverArt genre duration');

  const ceilingById = new Map();
  if (fs.existsSync(CEILING_PATH)) {
    (await loadResult('source_ceiling_audit')).forEach((r) => ceilingById.set(r.id, r));
  }

  const report = [];
  for (const s of songs) {
    const id = s._id.toString();

    // Same set of criteria as admin approval queue (utils/songReview.js).
    const r = reviewSong(s, { ceiling: ceilingById.get(id) });
    const copyrightIssues = r.copyright.issues;
    const qualityIssues = r.quality.issues;

    report.push({
      id, title: s.title, artist: s.artist,
      licenseType: s.licenseType,
      copyrightPass: copyrightIssues.length === 0,
      copyrightIssues,
      qualityPass: qualityIssues.length === 0,
      qualityIssues,
    });
  }

  await saveResult('two_tier_review', report);

  const total = report.length;
  const cPass = report.filter((r) => r.copyrightPass).length;
  const qPass = report.filter((r) => r.qualityPass).length;
  const bothPass = report.filter((r) => r.copyrightPass && r.qualityPass).length;

  const tally = (getter) => {
    const m = {};
    report.forEach((r) => getter(r).forEach((i) => {
      const k = i.replace(/\(.*\)/, '').trim();
      m[k] = (m[k] || 0) + 1;
    }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  console.log(`=== XÉT DUYỆT ${total} BÀI ===\n`);
  console.log(`TẦNG 1 — BẢN QUYỀN   : ${cPass}/${total} đạt  (${total - cPass} trượt -> phải gỡ)`);
  tally((r) => r.copyrightIssues).forEach(([k, v]) => console.log(`      ${String(v).padStart(4)}  ${k}`));

  console.log(`\nTẦNG 2 — CHẤT LƯỢNG  : ${qPass}/${total} đạt  (${total - qPass} cần sửa)`);
  tally((r) => r.qualityIssues).forEach(([k, v]) => console.log(`      ${String(v).padStart(4)}  ${k}`));

  console.log(`\nĐẠT CẢ HAI TẦNG      : ${bothPass}/${total}`);
  if (!ceilingById.size) {
    console.log('\n(chưa có source_ceiling_audit.json nên chưa xét được tiêu chí "đạt trần nguồn")');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
