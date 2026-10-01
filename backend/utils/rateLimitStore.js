const { client } = require('../config/redis');

// Store cho express-rate-limit đặt trong Redis. Store mặc định đếm trong RAM từng tiến trình: sau bộ
// cân bằng tải có N instance, kẻ dò mật khẩu/OTP được N × hạn mức. Cửa sổ cố định: INCR rồi đặt
// hạn MỘT LẦN (PEXPIRE NX) trong cùng một MULTI — nguyên tử, không cần Lua.
class RedisRateLimitStore {
  constructor(prefix = 'rl:') {
    this.prefix = prefix;
    this.localKeys = false; // báo cho express-rate-limit: bộ đếm dùng chung giữa các instance
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const k = this.prefix + key;
    const [totalHits, , ttl] = await client.multi().incr(k).pExpire(k, this.windowMs, 'NX').pTTL(k).exec();
    return { totalHits: Number(totalHits), resetTime: new Date(Date.now() + Math.max(0, Number(ttl))) };
  }

  async decrement(key) {
    await client.decr(this.prefix + key);
  }

  async resetKey(key) {
    await client.del(this.prefix + key);
  }
}

module.exports = { RedisRateLimitStore };
