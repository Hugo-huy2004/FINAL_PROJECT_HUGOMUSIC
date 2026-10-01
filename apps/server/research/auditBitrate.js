// Rate bitrate by file size / duration — do not download file content.
//
// Instead of the old way (auditAudioQuality.js, removed) which downloads the first 256 KB and then has ffprobe read it:
// That way gives MASSIVE WRONG RESULTS. The file with a large embedded cover image is the first 256 KB
// It's all photos, the music frame hasn't been touched yet, so ffprobe reports "broken" — verified
// The 3 files were corrupted. When downloaded, they were all completely normal 320 kbps MP3s.
//
// Here we only need HEAD to get the size (no bandwidth wasted, nothing to do
// misunderstood), then bitrate = size * 8 / duration. This is also the child
// number used for threshold filtering, so ffprobe is no longer needed.
//
// Use: node research/auditBitrate.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { headR2, keyFromR2Url } = require('../src/core/r2');
const connectDB = require('../src/config/db');
const { saveResult } = require('../src/modules/research/researchStore');
const Song = require('../src/modules/songs/Song');

const CONCURRENCY = 12;

async function main() {
  await connectDB();
  const songs = await Song.find({ filePath: /^https?:\/\// })
    .select('title artist filePath duration isPremium license sourceUrl');
  console.log(`Đang đo ${songs.length} file bằng HEAD (không tải nội dung)...\n`);

  const queue = [...songs];
  const results = [];
  let done = 0;

  async function worker() {
    while (queue.length) {
      const song = queue.shift();
      if (!song) break;
      const key = keyFromR2Url(song.filePath);
      let entry = {
        id: song._id.toString(),
        title: song.title,
        artist: song.artist,
        key,
        durationSec: song.duration || null,
        // georgeblood is available in real 24-bit FLAC -> this song can be redownloaded in high quality
        hasHiResSource: /georgeblood|gbia/i.test(`${song.license || ''} ${song.sourceUrl || ''}`),
      };
      if (!key) {
        entry.verdict = 'not-on-r2';
      } else {
        try {
          const { size } = await headR2(key);
          entry.sizeMB = +(size / 1048576).toFixed(2);
          entry.kbps = song.duration
            ? Math.round((size * 8) / song.duration / 1000)
            : null;
          entry.verdict = entry.kbps ? 'ok' : 'no-duration';
        } catch (err) {
          entry.verdict = 'missing-on-r2';
          entry.error = err.name;
        }
      }
      results.push(entry);
      done += 1;
      if (done % 100 === 0) console.log(`  ...đã đo ${done}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveResult('audio_quality_audit', results);

  const ok = results.filter((r) => r.verdict === 'ok');
  const bad = results.filter((r) => r.verdict !== 'ok');
  const band = (lo, hi) => ok.filter((r) => r.kbps >= lo && r.kbps < hi).length;

  console.log('\n=== PHÂN BỐ BITRATE THẬT ===');
  console.log(`  không đo được / mất file      ${String(bad.length).padStart(4)}`);
  console.log(`  < 128 kbps                    ${String(band(0, 128)).padStart(4)}`);
  console.log(`  128-191 kbps                  ${String(band(128, 192)).padStart(4)}`);
  console.log(`  192-319 kbps                  ${String(band(192, 320)).padStart(4)}`);
  console.log(`  320-1410 kbps                 ${String(band(320, 1411)).padStart(4)}`);
  console.log(`  >= 1411 kbps (chuẩn CD trở lên) ${String(ok.filter((r) => r.kbps >= 1411).length).padStart(2)}`);

  const refetchable = results.filter((r) => r.hasHiResSource).length;
  console.log(`\n  Có nguồn 24-bit để tải lại    ${String(refetchable).padStart(4)}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
