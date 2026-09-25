// Chấm bitrate bằng kích thước file / thời lượng — không tải nội dung file.
//
// Thay cho cách cũ (auditAudioQuality.js, đã gỡ) vốn tải 256 KB đầu rồi nhờ ffprobe đọc:
// cách đó cho KẾT QUẢ SAI HÀNG LOẠT. File có ảnh bìa nhúng lớn thì 256 KB đầu
// toàn là ảnh, chưa chạm tới khung nhạc, nên ffprobe báo "hỏng" — đã kiểm chứng
// 3 file bị chấm hỏng, tải nguyên về thì đều là MP3 320 kbps hoàn toàn bình thường.
//
// Ở đây chỉ cần HEAD để lấy kích thước (không tốn băng thông, không có gì để
// hiểu nhầm), rồi bitrate = kích thước * 8 / thời lượng. Đây cũng chính là con
// số dùng để lọc ngưỡng, nên không cần ffprobe nữa.
//
// Dùng: node research/auditBitrate.js

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { headR2, keyFromR2Url } = require('../utils/r2');
const connectDB = require('../config/db');
const Song = require('../models/Song');

const OUT_PATH = path.join(__dirname, 'results', 'audio_quality_audit.json');
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
        // georgeblood có sẵn bản 24-bit FLAC thật -> bài này tải lại được ở chất lượng cao
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
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

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
  console.log(`\nĐã ghi kết quả: ${OUT_PATH}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
