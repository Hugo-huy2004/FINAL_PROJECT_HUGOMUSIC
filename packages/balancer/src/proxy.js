// Layer-7 load balancer for HTTP and WebSocket — plain Node, no dependencies. Backend choice: ./balancer.js.
//
// Two pools:
//   api       stateless REST, balanced across every copy.
//   realtime  optional; requests under `realtimePaths` (default /socket.io) go to the first healthy copy only
//             (failover), for state that lives in one process — rooms, live sessions.
//
// Connection handling:
//   - Keep-alive pool per backend (http.Agent): no TCP handshake per request.
//   - Retry on ANOTHER backend when a request fails before any response: always when the connection was refused
//     (the request never reached the backend, so even POST is safe); for GET/HEAD/OPTIONS also when the
//     connection broke or the backend answered 502/503 (e.g. it is draining).
//   - Timeout waiting for response headers → 504, so a client never hangs forever.
//   - X-Forwarded-For/Proto/Host and X-Request-Id tell the backend the real client and trace a request across layers.
//   - WebSocket: after the backend accepts the Upgrade, the raw TCP stream is piped both ways.
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { createPool, pick, recordLatency, recordSuccess, recordFailure, recordHealth } = require('./balancer');

const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BUFFERED_BODY = 1024 * 1024; // larger bodies (uploads) are streamed straight through: one attempt, no retry
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade'];
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/** Configuration from environment variables (LB_*); every field can also be passed to createLoadBalancer directly. */
function readConfig(env = process.env) {
  const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.LB_PORT || 8080),
    api: list(env.LB_API),
    realtime: list(env.LB_REALTIME),
    realtimePaths: list(env.LB_REALTIME_PATHS || '/socket.io'),
    algo: env.LB_ALGO || 'p2c-ewma',
    healthPath: env.LB_HEALTH_PATH || '/healthz',
    hcIntervalMs: Number(env.LB_HC_INTERVAL_MS || 1000),
    hcTimeoutMs: Number(env.LB_HC_TIMEOUT_MS || 800),
    headerTimeoutMs: Number(env.LB_HEADER_TIMEOUT_MS || 30000),
    maxRetries: Number(env.LB_MAX_RETRIES || 2),
    // Behind a tunnel or another proxy that sets the real client IP in a header. Enable only when EVERY
    // connection arrives through it, or clients could spoof their IP.
    clientIpHeader: (env.LB_CLIENT_IP_HEADER || '').toLowerCase(),
  };
}

function createLoadBalancer(options, { log = console.log } = {}) {
  const cfg = { ...readConfig({}), ...options };
  const pools = { api: createPool('api', cfg.api, { algo: cfg.algo }) };
  if (cfg.realtime.length) pools.realtime = createPool('realtime', cfg.realtime, { mode: 'failover' });

  const agents = new Map(); // backend → its own keep-alive http.Agent
  const agentOf = (b) => {
    if (!agents.has(b)) agents.set(b, new http.Agent({ keepAlive: true, maxSockets: 512, timeout: 30000 }));
    return agents.get(b);
  };
  const isRealtime = (url) => cfg.realtimePaths.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`));
  const poolFor = (url) => (pools.realtime && isRealtime(url) ? pools.realtime : pools.api);
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
    if (req.url === '/__lb/stats' && LOOPBACK.includes(req.socket.remoteAddress)) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(stats(), null, 2));
    }
    const pool = poolFor(req.url);
    const headers = forwardHeaders(req);

    // A small body is buffered so it can be resent on retry; a big one is streamed (single attempt).
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
        return res.end(JSON.stringify({ message: 'Server busy, please try again shortly' }));
      }
      tried.add(b);
      const outcome = await tryBackend(pool, b, req, res, headers, body, streamBody);
      if (outcome === 'done') return;
      const retryable = outcome === 'refused' || (IDEMPOTENT.has(req.method) && !streamBody);
      if (!retryable || attempt >= cfg.maxRetries) {
        if (!res.headersSent) res.writeHead(outcome === 'timeout' ? 504 : 502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Could not connect to server' }));
      }
      res.setHeader('X-LB-Retried', String(attempt + 1));
    }
  }

  // One attempt → 'done' (response sent to the client) | 'refused' (never reached the backend) |
  // 'failed' (broke or 502/503 before a response) | 'timeout'.
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
        // Backend down or draining (502/503): for a repeatable request, try another backend instead.
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
        // A media stream stays open for minutes: it counts as in flight until the response really ends —
        // exactly what least-conn and p2c need to know.
        res.on('close', () => { release(); if (!ur.complete) ur.destroy(); });
        finish('done');
      });

      up.on('error', (err) => {
        clearTimeout(timer);
        release();
        if (settled) return; // failed after the response started: the client sees a broken connection
        recordFailure(pool, b);
        const code = err.code;
        if (err.message === 'header timeout') return finish('timeout');
        finish(code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND' ? 'refused' : 'failed');
      });

      // Client left midway (seek, skip): cancel the backend request too.
      res.on('close', () => { if (!res.writableFinished) up.destroy(); });

      if (streamBody) req.pipe(up);
      else up.end(body || undefined);
    });
  }

  // ---------- WebSocket (Upgrade) ----------
  // Upgraded sockets leave the HTTP server (closeAllConnections cannot see them), so they are tracked to close them.
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

  // ---------- Active health checks ----------
  function checkOnce(pool, b) {
    const req = http.get({ host: b.host, port: b.port, path: cfg.healthPath, timeout: cfg.hcTimeoutMs, agent: false }, (r) => {
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
