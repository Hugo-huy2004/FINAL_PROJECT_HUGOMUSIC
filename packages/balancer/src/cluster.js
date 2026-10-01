// Run a whole cluster on one machine with one command: N copies of your server + an optional realtime copy +
// the load balancer in front.
//
// Each copy gets ROLE ('api' | 'realtime'), PORT and INSTANCE_ID in its environment and must answer the health
// path with 200 when ready.
//   - Self-healing: a copy that dies is restarted after 1 s → 2 s → … → 30 s, so a crash loop cannot spin;
//     a copy that stayed up 60 s starts again from 1 s.
//   - Zero-downtime deploy: `kill -HUP <pid>` restarts the api copies one by one — SIGTERM (the copy drains
//     itself), wait for it to exit, start the new one, wait for its health check — so N−1 copies always serve.
const { spawn } = require('child_process');
const http = require('http');
const { createLoadBalancer, readConfig } = require('./proxy');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[cluster]', ...a);

function healthy(port, healthPath) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: healthPath, timeout: 1000, agent: false }, (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function waitHealthy(port, healthPath, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await healthy(port, healthPath)) return true;
    await sleep(300);
  }
  return false;
}

function createWorker(script, role, port) {
  const w = { role, port, id: `${role}-${port}`, proc: null, restarts: 0, startedAt: 0, stopping: false };
  w.start = () => {
    w.startedAt = Date.now();
    w.proc = spawn(process.execPath, [script], {
      env: { ...process.env, ROLE: role, PORT: String(port), INSTANCE_ID: w.id },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    w.proc.on('exit', async (code, signal) => {
      if (w.stopping) return;
      if (Date.now() - w.startedAt > 60000) w.restarts = 0;
      const delay = Math.min(30000, 1000 * 2 ** w.restarts);
      w.restarts += 1;
      log(`${w.id} exited (code=${code} signal=${signal}) → restart in ${delay} ms`);
      await sleep(delay);
      if (!w.stopping) w.start();
    });
  };
  // Graceful stop: SIGTERM, then wait until the process has fully exited.
  w.stop = () => new Promise((resolve) => {
    if (!w.proc || w.proc.exitCode !== null) return resolve();
    w.stopping = true;
    w.proc.once('exit', () => resolve());
    w.proc.kill('SIGTERM');
  });
  return w;
}

/**
 * @param {string} script path of the server entry file
 * @param {object} [opts] apiCount (3), apiBasePort (5011), realtime (true), realtimePort (5021), plus any
 *   createLoadBalancer option (port, realtimePaths, algo…). Defaults come from LB_* environment variables.
 */
async function runCluster(script, opts = {}) {
  const env = process.env;
  const o = {
    ...readConfig(),
    apiCount: Number(env.LB_API_COUNT || 3),
    apiBasePort: Number(env.LB_API_BASE_PORT || 5011),
    realtime: env.LB_RT_COUNT !== '0',
    realtimePort: Number(env.LB_RT_PORT || 5021),
    ...opts,
  };
  const api = Array.from({ length: o.apiCount }, (_, i) => createWorker(script, 'api', o.apiBasePort + i));
  const rt = o.realtime ? [createWorker(script, 'realtime', o.realtimePort)] : [];
  const workers = [...api, ...rt];
  workers.forEach((w) => w.start());

  const lb = createLoadBalancer({ ...o, api: api.map((w) => `127.0.0.1:${w.port}`), realtime: rt.map((w) => `127.0.0.1:${w.port}`) });
  const port = await lb.listen();
  log(`LB :${port} algo=${o.algo} — ${api.length} api + ${rt.length} realtime`);

  let rolling = false;
  process.on('SIGHUP', async () => {
    if (rolling) return;
    rolling = true;
    log('rolling restart started');
    for (const w of api) {
      await w.stop();
      w.stopping = false;
      w.restarts = 0;
      w.start();
      const ok = await waitHealthy(w.port, o.healthPath);
      log(`${w.id} ${ok ? 'healthy' : 'NOT healthy after 30 s — rolling restart stopped'}`);
      if (!ok) break;
    }
    rolling = false;
    log('rolling restart done');
  });

  const shutdown = async () => {
    log('shutting down');
    await Promise.all(workers.map((w) => w.stop()));
    await lb.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return lb;
}

module.exports = { runCluster };
