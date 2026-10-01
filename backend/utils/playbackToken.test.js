const assert = require('assert');
const {
  mintToken,
  verifyToken,
} = require('./playbackToken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-123456';

// 1. mintToken & verifyToken test
const full = mintToken('audio/a.mp3');
assert.strictEqual(verifyToken('audio/a.mp3', full), true, 'valid token should verify');
assert.strictEqual(verifyToken('audio/b.mp3', full), false, 'token is bound to its key');
assert.strictEqual(mintToken('audio/a.mp3'), full, 'same window -> same token (prefetch reuse)');

// 2. HLS prefix token coverage
assert.strictEqual(
  verifyToken('hls/abc/low_007.ts', mintToken('hls/abc/master.m3u8')),
  true,
  'one token covers every segment of the song'
);

// 3. Expiration and format
const [, sig] = full.split('.');
assert.strictEqual(verifyToken('audio/a.mp3', `1.${sig}`), false, 'expired token rejected');
assert.strictEqual(verifyToken('audio/a.mp3', `${full}.x`), false, 'malformed token rejected');

console.log('✓ backend/utils/playbackToken.test.js passed');
