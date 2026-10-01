// Bộ cân bằng tải tầng 7 (HTTP + WebSocket) của Hugo Music — Node thuần, không thư viện ngoài.
// Thuật toán chọn backend: lb/balancer.js. Chạy: node lb/index.js (cấu hình qua biến môi trường, xem
// readConfig). Kiểm thử: node lb/lb.test.js.
//
// Định tuyến theo chức năng:
//   /socket.io/*, /api/rooms/*  → pool "realtime" (chế độ failover — trạng thái đài/phòng ở một tiến trình)
//   còn lại                     → pool "api"      (chế độ balance — REST không trạng thái, nhân bản được)
//
// Kỹ thuật kết nối:
//   - Keep-alive + pool kết nối tới từng backend (http.Agent): không bắt tay TCP lại cho mỗi request.
//   - Retry sang backend KHÁC khi lỗi trước khi có phản hồi: luôn với lỗi không kết nối được (request
//     chưa tới backend → an toàn cả với POST), và với GET/HEAD khi kết nối đứt hoặc backend trả 502/503.
//   - Timeout chờ header phản hồi → 504, không treo client vô hạn.
//   - X-Forwarded-For/Proto/Host + X-Request-Id để backend biết IP thật và lần vết một request qua các tầng.
//   - WebSocket: chuyển tiếp nguyên luồng TCP sau khi backend chấp nhận Upgrade.
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { createPool, pick, recordLatency, recordSuccess, recordFailure, recordHealth } = require('./balancer');

const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BUFFERED_BODY = 1024 * 1024; // body lớn hơn (upload nhạc/ảnh) thì stream thẳng, không retry được
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade'];

function readConfig(env = process.env) {
  const list = (v, d) => (v || d).split(',').map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.LB_PORT || 5001),
    api: list(env.LB_API, '127.0.0.1:5011,127.0.0.1:5012,127.0.0.1:5013'),
    realtime: list(env.LB_REALTIME, '127.0.0.1:5021'),
    algo: env.LB_ALGO || 'p2c-ewma',
    hcIntervalMs: Number(env.LB_HC_INTERVAL_MS || 1000),
    hcTimeoutMs: Number(env.LB_HC_TIMEOUT_MS || 800),
    headerTimeoutMs: Number(env.LB_HEADER_TIMEOUT_MS || 30000),
    maxRetries: Number(env.LB_MAX_RETRIES || 2),
    // Đứng sau Cloudflare Tunnel: IP thật nằm ở header này (chỉ bật khi MỌI kết nối đều qua tunnel).
    clientIpHeader: (env.LB_CLIENT_IP_HEADER || '').toLowerCase(),
  };
}

function createLoadBalancer(cfg, { log = console.log } = {}) {
  const pools = {
    api: createPool('api', cfg.api, { algo: cfg.algo }),
    realtime: createPool('realtime', cfg.realtime, { mode: 'failover' }),
  };
  const agents = new Map(); // backend → http.Agent keep-alive riêng
  const agentOf = (b) => {
    if (!agents.has(b)) agents.set(b, new http.Agent({ keepAlive: true, maxSockets: 512, timeout: 30000 }));
    return agents.get(b);
  };
  const poolFor = (url) => (/^\/(socket\.io|api\/rooms)(\/|$|\?)/.test(url) ? pools.realtime : pools.api);
  const clientIp = (req) => (cfg.clientIpHeader && req.headers[cfg.clientIpHeader]) || req.socket.remoteAddress;

  function forwardHeaders(req) {
    const h = { ...req.headers };
    for (const k of HOP_BY_HOP) delete h[k];
    const prior = req.headers['x-forwarded-for'];
    const ip = clientIp(req);
    h['x-forwarded-for'] = cfg.clientIpHeader ? ip : prior ? `${prior}, ${ip}` : ip;
    h['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
    h['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host || '';
    h['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
    return h;
  }

  // ---------- HTTP ----------
  async function handle(req, res) {
    if (req.url === '/__lb/stats' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(stats(), null, 2));
    }
    const pool = poolFor(req.url);
    const headers = forwardHeaders(req);

    // Body nhỏ thì đệm lại để retry được; body lớn stream thẳng (một lần thử).
    let body = null;
    const len = Number(req.headers['content-length'] || 0);
    const hasBody = len > 0 || req.headers['transfer-encoding'];
    if (hasBody && len > 0 && len <= MAX_BUFFERED_BODY) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    const streamBody = hasBody && !body;

    const tried = new Set();
    for (let attempt = 0; ; attempt += 1) {
      const b = pick(pool, { exclude: tried });
      if (!b) {
        if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '1' });
        return res.end(JSON.stringify({ message: 'Máy chủ đang bận, thử lại sau giây lát' }));
      }
      tried.add(b);
      const outcome = await tryBackend(pool, b, req, res, headers, body, streamBody);
      if (outcome === 'done') return;
      const retryable = outcome === 'refused' || (IDEMPOTENT.has(req.method) && !streamBody);
      if (!retryable || attempt >= cfg.maxRetries) {
        if (!res.headersSent) res.writeHead(outcome === 'timeout' ? 504 : 502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Không kết nối được máy chủ' }));
      }
      res.setHeader('X-LB-Retried', String(attempt + 1));
    }
  }

  // Một lần thử. Kết quả: 'done' (đã trả lời client) | 'refused' (chưa tới được backend) |
  // 'failed' (đứt/5xx trước khi có phản hồi) | 'timeout'.
  function tryBackend(pool, b, req, res, headers, body, streamBody) {
    return new Promise((resolve) => {
      const started = process.hrtime.bigint();
      b.inflight += 1;
      b.requests += 1;
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      let released = false;
      const release = () => { if (!released) { released = true; b.inflight -= 1; } };

      const up = http.request({
        host: b.host, port: b.port, method: req.method, path: req.url, headers, agent: agentOf(b),
      });
      const timer = setTimeout(() => { up.destroy(new Error('header timeout')); }, cfg.headerTimeoutMs);

      up.on('response', (ur) => {
        clearTimeout(timer);
        recordLatency(b, Number(process.hrtime.bigint() - started) / 1e6);
        // Backend đang tắt/quá tải trả 502/503: với request lặp lại được, thử bản khác thay vì trả lỗi.
        if ((ur.statusCode === 502 || ur.statusCode === 503) && IDEMPOTENT.has(req.method) && !streamBody) {
          ur.resume();
          release();
          recordFailure(pool, b);
          return finish('failed');
        }
        recordSuccess(b);
        const out = { ...ur.headers };
        for (const k of HOP_BY_HOP) delete out[k];
        res.writeHead(ur.statusCode, out);
        ur.pipe(res);
        // Stream nhạc giữ kết nối hàng phút: "đang xử lý" tính tới khi phản hồi thật sự kết thúc —
        // chính điều least-conn/p2c cần biết.
        res.on('close', () => { release(); if (!ur.complete) ur.destroy(); });
        finish('done');
      });

      up.on('error', (err) => {
        clearTimeout(timer);
        release();
        if (settled) return; // lỗi sau khi đã chuyển phản hồi: client tự thấy kết nối đứt
        recordFailure(pool, b);
        const code = err.code;
        if (err.message === 'header timeout') return finish('timeout');
        finish(code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND' ? 'refused' : 'failed');
      });

      // Client bỏ đi giữa chừng (tua/skip bài): huỷ luôn request tới backend.
      res.on('close', () => { if (!res.writableFinished) up.destroy(); });

      if (streamBody) req.pipe(up);
      else up.end(body || undefined);
    });
  }

  // ---------- WebSocket (Upgrade) ----------
  // Socket đã Upgrade tách khỏi máy chủ HTTP (closeAllConnections không thấy) → tự giữ danh sách để tắt.
  const tunnels = new Set();
  function upgrade(req, socket, head) {
    const pool = poolFor(req.url);
    const b = pick(pool);
    if (!b) return socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    const headers = forwardHeaders(req);
    headers.connection = 'Upgrade';
    headers.upgrade = req.headers.upgrade;
    let connected = false;
    const upstream = net.connect(b.port, b.host, () => {
      connected = true;
      b.inflight += 1;
      b.requests += 1;
      recordSuccess(b);
      const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), '', ''];
      upstream.write(lines.join('\r\n'));
      if (head?.length) upstream.write(head);
      upstream.pipe(socket).pipe(upstream);
    });
    let closed = false;
    const tunnel = [socket, upstream];
    tunnels.add(tunnel);
    const close = () => {
      if (closed) return;
      closed = true;
      tunnels.delete(tunnel);
      if (connected) b.inflight -= 1;
      socket.destroy();
      upstream.destroy();
    };
    upstream.on('error', (e) => { if (e.code === 'ECONNREFUSED') recordFailure(pool, b); close(); });
    socket.on('error', close);
    upstream.on('close', close);
    socket.on('close', close);
  }

  // ---------- Health check chủ động ----------
  function checkOnce(pool, b) {
    const req = http.get({ host: b.host, port: b.port, path: '/healthz', timeout: cfg.hcTimeoutMs, agent: false }, (r) => {
      r.resume();
      report(pool, b, r.statusCode === 200);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => report(pool, b, false));
  }
  function report(pool, b, ok) {
    const change = recordHealth(pool, b, ok);
    if (change) log(`[lb] ${pool.name} ${b.addr} ${change.toUpperCase()}`);
  }
  let hcTimer = null;
  const startHealthChecks = () => {
    const tick = () => { for (const pool of Object.values(pools)) for (const b of pool.backends) checkOnce(pool, b); };
    tick();
    hcTimer = setInterval(tick, cfg.hcIntervalMs);
  };

  function stats() {
    const now = Date.now();
    return Object.fromEntries(Object.values(pools).map((p) => [p.name, {
      mode: p.mode, algo: p.mode === 'failover' ? 'failover' : p.algo,
      backends: p.backends.map((b) => ({
        addr: b.addr, up: b.up, ejected: b.ejectedUntil > now, inflight: b.inflight,
        ewmaMs: Math.round(b.ewmaMs * 10) / 10, requests: b.requests, failures: b.failures,
      })),
    }]));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      log(`[lb] ${e.message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.on('upgrade', upgrade);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  return {
    server, pools, stats,
    listen: (port = cfg.port) => new Promise((r) => server.listen(port, () => { startHealthChecks(); r(server.address().port); })),
    close: () => new Promise((r) => {
      clearInterval(hcTimer);
      for (const a of agents.values()) a.destroy();
      for (const t of tunnels) for (const s of t) s.destroy();
      server.closeAllConnections();
      server.close(r);
    }),
  };
}

module.exports = { createLoadBalancer, readConfig };

if (require.main === module) {
  const cfg = readConfig();
  const lb = createLoadBalancer(cfg);
  lb.listen().then((port) => {
    console.log(`[lb] :${port} algo=${cfg.algo} api=[${cfg.api}] realtime=[${cfg.realtime}]`);
  });
  const stop = () => lb.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
