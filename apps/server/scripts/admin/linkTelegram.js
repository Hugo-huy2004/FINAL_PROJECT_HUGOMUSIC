// Links a Telegram chat ID to an admin account, so login OTPs have somewhere to go.
//
// Setup:
//   1. Create a bot via @BotFather on Telegram, get its token, set TELEGRAM_BOT_TOKEN
//      in apps/server/.env.
//   2. Send any message (e.g. "hi") to your new bot from the Telegram account that
//      should receive admin OTPs — Telegram bots can't message you first.
//   3. Run: node scripts/admin/findTelegramChatId.js   (prints chat IDs that messaged the bot)
//   4. Run: node scripts/admin/linkTelegram.js <admin-email> <chatId>
//
// Usage:
//   node scripts/admin/linkTelegram.js admin@example.com 123456789

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const User = require('../../src/modules/auth/User');

async function main() {
  const [email, chatId] = process.argv.slice(2);
  if (!email || !chatId) {
    console.error('Usage: node scripts/admin/linkTelegram.js <email> <chatId>');
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found with email ${email}.`);
    process.exit(1);
  }
  if (user.role !== 'admin') {
    console.error(`${email} is not an admin — run scripts/admin/createAdmin.js first.`);
    process.exit(1);
  }

  user.telegramChatId = String(chatId);
  await user.save();
  console.log(`Linked Telegram chat ${chatId} to admin ${user.username} <${user.email}>.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
