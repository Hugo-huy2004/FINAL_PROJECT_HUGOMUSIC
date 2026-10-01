// Gộp DB: 12 collection → 7 (users, songs, playlists, artists, rooms, events, runs). Xem models/kindScope.js.
//
//   listeningrooms  → rooms   (kind giữ nguyên: station | blind)
//   radiostations   → rooms   (kind: radio)
//   playbackmetrics → events  (kind giữ nguyên: stream | playback)
//   listeningvotes  → events  (kind: blind-vote)
//   pipelineruns    → runs    (kind: pipeline)
//   researchresults → runs    (kind: research)
//   partyrooms, stations      → bỏ (không model nào dùng — dữ liệu của tính năng đã xoá)
//
// Giữ nguyên _id nên mọi tham chiếu vẫn đúng. Chạy lại bao nhiêu lần cũng được (ghi đè theo _id).
//   node scripts/db/consolidate.js          chép + đối chiếu số bản ghi (không xoá gì)
//   node scripts/db/consolidate.js --drop   như trên, khớp hết thì xoá collection cũ + collection rác
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');

const MOVES = [
  { from: 'listeningrooms', to: 'rooms' },
  { from: 'radiostations', to: 'rooms', kind: 'radio' },
  { from: 'playbackmetrics', to: 'events' },
  { from: 'listeningvotes', to: 'events', kind: 'blind-vote' },
  { from: 'pipelineruns', to: 'runs', kind: 'pipeline' },
  { from: 'researchresults', to: 'runs', kind: 'research' },
];
const DEAD = ['partyrooms', 'stations'];
const MODELS = ['ListeningRoom', 'RadioStation', 'PlaybackMetric', 'ListeningVote', 'PipelineRun', 'ResearchResult'];

async function main() {
  const drop = process.argv.includes('--drop');
  await mongoose.connect(process.env.MONGO_URI, { readPreference: 'primary' });
  const db = mongoose.connection.db;
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const report = [];
  let allOk = true;

  for (const m of MOVES) {
    if (!existing.has(m.from)) { report.push({ ...m, source: 0, copied: 0, ok: true, note: 'không còn collection nguồn' }); continue; }
    const docs = await db.collection(m.from).find().toArray();
    if (docs.length) {
      await db.collection(m.to).bulkWrite(docs.map((d) => ({
        replaceOne: { filter: { _id: d._id }, replacement: m.kind ? { ...d, kind: m.kind } : d, upsert: true },
      })));
    }
    const copied = await db.collection(m.to).countDocuments({ _id: { $in: docs.map((d) => d._id) } });
    const missingKind = await db.collection(m.to).countDocuments({ _id: { $in: docs.map((d) => d._id) }, kind: { $exists: false } });
    const ok = copied === docs.length && missingKind === 0;
    allOk &&= ok;
    report.push({ ...m, source: docs.length, copied, ok });
    console.log(`${ok ? '✓' : '✗'} ${m.from.padEnd(16)} → ${m.to.padEnd(7)} ${String(docs.length).padStart(5)} bản ghi, đã chép ${copied}`);
  }

  // Index theo schema mới (unique có partialFilterExpression theo kind).
  for (const name of MODELS) await require(`../../models/${name}`).syncIndexes();

  if (drop) {
    if (!allOk) throw new Error('Có collection chép chưa khớp — KHÔNG xoá gì. Chạy lại để thử.');
    for (const name of [...MOVES.map((m) => m.from), ...DEAD]) {
      if (existing.has(name)) { await db.collection(name).drop(); console.log(`  đã xoá collection ${name}`); }
    }
  }
  const ResearchResult = require('../../models/ResearchResult');
  await ResearchResult.findOneAndUpdate({ name: 'db_consolidation' },
    { name: 'db_consolidation', rows: report, meta: { dropped: drop }, runAt: new Date() }, { upsert: true });
  const after = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`\nCollection hiện có (${after.length}): ${after.join(', ')}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
