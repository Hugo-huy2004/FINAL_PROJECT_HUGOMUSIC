// VERIFY THE CEILING DETECTOR WITH PREVIOUS KNOWLEDGE FACTS
//
// How to do: take the REAL lossless file (verified full spectrum), compress it to the REAL bitrate
// KNOW, then wrap it back to FLAC — properly simulating the trick of creating "lossless
// fake". Then run the detector on the wrapped copy and see if it restores the correct bitrate
// original no.
//
// This is a strict test because the wrapped copy has NO clear traces left
// metadata: container is FLAC, declared bitrate ~900 kbps. Only signal spectrum
// just denounced the real source.
//
// Use: node research/validateCeiling.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { saveResult } = require('../src/modules/research/researchStore');
const { analyze } = require('./spectralCeiling');

// Sample music folder (parameter 1). If not, calibration only uses pink noise.
const SEED_DIR = process.argv[2] || path.join(__dirname, 'seed_audio');
const TRUE_BITRATES = [64, 96, 128, 160, 192, 256, 320];

// The source must be TRUE lossless — verified by the detector itself (no walls).
const SOURCES = [
  'Adhesion - ASRS1.flac',
  'Francisco_Pinto - Sabrina.flac',
  'My_Mean_Magpie_Recordings - Embers_in_the_Snow.flac',
  'Various_Artists___Relax_Brother__Relax__A_Twentieth_Anniversary_Tribute_to_Teenbeat_Records__MMM025_ - Shumai___Yes__She_is_My_Skinhead_Girl__Dr__Fujimoto_mix___Originally_by_Unrest_.flac',
];

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300000 });
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-'));
  const rows = [];

  try {
    for (const name of SOURCES) {
      const src = path.join(SEED_DIR, name);
      if (!fs.existsSync(src)) { console.warn(`bỏ qua (không thấy): ${name}`); continue; }

      // Confirm the source is truly lossless before using it as a standard.
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
        ff(['-i', mp3, '-c:a', 'flac', laundered]);   // wrapped into "lossless"

        const r = analyze(laundered);
        const ok = r.ceilingKbps === trueKbps;
        const near = !ok && Math.abs(Math.log2(r.ceilingKbps / trueKbps)) <= 1;  // deviation <= 1 step

        rows.push({ source: name, trueKbps, declaredKbps: r.declaredKbps,
                    cutoffHz: r.cutoffHz, detectedKbps: r.ceilingKbps, exact: ok, within1Step: ok || near });

        console.log(
          `  thật ${String(trueKbps).padStart(3)}k -> bọc FLAC khai ${String(r.declaredKbps).padStart(4)}k ` +
          `| vách ${String(r.cutoffHz ?? '—').padStart(6)} Hz | đoán ${String(r.detectedKbps ?? '—').padStart(4)}k ` +
          `${ok ? 'ĐÚNG' : near ? 'lệch 1 bậc' : 'SAI'}`
        );
      }
    }

    await saveResult('ceiling_validation', rows);

    const exact = rows.filter((r) => r.exact).length;
    const within = rows.filter((r) => r.within1Step).length;
    const detected = rows.filter((r) => r.cutoffHz != null).length;

    console.log(`\n=== KẾT QUẢ (${rows.length} phép thử) ===`);
    console.log(`Phát hiện có nén    : ${detected}/${rows.length} (${(detected / rows.length * 100).toFixed(0)}%)`);
    console.log(`Đoán đúng chính xác : ${exact}/${rows.length} (${(exact / rows.length * 100).toFixed(0)}%)`);
    console.log(`Đoán lệch <= 1 bậc  : ${within}/${rows.length} (${(within / rows.length * 100).toFixed(0)}%)`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Results saved to DB (ResearchResult) — connect before running, disconnect when finished.
connectDB()
  .then(main)
  .then(() => mongoose.disconnect())
  .catch((err) => { console.error(err); process.exit(1); });
