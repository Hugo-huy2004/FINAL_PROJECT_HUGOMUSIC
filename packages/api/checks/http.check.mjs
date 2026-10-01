// Check the client connection layer (src/utils/net.ts): node scripts/check-net.mjs
import assert from 'node:assert/strict';
import { createHttpClient, backoffMs } from '../src/http.ts';

const json = (status, body, headers = {}) => new Response(status === 304 ? null : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
});
const noSleep = { sleep: async () => {}, rand: () => 0.5 };

// 1. Full jitter is in [0, min(cap, base·2^n)).
for (let n = 0; n < 8; n++) {
  const hi = Math.min(4000, 300 * 2 ** n);
  assert.ok(backoffMs(n, 300, 4000, () => 0.999) < hi);
  assert.equal(backoffMs(n, 300, 4000, () => 0), 0);
}

// 2. GET: network error 503 then success → 2 retries, client sees success.
{
  const seq = [() => { throw new TypeError('network'); }, () => json(503, {}), () => json(200, { ok: 1 })];
  let calls = 0;
  const c = createHttpClient({ ...noSleep, fetchImpl: async () => seq[calls++]() });
  const r = await c.send('/a', { headers: {} });
  assert.equal(r.status, 200);
  assert.equal(r.retries, 2);
  assert.equal(calls, 3);
}

// 3. POST never retries itself (avoid creating records twice).
{
  let calls = 0;
  const c = createHttpClient({ ...noSleep, fetchImpl: async () => { calls++; return json(503, {}); } });
  const r = await c.send('/p', { method: 'POST', headers: {} });
  assert.equal(r.status, 503);
  assert.equal(calls, 1);
  let calls2 = 0;
  const c2 = createHttpClient({ ...noSleep, fetchImpl: async () => { calls2++; throw new TypeError('network'); } });
  await assert.rejects(c2.send('/p', { method: 'POST', headers: {} }));
  assert.equal(calls2, 1);
}

// 4. At the end of the retry, return the actual error (do not repeat indefinitely).
{
  let calls = 0;
  const c = createHttpClient({ ...noSleep, retries: 2, fetchImpl: async () => { calls++; return json(502, {}); } });
  assert.equal((await c.send('/x', { headers: {} })).status, 502);
  assert.equal(calls, 3);
}

// 5. Server Retry-After is respected (seconds → ms, with ceiling).
{
  const waits = [];
  const seq = [() => json(503, {}, { 'retry-after': '1' }), () => json(200, {})];
  let i = 0;
  const c = createHttpClient({ sleep: async (ms) => { waits.push(ms); }, fetchImpl: async () => seq[i++]() });
  await c.send('/r', { headers: {} });
  assert.deepEqual(waits, [1000]);
}

// 6. Timeout: fetch hangs → canceled after timeoutMs, then retry.
{
  let calls = 0;
  const c = createHttpClient({
    ...noSleep, timeoutMs: 30, retries: 1,
    fetchImpl: (url, init) => { calls++; return calls === 1 ? new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))) : Promise.resolve(json(200, { late: false })); },
  });
  const r = await c.send('/t', { headers: {} });
  assert.equal(r.data.late, false);
  assert.equal(calls, 2);
}

// 7. Combine requests: 5 calls with GET in flight → 1 network request. Different sessions are separate.
{
  let calls = 0;
  const c = createHttpClient({ ...noSleep, fetchImpl: async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return json(200, { n: calls }); } });
  const rs = await Promise.all(Array.from({ length: 5 }, () => c.send('/songs', { headers: {} })));
  assert.equal(calls, 1);
  assert.ok(rs.every((r) => r.data.n === 1));
  await Promise.all([c.send('/me', { headers: { Authorization: 'Bearer A' } }), c.send('/me', { headers: { Authorization: 'Bearer B' } })]);
  assert.equal(calls, 3, 'mỗi phiên một request');
}

// 8. ETag: 2nd time send If-None-Match, receive 304 → return old data, 0 body bytes.
{
  const seen = [];
  const c = createHttpClient({
    ...noSleep,
    fetchImpl: async (url, init) => {
      seen.push(init.headers['If-None-Match']);
      return init.headers['If-None-Match'] === 'W/"v1"' ? json(304) : json(200, { songs: [1, 2, 3] }, { etag: 'W/"v1"' });
    },
  });
  const a = await c.send('/api/songs', { headers: {} });
  const b = await c.send('/api/songs', { headers: {} });
  assert.deepEqual(seen, [undefined, 'W/"v1"']);
  assert.equal(b.status, 200);
  assert.equal(b.fromCache, true);
  assert.deepEqual(b.data, a.data);
}

console.log('net self-check: ok');
