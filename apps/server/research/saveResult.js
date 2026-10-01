// Save JSON output from stdin to DB — for non-Node scripts (eg. Python):
//   .venv/bin/python research/codec_compare.py ... | node research/saveResult.js codec_compare
// Only the last JSON portion on stdin is saved (line starting with "[" or "{" through to the end).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { saveResult } = require('../src/modules/research/researchStore');

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
  process.stdout.write(input.slice(0, start)); // The lowercase part (summary table) still appears
  await connectDB();
  await saveResult(name, JSON.parse(input.slice(start)));
  await mongoose.disconnect();
});
