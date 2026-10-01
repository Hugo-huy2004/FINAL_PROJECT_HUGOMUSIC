// Prints recent chats that have messaged your bot, so you can find a chat ID to pass
// to scripts/admin/linkTelegram.js. Requires TELEGRAM_BOT_TOKEN in apps/server/.env and at least
// one message already sent to the bot (Telegram bots can't message you first).
//
// Usage: node scripts/admin/findTelegramChatId.js

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set in apps/server/.env.');
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const json = await res.json();
  if (!json.ok) {
    console.error('Telegram API error:', json.description);
    process.exit(1);
  }

  const seen = new Map();
  for (const update of json.result) {
    const chat = update.message?.chat;
    if (chat) seen.set(chat.id, chat);
  }

  if (seen.size === 0) {
    console.log('No messages found yet. Send any message to your bot on Telegram, then re-run this.');
    return;
  }

  console.log('Chats that have messaged your bot:');
  for (const chat of seen.values()) {
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '(unknown)';
    console.log(`  chatId=${chat.id}  ${name}${chat.username ? ` (@${chat.username})` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
