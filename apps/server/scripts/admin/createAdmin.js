// One-off CLI to promote a user to admin. Deliberately not an HTTP endpoint —
// admin rights should never be grantable over the network.
//
// Usage:
//   node scripts/admin/createAdmin.js someone@example.com
// (register the account first through the normal app, then run this)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const User = require('../../src/modules/auth/User');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/admin/createAdmin.js <email>');
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found with email ${email}. Register the account first.`);
    process.exit(1);
  }

  user.role = 'admin';
  await user.save();
  console.log(`${user.username} <${user.email}> is now an admin.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
