// Unified Config Module (Rule #4: Use config folder)
const { env, validateEnv } = require('./env');
const connectDB = require('./db');
const redis = require('./redis');
const storage = require('./storage');

module.exports = {
  env,
  validateEnv,
  connectDB,
  redis,
  storage,
};
