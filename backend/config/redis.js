const { createClient } = require('redis');
const { env } = require('./env');

// Cache-aside layer cho danh mục bài hát (songController.js getSongs)
// Nếu Redis không chạy, các hàm cache tự động fallback (cache miss) thay vì làm gián đoạn request
const client = createClient({ url: env.REDIS_URL });
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

module.exports = {
  client,
  cacheGet,
  cacheSet,
  cacheDel,
  isReady: () => isReady,
};
