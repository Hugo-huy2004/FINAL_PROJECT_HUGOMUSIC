// Lưu kết quả JSON từ stdin vào DB — cho script không phải Node (vd. Python):
//   .venv/bin/python research/codec_compare.py ... | node research/saveResult.js codec_compare
// Chỉ phần JSON cuối cùng trên stdin được lưu (dòng bắt đầu bằng "[" hoặc "{" tới hết).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { saveResult } = require('../utils/researchStore');

const name = process.argv[2];
if (!name) {
  console.error('Dùng: … | node research/saveResult.js <tên-kết-quả>');
  process.exit(1);
}
let input = '';
process.stdin.on('data', (c) => { input += c; }).on('end', async () => {
  const start = input.search(/^[[{]/m);
  if (start < 0) {
    console.error('Không thấy JSON trên stdin.');
    process.exit(1);
  }
  process.stdout.write(input.slice(0, start)); // phần in thường (bảng tóm tắt) vẫn hiện ra
  await connectDB();
  await saveResult(name, JSON.parse(input.slice(start)));
  await mongoose.disconnect();
});
