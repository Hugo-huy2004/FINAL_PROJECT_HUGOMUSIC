const mongoose = require('mongoose');

const ensureAdminUser = async () => {
  try {
    const User = require('../models/User');
    const adminUsername = 'HugoMusicAdmin';
    const exists = await User.findOne({ username: adminUsername });
    // No hardcoded fallback: a default password in source is a published password.
    if (!exists && process.env.ADMIN_PASSWORD) {
      await User.create({
        username: adminUsername,
        email: 'admin@hugomusic.com',
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
      });
      console.log(`[Database] Auto-seeded default admin user '${adminUsername}'.`);
    }
  } catch (err) {
    console.error('[Database] Admin ensure check failed:', err.message);
  }
};

const connectDB = async () => {
  try {
    // useNewUrlParser/useUnifiedTopology are no-ops on modern mongoose; dropped.
    // Đọc từ PRIMARY: đọc ngay sau khi ghi phải thấy dữ liệu vừa ghi (read-your-writes). readPreference=nearest
    // trong MONGO_URI từng cho ~0,5% lần đọc dữ liệu cũ (vừa lưu xong tải lại vẫn thấy bản cũ). Ba node replica
    // chạy chung máy nên đọc node phụ không nhanh hơn — chỉ mất tính nhất quán.
    const conn = await mongoose.connect(process.env.MONGO_URI, { readPreference: 'primary' });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await ensureAdminUser();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
