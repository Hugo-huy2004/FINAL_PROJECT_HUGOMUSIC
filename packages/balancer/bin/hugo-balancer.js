#!/usr/bin/env node
// hugo-balancer start                  load balancer configured by LB_* variables (LB_API required)
// hugo-balancer cluster <server.js>    N copies of your server + the load balancer, self-healing, HUP = rolling restart
// hugo-balancer bench --url <url> …    load test: throughput, latency percentiles, which copy answered
const path = require('path');
const { createLoadBalancer, readConfig, runCluster, bench } = require('..');
const { parseArgs } = require('../src/bench');

const [cmd = 'start', ...rest] = process.argv.slice(2);
const fail = (msg) => { console.error(`hugo-balancer: ${msg}`); process.exit(1); };

if (cmd === 'start') {
  const cfg = readConfig();
  if (!cfg.api.length) fail('set LB_API to the api backends, e.g. LB_API=127.0.0.1:5011,127.0.0.1:5012');
  const lb = createLoadBalancer(cfg);
  lb.listen().then((port) => console.log(`[lb] :${port} algo=${cfg.algo} api=[${cfg.api}] realtime=[${cfg.realtime}]`));
  const stop = () => lb.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} else if (cmd === 'cluster') {
  if (!rest[0]) fail('usage: hugo-balancer cluster <server.js>');
  runCluster(path.resolve(rest[0]));
} else if (cmd === 'bench') {
  const args = parseArgs(rest);
  bench(args).then((r) => {
    const { timeline, ...summary } = r;
    console.log(JSON.stringify(summary, null, 2));
    const bad = timeline.map((t, s) => (t.err ? `${s}s:${t.err}` : null)).filter(Boolean);
    console.log(`seconds with errors: ${bad.length ? bad.join(' ') : 'none'}`);
    if (args.json) require('fs').writeFileSync(args.json, JSON.stringify({ args, ...r }, null, 2));
  });
} else {
  fail(`unknown command "${cmd}" — use start, cluster or bench`);
}
