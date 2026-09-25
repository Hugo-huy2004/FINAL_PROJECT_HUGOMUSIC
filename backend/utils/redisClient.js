const { createClient } = require('redis');

// Cache-aside layer for the hot, identical catalogue read (see
// controllers/songController.js getSongs).
//
// ponytail: if Redis isn't running, every call below just no-ops (cache miss)
// instead of crashing the request — this is a performance layer, not a source of
// truth, so the app must work correctly without it.
const client = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
let isReady = false;

client.on('error', (err) => {
  if (isReady) console.warn('[redis] connection error:', err.message);
  isReady = false;
});
client.on('ready', () => {
  isReady = true;
  console.log('[redis] connected');
});

client.connect().catch((err) => console.warn('[redis] initial connect failed, caching disabled:', err.message));

async function cacheGet(key) {
  if (!isReady) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[redis] GET failed:', err.message);
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  if (!isReady) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.warn('[redis] SET failed:', err.message);
  }
}

async function cacheDel(key) {
  if (!isReady) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn('[redis] DEL failed:', err.message);
  }
}

module.exports = { cacheGet, cacheSet, cacheDel };
