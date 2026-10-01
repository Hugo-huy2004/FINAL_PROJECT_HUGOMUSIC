// Tra giấy phép CỤ THỂ của từng bài từ chính metadata archive.org và ghi vào DB.
//
// Vì sao cần: các script nhập hàng loạt cũ chỉ lưu một chuỗi mô tả chung do mình tự đặt
// ("Creative Commons (archive.org netlabels...)") — không phân biệt được CC BY, CC BY-NC-ND hay
// Public Domain, mà đây là những giấy phép có ràng buộc rất khác nhau (ND cấm tạo bản phái sinh →
// không được dựng HLS; NC cấm thương mại). Admin thấy các bài đó "không có bản quyền".
//
// Quy tắc bắt buộc: mọi bài PHẢI tra được nguồn kèm giấy phép. Bài nào không tra được bị liệt kê
// riêng (lưu vào DB: research result 'license_gaps'), không được im lặng bỏ qua.
//
// Dùng:
//   node scripts/catalog/backfillLicenses.js --dry-run     tra nhưng không ghi
//   node scripts/catalog/backfillLicenses.js               chỉ các bài còn thiếu licenseType
//   node scripts/catalog/backfillLicenses.js --all         tra lại toàn bộ kho

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Song = require('../../models/Song');
const { saveResult } = require('../../utils/researchStore');
const redis = require('../../config/redis');

const DRY_RUN = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const CONCURRENCY = 2; // lịch sự với archive.org — quá tải thì nó trả body rỗng

// Phân loại giấy phép từ URL/chuỗi rights của archive.org.
// Thứ tự kiểm tra quan trọng: BY-NC-ND phải được nhận trước BY, nếu không chuỗi "by-nc-nd" sẽ
// khớp nhầm thành "by" và mất ràng buộc NC/ND.
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

  // Bộ sưu tập 78rpm của George Blood là các bản thu trước 1972 đã hết hạn bảo hộ — archive.org
  // không gắn licenseurl cho từng item nhưng bản chất thuộc phạm vi công cộng. Trường `collection`
  // đôi khi rỗng, nhưng mã định danh item mang dấu hiệu georgeblood ("78_..._gbia...").
  if (/georgeblood|78rpm/i.test(collection || '')) return 'public-domain';
  if (/^78_.*gbia|gbia\d/i.test(identifier || '')) return 'public-domain';

  return null;
}

function identifierFromSourceUrl(sourceUrl) {
  const m = /archive\.org\/details\/([^/?#]+)/.exec(sourceUrl || '');
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchItem(identifier) {
  // Thử lại có giãn cách. archive.org khi quá tải vẫn trả HTTP 200 với body rỗng — nếu coi đó là
  // "item không khai giấy phép" thì sẽ gỡ nhầm nhạc hợp lệ. Item thật luôn có metadata.identifier.
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
  const untraceable = [];       // không có sourceUrl archive.org
  const fetchFailed = [];       // tra hỏng -> chạy lại được
  const noLicenseDeclared = []; // nguồn thật sự không khai giấy phép
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
        // Tra được nhưng item không khai giấy phép — khác hẳn tra hỏng, tách riêng để không gỡ nhầm.
        group.forEach((s) => noLicenseDeclared.push(s));
        done += 1;
        continue;
      }
      typeCount[licenseType] = (typeCount[licenseType] || 0) + group.length;

      for (const song of group) {
        if (!DRY_RUN) {
          song.licenseUrl = licenseUrl || undefined;
          song.licenseType = licenseType;
          // Ghi công theo đúng tên tác giả nguồn công bố, không tự đặt lại.
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
    await redis.cacheDel('songs:all'); // danh sách bài đang cache 1 giờ — xoá để admin/app thấy ngay
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
