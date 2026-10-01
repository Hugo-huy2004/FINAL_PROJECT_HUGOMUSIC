// Quản lý tập trung mọi biến môi trường và cấu hình hệ thống
require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5001', 10),
  JWT_SECRET: process.env.JWT_SECRET,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hugo_music',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // Chạy sau bộ cân bằng tải (lb/): 'api' = tầng REST không trạng thái (nhân bản thoải mái),
  // 'realtime' = Socket.IO + /api/rooms (giữ timer của đài/phòng — một bản), 'all' = cả hai (dev).
  ROLE: process.env.ROLE || 'all',
  INSTANCE_ID: process.env.INSTANCE_ID || `${require('os').hostname()}:${process.env.PORT || '5001'}`,
  // Tin X-Forwarded-For từ đâu (Express 'trust proxy'). Bộ cân bằng tải chạy cùng máy → 'loopback'.
  TRUST_PROXY: process.env.TRUST_PROXY || 'loopback',
  
  // Cloudflare R2 / S3
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    isConfigured() {
      return Boolean(this.accountId && this.accessKeyId && this.secretAccessKey && this.bucketName);
    }
  },
};

// Kiểm tra các biến môi trường thiết yếu khi khởi động ứng dụng
function validateEnv() {
  if (!env.JWT_SECRET) {
    console.error('Error: JWT_SECRET is not set (see backend/.env.example).');
    process.exit(1);
  }
}

module.exports = { env, validateEnv };
