// Completely remove articles from the repository and from R2 that VIOLATE copyright: the source does not declare any specific license.
//
// Level 1 of the review (utils/songReview.js) is a hard gate: popular music must have a license
// that. Articles where the source itself (archive.org) does not declare a license — or declare "All rights reserved", or
// just general "Creative Commons" with unknown variations (don't know if commercial/derivatives are prohibited or not) —
// it cannot be kept.
//
// Safety before deletion (cannot be undone):
// - only consider posts with missing licenseType AFTER running backfillLicenses.js;
// - Recheck the source immediately after deletion; Check FAILED (network, archive.org overloaded), then SKIP, do not delete;
// - sources that already have a specific license are attached instead of deleted;
// - default to list only; --confirm is required to delete;
// - write record (article, source, reason, deleted R2 file) to DB: research result 'license_purge'.
//
// Use:
// node scripts/catalog/purgeUnlicensed.js lists posts that will be removed
// node scripts/catalog/purgeUnlicensed.js --confirm real removal (DB + R2)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const Song = require('../../src/modules/songs/Song');
const redis = require('../../src/config/redis');
const { saveResult } = require('../../src/modules/research/researchStore');
const { removeSongCompletely } = require('../../src/modules/songs/songRemoval');
const { classifyLicense, identifierFromSourceUrl, fetchItem } = require('./backfillLicenses');

const CONFIRM = process.argv.includes('--confirm');

// Why an item failed — record it in the record.
function violation(md) {
  const text = ['rights', 'description', 'notes', 'subject', 'licenseurl'].map((k) => [].concat(md[k] || []).join(' ')).join(' ');
  if (/all rights reserved/i.test(text)) return 'Nguồn ghi "All rights reserved"';
  if (/creative commons/i.test(text)) return 'Chỉ ghi chung "Creative Commons", không rõ biến thể giấy phép';
  return 'Nguồn không khai giấy phép';
}

async function main() {
  await connectDB();
  const songs = await Song.find({ licenseType: { $in: [null] } }).select('title artist sourceUrl filePath coverArt status');
  const byItem = new Map();
  for (const s of songs) {
    const id = identifierFromSourceUrl(s.sourceUrl);
    if (!id) continue; // no archive.org source: let the admin handle it manually, the script doesn't guess on its own
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id).push(s);
  }
  console.log(`${songs.length} bài thiếu giấy phép, ${byItem.size} item nguồn${CONFIRM ? ' — XOÁ THẬT' : ' — chỉ liệt kê (thêm --confirm để xoá)'}\n`);

  const log = [];
  let skipped = 0, licensed = 0;
  for (const [identifier, group] of byItem) {
    let meta;
    try {
      meta = await fetchItem(identifier);
    } catch (err) {
      skipped += group.length;
      console.log(`  BỎ QUA (tra hỏng: ${err.message})  ${identifier}`);
      continue;
    }
    const md = meta.metadata || {};
    const collection = [].concat(md.collection || []).join(' ');
    const type = classifyLicense(md.licenseurl, md.rights, collection, identifier);
    if (type) {
      // The source has now declared its license → attached, not deleted.
      if (CONFIRM) for (const s of group) { s.licenseType = type; s.licenseUrl = md.licenseurl || undefined; await s.save(); }
      licensed += group.length;
      console.log(`  GẮN ${type}  ${identifier}`);
      continue;
    }
    const reason = violation(md);
    for (const s of group) {
      const entry = { id: String(s._id), title: s.title, artist: s.artist, sourceUrl: s.sourceUrl, reason };
      if (CONFIRM) Object.assign(entry, await removeSongCompletely(s));
      log.push(entry);
    }
    console.log(`  ${CONFIRM ? 'ĐÃ GỠ' : 'SẼ GỠ'} ${String(group.length).padStart(2)} bài  ${identifier}  — ${reason}`);
  }

  console.log(`\n${CONFIRM ? 'Đã gỡ' : 'Sẽ gỡ'}: ${log.length} bài · gắn được giấy phép: ${licensed} · bỏ qua vì tra hỏng: ${skipped}`);
  if (CONFIRM) {
    const notCleaned = log.filter((e) => !e.storageCleaned);
    if (notCleaned.length) console.log(`⚠ ${notCleaned.length} bài chưa dọn xong R2 — chạy lại script để thử lại`);
    await saveResult('license_purge', log, { at: new Date().toISOString(), removed: log.length, licensed, skipped });
    await redis.cacheDel('songs:all');
  }
  await redis.client.quit().catch(() => {});
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
