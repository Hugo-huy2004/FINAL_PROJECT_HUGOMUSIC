// CALIBRATION OF THE TABLE "SPECTRUM CUT POINT -> BITRATE CEILING"
//
// Don't take numbers from the documentation but measure yourself: encode the same source at ALREADY bitrates
// KNOW IN ADVANCE and then re-measure the cutting point of each plate. The resulting relationship is the lookup table.
//
// Use two types of sources to separate the two causes of spectrum clipping:
// - Synthetic pink noise: the spectrum is full up to Nyquist, so the measured cutoff IS the set
// encoded, without mixing the characteristics of the music.
// - Real music in the warehouse: verify that the lookup table is still correct on the actual signal.
//
// Use: node research/calibrateCeiling.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { saveResult } = require('../src/modules/research/researchStore');
const { measureCutoffHz } = require('./spectralCeiling');

const BITRATES = [64, 96, 128, 160, 192, 256, 320];
// Sample music folder (parameter 1). If not, calibration only uses pink noise.
const SEED_DIR = process.argv[2] || path.join(__dirname, 'seed_audio');

function run(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { timeout: 300000 });
}

// Pink noise 60 seconds, 44.1 kHz — spread spectrum up to Nyquist (22.05 kHz).
function makePinkNoise(dest) {
  run(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=44100:duration=60',
       '-ac', '2', '-c:a', 'pcm_s16le', dest]);
}

function encodeMp3(src, dest, kbps) {
  run(['-i', src, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-vn', dest]);
}

function encodeAac(src, dest, kbps) {
  run(['-i', src, '-c:a', 'aac', '-b:a', `${kbps}k`, '-vn', dest]);
}

function calibrateOne(label, wavPath, work) {
  const row = { source: label, baselineCutoffHz: measureCutoffHz(wavPath, 60), mp3: {}, aac: {} };
  for (const kbps of BITRATES) {
    const mp3 = path.join(work, `${label}_${kbps}.mp3`);
    const m4a = path.join(work, `${label}_${kbps}.m4a`);
    encodeMp3(wavPath, mp3, kbps);
    encodeAac(wavPath, m4a, kbps);
    row.mp3[kbps] = measureCutoffHz(mp3, 60);
    row.aac[kbps] = measureCutoffHz(m4a, 60);
    process.stdout.write(`  ${label} ${kbps}k -> mp3 ${row.mp3[kbps]} Hz | aac ${row.aac[kbps]} Hz\n`);
  }
  return row;
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-'));
  const rows = [];

  try {
    console.log('Nguồn tổng hợp (nhiễu hồng, phổ đầy tới Nyquist):');
    const pink = path.join(work, 'pink.wav');
    makePinkNoise(pink);
    rows.push(calibrateOne('pink', pink, work));

    // Choose a few real songs with the highest declared bitrate as verification sources.
    const seeds = fs.existsSync(SEED_DIR)
      ? fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.mp3')).slice(0, 3)
      : [];

    for (const [i, name] of seeds.entries()) {
      console.log(`\nNhạc thật #${i + 1}: ${name.slice(0, 50)}`);
      const wav = path.join(work, `real${i}.wav`);
      run(['-i', path.join(SEED_DIR, name), '-t', '60', '-c:a', 'pcm_s16le', wav]);
      rows.push(calibrateOne(`real${i}`, wav, work));
    }

    await saveResult('ceiling_calibration', rows);

    // Summary table: bitrate cutoff, taken from the (cleanest) synthetic source.
    const pinkRow = rows[0];
    console.log('\n=== BẢNG TRA HIỆU CHUẨN (nguồn nhiễu hồng) ===');
    console.log('bitrate | điểm cắt MP3 | điểm cắt AAC');
    for (const kbps of BITRATES) {
      console.log(`${String(kbps).padStart(6)}k | ${String(pinkRow.mp3[kbps]).padStart(12)} | ${String(pinkRow.aac[kbps]).padStart(12)}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Results saved to DB (ResearchResult) — connect before running, disconnect when finished.
connectDB()
  .then(main)
  .then(() => mongoose.disconnect())
  .catch((err) => { console.error(err); process.exit(1); });
