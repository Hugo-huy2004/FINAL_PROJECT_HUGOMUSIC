// Hugo Music API - Server Entrypoint
// Comply with Rule #2: The index.js file is only used to initialize and connect modules, does not contain business logic
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// 1. Configuration & Database (Rule #4)
const { env, validateEnv, connectDB } = require('./config');
validateEnv();
connectDB();

// 2. Middlewares & Routing
const { notFound, errorHandler } = require('./core/middleware/errors');
const path = require('path');
const { discoverModules, mountModules } = require('hugo-server');

const mongoose = require('mongoose');
const { client: redis, isReady: redisReady } = require('./config/redis');
const realtime = env.ROLE !== 'api'; // realtime layer holds Socket.IO + common listening room

const app = express();
app.set('trust proxy', env.TRUST_PROXY); // req.ip = The listener's real IP as forwarded by the load balancer
app.use(helmet({ crossOriginResourcePolicy: false })); // Allows cross-origin audio and avatar playback
app.use(compression());                                // gzip compression of returned data
app.use(cors());
app.use(express.json());

// Each response specifies which instance to process — proof of load distribution when measured, and to trace errors to a copy.
// Draining: tells the client to close the keep-alive connection to go to another instance next time.
let draining = false;
app.use((req, res, next) => {
  res.set('X-Instance', env.INSTANCE_ID);
  if (draining) res.set('Connection', 'close');
  next();
});

// GET /api default "no-cache" = IS saved but must ask again before using: client sends If-None-Match,
// If the data does not change, you will receive an empty 304 (Express's ETag hashed according to the content → identical between all instances
// after the load balancer). The music/photo route sets its own Cache-Control, overriding this value.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'no-cache');
  next();
});

// Healthcheck
app.get('/', (req, res) => res.json({ status: 'ok', service: 'hugo-music-api' }));
// Active health check of the load balancer (hugo-balancer):
// - mongo === 1 and !draining is a prerequisite (no Mongo or shutdown, then 503).
// - redis: If Redis is offline, the system automatically runs degraded mode (fallback In-Memory cache/OTP/RateLimit),
// still serves other APIs well and returns HTTP 200 so the load balancer doesn't disconnect the entire cluster.
app.get('/healthz', (req, res) => {
  const mongo = mongoose.connection.readyState === 1;
  const redis = redisReady();
  const checks = { mongo, redis, draining };
  const ok = mongo && !draining;
  const status = !ok ? 503 : 200;
  res.status(status).json({
    ok,
    status: !redis ? 'degraded' : 'healthy',
    instance: env.INSTANCE_ID,
    role: env.ROLE,
    uptime: Math.round(process.uptime()),
    ...checks,
  });
});

// REST API: every src/modules/<name>/routes.js is mounted at /api/<name> (hugo-server discoverModules) — no hand-kept list.
// tier 'realtime' (rooms) is mounted only on instances holding Socket.IO + room state; the load balancer
// (hugo-balancer, LB_REALTIME_PATHS) routes /api/rooms there.
const modules = mountModules(app, discoverModules(path.join(__dirname, 'modules')), (m) => m.tier === 'realtime' && !realtime);

// The docs module (modules/docs) documents every mounted module, so it needs the list.
app.locals.modules = modules;

// Error Middlewares
app.use(notFound);
app.use(errorHandler);

// 3. HTTP & Socket.IO Server (Separate logic according to Rule #2)
const server = http.createServer(app);
// The Node's keep-alive must live LONGER than the load balancer's (hugo-balancer keeps idle connections 30 s): if the Node is closed
// Before, the load balancer may send requests to the same connection that was just closed → random ECONNRESET error.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
const io = realtime ? require('./sockets').initSockets(server, app) : null;

// 4. Start port listening
const { startQueueWorker, stopQueueWorker } = require('./pipeline/queue');
server.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}] role=${env.ROLE} id=${env.INSTANCE_ID}`);
  if (env.ROLE !== 'api' || process.env.PIPELINE_WORKER === 'true') {
    startQueueWorker();
  }
});

// 5. Graceful shutdown — redeploy/scale down without dropping running requests:
// (1) /healthz returns 503 so the load balancer stops sending new requests, (2) waits for it to recognize it,
// (3) stop receiving connections, wait for unfinished requests, (4) close DB/Redis. If it's past the deadline, it's hard to exit.
const DRAIN_MS = Number(process.env.DRAIN_MS || 3000);
async function shutdown(signal) {
  if (draining) return;
  draining = true;
  console.log(`[shutdown] ${signal}: draining ${DRAIN_MS} ms`);
  setTimeout(() => process.exit(1), DRAIN_MS + 10_000).unref();
  await stopQueueWorker();
  await new Promise((r) => setTimeout(r, DRAIN_MS));
  io?.close();
  server.closeIdleConnections();
  await new Promise((r) => server.close(r));
  await Promise.allSettled([mongoose.disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
