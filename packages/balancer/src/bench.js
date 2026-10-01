// Load generator for load-balancing experiments (no external tool needed):
//   hugo-balancer bench --url http://localhost:8080 --paths /api/a,/api/b --c 32 --d 20 [--json out.json]
// C keep-alive connections run in parallel for D seconds, each cycling through the paths. Reports throughput,
// p50/p95/p99/max latency, status codes, network errors, and which copy answered (X-Instance header).
const http = require('http');

function parseArgs(argv) {
  const a = { url: 'http://localhost:8080', paths: '/', c: 32, d: 20, json: '' };
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  return { ...a, c: Number(a.c), d: Number(a.d), paths: a.paths.split(',') };
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;

async function bench({ url, paths, c, d }, { onTick } = {}) {
  const { hostname, port } = new URL(url);
  const agent = new http.Agent({ keepAlive: true, maxSockets: c });
  const lat = [];
  const status = {};
  const instances = {};
  const timeline = []; // errors per second — shows whether killing a copy mid-run caused any
  let errors = 0;
  let i = 0;
  const start = Date.now();
  const end = start + d * 1000;

  const one = () => new Promise((resolve) => {
    const path = paths[i++ % paths.length];
    const t0 = process.hrtime.bigint();
    const sec = Math.floor((Date.now() - start) / 1000);
    timeline[sec] ??= { ok: 0, err: 0 };
    const req = http.get({ hostname, port, path, agent }, (res) => {
      res.resume();
      res.on('end', () => {
        lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
        status[res.statusCode] = (status[res.statusCode] || 0) + 1;
        const inst = res.headers['x-instance'] || '-';
        instances[inst] = (instances[inst] || 0) + 1;
        timeline[sec][res.statusCode < 500 ? 'ok' : 'err'] += 1;
        resolve();
      });
    });
    req.on('error', () => { errors += 1; timeline[sec].err += 1; resolve(); });
  });

  const tick = onTick && setInterval(() => onTick(Date.now() - start), 1000);
  await Promise.all(Array.from({ length: c }, async () => { while (Date.now() < end) await one(); }));
  clearInterval(tick);
  agent.destroy();

  lat.sort((x, y) => x - y);
  const total = lat.length + errors;
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    requests: total, rps: Math.round(total / d), errors, status, instances,
    latencyMs: { p50: r1(pct(lat, 0.5)), p95: r1(pct(lat, 0.95)), p99: r1(pct(lat, 0.99)), max: r1(lat.at(-1) || 0) },
    timeline: timeline.map((t) => t || { ok: 0, err: 0 }),
  };
}

module.exports = { bench, parseArgs };
