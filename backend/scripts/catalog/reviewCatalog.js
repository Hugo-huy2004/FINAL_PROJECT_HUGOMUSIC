// Xét duyệt kho nhạc qua 2 tầng độc lập.
//
// TẦNG 1 — BẢN QUYỀN (cổng cứng: trượt là phải gỡ khỏi kho)
//   Nhạc CC và Public Domain đều BẮT BUỘC nêu nguồn + giấy phép khi phổ biến
//   lại, nên đây là nghĩa vụ pháp lý chứ không phải tiêu chí "cho đẹp".
//   - có sourceUrl truy được
//   - có licenseType đã tra từ metadata nguồn
//   - có attribution (ghi công tác giả)
//
// TẦNG 2 — CHẤT LƯỢNG SẢN PHẨM (chấm điểm: trượt là phải sửa, không phải xoá)
//   - đạt trần chất lượng nguồn (không giữ bản thấp khi nguồn có bản tốt hơn)
//   - có ảnh bìa thật, không phải ảnh mặc định
//   - có thể loại
//   - tên bài/nghệ sĩ sạch, không còn dấu vết tên file
//
// Hai tầng tách bạch vì hệ quả khác nhau: trượt bản quyền thì phải xoá, trượt
// chất lượng thì phải bổ sung/tải lại. Gộp chung sẽ dẫn tới xoá nhầm nhạc hợp lệ.
//
// Dùng: node scripts/catalog/reviewCatalog.js

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const { saveResult, loadResult } = require('../../utils/researchStore');
const Song = require('../../models/Song');
const { reviewSong } = require('../../utils/songReview');


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

    // Cùng bộ tiêu chí với hàng chờ duyệt của admin (utils/songReview.js).
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
