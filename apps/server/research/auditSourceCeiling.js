// Mark each assignment according to the rule: files below 1411 kbps are allowed ONLY when home
// The producer/writer never released a better version. If the source has a copy available
// It's better but we're keeping the low version (because the network was weak before so we downloaded the light version),
// then the article must be re-uploaded — it cannot be left unchanged.
//
// How to do it: for each item on archive.org, read the metadata to know what the actual item is
// which formats to release, then find the best version that corresponds to the RIGHT recording
// existing (matches the original file name stored in externalId, not the entire item
// — an item can contain many different articles).
//
// Only reads metadata (light JSON), does not download music files.
//
// Classification results:
// KEEP_AT_CEILING - we are keeping the best version the source has -> keep, even <1411
// REFETCH - the source has a better version -> have to download again
// NO_SOURCE - cannot look up the source -> need to decide separately
//
// Use: node research/auditSourceCeiling.js

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { saveResult, loadResult } = require('../src/modules/research/researchStore');
const Song = require('../src/modules/songs/Song');

const CONCURRENCY = 2;

// Ranking archive.org formats by quality. Bigger number = better.
const FORMAT_RANK = {
  '24bit flac': 100,
  'flac': 90,
  'wave': 85,
  'wav': 85,
  'aiff': 85,
  'shorten': 80,
  'ogg vorbis': 50,
  'vbr mp3': 40,
  'mp3': 35,
  '64kbps mp3': 20,
  '32kbps mp3': 10,
};

function rankOf(format) {
  const f = (format || '').toLowerCase().trim();
  if (FORMAT_RANK[f] != null) return FORMAT_RANK[f];
  if (f.includes('24bit') && f.includes('flac')) return 100;
  if (f.includes('flac')) return 90;
  if (f.includes('wav') || f.includes('aiff')) return 85;
  if (f.includes('mp3')) return 35;
  return 0;
}

// "ia_The_Beautiful_Machine-16742_Josh_Woodward_-_03_-_Shot_Down.mp3"
// -> "Josh_Woodward_-_03_-_Shot_Down" (record name, remove item and suffix prefix)
function trackStemFromExternalId(externalId, identifier) {
  if (!externalId) return null;
  let s = externalId.replace(/^ia_/, '');
  if (identifier && s.startsWith(`${identifier}_`)) s = s.slice(identifier.length + 1);
  return s.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

function identifierFromSourceUrl(sourceUrl) {
  const m = /archive\.org\/details\/([^/?#]+)/.exec(sourceUrl || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// Standardization to compare file names between DB and archive.org: the two sides differ in accents
// spaces/underscores/punctuation so all non-alphanumeric characters must be removed to match.
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchItem(identifier) {
  // Retry with interval: archive.org still returns when overloaded/speed limited
  // HTTP 200 but body is empty. If you think of it as "lookup done, no files", then yes
  // erroneously concluded that a series of songs had no source — a real musical item
  // There must be at least one audio file, so body has no file = search failed.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const audioCount = (json.files || []).filter((f) => rankOf(f.format) > 0).length;
      if (audioCount === 0) throw new Error('metadata rỗng (nhiều khả năng bị giới hạn tốc độ)');
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function main() {
  if (!fs.existsSync(AUDIT_IN)) {
    console.error('Chạy trước: node research/auditBitrate.js');
    process.exit(1);
  }
  const bitrateById = new Map(
    (await loadResult('audio_quality_audit')).map((a) => [a.id, a])
  );

  await connectDB();
  const songs = await Song.find({}).select('title artist sourceUrl externalId duration');
  console.log(`Đang tra nguồn cho ${songs.length} bài...\n`);

  // Group by item: an item contains many articles, only need to call metadata once.
  const byIdentifier = new Map();
  const noSource = [];
  for (const song of songs) {
    const id = identifierFromSourceUrl(song.sourceUrl);
    if (!id) { noSource.push(song); continue; }
    if (!byIdentifier.has(id)) byIdentifier.set(id, []);
    byIdentifier.get(id).push(song);
  }
  console.log(`  ${byIdentifier.size} item cần tra (cho ${songs.length - noSource.length} bài)\n`);

  const results = [];
  for (const song of noSource) {
    results.push({
      id: song._id.toString(), title: song.title, artist: song.artist,
      verdict: 'NO_SOURCE', currentKbps: bitrateById.get(song._id.toString())?.kbps ?? null,
    });
  }

  const identifiers = [...byIdentifier.keys()];
  let done = 0;

  async function worker() {
    while (identifiers.length) {
      const identifier = identifiers.shift();
      if (!identifier) break;
      const group = byIdentifier.get(identifier);
      let meta = null;
      try {
        meta = await fetchItem(identifier);
      } catch (err) {
        for (const song of group) {
          results.push({
            id: song._id.toString(), title: song.title, artist: song.artist,
            verdict: 'NO_SOURCE', reason: `metadata: ${err.message}`,
            currentKbps: bitrateById.get(song._id.toString())?.kbps ?? null,
          });
        }
        done += 1;
        continue;
      }

      const files = (meta.files || []).filter((f) => rankOf(f.format) > 0);
      for (const song of group) {
        const cur = bitrateById.get(song._id.toString());
        const stem = trackStemFromExternalId(song.externalId, identifier);
        const stemNorm = normalize(stem);

        // Only compare files of the SAME recording, not the entire item.
        const sameTrack = stemNorm
          ? files.filter((f) => {
              const fNorm = normalize(f.name.replace(/\.[a-z0-9]+$/i, ''));
              return fNorm.includes(stemNorm) || stemNorm.includes(fNorm);
            })
          : [];

        const pool = sameTrack.length ? sameTrack : [];
        const best = pool.reduce((a, b) => (rankOf(b.format) > rankOf(a?.format) ? b : a), null);

        if (!best) {
          results.push({
            id: song._id.toString(), title: song.title, artist: song.artist,
            identifier, verdict: 'NO_SOURCE', reason: 'không khớp được file gốc',
            currentKbps: cur?.kbps ?? null,
          });
          continue;
        }

        const bestKbps = song.duration && best.size
          ? Math.round((Number(best.size) * 8) / song.duration / 1000)
          : null;
        // More than 15% is considered "truly better" — a difference of just a few percentage points
        // Differences due to packaging and reloading are not worth it.
        const better = bestKbps && cur?.kbps ? bestKbps > cur.kbps * 1.15 : false;

        results.push({
          id: song._id.toString(), title: song.title, artist: song.artist,
          identifier,
          currentKbps: cur?.kbps ?? null,
          bestFormat: best.format,
          bestKbps,
          bestFileName: best.name,
          verdict: better ? 'REFETCH' : 'KEEP_AT_CEILING',
        });
      }
      done += 1;
      if (done % 25 === 0) console.log(`  ...đã tra ${done}/${byIdentifier.size} item`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await saveResult('source_ceiling_audit', results);

  const by = (v) => results.filter((r) => r.verdict === v);
  const keep = by('KEEP_AT_CEILING');
  const refetch = by('REFETCH');
  const none = by('NO_SOURCE');

  console.log('\n=== KẾT QUẢ THEO QUY TẮC "TRẦN CỦA NHÀ SẢN XUẤT" ===');
  console.log(`  GIỮ - đã là bản tốt nhất nguồn có : ${keep.length}`);
  console.log(`     trong đó dưới 1411 kbps        : ${keep.filter((r) => r.currentKbps && r.currentKbps < 1411).length}`);
  console.log(`  TẢI LẠI - nguồn có bản tốt hơn    : ${refetch.length}`);
  console.log(`     tải lại sẽ đạt >= 1411 kbps    : ${refetch.filter((r) => r.bestKbps >= 1411).length}`);
  console.log(`     tải lại vẫn < 1411 kbps        : ${refetch.filter((r) => r.bestKbps < 1411).length}`);
  console.log(`  KHÔNG TRA ĐƯỢC NGUỒN              : ${none.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
