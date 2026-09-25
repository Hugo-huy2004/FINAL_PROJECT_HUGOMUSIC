// Load .env before any other require — several modules read process.env at load time.
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const songRoutes = require('./routes/songRoutes');
const playlistRoutes = require('./routes/playlistRoutes');
const radioRoutes = require('./routes/radioRoutes');
const artistRoutes = require('./routes/artistRoutes');
const imageRoutes = require('./routes/imageRoutes');
const metricRoutes = require('./routes/metricRoutes');
const partyRoutes = require('./routes/partyRoutes');
const PartyRoom = require('./models/PartyRoom');

// Every session token in the app is signed with this — silently falling back to a
// hardcoded default here would mean anyone reading the source could forge one.
// Fail loudly at boot instead, same as a bad Mongo URI does in connectDB.
if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET is not set (see backend/.env.example).');
  process.exit(1);
}

connectDB();

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false })); // keep streamed audio/avatars embeddable cross-origin
app.use(compression()); // gzip JSON responses — the song catalog list is the big one
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', service: 'hugo-music-api' }));

// The rate limiter itself, and which auth routes actually need it, live in
// routes/authRoutes.js — only the brute-forceable ones (login/otp/register/google),
// not the already-authenticated ones (/me, /profile, /avatar...) that a normal
// session hits repeatedly just by using the app.
app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/radio', radioRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/party', partyRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

// In-memory party-room state for fast fallback
const partyRooms = new Map();

const broadcastMemberCount = (roomId, excludeSocketId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  const count = room ? room.size - (excludeSocketId && room.has(excludeSocketId) ? 1 : 0) : 0;
  io.to(roomId).emit('room_members', { roomId, count });
};

// Party codes are case-insensitive (the schema uppercases them). Workspace rooms embed
// a lowercase hex ObjectId, so uppercasing those too broke multi-device sync: clients
// joined WORKSPACE:<ID> while play_sync and room_members used workspace:<id>.
const WORKSPACE = 'workspace:';
const roomKey = (id) => {
  const s = String(id).trim();
  return s.startsWith(WORKSPACE) ? s : s.toUpperCase();
};

// Optional identity: guests can still listen in, but host-only actions and a user's own
// workspace room need a verified user. The client passes its session JWT in the
// handshake (frontend/src/utils/socket.ts) and reconnects when it logs in/out.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      socket.data.userId = String(jwt.verify(token, process.env.JWT_SECRET).id);
    } catch {
      // invalid/expired token -> treated as a guest
    }
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle joining a room (supports both legacy PIN & persistent MongoDB party room)
  socket.on('join_room', async (roomId, userInfo) => {
    if (!roomId) return;
    const roomCode = roomKey(roomId);
    const isWorkspace = roomCode.startsWith(WORKSPACE);
    // Someone else's workspace room would let a stranger watch and drive their playback.
    if (isWorkspace && roomCode !== `${WORKSPACE}${socket.data.userId}`) return;

    // Anti-collision: Evict socket from any previous party room (joining the personal
    // workspace room must not kick the user out of the party they're in).
    if (!isWorkspace) {
      for (const r of socket.rooms) {
        if (r !== socket.id && !r.startsWith(WORKSPACE) && r !== roomCode) {
          socket.leave(r);
          broadcastMemberCount(r);
          console.log(`Socket ${socket.id} automatically left previous party room ${r}`);
        }
      }
    }

    socket.join(roomCode);
    console.log(`User ${socket.id} joined room ${roomCode}`);

    // Check MongoDB for persistent party room
    try {
      const dbRoom = isWorkspace ? null : await PartyRoom.findOne({ code: roomCode, isActive: true });
      if (dbRoom) {
        // Identity comes from the verified handshake token only — userInfo.userId,
        // userInfo.isHost and a matching display name are all client-controlled.
        const userId = socket.data.userId;
        const userName = userInfo?.name;
        const isHost = Boolean(userId && dbRoom.host && dbRoom.host.toString() === userId);

        let participant = null;
        if (isHost) {
          participant = dbRoom.participants.find(p =>
            p.role === 'host' ||
            (p.userId && p.userId.toString() === userId)
          );
        } else {
          if (userId) {
            participant = dbRoom.participants.find(p => p.userId && p.userId.toString() === userId.toString());
          }
          if (!participant && socket.id) {
            participant = dbRoom.participants.find(p => p.socketId === socket.id);
          }
          if (!participant && userName && userName !== 'Khách') {
            participant = dbRoom.participants.find(p => p.name === userName && p.role !== 'host');
          }
        }

        if (participant) {
          participant.isOnline = true;
          participant.socketId = socket.id;
          if (userId && !participant.userId) participant.userId = userId;
          if (userInfo?.name) participant.name = userInfo.name;
          if (userInfo?.avatar) participant.avatar = userInfo.avatar;
          if (isHost) participant.role = 'host';
        } else if (userInfo) {
          dbRoom.participants.push({
            userId: userId || undefined,
            socketId: socket.id,
            name: userInfo.name || 'Khách',
            avatar: userInfo.avatar || '',
            role: isHost ? 'host' : 'guest',
            isOnline: true,
            joinedAt: new Date(),
          });
        }

        // Deduplicate participants: keep only unique host and unique users/names
        const seenParticipants = new Set();
        dbRoom.participants = dbRoom.participants.filter(p => {
          if (p.role === 'host') {
            if (seenParticipants.has('host')) return false;
            seenParticipants.add('host');
            return true;
          }
          // Drop any non-host participant with host's name or host's userId
          if (p.name === dbRoom.hostName) return false;
          if (p.userId && dbRoom.host && p.userId.toString() === dbRoom.host.toString()) return false;

          const key = p.userId ? `u_${p.userId.toString()}` : `n_${p.name}`;
          if (seenParticipants.has(key)) return false;
          seenParticipants.add(key);
          return true;
        });

        // Compute true real-time online status based on currently connected socket IDs in roomCode
        const activeSockets = io.sockets.adapter.rooms.get(roomCode);
        for (const p of dbRoom.participants) {
          p.isOnline = Boolean(p.socketId && activeSockets && activeSockets.has(p.socketId));
        }

        await dbRoom.save();

        // Send full room state to the newly joined socket
        socket.emit('party:room_state', { room: dbRoom });
        io.to(roomCode).emit('party:room_updated', { room: dbRoom });
      }
    } catch (err) {
      console.warn('Error querying persistent room on join:', err.message);
    }

    // Also support in-memory state
    const state = partyRooms.get(roomCode);
    if (state) {
      socket.emit('room_state', state);
    }
    broadcastMemberCount(roomCode);
  });

  // Host playback action: play, pause, seek, change song, update queue
  socket.on('party:host_action', async (data) => {
    if (!data || !data.roomId) return;
    const roomCode = roomKey(data.roomId);

    try {
      const dbRoom = await PartyRoom.findOne({ code: roomCode, isActive: true });
      // Only the verified host drives playback — room codes are listed publicly, so
      // without this any visitor could hijack any room.
      if (!dbRoom || !socket.data.userId || dbRoom.host.toString() !== socket.data.userId) return;

      socket.to(roomCode).emit('party:sync_playback', data);

      // Persist so the room survives even if everyone leaves
      if (data.currentSong !== undefined) dbRoom.currentSong = data.currentSong;
      if (data.position !== undefined) dbRoom.position = data.position;
      if (data.isPlaying !== undefined) dbRoom.isPlaying = data.isPlaying;
      if (data.queueIndex !== undefined) dbRoom.queueIndex = data.queueIndex;
      if (Array.isArray(data.queue)) dbRoom.queue = data.queue;
      dbRoom.lastSyncTime = new Date();
      await dbRoom.save();
    } catch (err) {
      console.warn('Error saving party host action to DB:', err.message);
    }
  });

  // Legacy sync signal (used by personal workspace sync & legacy party)
  socket.on('play_sync', (data) => {
    if (!data || !data.roomId || !socket.rooms.has(data.roomId)) return; // only rooms this socket is in
    partyRooms.set(data.roomId, data);
    io.to(data.roomId).emit('sync_playback', data);
  });

  // Participant leaves room (persistent room stays active!)
  socket.on('leave_room', async (roomId) => {
    if (!roomId) return;
    const roomCode = roomKey(roomId);
    socket.leave(roomCode);
    broadcastMemberCount(roomCode);

    try {
      const dbRoom = await PartyRoom.findOne({ code: roomCode, isActive: true });
      if (dbRoom) {
        const participant = dbRoom.participants.find(p => p.socketId === socket.id);
        if (participant) {
          participant.isOnline = false;
          await dbRoom.save();
          io.to(roomCode).emit('party:room_updated', { room: dbRoom });
        }
      }
    } catch (err) {
      console.warn('Error updating participant offline status on leave:', err.message);
    }
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        broadcastMemberCount(roomId, socket.id);
        // Mark participant offline in DB asynchronously
        PartyRoom.findOne({ code: roomId, isActive: true }).then(dbRoom => {
          if (dbRoom) {
            const p = dbRoom.participants.find(part => part.socketId === socket.id);
            if (p) {
              p.isOnline = false;
              dbRoom.save().then(() => {
                io.to(roomId).emit('party:room_updated', { room: dbRoom });
              });
            }
          }
        }).catch(() => {});
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
