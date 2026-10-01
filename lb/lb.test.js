// Kiểm thử bộ cân bằng tải: node lb/lb.test.js — backend giả chạy trong cùng tiến trình.
const assert = require('assert');
const http = require('http');
const net = require('net');
const { createLoadBalancer } = require('./index');
const { createPool, pick, recordFailure, recordHealth, recordLatency } = require('./balancer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Backend giả: trả tên mình, chậm `delay` ms, /healthz theo cờ `healthy`, 503 khi `draining`.
function fakeBackend(name, opts = {}) {
  const st = { name, delay: 0, healthy: true, draining: false, hits: 0, lastHeaders: null, ...opts };
  st.server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') { res.writeHead(st.healthy ? 200 : 503); return res.end(); }
    st.hits += 1;
    st.lastHeaders = req.headers;
    if (st.draining) { res.writeHead(503); return res.end('draining'); }
    let body = '';
    for await (const c of req) body += c;
    await sleep(st.delay);
    res.writeHead(200, { 'X-Instance': name });
    res.end(JSON.stringify({ name, url: req.url, body }));
  });
  // WebSocket giả: bắt tay 101 rồi phản hồi lại (echo) mọi byte nhận được.
  st.server.on('upgrade', (req, socket) => {
    st.hits += 1;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(d));
    socket.on('end', () => socket.end()); // socket của http.Server cho phép nửa mở — tự đóng như ws thật
  });
  st.listen = () => new Promise((r) => st.server.listen(0, '127.0.0.1', () => { st.port = st.server.address().port; r(); }));
  st.close = () => new Promise((r) => { st.server.closeAllConnections(); st.server.close(r); });
  return st;
}

function request(port, { method = 'GET', path = '/api/songs', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, agent: false, headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {} }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: data.startsWith('{') ? JSON.parse(data) : data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function withLb(backends, realtime, cfgOver, fn) {
  const cfg = {
    port: 0, api: backends.map((b) => `127.0.0.1:${b.port}`), realtime: realtime.map((b) => `127.0.0.1:${b.port}`),
    algo: 'round-robin', hcIntervalMs: 50, hcTimeoutMs: 40, headerTimeoutMs: 2000, maxRetries: 2, clientIpHeader: '', ...cfgOver,
  };
  const lb = createLoadBalancer(cfg, { log: () => {} });
  const port = await lb.listen(0);
  try { await fn(port, lb); } finally { await lb.close(); }
}

// ---------- Thuật toán (thuần) ----------
function unitTests() {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const p = createPool('api', ['a:1', 'b:2', 'c:3'], { algo: 'p2c-ewma', rand });
  const [a, b, c] = p.backends;
  recordLatency(a, 5); recordLatency(b, 5); recordLatency(c, 200);
  const counts = { 'a:1': 0, 'b:2': 0, 'c:3': 0 };
  for (let i = 0; i < 300; i++) counts[pick(p).addr] += 1;
  assert.strictEqual(counts['c:3'], 0, 'p2c-ewma không chọn bản chậm hơn 40× khi còn bản nhanh');

  // Peak EWMA: tăng thì nhận ngay, giảm thì trượt.
  recordLatency(a, 100);
  assert.strictEqual(a.ewmaMs, 100);
  recordLatency(a, 0.001);
  assert(a.ewmaMs > 60 && a.ewmaMs < 100, 'giảm từ từ');

  // least-conn
  const lc = createPool('api', ['x:1', 'y:2'], { algo: 'least-conn' });
  lc.backends[0].inflight = 5;
  assert.strictEqual(pick(lc).addr, 'y:2');

  // Outlier ejection: 3 lỗi liên tiếp → loại, thời gian loại tăng gấp đôi.
  const oe = createPool('api', ['x:1', 'y:2'], { algo: 'round-robin', ejectAfter: 3, ejectBaseMs: 1000 });
  const x = oe.backends[0];
  assert.strictEqual(recordFailure(oe, x, 0), false);
  recordFailure(oe, x, 0);
  assert.strictEqual(recordFailure(oe, x, 0), true, 'lỗi thứ 3 → loại');
  assert.strictEqual(x.ejectedUntil, 1000);
  for (let i = 0; i < 3; i++) recordFailure(oe, x, 2000);
  assert.strictEqual(x.ejectedUntil, 2000 + 2000, 'tái phạm → gấp đôi');
  for (let i = 0; i < 10; i++) assert.strictEqual(pick(oe, { now: 2500 }).addr, 'y:2', 'bản bị loại không được chọn');

  // Health check: fall=2 mới xuống, rise=2 mới lên.
  const hc = createPool('api', ['x:1'], {});
  const h = hc.backends[0];
  assert.strictEqual(recordHealth(hc, h, false), null);
  assert.strictEqual(recordHealth(hc, h, false), 'down');
  assert.strictEqual(pick(hc), null);
  assert.strictEqual(recordHealth(hc, h, true), null);
  assert.strictEqual(recordHealth(hc, h, true), 'up');

  // failover: luôn bản khoẻ đầu tiên.
  const fo = createPool('rt', ['p:1', 's:2'], { mode: 'failover' });
  assert.strictEqual(pick(fo).addr, 'p:1');
  fo.backends[0].up = false;
  assert.strictEqual(pick(fo).addr, 's:2');
}

// ---------- Tích hợp (mạng thật trên loopback) ----------
async function integrationTests() {
  const [b1, b2, b3] = [fakeBackend('b1'), fakeBackend('b2'), fakeBackend('b3')];
  const rt = fakeBackend('rt');
  for (const b of [b1, b2, b3, rt]) await b.listen();

  // 1. Round-robin chia đều; X-Forwarded-For + X-Request-Id được gắn.
  await withLb([b1, b2, b3], [rt], {}, async (port) => {
    for (let i = 0; i < 30; i++) await request(port);
    assert.deepStrictEqual([b1.hits, b2.hits, b3.hits], [10, 10, 10], 'round-robin chia đều');
    assert(b1.lastHeaders['x-forwarded-for'], 'có X-Forwarded-For');
    assert(b1.lastHeaders['x-request-id'], 'có X-Request-Id');
  });

  // 2. Định tuyến theo chức năng: /api/rooms và /socket.io sang tầng realtime.
  await withLb([b1, b2, b3], [rt], {}, async (port) => {
    const before = rt.hits;
    const r = await request(port, { path: '/api/rooms/stations' });
    assert.strictEqual(r.json.name, 'rt');
    assert.strictEqual(rt.hits, before + 1);
    assert.strictEqual((await request(port, { path: '/api/songs' })).json.name === 'rt', false);
  });

  // 3. Một bản chết giữa chừng: không request nào lỗi (retry sang bản khác), kể cả POST.
  await withLb([b1, b2, b3], [rt], {}, async (port) => {
    await b2.close();
    const results = [];
    for (let i = 0; i < 20; i++) results.push(await request(port));
    results.push(await request(port, { method: 'POST', path: '/api/auth/login', body: '{"x":1}' }));
    assert(results.every((r) => r.status === 200), 'không lỗi khi một bản chết');
    assert.strictEqual(results.at(-1).json.body, '{"x":1}', 'body POST được gửi lại nguyên vẹn');
    assert(results.some((r) => r.headers['x-lb-retried']), 'có retry');
    await sleep(200); // health check kịp đánh dấu DOWN
    const hitsBefore = b1.hits + b3.hits;
    for (let i = 0; i < 10; i++) {
      const r = await request(port);
      assert.strictEqual(r.headers['x-lb-retried'], undefined, 'đã loại bản chết → không cần retry nữa');
    }
    assert.strictEqual(b1.hits + b3.hits, hitsBefore + 10);
    await b2.listen(); // cổng mới
  });

  // 4. Bản đang tắt êm trả 503 cho GET → chuyển sang bản khác, client không thấy lỗi.
  const d1 = fakeBackend('d1', { draining: true });
  const d2 = fakeBackend('d2');
  await d1.listen(); await d2.listen();
  await withLb([d1, d2], [rt], {}, async (port) => {
    for (let i = 0; i < 6; i++) {
      const r = await request(port);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.name, 'd2');
    }
  });

  // 5. /healthz 503 → bị đánh dấu DOWN, không nhận request nữa.
  await withLb([d1, d2], [rt], {}, async (port) => {
    d1.draining = false;
    d1.healthy = false;
    await sleep(200);
    const before = d1.hits;
    for (let i = 0; i < 6; i++) await request(port);
    assert.strictEqual(d1.hits, before, 'bản không khoẻ không nhận request');
    d1.healthy = true;
    await sleep(200);
    for (let i = 0; i < 6; i++) await request(port);
    assert(d1.hits > before, 'khoẻ lại thì nhận request trở lại');
  });

  // 6. p2c-ewma tránh bản chậm (thật, qua mạng).
  const f1 = fakeBackend('f1'); const f2 = fakeBackend('f2'); const slow = fakeBackend('slow', { delay: 80 });
  for (const b of [f1, f2, slow]) await b.listen();
  await withLb([f1, f2, slow], [rt], { algo: 'p2c-ewma' }, async (port) => {
    for (let i = 0; i < 60; i++) await request(port);
    assert(slow.hits <= 3, `p2c-ewma gửi ${slow.hits}/60 request cho bản chậm`);
  });

  // 7. Tất cả bản chết → 503 kèm Retry-After, không treo.
  const dead = fakeBackend('dead');
  await dead.listen();
  await withLb([dead], [rt], {}, async (port) => {
    await dead.close();
    const r = await request(port);
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.headers['retry-after'], '1');
  });

  // 8. WebSocket Upgrade được chuyển tiếp tới tầng realtime, dữ liệu đi hai chiều.
  await withLb([b1], [rt], {}, async (port) => {
    const echoed = await new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1', () => {
        s.write('GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
      let buf = '';
      s.on('data', (d) => {
        buf += d;
        if (buf.includes('101') && !buf.includes('ping')) s.write('ping');
        if (buf.includes('ping')) { s.destroy(); resolve(buf); }
      });
      s.on('error', reject);
    });
    assert(echoed.startsWith('HTTP/1.1 101'), 'bắt tay 101');
    assert(echoed.includes('ping'), 'dữ liệu đi hai chiều');
  });

  for (const b of [b1, b2, b3, rt, d1, d2, f1, f2, slow]) await b.close();
}

unitTests();
integrationTests()
  .then(() => console.log('lb self-check: ok'))
  .catch((e) => { console.error(e); process.exit(1); });
