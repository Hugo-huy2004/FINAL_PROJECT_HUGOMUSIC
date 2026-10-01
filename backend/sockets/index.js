// Entry point khởi tạo Socket.IO và gắn các luồng xử lý thời gian thực
// Tuân thủ Rule #2: Tách biệt logic ra khỏi index.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const rooms = require('../rooms');
const { attachWorkspaceSocket } = require('./workspaceSocket');

function initSockets(server, app) {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Lưu io vào app instance để các REST controller có thể emit sự kiện khi cần
  if (app) {
    app.set('io', io);
  }

  // Middleware xác thực danh tính qua JWT session token truyền trong handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.userId = String(jwt.verify(token, env.JWT_SECRET).id);
      } catch {
        // Token không hợp lệ hoặc hết hạn -> xử lý như khách (guest)
      }
    }
    next();
  });

  // 1. Kênh nghe chung 24/7 & nghe mù (A/B testing)
  rooms.attach(io);

  // 2. Đồng bộ không gian phát cá nhân giữa các thiết bị (workspace sync)
  attachWorkspaceSocket(io);

  return io;
}

module.exports = { initSockets };
