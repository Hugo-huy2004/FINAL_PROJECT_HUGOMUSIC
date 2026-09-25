// Khung chung của các script xử lý từng bài (buildHls, buildPslLadder): kết nối DB,
// lọc bài, tải tệp gốc từ R2 về thư mục tạm, gọi `work`, dọn dẹp, in tổng kết.
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Song = require('../../models/Song');
const { readFromR2, keyFromR2Url } = require('../../utils/r2');
const { NO_DERIVATIVE } = require('../../utils/songReview');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const flag = (name) => process.argv.includes(`--${name}`);

// work(song, srcPath, workDir) -> dòng mô tả kết quả. Tuỳ chọn dòng lệnh chung:
// --id=<songId> (một bài), --limit=N (thử vài bài).
async function eachSong({ filter, select }, work) {
  await connectDB();
  let query = Song.find({
    ...filter,
    ...(arg('id') && { _id: arg('id') }),
    // Giấy phép ND cấm tạo bản phái sinh — chuyển mã có thể bị coi là phái sinh.
    licenseType: { $nin: NO_DERIVATIVE },
    filePath: /r2\.cloudflarestorage\.com/,
  }).select(`title filePath duration ${select}`);
  if (arg('limit')) query = query.limit(Number(arg('limit')));
  const songs = await query;

  let ok = 0;
  for (const [i, song] of songs.entries()) {
    const key = keyFromR2Url(song.filePath);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-'));
    try {
      const src = path.join(dir, `src${path.extname(key) || '.mp3'}`);
      fs.writeFileSync(src, await readFromR2(key));
      const note = await work(song, src, dir);
      ok += 1;
      console.log(`[${i + 1}/${songs.length}] "${song.title.slice(0, 40)}" ${note}`);
    } catch (err) {
      console.warn(`[${i + 1}/${songs.length}] LỖI "${song.title.slice(0, 40)}": ${String(err.message).split('\n')[0]}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`Xong: ${ok}/${songs.length} bài`);
  await mongoose.disconnect();
  if (ok < songs.length) process.exitCode = 1;
}

module.exports = { eachSong, arg, flag };
