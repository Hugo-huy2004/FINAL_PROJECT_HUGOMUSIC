const ResearchResult = require('../models/ResearchResult');

// Lưu/đọc kết quả thí nghiệm trong MongoDB (models/ResearchResult.js). Cần đã connectDB().
async function saveResult(name, rows, meta) {
  await ResearchResult.findOneAndUpdate(
    { name },
    { name, rows, meta, runAt: new Date() },
    { upsert: true, setDefaultsOnInsert: true },
  );
  console.log(`Đã lưu kết quả "${name}" vào DB (ResearchResult).`);
}

async function loadResult(name) {
  const doc = await ResearchResult.findOne({ name }).lean();
  if (!doc) throw new Error(`Chưa có kết quả "${name}" trong DB — chạy thí nghiệm đó trước.`);
  return doc.rows;
}

module.exports = { saveResult, loadResult };
