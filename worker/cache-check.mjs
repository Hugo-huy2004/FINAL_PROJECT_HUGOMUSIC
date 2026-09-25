// Self-check for src/index.js: `node worker/cache-check.mjs`.
// Mocks R2 + the Cache API with the two rules that matter (put rejects 206; match
// honours Range), and mints tokens with the BACKEND's playbackToken.js so the Node
// and Web Crypto implementations are proven to agree.
import worker from './src/index.js';
import assert from 'node:assert';
import { createRequire } from 'node:module';

process.env.JWT_SECRET = 'cache-check';
const { mintToken } = createRequire(import.meta.url)('../backend/utils/playbackToken.js');
const full = mintToken('audio/a.mp3');

const BODY = new Uint8Array(1000).map((_, i) => i % 256);
const store = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const hit = store.get(req.url);
      if (!hit) return undefined;
      const range = req.headers.get('Range');
      if (!range) return new Response(hit.body, { status: 200, headers: hit.headers });
      const [a, b] = range.slice(6).split('-').map(Number);
      return new Response(hit.body.slice(a, b + 1), { status: 206, headers: hit.headers });
    },
    async put(key, res) {
      if (res.status === 206) throw new TypeError('Cannot cache 206');
      store.set(key, { body: new Uint8Array(await res.arrayBuffer()), headers: res.headers });
    },
  },
};
const env = {
  JWT_SECRET: 'cache-check',
  BUCKET: {
    head: async () => ({ size: BODY.length, httpEtag: '"e"', httpMetadata: { contentType: 'audio/mpeg' } }),
    get: async (_k, opts) => ({
      body: new Response(opts?.range ? BODY.slice(opts.range.offset, opts.range.offset + opts.range.length) : BODY).body,
    }),
  },
};
const run = async (url, headers = {}) => {
  const pending = [];
  const res = await worker.fetch(new Request(url, { headers }), env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
};

// No token -> no music.
let res = await run('https://cdn.test/audio/a.mp3', { Range: 'bytes=0-99' });
assert.equal(res.status, 401);
res = await run('https://cdn.test/audio/a.mp3?token=9999999999.forged', { Range: 'bytes=0-99' });
assert.equal(res.status, 401);

// First listener: range MISS, served from R2, full object cached in the background.
res = await run(`https://cdn.test/audio/a.mp3?token=${full}`, { Range: 'bytes=0-99' });
assert.equal(res.status, 206);
assert.equal(res.headers.get('X-Edge-Cache'), 'MISS');
assert.equal((await res.arrayBuffer()).byteLength, 100);
assert.ok(store.has('https://cdn.test/audio/a.mp3'), 'cache key must not contain the token');

// Second listener (token in the URL differs from the cached key), seeks: served from edge.
res = await run(`https://cdn.test/audio/a.mp3?token=${full}&t=2`, { Range: 'bytes=500-599' });
assert.equal(res.status, 206);
assert.equal(res.headers.get('X-Edge-Cache'), 'HIT');
assert.deepEqual(new Uint8Array(await res.arrayBuffer()), BODY.slice(500, 600));

// Không token / token bị sửa / token của bài khác -> 401 (cổng ký ở utils/playbackToken.js).
for (const bad of ['', 'token=', `token=${full}x`, `token=${mintToken('audio/b.mp3')}`, `token=${full.replace('.', '.p1500.')}`]) {
  res = await run(`https://cdn.test/audio/a.mp3?${bad}`);
  assert.equal(res.status, 401, `phải từ chối: ${bad}`);
}

// *.workers.dev: Cache API vô tác dụng -> không đọc/ghi cache.
store.clear();
res = await run(`https://x.workers.dev/audio/a.mp3?token=${full}`, { Range: 'bytes=0-99' });
assert.equal(res.status, 206);
assert.equal(store.size, 0, 'không lưu cache trên workers.dev');

// Playlists hand the token down to every child URI (works for native HLS players too).
env.BUCKET.get = async () => ({ text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8\n', body: null });
const hlsToken = mintToken('hls/x');
res = await run(`https://cdn.test/hls/x/master.m3u8?token=${hlsToken}`);
assert.equal(res.status, 200);
assert.ok((await res.text()).includes(`low.m3u8?token=${encodeURIComponent(hlsToken)}`));

console.log('worker cache-check: ok');
