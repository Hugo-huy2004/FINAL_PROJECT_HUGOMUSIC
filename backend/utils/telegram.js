// Sends a message via the Telegram Bot API. Falls back to logging the message to the
// server console when no bot token is configured, so the OTP login flow stays fully
// testable before you've set up a real Telegram bot (see scripts/admin/linkTelegram.js).
const sendTelegramMessage = async (chatId, text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.warn(`[telegram] Not configured — would send to chat ${chatId || '(none linked)'}:\n  ${text}`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error('[telegram] send failed:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] send error:', err.message);
    return false;
  }
};

module.exports = { sendTelegramMessage };
