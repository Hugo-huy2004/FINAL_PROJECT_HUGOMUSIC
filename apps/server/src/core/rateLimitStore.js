const { client, isReady } = require('../config/redis');

// Store cho express-rate-limit:
// - When Redis is available: Shared between instances (MULTI atomic INCR + PEXPIRE).
// - When Redis crashes or runs locally without Redis: Automatically fallback to In-Memory Map
// to ensure Auth routes do not receive 500 errors and maintain continuous operation.
class RedisRateLimitStore {
  constructor(prefix = 'rl:') {
    this.prefix = prefix;
    this.localKeys = false;
    this.memoryStore = new Map();
  }

  init(options) {
    this.windowMs = options?.windowMs || 60000;
  }

  _incrementMemory(k) {
    const now = Date.now();
    let record = this.memoryStore.get(k);
    if (!record || record.resetTime <= now) {
      record = { totalHits: 1, resetTime: now + (this.windowMs || 60000) };
    } else {
      record.totalHits += 1;
    }
    this.memoryStore.set(k, record);
    return { totalHits: record.totalHits, resetTime: new Date(record.resetTime) };
  }

  async increment(key) {
    const k = this.prefix + key;
    if (!isReady()) {
      return this._incrementMemory(k);
    }
    try {
      const [totalHits, , ttl] = await client.multi().incr(k).pExpire(k, this.windowMs, 'NX').pTTL(k).exec();
      return { totalHits: Number(totalHits), resetTime: new Date(Date.now() + Math.max(0, Number(ttl))) };
    } catch {
      return this._incrementMemory(k);
    }
  }

  async decrement(key) {
    const k = this.prefix + key;
    const record = this.memoryStore.get(k);
    if (record && record.totalHits > 0) record.totalHits -= 1;
    if (isReady()) {
      try {
        await client.decr(k);
      } catch {}
    }
  }

  async resetKey(key) {
    const k = this.prefix + key;
    this.memoryStore.delete(k);
    if (isReady()) {
      try {
        await client.del(k);
      } catch {}
    }
  }
}

module.exports = { RedisRateLimitStore };

if (require.main === module) {
  const assert = require('assert');
  (async () => {
    const store = new RedisRateLimitStore('test_rl:');
    store.init({ windowMs: 1000 });
    const key = store.prefix + 'ip_1';
    const res1 = store._incrementMemory(key);
    assert.strictEqual(res1.totalHits, 1);
    const res2 = store._incrementMemory(key);
    assert.strictEqual(res2.totalHits, 2);
    await store.decrement('ip_1');
    assert.strictEqual(store.memoryStore.get(key).totalHits, 1);
    await store.resetKey('ip_1');
    assert.strictEqual(store.memoryStore.get(key), undefined);
    console.log('rateLimitStore self-check: ok');
    await client.quit().catch(() => {});
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
