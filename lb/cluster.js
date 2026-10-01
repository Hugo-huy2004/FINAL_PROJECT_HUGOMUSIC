// Chạy cả cụm Hugo Music trên một máy bằng một lệnh — tự viết thay cho PM2/Kubernetes:
//   node lb/cluster.js                     (LB_API_COUNT=3 bản API + 1 bản realtime + bộ cân bằng tải)
//
//   - Tự chữa (self-healing): bản nào chết thì khởi động lại, chờ tăng dần 1 s → 2 s → … → 30 s để
//     không rơi vào vòng lặp crash liên tục; chạy ổn 60 s thì xoá bộ đếm.
//   - Triển khai không gián đoạn (rolling restart): `kill -HUP <pid>` → lần lượt từng bản API: tắt êm
//     (SIGTERM, backend tự draining — backend/index.js), chờ thoát, chạy bản mới, chờ /healthz 200 rồi
//     mới sang bản kế. Luôn còn N−1 bản phục vụ.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { createLoadBalancer, readConfig } = require('./index');

const BACKEND = path.join(__dirname, '..', 'backend', 'index.js');
const API_COUNT = Number(process.env.LB_API_COUNT || 3);
const API_BASE_PORT = Number(process.env.LB_API_BASE_PORT || 5011);
const RT_PORT = Number(process.env.LB_RT_PORT || 5021);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[cluster]', ...a);

function healthy(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 1000, agent: false }, (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function waitHealthy(port, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await healthy(port)) return true;
    await sleep(300);
  }
  return false;
}

function createWorker(role, port) {
  const w = { role, port, id: `${role}-${port}`, proc: null, restarts: 0, startedAt: 0, stopping: false };
  w.start = () => {
    w.startedAt = Date.now();
    w.proc = spawn(process.execPath, [BACKEND], {
      cwd: path.dirname(BACKEND), // backend đọc .env theo thư mục đang chạy
      env: { ...process.env, ROLE: role, PORT: String(port), INSTANCE_ID: w.id },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    w.proc.on('exit', async (code, signal) => {
      if (w.stopping) return;
      if (Date.now() - w.startedAt > 60000) w.restarts = 0;
      const delay = Math.min(30000, 1000 * 2 ** w.restarts);
      w.restarts += 1;
      log(`${w.id} thoát (code=${code} signal=${signal}) → chạy lại sau ${delay} ms`);
      await sleep(delay);
      if (!w.stopping) w.start();
    });
  };
  // Tắt êm và chờ thoát hẳn (backend tự draining khi nhận SIGTERM).
  w.stop = () => new Promise((resolve) => {
    if (!w.proc || w.proc.exitCode !== null) return resolve();
    w.stopping = true;
    w.proc.once('exit', () => resolve());
    w.proc.kill('SIGTERM');
  });
  return w;
}

async function main() {
  const api = Array.from({ length: API_COUNT }, (_, i) => createWorker('api', API_BASE_PORT + i));
  const rt = createWorker('realtime', RT_PORT);
  const workers = [...api, rt];
  workers.forEach((w) => w.start());

  const cfg = { ...readConfig(), api: api.map((w) => `127.0.0.1:${w.port}`), realtime: [`127.0.0.1:${rt.port}`] };
  const lb = createLoadBalancer(cfg);
  const port = await lb.listen();
  log(`LB :${port} algo=${cfg.algo} — ${API_COUNT} api + 1 realtime`);

  let rolling = false;
  process.on('SIGHUP', async () => {
    if (rolling) return;
    rolling = true;
    log('rolling restart bắt đầu');
    for (const w of api) {
      await w.stop();
      w.stopping = false;
      w.restarts = 0;
      w.start();
      const ok = await waitHealthy(w.port);
      log(`${w.id} ${ok ? 'đã khoẻ' : 'KHÔNG khoẻ sau 30 s — dừng rolling restart'}`);
      if (!ok) break;
    }
    rolling = false;
    log('rolling restart xong');
  });

  const shutdown = async () => {
    log('tắt cụm');
    await Promise.all(workers.map((w) => w.stop()));
    await lb.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
