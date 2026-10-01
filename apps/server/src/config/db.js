const mongoose = require('mongoose');

const ensureAdminUser = async () => {
  try {
    const User = require('../modules/auth/User');
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
    // Read from PRIMARY: read immediately after writing to see the data just written (read-your-writes). readPreference=nearest
    // in MONGO_URI used to give ~0.5% of reads of old data (just saved and reloaded and still see the old version). Three replica nodes
    // running on the same machine, reading the slave node is not faster — it just loses consistency.
    const conn = await mongoose.connect(process.env.MONGO_URI, { readPreference: 'primary' });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await ensureAdminUser();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
