const crypto = require('crypto');
const { client, isReady } = require('../../config/redis');

// Pending-OTP store, keyed by a random one-time token handed to the client after step 1.
// Lives in Redis so every API instance behind the load balancer sees the same slot.
// Dual-engine: If Redis is unavailable or disconnected, gracefully falls back to an in-memory Map.
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const keyOf = (purpose, tempToken) => `otp:${purpose}:${tempToken}`;

// In-memory fallback map
const memoryOtpStore = new Map();

const cleanExpiredMemoryOtps = () => {
  const now = Date.now();
  for (const [k, v] of memoryOtpStore.entries()) {
    if (v.expiresAt <= now) memoryOtpStore.delete(k);
  }
};

const createOtp = async (userId, purpose) => {
  if (!purpose) throw new Error('createOtp: purpose is required');
  const tempToken = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));

  if (isReady()) {
    try {
      await client.multi()
        .hSet(keyOf(purpose, tempToken), { userId, code, attempts: 0 })
        .pExpire(keyOf(purpose, tempToken), OTP_TTL_MS)
        .exec();
      return { tempToken, code };
    } catch (err) {
      console.warn('[otpStore] Redis createOtp failed, falling back to in-memory store:', err.message);
    }
  }

  // Fallback to in-memory
  cleanExpiredMemoryOtps();
  memoryOtpStore.set(keyOf(purpose, tempToken), {
    userId,
    code,
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  return { tempToken, code };
};

// A wrong code (e.g. a typo) does NOT burn the tempToken — retry up to MAX_ATTEMPTS without
// re-entering the password. Consumed only on success, expiry (Redis TTL), or attempt budget.
const verifyOtp = async (tempToken, code, purpose) => {
  if (typeof tempToken !== 'string' || !purpose) return null;
  const key = keyOf(purpose, tempToken);

  if (isReady()) {
    try {
      const attempts = await client.hIncrBy(key, 'attempts', 1);
      const entry = await client.hGetAll(key);
      if (!entry.code) {
        await client.del(key);
        return null;
      }
      if (attempts > MAX_ATTEMPTS) {
        await client.del(key);
        return null;
      }
      if (entry.code !== String(code)) return null;
      return (await client.del(key)) === 1 ? entry.userId : null;
    } catch (err) {
      console.warn('[otpStore] Redis verifyOtp failed, trying in-memory fallback:', err.message);
    }
  }

  // Fallback to in-memory
  cleanExpiredMemoryOtps();
  const entry = memoryOtpStore.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryOtpStore.delete(key);
    return null;
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    memoryOtpStore.delete(key);
    return null;
  }
  if (entry.code !== String(code)) return null;
  memoryOtpStore.delete(key);
  return entry.userId;
};

module.exports = { createOtp, verifyOtp };
