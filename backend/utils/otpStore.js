const crypto = require('crypto');
const { client } = require('../config/redis');

// Pending-OTP store, keyed by a random one-time token handed to the client after step 1
// (admin login: password correct; registration: email entered). Never keyed by userId
// directly, so a client can't guess/target another session's OTP slot.
// Lives in Redis so every API instance behind the load balancer sees the same slot —
// step 1 and step 2 routinely land on different instances.
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// `purpose` ngăn dùng mã của luồng này cho luồng khác: mã xác minh email khi đăng ký hay mã đặt lại
// mật khẩu không bao giờ mở được bước 2 của đăng nhập admin, và ngược lại.
const keyOf = (purpose, tempToken) => `otp:${purpose}:${tempToken}`;

const createOtp = async (userId, purpose) => {
  if (!purpose) throw new Error('createOtp: purpose is required');
  const tempToken = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  await client.multi()
    .hSet(keyOf(purpose, tempToken), { userId, code, attempts: 0 })
    .pExpire(keyOf(purpose, tempToken), OTP_TTL_MS)
    .exec();
  return { tempToken, code };
};

// A wrong code (e.g. a typo) does NOT burn the tempToken — retry up to MAX_ATTEMPTS without
// re-entering the password. Consumed only on success, expiry (Redis TTL), or attempt budget.
const verifyOtp = async (tempToken, code, purpose) => {
  if (typeof tempToken !== 'string' || !purpose) return null;
  const key = keyOf(purpose, tempToken);
  const attempts = await client.hIncrBy(key, 'attempts', 1);
  const entry = await client.hGetAll(key);
  if (!entry.code) { // không tồn tại/đã hết hạn — HINCRBY vừa tạo ra một hash rỗng, dọn đi
    await client.del(key);
    return null;
  }
  if (attempts > MAX_ATTEMPTS) {
    await client.del(key);
    return null;
  }
  if (entry.code !== String(code)) return null;
  // Hai request đúng mã tới hai instance cùng lúc: chỉ bên xoá được mới thắng (dùng một lần).
  return (await client.del(key)) === 1 ? entry.userId : null;
};

module.exports = { createOtp, verifyOtp };
