// CHẨN ĐOÁN KHO: tìm file khai chất lượng cao nhưng nội dung đã bị nén từ trước
//
// KHÔNG ảnh hưởng tới thang tier. Xem docs/PSL_TECHNIQUE.md §7.3 — phép đo phổ
// đã bị loại khỏi đường quyết định thang vì có bài trần băng thông 14 kHz mà
// chất lượng cảm nhận vẫn tăng tới 320k. Script này phục vụ việc QUẢN LÝ KHO:
// biết bài nào nên tải lại bản tốt hơn từ nguồn gốc.
//
// Giới hạn đã đo (§6.3): bộ dò chỉ bắt được nguồn bị giới hạn băng thông rõ rệt
// trên nhạc mộc, yên tĩnh. Với nhạc dày và to, bộ mã hoá để lại nhiễu lượng tử
// hoá ~-76 dB thay vì im lặng số nên bộ dò bỏ sót. Kết quả vì vậy là CẬN DƯỚI
// của số file có vấn đề, không phải con số đầy đủ.
//
// Dùng:
//   node research/auditFakeLossless.js <thư mục>     (quét file cục bộ)

const fs = require('fs');
const path = require('path');
const { analyze } = require('./spectralCeiling');

const AUDIO_EXT = new Set(['.flac', '.wav', '.aiff', '.m4a', '.mp3', '.ogg', '.opus']);

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Dùng: node research/auditFakeLossless.js <thư mục>');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()));
console.log(`Quét ${files.length} file trong ${dir}\n`);

const suspects = [];
for (const name of files) {
  let r;
  try {
    r = analyze(path.join(dir, name));
  } catch (err) {
    console.warn(`  LỖI ${name.slice(0, 40)}: ${String(err.message).split('\n')[0]}`);
    continue;
  }
  if (r.inflated) {
    suspects.push({ name, ...r, profile: undefined });
    console.log(
      `  ${name.slice(0, 44).padEnd(44)} khai ${String(r.declaredKbps).padStart(5)}k ` +
      `| vách ${String(r.cutoffHz).padStart(6)} Hz | trần ~${String(r.ceilingKbps).padStart(4)}k ` +
      `| phình ${r.inflationRatio}x`
    );
  }
}

console.log(`\nNghi vấn: ${suspects.length}/${files.length}`);
if (suspects.length) {
  // Gom theo tiền tố tên file: file giả thường đến theo cả cụm từ một nguồn tải lên.
  const byPrefix = {};
  for (const s of suspects) {
    const key = s.name.split(' - ')[0].slice(0, 30);
    byPrefix[key] = (byPrefix[key] || 0) + 1;
  }
  console.log('\nGom theo nguồn (cụm cùng nguồn là dấu hiệu đáng tin hơn ca lẻ):');
  for (const [k, n] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(32)} ${n} file`);
  }
}
