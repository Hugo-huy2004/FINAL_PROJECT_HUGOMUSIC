// Gỡ hẳn khỏi kho và khỏi R2 những bài VI PHẠM bản quyền: nguồn không khai giấy phép cụ thể nào.
//
// Tầng 1 của xét duyệt (utils/songReview.js) là cổng cứng: nhạc phổ biến lại phải có giấy phép cho phép
// điều đó. Bài mà chính nguồn (archive.org) không khai giấy phép — hoặc khai "All rights reserved", hoặc
// chỉ ghi chung "Creative Commons" không rõ biến thể (không biết có cấm thương mại/phái sinh hay không) —
// thì không được giữ.
//
// An toàn trước khi xoá (không hoàn tác được):
//   - chỉ xét bài còn thiếu licenseType SAU khi đã chạy backfillLicenses.js;
//   - tra lại nguồn ngay lúc xoá; tra HỎNG (mạng, archive.org quá tải) thì BỎ QUA, không xoá;
//   - nguồn đã có giấy phép cụ thể thì gắn vào thay vì xoá;
//   - mặc định chỉ liệt kê; phải có --confirm mới xoá;
//   - ghi biên bản (bài, nguồn, lý do, tệp R2 đã xoá) vào DB: research result 'license_purge'.
//
// Dùng:
//   node scripts/catalog/purgeUnlicensed.js             liệt kê bài sẽ bị gỡ
//   node scripts/catalog/purgeUnlicensed.js --confirm   gỡ thật (DB + R2)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Song = require('../../models/Song');
const redis = require('../../config/redis');
const { saveResult } = require('../../utils/researchStore');
const { removeSongCompletely } = require('../../utils/songRemoval');
const { classifyLicense, identifierFromSourceUrl, fetchItem } = require('./backfillLicenses');

const CONFIRM = process.argv.includes('--confirm');

// Vì sao một item không đạt — ghi vào biên bản.
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
    if (!id) continue; // không có nguồn archive.org: để admin xử lý tay, script không tự đoán
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
      // Nguồn giờ đã khai giấy phép → gắn vào, không xoá.
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
