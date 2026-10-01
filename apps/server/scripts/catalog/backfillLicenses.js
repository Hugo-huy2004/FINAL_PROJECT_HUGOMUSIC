// Look up the SPECIFIC license of each article from the archive.org metadata itself and write it to the DB.
//
// Why you need it: old batch import scripts only save a general description string that you set yourself
// ("Creative Commons (archive.org netlabels...)") — does not distinguish between CC BY, CC BY-NC-ND or
// Public Domain, which are very different binding licenses (ND prohibits creating derivative copies →
// Do not build HLS; NC prohibits trade). Admin finds those articles "not copyrighted".
//
// Mandatory rule: all articles MUST have a source with a license. Any articles that cannot be searched are listed
// private (save to DB: research result 'license_gaps'), do not silently ignore.
//
// Use:
// node scripts/catalog/backfillLicenses.js --dry-run checks but does not write
// node scripts/catalog/backfillLicenses.js shows articles that are missing licenseType
// node scripts/catalog/backfillLicenses.js --all recheck the entire repository

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const Song = require('../../src/modules/songs/Song');
const { saveResult } = require('../../src/modules/research/researchStore');
const redis = require('../../src/config/redis');

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const CONCURRENCY = 2; // Courtesy archive.org — overloaded and it returns an empty body

// Sort licenses from archive.org URL/rights string.
// Important check order: BY-NC-ND must be received before BY, otherwise the string "by-nc-nd" will
// Mismatched "by" and lost the NC/ND constraint.
function classifyLicense(licenseUrl, rights, collection, identifier) {
  const s = `${licenseUrl || ''} ${rights || ''}`.toLowerCase();

  if (/publicdomain|public-domain|\bcc0\b|mark\/1\.0/.test(s)) return 'public-domain';
  if (/by-nc-nd/.test(s)) return 'cc-by-nc-nd';
  if (/by-nc-sa/.test(s)) return 'cc-by-nc-sa';
  if (/by-nc/.test(s)) return 'cc-by-nc';
  if (/by-nd/.test(s)) return 'cc-by-nd';
  if (/by-sa/.test(s)) return 'cc-by-sa';
  if (/creativecommons\.org\/licenses\/by/.test(s)) return 'cc-by';
  if (/creativecommons/.test(s)) return 'cc-other';

  // George Blood's 78rpm collection contains expired pre-1972 recordings — archive.org
  // Do not attach licenseurl to each item but is essentially in the public domain. `collection` field
  // sometimes empty, but the item identifier carries the georgeblood sign ("78_..._gbia...").
  if (/georgeblood|78rpm/i.test(collection || '')) return 'public-domain';
  if (/^78_.*gbia|gbia\d/i.test(identifier || '')) return 'public-domain';

  return null;
}

function identifierFromSourceUrl(sourceUrl) {
  const m = /archive\.org\/details\/([^/?#]+)/.exec(sourceUrl || '');
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchItem(identifier) {
  // Try again with a gap. archive.org when overloaded still returns HTTP 200 with empty body — if considered that
  // "Item does not declare its license" will mistakenly remove valid music. Real items always have metadata.identifier.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.metadata || !json.metadata.identifier) throw new Error('metadata rỗng (nhiều khả năng bị giới hạn tốc độ)');
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function main() {
  await connectDB();
  const filter = ALL ? {} : { licenseType: { $in: [null] } };
  const songs = await Song.find(filter).select('title artist sourceUrl license licenseUrl licenseType attribution');
  console.log(`Tra giấy phép cho ${songs.length} bài${ALL ? ' (toàn kho)' : ' còn thiếu'}${DRY_RUN ? ' — CHẠY THỬ, không ghi' : ''}\n`);

  const byIdentifier = new Map();
  const untraceable = [];       // no sourceUrl archive.org
  const fetchFailed = [];       // check error -> run again
  const noLicenseDeclared = []; // The real source did not declare a license
  for (const song of songs) {
    const id = identifierFromSourceUrl(song.sourceUrl);
    if (!id) { untraceable.push(song); continue; }
    if (!byIdentifier.has(id)) byIdentifier.set(id, []);
    byIdentifier.get(id).push(song);
  }
  const identifiers = [...byIdentifier.keys()];
  console.log(`  ${identifiers.length} item archive.org cần tra\n`);

  const typeCount = {};
  let updated = 0, done = 0;

  async function worker() {
    while (identifiers.length) {
      const identifier = identifiers.shift();
      const group = byIdentifier.get(identifier);
      let meta;
      try {
        meta = await fetchItem(identifier);
      } catch (err) {
        group.forEach((s) => fetchFailed.push({ song: s, reason: err.message }));
        done += 1;
        continue;
      }
      const md = meta.metadata || {};
      const licenseUrl = md.licenseurl || null;
      const collection = Array.isArray(md.collection) ? md.collection.join(' ') : md.collection;
      const licenseType = classifyLicense(licenseUrl, md.rights, collection, identifier);

      if (!licenseType) {
        // The item was searched but the license was not declared - different from a failed search, separated so as not to mistakenly remove it.
        group.forEach((s) => noLicenseDeclared.push(s));
        done += 1;
        continue;
      }
      typeCount[licenseType] = (typeCount[licenseType] || 0) + group.length;

      for (const song of group) {
        if (!DRY_RUN) {
          song.licenseUrl = licenseUrl || undefined;
          song.licenseType = licenseType;
          // Attribute credit according to the published source author's name, do not rename it yourself.
          if (md.creator && !song.attribution) song.attribution = Array.isArray(md.creator) ? md.creator[0] : md.creator;
          await song.save();
        }
        updated += 1;
      }
      done += 1;
      if (done % 25 === 0) console.log(`  ...đã tra ${done}/${byIdentifier.size} item`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log('\n=== PHÂN LOẠI GIẤY PHÉP ===');
  Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${t.padEnd(16)} ${String(n).padStart(4)} bài`));
  console.log(`\n  ${DRY_RUN ? 'Sẽ cập nhật' : 'Đã cập nhật'}                : ${updated}`);
  console.log(`  Không có sourceUrl archive.org     : ${untraceable.length}`);
  console.log(`  Tra HỎNG (chạy lại được)           : ${fetchFailed.length}`);
  console.log(`  Nguồn KHÔNG KHAI giấy phép         : ${noLicenseDeclared.length}`);

  if (noLicenseDeclared.length) {
    const byItem = {};
    noLicenseDeclared.forEach((s) => { byItem[s.sourceUrl] = (byItem[s.sourceUrl] || 0) + 1; });
    console.log('\n=== NGUỒN KHÔNG KHAI GIẤY PHÉP (vi phạm quy tắc bắt buộc) ===');
    Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)} bài  ${k}`));
  }

  if (!DRY_RUN) {
    await saveResult('license_gaps', [
      ...untraceable.map((s) => ({ kind: 'noSourceUrl', id: String(s._id), title: s.title, artist: s.artist })),
      ...fetchFailed.map((f) => ({ kind: 'fetchFailed', id: String(f.song._id), title: f.song.title, artist: f.song.artist, reason: f.reason })),
      ...noLicenseDeclared.map((s) => ({ kind: 'noLicenseDeclared', id: String(s._id), title: s.title, artist: s.artist, sourceUrl: s.sourceUrl })),
    ], { checked: songs.length, updated, typeCount });
    await redis.cacheDel('songs:all'); // List of songs cached for 1 hour — delete so admin/app can see immediately
    console.log('\nDanh sách còn thiếu đã lưu: research result "license_gaps"');
  }
  await redis.client.quit().catch(() => {});
  await mongoose.disconnect();
}

module.exports = { classifyLicense, identifierFromSourceUrl, fetchItem };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
