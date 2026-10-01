# hugo-balancer

A layer-7 load balancer for HTTP and WebSocket in plain Node, with a self-healing local cluster and a load tester. Zero dependencies.

```
npm install hugo-balancer
```

## Three commands

```bash
# 1. Balance existing servers
LB_API=127.0.0.1:5011,127.0.0.1:5012,127.0.0.1:5013 npx hugo-balancer start

# 2. Run N copies of your server + the balancer, restart crashed copies, roll restarts on HUP
npx hugo-balancer cluster server.js
kill -HUP <pid>          # zero-downtime: one copy at a time, N−1 always serving

# 3. Load-test it
npx hugo-balancer bench --url http://localhost:8080 --paths /api/a,/api/b --c 32 --d 20 --json out.json
```

## What it does

| Concern | Behaviour |
|---|---|
| Choosing a backend | `p2c-ewma` (default): two random backends, keep the one with lower latency × (in flight + 1); also `least-conn`, `round-robin`, `random` |
| Stateful tier | Paths in `LB_REALTIME_PATHS` (default `/socket.io`) go to the `realtime` pool in failover mode: always the first healthy copy |
| Dead backends | Active health checks (`rise`/`fall`) plus passive ejection after 3 consecutive errors, doubling up to 60 s |
| Retries | On another backend: always when the connection was refused (never reached the server, so POST is safe); for GET/HEAD/OPTIONS also on a broken connection or 502/503 |
| Slow backends | No response headers within `LB_HEADER_TIMEOUT_MS` → 504; latency feeds the p2c score so slow copies are avoided early |
| Bodies | Up to 1 MB buffered for retries; larger uploads stream straight through (one attempt) |
| WebSocket | Upgrade forwarded, TCP piped both ways |
| Tracing | `X-Forwarded-For/Proto/Host`, `X-Request-Id`, `X-LB-Retried` |
| Stats | `GET /__lb/stats` from loopback only: per-backend up, ejected, in flight, EWMA, totals |

## Configuration

| Variable | Default | |
|---|---|---|
| `LB_PORT` | `8080` | listen port |
| `LB_API` | — | api backends `host:port,…` (required for `start`) |
| `LB_REALTIME` | — | realtime backends; empty = no realtime pool |
| `LB_REALTIME_PATHS` | `/socket.io` | path prefixes routed to the realtime pool |
| `LB_ALGO` | `p2c-ewma` | `p2c-ewma` · `least-conn` · `round-robin` · `random` |
| `LB_HEALTH_PATH` | `/healthz` | must answer 200 when the copy can serve |
| `LB_HC_INTERVAL_MS` / `LB_HC_TIMEOUT_MS` | `1000` / `800` | health check cadence |
| `LB_HEADER_TIMEOUT_MS` | `30000` | wait for response headers |
| `LB_MAX_RETRIES` | `2` | extra attempts per request |
| `LB_CLIENT_IP_HEADER` | — | trust this header for the client IP (only when every connection comes through that proxy) |

`cluster` also reads `LB_API_COUNT` (3), `LB_API_BASE_PORT` (5011), `LB_RT_PORT` (5021) and `LB_RT_COUNT` (1, or 0 for none). Each copy starts with `ROLE` (`api` | `realtime`), `PORT` and `INSTANCE_ID` in its environment.

**Your server, for zero-downtime restarts:** on SIGTERM, answer the health path with 503, wait a couple of health-check intervals, then close. Set `server.keepAliveTimeout` above 30 s so idle pooled connections are closed by the balancer first.

## From code

```js
const { createLoadBalancer, readConfig } = require('hugo-balancer');

const lb = createLoadBalancer({ ...readConfig(), api: ['127.0.0.1:5011', '127.0.0.1:5012'], realtimePaths: ['/socket.io', '/rooms'] });
await lb.listen(8080);
lb.stats();     // same as /__lb/stats
await lb.close();
```

The selection algorithms are exported too (`createPool`, `pick`, `recordLatency`, `recordFailure`, `recordHealth`) for simulations.

## License

MIT
