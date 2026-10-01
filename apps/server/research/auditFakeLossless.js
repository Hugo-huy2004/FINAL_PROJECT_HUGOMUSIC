// STOCK DIAGNOSIS: find high quality declaration files but the content has been compressed before
//
// Does NOT affect tier ladder. See docs/PSL_TECHNIQUE.md §7.3 — spectroscopy
// was removed from the ladder decision because of the 14 kHz bandwidth ceiling
// Perceived quality still increased to 320k. This script serves WAREHOUSE MANAGEMENT:
// Knowing which songs should be re-downloaded is better from the original source.
//
// Measured limits (§6.3): the detector only captures sources that are clearly bandwidth limited
// on acoustic music, quiet. With thick and loud music, the encoder leaves behind quantum noise
// ~-76 dB instead of digital silence so the detector misses it. The result is therefore LOWER NEAR
// of the number of files with problems, not the full number.
//
// Use:
// node research/auditFakeLossless.js <folder> (scans local files)

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
  // Group by file name prefix: fake files often come in whole phrases from an upload source.
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
