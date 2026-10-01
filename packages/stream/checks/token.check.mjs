// Playback tokens: binding to the key, shared windows, HLS prefixes, expiry, tampering — and the exact format of
// the previous Node implementation (node:crypto base64url), so tokens already in flight stay valid.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mintToken, verifyToken, prefixForKey } from '../src/index.js';

const S = 'check-secret';
const now = 1_790_000_123_000;
const full = await mintToken('audio/a.mp3', S, { now });

assert.equal(full, `1790000700.${createHmac('sha256', S).update('audio/a.mp3|1790000700').digest('base64url')}`, 'format: exp = end of the window after this one (lives 5–10 min), base64url HMAC');
assert.equal(await verifyToken('audio/a.mp3', full, S, { now }), true);
assert.equal(await verifyToken('audio/b.mp3', full, S, { now }), false, 'bound to its key');
assert.equal(await verifyToken('audio/a.mp3', full, 'other', { now }), false, 'bound to the secret');
assert.equal(await mintToken('audio/a.mp3', S, { now: now + 60_000 }), full, 'same window → same token (prefetch reuse)');
assert.equal(prefixForKey('hls/abc/low_007.ts'), 'hls/abc');
assert.equal(await verifyToken('hls/abc/low_007.ts', await mintToken('hls/abc/master.m3u8', S, { now }), S, { now }), true, 'one token covers every segment');
assert.equal(await verifyToken('audio/a.mp3', full, S, { now: 1_790_000_701_000 }), false, 'expired');

const [exp, sig] = full.split('.');
for (const bad of [`1.${sig}`, `${full}.x`, `${exp}.`, `${exp}.${sig.slice(1)}`, `${exp}.!!`, '', null, 42]) {
  assert.equal(await verifyToken('audio/a.mp3', bad, S, { now }), false, `rejects ${bad}`);
}
await assert.rejects(mintToken('audio/a.mp3', ''), /secret/);
assert.equal(await verifyToken('audio/a.mp3', full, ''), false, 'missing secret never verifies');
console.log('token: ok');
