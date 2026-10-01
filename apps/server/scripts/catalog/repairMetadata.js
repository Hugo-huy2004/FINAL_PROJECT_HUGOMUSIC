// Edit title / artist / track number from archive.org's file level metadata.
//
// Why: old import scripts get their name from FILE NAME ("Derek_Clegg - The_River", "09SunnyDay",
// "03 - Counting backwards") and assign "Various Artists" to the collection's songs. Each post has an externalId
// "<item>/<filename>" should be able to look up the correct file: archive.org records title/artist/creator/track for each file.
//
// Rules (in order of confidence):
// 1. article name: files[].title of the correct file; If missing, clean the file name (remove the ending, _ → space,
// separate CamelCase "SunnyDay" → "Sunny Day").
// 2. remove the sequence number at the beginning of the name (01 - / 03. / 09SunnyDay) when it MATCHes the track number of the file — avoid cutting by mistake
// real name starts with a number ("May 15, 2010", "3rd Movement").
// 3. remove the prefix "Artist - " / "Album - " in the name.
// 4. artist: files[].artist || files[].creator; The article is "Various Artists" and the name is in the form
// "X - Y" means the artist is X.
// 5. 78rpm version (item "78_..."): name cataloged by the digitized library — keep the same name; just change the sign ";" middle
// The characters are written as "," for ease of reading.
// All changes (before → after) are saved to runs: research result 'metadata_repair' — read back to undo.
//
// node scripts/catalog/repairMetadata.js runs test, prints changes
// node scripts/catalog/repairMetadata.js --apply writes to DB

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');

const AUDIO = /\.(mp3|ogg|flac|wav|m4a|aiff?)$/i;
const tidy = (s) => String(s || '').replace(/_+/g, ' ').replace(/\s*--\s*/g, ' – ').replace(/\s{2,}/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "HardDriveToDestiny" → "Hard Drive To Destiny" (only if the entire name has no spaces).
const splitCamel = (s) => (/\s/.test(s) ? s : s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2'));

function cleanTitle(raw, { track, artist, album }) {
  let t = tidy(String(raw).replace(AUDIO, ''));
  const n = Number.parseInt(track, 10);
  if (Number.isFinite(n)) {
    // track number at the beginning: "01 - X", "1. X", "01X", "01-Artist-X" — only if equal to the track number of the file
    const m = new RegExp(`^0*${n}(?:\\s*[-.):]\\s*|(?=[A-Z]))`).exec(t);
    if (m && t.length > m[0].length + 1) t = t.slice(m[0].length).trim();
  }
  for (const prefix of [artist, album].filter(Boolean)) {
    const m = new RegExp(`^${esc(tidy(prefix))}\\s*[-–:]\\s*`, 'i').exec(t);
    if (m && t.length > m[0].length + 1) t = t.slice(m[0].length).trim();
  }
  // "sern20 Lucrecia-03-Counting backwards" type of file name left over after removing the prefix: take the part after "-<track>-"
  if (Number.isFinite(n)) {
    const m = new RegExp(`-0*${n}-(.+)$`).exec(t);
    if (m) t = m[1].trim();
  }
  // The file name is like "03ThePhantoms..." but the track number of the file is wrong: the number has a capital letter at the beginning of the name without a space.
  if (!/\s/.test(t)) t = t.replace(/^\d{1,2}(?=[A-Z][a-z])/, '');
  return splitCamel(t);
}

// ---- quality gate: fix only when current name is clearly BROKEN and BETTER suggestions are clear ----
// Archive.org's file-level metadata may be worse than the existing name (release code "qd-4258", missing accent "Acido",
// "Ã²±" encoding error, case change) — blind overwriting will further corrupt the correct name.
const strip = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const CODE = /\[[^\]]*\]|\b[a-z]{1,5}-?\d{3,5}\b/i;            // [LCL11], qd-4258, krd-006, sern20…
const MOJIBAKE = /[ÃÂ][\u0080-ÿ]|[²±À]{2,}|�/;
function badProposal(next, cur) {
  if (!next || CODE.test(next) || MOJIBAKE.test(next)) return true;
  if (/(^|\s)vbr$/i.test(next)) return true;
  if (/^\d+\s/.test(next) && !/^\d/.test(String(cur || ''))) return true;                  // add track number to name ("Flor"→"01 Flor")
  if (next.toLowerCase() === String(cur || '').toLowerCase()) return true;                 // just different flowers/regulars
  if (next === next.toLowerCase() && /[A-Z]/.test(String(cur || ''))) return true;          // lose capital letters ("Even_I"→"even i")
  if (strip(cur) === next && strip(cur) !== cur) return true;                               // lose track
  return false;
}
const truncatedBy = (cur, next) => !!cur && next.length > cur.length + 2 && next.toLowerCase().startsWith(cur.toLowerCase().trim());
function brokenTitle(t, track) {
  const n = Number.parseInt(track, 10);
  return /_/.test(t)
    || (Number.isFinite(n) && new RegExp(`^0*${n}(\\s*[-.)]\\s*|(?=[A-Z]))`).test(t))
    || /^\S*[a-z][A-Z]\S*$/.test(t) && !/\s/.test(t)                                          // "SunnyDay"
    || t.length > 70;                                                                          // stick to long album names
}

function planFor(song, file, item) {
  const is78 = /^78_/.test(item.identifier);
  const out = {};
  if (is78) {
    const artist = String(song.artist || '').split(';').map((x) => x.trim()).filter(Boolean).join(', ');
    if (artist && artist !== song.artist) out.artist = artist;
    return out;
  }
  const track = file?.track || song.album?.trackNo;
  const various = /^various/i.test(song.artist || '') || !song.artist;
  // Proposed name: remove prefix "[CODE] Album - ", track number; The song "Various Artists" separates "Artist - Name".
  let title = cleanTitle(file?.title || song.title, { track, artist: file?.artist || file?.creator || song.artist, album: file?.album || song.album?.title });
  title = title.replace(/^\[[^\]]+\][^-–]*[-–]\s*/, '').replace(/^\d{1,3}\s+(?=\S)/, (m) => (Number.isFinite(Number.parseInt(track, 10)) ? '' : m)).trim();
  let artist = tidy(file?.artist || file?.creator || '');
  if (various && / - /.test(title)) {
    const [a, ...rest] = title.split(' - ');
    artist = tidy(a);
    title = rest.join(' - ').trim();
  }
  const titleOk = !badProposal(title, song.title) && (brokenTitle(song.title, track) || various || truncatedBy(song.title, title));
  if (titleOk && title !== song.title) out.title = title;
  const artistOk = artist && !badProposal(artist, song.artist) && !/^various/i.test(artist)
    && (various || truncatedBy(song.artist, artist) || /_/.test(song.artist || ''));
  if (artistOk && artist !== song.artist) out.artist = artist;
  const trackNo = Number.parseInt(track, 10);
  if (Number.isFinite(trackNo) && song.album?.trackNo == null) out['album.trackNo'] = trackNo;
  return out;
}

module.exports = { cleanTitle, planFor };

async function main() {
  const apply = process.argv.includes('--apply');
  const connectDB = require('../../src/config/db');
  const Song = require('../../src/modules/songs/Song');
  const { saveResult } = require('../../src/modules/research/researchStore');
  const { identifierFromSourceUrl, fetchItem } = require('./backfillLicenses');
  const redis = require('../../src/config/redis');
  await connectDB();
  // --plan <file>: test run and write all proposals to file for review; --apply --plan <file> records the correct approved version (do not look up again)
  const planIdx = process.argv.indexOf('--plan');
  const planFile = planIdx > 0 ? process.argv[planIdx + 1] : null;
  if (apply && planFile) return writeChanges(JSON.parse(require('fs').readFileSync(planFile, 'utf8')), { Song, saveResult, redis });

  const songs = await Song.find({}).select('title artist externalId sourceUrl album.trackNo album.title').lean();
  const byItem = new Map();
  for (const s of songs) {
    const id = identifierFromSourceUrl(s.sourceUrl);
    if (!id) continue;
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(s);
  }
  const changes = [];
  let failed = 0;
  const ids = [...byItem.keys()];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (ids.length) {
      const identifier = ids.shift();
      let meta;
      try { meta = await fetchItem(identifier); } catch { failed += byItem.get(identifier).length; continue; }
      const files = new Map((meta.files || []).map((f) => [f.name, f]));
      for (const s of byItem.get(identifier)) {
        const ext = String(s.externalId || '');
        const fname = ext.includes('/') ? ext.slice(ext.indexOf('/') + 1) : ext.replace(new RegExp(`^ia_${esc(identifier)}_`), '');
        const set = planFor(s, files.get(fname) || null, { identifier });
        if (Object.keys(set).length) changes.push({ id: String(s._id), before: { title: s.title, artist: s.artist }, set });
      }
    }
  }));

  for (const c of changes.slice(0, apply ? 0 : 40)) {
    console.log(`• ${c.before.title}  —  ${c.before.artist}\n  → ${c.set.title ?? c.before.title}  —  ${c.set.artist ?? c.before.artist}${c.set['album.trackNo'] ? `  (track ${c.set['album.trackNo']})` : ''}`);
  }
  const count = (k) => changes.filter((c) => c.set[k] !== undefined).length;
  console.log(`\n${changes.length} bài có thay đổi (tên: ${count('title')}, nghệ sĩ: ${count('artist')}, số track: ${count('album.trackNo')}) · tra hỏng: ${failed}`);
  if (planFile) require('fs').writeFileSync(planFile, JSON.stringify(changes, null, 1));
  if (apply) return writeChanges(changes, { Song, saveResult, redis });
  await redis.client.quit().catch(() => {});
  await mongoose.disconnect();
}

async function writeChanges(changes, { Song, saveResult, redis }) {
  await Song.bulkWrite(changes.map((c) => ({ updateOne: { filter: { _id: c.id }, update: { $set: c.set } } })));
  await saveResult('metadata_repair', changes, { at: new Date().toISOString() });
  await redis.cacheDel('songs:all');
  console.log(`Đã ghi ${changes.length} bài. Biên bản (trước → sau) ở research result "metadata_repair".`);
  await redis.client.quit().catch(() => {});
  await mongoose.disconnect();
}

if (require.main === module) {
  if (process.argv.includes('--self-check')) {
    const assert = require('assert');
    assert.strictEqual(cleanTitle('09SunnyDay.wav', { track: '09' }), 'Sunny Day');
    assert.strictEqual(cleanTitle("01 - Let's pretend", { track: '01', artist: 'Lucrecia' }), "Let's pretend");
    assert.strictEqual(cleanTitle('sern20_Lucrecia-03-Counting_backwards.mp3', { track: '03', artist: 'Lucrecia' }), 'Counting backwards');
    assert.strictEqual(cleanTitle('03ThePhantomsOfAThousandHours', { track: '7' }), 'The Phantoms Of AThousand Hours');
    assert.strictEqual(cleanTitle('01.Poor_Folk.mp3', { track: '1' }), 'Poor Folk');
    assert.strictEqual(cleanTitle('15/05/2010', { track: '15' }), '15/05/2010', 'không cắt tên thật bắt đầu bằng số');
    assert.strictEqual(cleanTitle('The River', { track: '01', artist: 'Derek Clegg' }), 'The River');
    const p = planFor({ title: 'Derek_Clegg - The_River', artist: 'Various Artists' }, null, { identifier: 'x' });
    assert.deepStrictEqual([p.title, p.artist], ['The River', 'Derek Clegg']);
    assert.deepStrictEqual(planFor({ title: '1. Sats: Adagio', artist: 'A;Beethoven' }, null, { identifier: '78_x' }), { artist: 'A, Beethoven' }, '78rpm: giữ tên');
    const keep = (cur, file) => { const { 'album.trackNo': _t, ...rest } = planFor(cur, file, { identifier: 'x' }); return rest; }; // Only consider name/artist
    assert.deepStrictEqual(keep({ title: 'Flor', artist: 'Various Artists' }, { title: '01 Flor' }).title, undefined, 'không thêm số track');
    assert.deepStrictEqual(keep({ title: 'What We Gonna Do', artist: 'Nyko Maca' }, { title: 'qd-4258 nykomaca+pg 03 What We Gonna Do', track: '03' }), {}, 'không nhận tên có mã phát hành');
    assert.deepStrictEqual(keep({ title: 'Fanáticos del silencio', artist: 'Vietnam' }, { title: 'Fanaticos del silencio' }), {}, 'không làm mất dấu');
    assert.strictEqual(keep({ title: 'Even_I', artist: 'X' }, { title: 'even i' }).title, undefined, 'không làm mất chữ hoa');
    assert.deepStrictEqual(keep({ title: 'Groove-0x002', artist: 'Nullbomb' }, { title: 'groove-0x002' }), {}, 'không đổi chỉ vì hoa/thường');
    assert.strictEqual(keep({ title: 'A Sound Like Razors Through Fl', artist: 'Nurgul Jones & The School Shoo' }, { title: 'A Sound Like Razors Through Flesh', artist: 'Nurgul Jones & The School Shooter Society' }).artist, 'Nurgul Jones & The School Shooter Society', 'sửa tên bị cắt cụt');
    const lcl = keep({ title: '[LCL11] Dubin Taiwan - 02 Volfoniq feat. Pier - Tsunamix', artist: 'Various Artists' }, { track: '2' });
    assert.deepStrictEqual([lcl.title, lcl.artist], ['Tsunamix', 'Volfoniq feat. Pier']);
    console.log('repairMetadata self-check: ok');
  } else {
    main().catch((e) => { console.error(e); process.exit(1); });
  }
}
