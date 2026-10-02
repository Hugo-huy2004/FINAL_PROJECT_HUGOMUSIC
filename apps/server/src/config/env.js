// Centrally manage all environment variables and system configurations
// The server's .env is always in apps/server/.env, regardless of which directory it is run from (balancer, script, npm workspace)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5001', 10),
  JWT_SECRET: process.env.JWT_SECRET,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hugo_music',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // Runs behind the load balancer (hugo-balancer): 'api' = stateless REST layer (relaxed replication),
  // 'realtime' = Socket.IO + /api/rooms (holds station/room timer — one copy), 'all' = both (dev).
  ROLE: process.env.ROLE || 'all',
  INSTANCE_ID: process.env.INSTANCE_ID || `${require('os').hostname()}:${process.env.PORT || '5001'}`,
  // Trust X-Forwarded-For from where (Express 'trust proxy'). The load balancer runs with the machine → 'loopback'.
  TRUST_PROXY: process.env.TRUST_PROXY || 'loopback',
  // Requests per minute per client IP across /api (index.js). Raise it for single-machine load tests.
  API_RATE_LIMIT: Number(process.env.API_RATE_LIMIT) || 600,
  
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

// Check essential environment variables when starting the application
function validateEnv() {
  if (!env.JWT_SECRET) {
    console.error('Error: JWT_SECRET is not set (see apps/server/.env.example).');
    process.exit(1);
  }
}

module.exports = { env, validateEnv };
