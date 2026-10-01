// Công cụ đo tải tự viết (không cần autocannon/k6) cho thí nghiệm cân bằng tải:
//   node lb/bench.js --url http://localhost:5100 --paths /api/artists,/api/songs --c 32 --d 20 [--json out.json]
// C kết nối keep-alive chạy song song trong D giây, mỗi kết nối lần lượt bốc một path. Báo: thông lượng,
// độ trễ p50/p95/p99/max, mã trạng thái, lỗi mạng, và instance nào xử lý (header X-Instance).
const http = require('http');

function parseArgs(argv) {
  const a = { url: 'http://localhost:5100', paths: '/api/artists', c: 32, d: 20, json: '' };
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
  const timeline = []; // lỗi theo từng giây — để thấy lúc tiêm lỗi (kill một bản) có ảnh hưởng không
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

module.exports = { bench };

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  bench(args).then((r) => {
    const { timeline, ...summary } = r;
    console.log(JSON.stringify(summary, null, 2));
    const bad = timeline.map((t, s) => (t.err ? `${s}s:${t.err}` : null)).filter(Boolean);
    console.log(`giây có lỗi: ${bad.length ? bad.join(' ') : 'không có'}`);
    if (args.json) require('fs').writeFileSync(args.json, JSON.stringify({ args, ...r }, null, 2));
  });
}
