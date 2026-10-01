// Hugo Music API - Server Entrypoint
// Tuân thủ Rule #2: File index.js chỉ dùng để khởi tạo và kết nối các module, không chứa logic nghiệp vụ
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// 1. Cấu hình & Cơ sở dữ liệu (Rule #4)
const { env, validateEnv, connectDB } = require('./config');
validateEnv();
connectDB();

// 2. Middlewares & Routing
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const authRoutes = require('./routes/authRoutes');
const songRoutes = require('./routes/songRoutes');
const playlistRoutes = require('./routes/playlistRoutes');
const radioRoutes = require('./routes/radioRoutes');
const artistRoutes = require('./routes/artistRoutes');
const imageRoutes = require('./routes/imageRoutes');
const metricRoutes = require('./routes/metricRoutes');
const roomRoutes = require('./routes/roomRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { describeApi } = require('./utils/apiDocs');
const { SOCKET_EVENTS } = require('./sockets/events');

const mongoose = require('mongoose');
const { client: redis, isReady: redisReady } = require('./config/redis');
const realtime = env.ROLE !== 'api'; // tầng realtime giữ Socket.IO + phòng nghe chung

const app = express();
app.set('trust proxy', env.TRUST_PROXY); // req.ip = IP thật của người nghe do bộ cân bằng tải chuyển tiếp
app.use(helmet({ crossOriginResourcePolicy: false })); // cho phép phát audio và ảnh đại diện cross-origin
app.use(compression());                                // nén gzip dữ liệu trả về
app.use(cors());
app.use(express.json());

// Mỗi phản hồi ghi rõ instance nào xử lý — bằng chứng phân tải khi đo, và để lần ra lỗi của một bản.
// Đang tắt (draining): bảo client đóng kết nối keep-alive để lần sau đi sang instance khác.
let draining = false;
app.use((req, res, next) => {
  res.set('X-Instance', env.INSTANCE_ID);
  if (draining) res.set('Connection', 'close');
  next();
});

// GET /api mặc định "no-cache" = ĐƯỢC lưu nhưng phải hỏi lại trước khi dùng: client gửi If-None-Match,
// dữ liệu không đổi thì nhận 304 rỗng (ETag của Express băm theo nội dung → trùng nhau giữa mọi instance
// sau bộ cân bằng tải). Route nhạc/ảnh tự đặt Cache-Control riêng, ghi đè giá trị này.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') res.set('Cache-Control', 'no-cache');
  next();
});

// Healthcheck
app.get('/', (req, res) => res.json({ status: 'ok', service: 'hugo-music-api' }));
// Health check chủ động của bộ cân bằng tải (lb/): chỉ 200 khi thật sự phục vụ được — có Mongo, có
// Redis, không đang tắt. Trả 503 thì bộ cân bằng tải ngừng gửi request mới tới bản này.
app.get('/healthz', (req, res) => {
  const checks = { mongo: mongoose.connection.readyState === 1, redis: redisReady(), draining };
  const ok = checks.mongo && checks.redis && !draining;
  res.status(ok ? 200 : 503).json({ ok, instance: env.INSTANCE_ID, role: env.ROLE, uptime: Math.round(process.uptime()), ...checks });
});

// REST API Endpoints
// Danh sách route DUY NHẤT: vừa để gắn vào app, vừa để sinh tài liệu API (GET /api/docs, utils/apiDocs.js).
// tier 'realtime': chỉ gắn ở tầng giữ Socket.IO + trạng thái phòng (bộ cân bằng tải lb/ định tuyến /api/rooms về đó).
const MOUNTS = [
  { prefix: '/api/auth', router: authRoutes, title: 'Xác thực & tài khoản' },
  { prefix: '/api/songs', router: songRoutes, title: 'Bài hát & phát nhạc' },
  { prefix: '/api/playlists', router: playlistRoutes, title: 'Danh sách phát' },
  { prefix: '/api/radio', router: radioRoutes, title: 'Radio trực tuyến' },
  { prefix: '/api/artists', router: artistRoutes, title: 'Nghệ sĩ' },
  { prefix: '/api/images', router: imageRoutes, title: 'Ảnh' },
  { prefix: '/api/metrics', router: metricRoutes, title: 'Số liệu nghe' },
  { prefix: '/api/rooms', router: roomRoutes, title: 'Phòng nghe chung', tier: 'realtime' },
  { prefix: '/api/admin', router: adminRoutes, title: 'Quản trị' },
];
for (const m of MOUNTS) if (m.tier !== 'realtime' || realtime) app.use(m.prefix, m.router);

// GET /api/docs — tài liệu API tự sinh (công khai: chỉ mô tả, không lộ dữ liệu; route admin vẫn cần quyền admin).
const apiDocs = describeApi(MOUNTS);
app.get('/api/docs', (req, res) => res.json({ generatedAt: new Date().toISOString(), groups: apiDocs, socketEvents: SOCKET_EVENTS }));

// Error Middlewares
app.use(notFound);
app.use(errorHandler);

// 3. HTTP & Socket.IO Server (Tách biệt logic theo Rule #2)
const server = http.createServer(app);
// Keep-alive của Node phải sống LÂU HƠN của bộ cân bằng tải (lb/ giữ kết nối rảnh 30 s): nếu Node đóng
// trước, bộ cân bằng tải có thể gửi request vào đúng kết nối vừa bị đóng → lỗi ECONNRESET ngẫu nhiên.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
const io = realtime ? require('./sockets').initSockets(server, app) : null;

// 4. Khởi động lắng nghe cổng
server.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}] role=${env.ROLE} id=${env.INSTANCE_ID}`);
});

// 5. Tắt êm (graceful shutdown) — triển khai lại / thu nhỏ không làm rớt request đang chạy:
//    (1) /healthz trả 503 để bộ cân bằng tải ngừng gửi request mới, (2) chờ nó kịp nhận ra,
//    (3) ngừng nhận kết nối, chờ request đang dở xong, (4) đóng DB/Redis. Quá hạn thì thoát cứng.
const DRAIN_MS = Number(process.env.DRAIN_MS || 3000);
async function shutdown(signal) {
  if (draining) return;
  draining = true;
  console.log(`[shutdown] ${signal}: draining ${DRAIN_MS} ms`);
  setTimeout(() => process.exit(1), DRAIN_MS + 10_000).unref();
  await new Promise((r) => setTimeout(r, DRAIN_MS));
  io?.close();
  server.closeIdleConnections();
  await new Promise((r) => server.close(r));
  await Promise.allSettled([mongoose.disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
