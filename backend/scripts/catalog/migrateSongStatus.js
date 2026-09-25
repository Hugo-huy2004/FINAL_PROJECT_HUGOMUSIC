// Một lần: gắn status 'published' cho các bài có từ trước khi có hàng chờ duyệt.
// Chúng đã qua xét duyệt hai tầng bằng scripts/catalog/reviewCatalog.js nên được coi là
// đã xuất bản. Chạy lại vô hại (chỉ đụng bài chưa có status).
//
// Dùng: node scripts/catalog/migrateSongStatus.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Song = require('../../models/Song');

(async () => {
  await connectDB();
  const r = await Song.updateMany({ status: { $exists: false } }, { $set: { status: 'published' } });
  const counts = await Song.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  console.log(`Đã gắn 'published' cho ${r.modifiedCount} bài.`, counts);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
