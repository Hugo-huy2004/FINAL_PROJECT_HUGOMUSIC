const crypto = require('crypto');

// Proof that an email address was OTP-verified during registration, so the final
// POST /api/auth/register call can be trusted without re-checking the code itself.
// ponytail: in-memory, single-process — same tradeoff as utils/otpStore.js.
const verified = new Map();
const TTL_MS = 30 * 60 * 1000; // long enough to finish the rest of the signup wizard

const markVerified = (email) => {
  const token = crypto.randomBytes(24).toString('hex');
  verified.set(token, { email, expiresAt: Date.now() + TTL_MS });
  return token;
};

const checkVerified = (token, email) => {
  const entry = verified.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    verified.delete(token);
    return false;
  }
  return entry.email === email;
};

module.exports = { markVerified, checkVerified };
