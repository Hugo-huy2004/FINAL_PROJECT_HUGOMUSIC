// Merge DB: 12 collections → 7 (users, songs, playlists, artists, rooms, events, runs). See models/kindScope.js.
//
// listeningrooms → rooms (kind of stays the same: station | blind)
//   radiostations   → rooms   (kind: radio)
// playbackmetrics → events (kind of stays the same: stream | playback)
//   listeningvotes  → events  (kind: blind-vote)
//   pipelineruns    → runs    (kind: pipeline)
//   researchresults → runs    (kind: research)
// partyrooms, stations → removed (no models used — feature data removed)
//
// Leave the _id intact so all references remain correct. Rerun as many times as you like (overwrite by _id).
// node scripts/db/consolidate.js copy + compare record numbers (don't delete anything)
// node scripts/db/consolidate.js --drop as above, if everything matches, delete the old collection + trash collection
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

  // Index according to new schema (unique has partialFilterExpression according to kind).
  for (const name of MODELS) await require(`../../models/${name}`).syncIndexes();

  if (drop) {
    if (!allOk) throw new Error('Có collection chép chưa khớp — KHÔNG xoá gì. Chạy lại để thử.');
    for (const name of [...MOVES.map((m) => m.from), ...DEAD]) {
      if (existing.has(name)) { await db.collection(name).drop(); console.log(`  đã xoá collection ${name}`); }
    }
  }
  const ResearchResult = require('../../src/modules/research/ResearchResult');
  await ResearchResult.findOneAndUpdate({ name: 'db_consolidation' },
    { name: 'db_consolidation', rows: report, meta: { dropped: drop }, runAt: new Date() }, { upsert: true });
  const after = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log(`\nCollection hiện có (${after.length}): ${after.join(', ')}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
