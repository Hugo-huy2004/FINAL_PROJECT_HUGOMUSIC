// Kiểm lớp kết nối client (src/utils/net.ts): node scripts/check-net.mjs
import assert from 'node:assert/strict';
import { createHttpClient, backoffMs } from '../src/utils/net.ts';

const json = (status, body, headers = {}) => new Response(status === 304 ? null : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
});
const noSleep = { sleep: async () => {}, rand: () => 0.5 };

// 1. Full jitter nằm trong [0, min(cap, base·2^n)).
for (let n = 0; n < 8; n++) {
  const hi = Math.min(4000, 300 * 2 ** n);
  assert.ok(backoffMs(n, 300, 4000, () => 0.999) < hi);
  assert.equal(backoffMs(n, 300, 4000, () => 0), 0);
}

// 2. GET: lỗi mạng rồi 503 rồi thành công → 2 lần retry, client thấy thành công.
{
  const seq = [() => { throw new TypeError('network'); }, () => json(503, {}), () => json(200, { ok: 1 })];
  let calls = 0;
  const c = createHttpClient({ ...noSleep, fetchImpl: async () => seq[calls++]() });
  const r = await c.send('/a', { headers: {} });
  assert.equal(r.status, 200);
  assert.equal(r.retries, 2);
  assert.equal(calls, 3);
}

// 3. POST không bao giờ tự retry (tránh tạo bản ghi hai lần).
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

// 4. Hết lượt retry thì trả lỗi thật (không lặp vô hạn).
{
  let calls = 0;
  const c = createHttpClient({ ...noSleep, retries: 2, fetchImpl: async () => { calls++; return json(502, {}); } });
  assert.equal((await c.send('/x', { headers: {} })).status, 502);
  assert.equal(calls, 3);
}

// 5. Retry-After của server được tôn trọng (giây → ms, có trần).
{
  const waits = [];
  const seq = [() => json(503, {}, { 'retry-after': '1' }), () => json(200, {})];
  let i = 0;
  const c = createHttpClient({ sleep: async (ms) => { waits.push(ms); }, fetchImpl: async () => seq[i++]() });
  await c.send('/r', { headers: {} });
  assert.deepEqual(waits, [1000]);
}

// 6. Timeout: fetch treo → bị huỷ sau timeoutMs, rồi retry.
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

// 7. Gộp request: 5 lời gọi cùng GET đang bay → 1 request mạng. Khác phiên thì tách riêng.
{
  let calls = 0;
  const c = createHttpClient({ ...noSleep, fetchImpl: async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return json(200, { n: calls }); } });
  const rs = await Promise.all(Array.from({ length: 5 }, () => c.send('/songs', { headers: {} })));
  assert.equal(calls, 1);
  assert.ok(rs.every((r) => r.data.n === 1));
  await Promise.all([c.send('/me', { headers: { Authorization: 'Bearer A' } }), c.send('/me', { headers: { Authorization: 'Bearer B' } })]);
  assert.equal(calls, 3, 'mỗi phiên một request');
}

// 8. ETag: lần 2 gửi If-None-Match, nhận 304 → trả dữ liệu cũ, 0 byte thân.
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
