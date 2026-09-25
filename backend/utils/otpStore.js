const crypto = require('crypto');

// In-memory pending-OTP store, keyed by a random one-time token handed to the client
// after step 1 of admin login (password correct, OTP sent). Never keyed by userId
// directly, so a client can't guess/target another session's OTP slot.
// ponytail: process-local Map — fine for a single-server, admin-only 2FA flow. Move
// to Redis (or add TTL cleanup) if this needs to survive restarts or scale out.
const pending = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

const MAX_ATTEMPTS = 5;

const createOtp = (userId) => {
  const tempToken = crypto.randomBytes(24).toString('hex');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pending.set(tempToken, { userId, code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return { tempToken, code };
};

// A wrong code (e.g. a typo) does NOT burn the tempToken — the admin can just retry,
// up to MAX_ATTEMPTS, without going all the way back to re-entering their password.
// The entry is only consumed on success, expiry, or exhausting the attempt budget.
const verifyOtp = (tempToken, code) => {
  const entry = pending.get(tempToken);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    pending.delete(tempToken);
    return null;
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    pending.delete(tempToken);
    return null;
  }

  if (entry.code !== String(code)) return null;

  pending.delete(tempToken); // correct — one-time use, consumed now
  return entry.userId;
};

module.exports = { createOtp, verifyOtp };
