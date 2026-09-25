// KIỂM CHỨNG BỘ DÒ TRẦN BẰNG SỰ THẬT ĐÃ BIẾT TRƯỚC
//
// Cách làm: lấy file lossless THẬT (đã xác minh phổ đầy), nén xuống bitrate ĐÃ
// BIẾT, rồi bọc ngược lại thành FLAC — mô phỏng đúng thủ thuật tạo "lossless
// giả". Sau đó chạy bộ dò trên bản bọc lại và xem nó có khôi phục đúng bitrate
// gốc không.
//
// Đây là phép thử nghiêm ngặt vì bản bọc lại KHÔNG còn dấu vết nào trong
// metadata: container là FLAC, bitrate khai báo ~900 kbps. Chỉ có phổ tín hiệu
// mới tố cáo nguồn thật.
//
// Dùng: node research/validateCeiling.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { analyze } = require('./spectralCeiling');

// Thư mục nhạc mẫu (tham số 1). Không có thì hiệu chuẩn chỉ dùng nhiễu hồng.
const SEED_DIR = process.argv[2] || path.join(__dirname, 'seed_audio');
const OUT_PATH = path.join(__dirname, 'results', 'ceiling_validation.json');
const TRUE_BITRATES = [64, 96, 128, 160, 192, 256, 320];

// Nguồn phải là lossless THẬT — đã xác minh bằng chính bộ dò (không có vách).
const SOURCES = [
  'Adhesion - ASRS1.flac',
  'Francisco_Pinto - Sabrina.flac',
  'My_Mean_Magpie_Recordings - Embers_in_the_Snow.flac',
  'Various_Artists___Relax_Brother__Relax__A_Twentieth_Anniversary_Tribute_to_Teenbeat_Records__MMM025_ - Shumai___Yes__She_is_My_Skinhead_Girl__Dr__Fujimoto_mix___Originally_by_Unrest_.flac',
];

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300000 });
}

function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-'));
  const rows = [];

  try {
    for (const name of SOURCES) {
      const src = path.join(SEED_DIR, name);
      if (!fs.existsSync(src)) { console.warn(`bỏ qua (không thấy): ${name}`); continue; }

      // Xác nhận nguồn đúng là lossless thật trước khi dùng làm chuẩn.
      const base = analyze(src);
      if (base.cutoffHz != null) {
        console.warn(`bỏ qua (nguồn đã bị cắt ở ${base.cutoffHz} Hz): ${name.slice(0, 40)}`);
        continue;
      }
      console.log(`\nNguồn: ${name.slice(0, 46)}  [phổ đầy, ${base.declaredKbps} kbps]`);

      for (const trueKbps of TRUE_BITRATES) {
        const mp3 = path.join(work, `t${trueKbps}.mp3`);
        const laundered = path.join(work, `t${trueKbps}.flac`);

        ff(['-i', src, '-c:a', 'libmp3lame', '-b:a', `${trueKbps}k`, '-vn', mp3]);
        ff(['-i', mp3, '-c:a', 'flac', laundered]);   // bọc lại thành "lossless"

        const r = analyze(laundered);
        const ok = r.ceilingKbps === trueKbps;
        const near = !ok && Math.abs(Math.log2(r.ceilingKbps / trueKbps)) <= 1;  // lệch <= 1 bậc

        rows.push({ source: name, trueKbps, declaredKbps: r.declaredKbps,
                    cutoffHz: r.cutoffHz, detectedKbps: r.ceilingKbps, exact: ok, within1Step: ok || near });

        console.log(
          `  thật ${String(trueKbps).padStart(3)}k -> bọc FLAC khai ${String(r.declaredKbps).padStart(4)}k ` +
          `| vách ${String(r.cutoffHz ?? '—').padStart(6)} Hz | đoán ${String(r.detectedKbps ?? '—').padStart(4)}k ` +
          `${ok ? 'ĐÚNG' : near ? 'lệch 1 bậc' : 'SAI'}`
        );
      }
    }

    fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2));

    const exact = rows.filter((r) => r.exact).length;
    const within = rows.filter((r) => r.within1Step).length;
    const detected = rows.filter((r) => r.cutoffHz != null).length;

    console.log(`\n=== KẾT QUẢ (${rows.length} phép thử) ===`);
    console.log(`Phát hiện có nén    : ${detected}/${rows.length} (${(detected / rows.length * 100).toFixed(0)}%)`);
    console.log(`Đoán đúng chính xác : ${exact}/${rows.length} (${(exact / rows.length * 100).toFixed(0)}%)`);
    console.log(`Đoán lệch <= 1 bậc  : ${within}/${rows.length} (${(within / rows.length * 100).toFixed(0)}%)`);
    console.log(`Đã ghi ${OUT_PATH}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
