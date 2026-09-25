// Đo thang bitrate PSL (ViSQOL) và ghi vào MongoDB — docs/PSL_TECHNIQUE.md.
// buildHls.js gọi measurePsl() cho bài chưa đo (nên duyệt bài là tự đo); chạy tay
// để đo bù cả kho mà không dựng HLS:
//   node scripts/streaming/buildPslLadder.js [--id=<songId>] [--limit=N] [--python=<python>]
// Python cần gói visqol-python: python3 -m venv .venv && .venv/bin/pip install visqol-python
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { eachSong, arg } = require('./eachSong');

const VENV_PYTHON = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
const PYTHON = arg('python') || process.env.PSL_PYTHON || (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3');
const MEASURE = path.join(__dirname, 'psl_measure.py');

async function measurePsl(song, src) {
  const r = JSON.parse(execFileSync(PYTHON, [MEASURE, src], { encoding: 'utf8', timeout: 30 * 60 * 1000 }));
  Object.assign(song, { pslLadder: r.ladder, pslMos: r.mos, pslTau: r.tau, pslMeasuredAt: new Date() });
  await song.save();
  return `nguồn ${r.declaredKbps}k → thang ${r.ladder.join('/') || '(chỉ tệp gốc)'} · tiết kiệm ${r.savedPct}%`;
}

module.exports = { measurePsl };

// Lọc theo pslMeasuredAt chứ không theo pslLadder: Mongoose lưu mảng rỗng [] cho
// mọi bài mới, nên lọc "pslLadder chưa có" sẽ bỏ sót toàn bộ bài admin tải lên.
if (require.main === module) {
  eachSong({ filter: { pslMeasuredAt: { $exists: false } }, select: 'pslLadder' }, measurePsl)
    .catch((err) => { console.error(err); process.exit(1); });
}
