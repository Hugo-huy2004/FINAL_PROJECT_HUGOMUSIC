// The entry point initializes Socket.IO and attaches real-time processing threads
// Follow Rule #2: Separate logic from index.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const rooms = require('../modules/rooms/service');
const { attachWorkspaceSocket } = require('./workspaceSocket');

function initSockets(server, app) {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Save the io to the app instance so REST controllers can emit events when needed
  if (app) {
    app.set('io', io);
  }

  // Middleware authenticates identities via the JWT session token transmitted in the handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.data.userId = String(jwt.verify(token, env.JWT_SECRET).id);
      } catch {
        // Invalid or expired token -> treated as guest
      }
    }
    next();
  });

  // 1. 24/7 general listening channel & blind listening (A/B testing)
  rooms.attach(io);

  // 2. Synchronize personal playspace between devices (workspace sync)
  attachWorkspaceSocket(io);

  return io;
}

module.exports = { initSockets };
