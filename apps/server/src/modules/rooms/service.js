// Hugo public listening room: time sync with server + two room types — 24/7 channel (stations.js)
// and blind listening room (blindTest.js); admin manages rooms in admin.js. Entering the room requires logging in.
const User = require('../auth/User');
const stations = require('./stations');
const blind = require('./blindTest');

const KINDS = { station: stations, blind };
const kindOf = (room) => room.split(':')[0];
const isLiveRoom = (room) => room.startsWith('station:') || room.startsWith('blind:');

function onLeft(io, room) {
  Promise.resolve(KINDS[kindOf(room)].left(io, room.slice(room.indexOf(':') + 1)))
    .catch((e) => console.warn('[rooms] left:', e.message));
}

function attach(io) {
  io.on('connection', (socket) => {
    // Reduced NTP style time synchronization: client measures round-trip time and samples with small RTT
    // At most, time difference = server time + RTT/2 − machine time (createServerClock of hugo-stream).
    socket.on('clock:ping', (ack) => typeof ack === 'function' && ack(Date.now()));

    // All operations in the room: need to log in, return errors via ack instead of throwing them out.
    const handle = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!socket.data.userId) return reply({ error: 'Đăng nhập để vào phòng' });
      try {
        reply(await fn(payload || {}));
      } catch (e) {
        reply({ error: e.message });
      }
    };

    // Each computer is only in one room: entering the new room means leaving the old room.
    const enter = async () => {
      if (!socket.data.name) {
        const u = await User.findById(socket.data.userId).select('nickname username role').lean();
        socket.data.name = u?.nickname || u?.username || 'Người nghe';
        socket.data.role = u?.role;
      }
      for (const r of [...socket.rooms]) if (isLiveRoom(r)) { socket.leave(r); onLeft(io, r); }
    };

    socket.on('station:join', handle(async ({ id }) => { await enter(); return stations.join(io, socket, id); }));
    socket.on('station:suggest', handle(({ id, songId }) => stations.suggest(io, socket, id, songId)));
    socket.on('station:vote', handle(({ id, entryId }) => stations.vote(io, socket, id, entryId)));
    socket.on('station:remove', handle(({ id, entryId }) => stations.remove(io, socket, id, entryId)));
    socket.on('blind:join', handle(async ({ id }) => { await enter(); return blind.join(io, socket, id); }));
    socket.on('blind:vote', handle(({ id, trialId, choice }) => blind.vote(io, socket, id, trialId, choice)));
    socket.on('room:leave', () => {
      for (const r of [...socket.rooms]) if (isLiveRoom(r)) { socket.leave(r); onLeft(io, r); }
    });
    // When 'disconnecting' the socket is still in the room — wait for it to leave completely before counting again.
    socket.on('disconnecting', () => {
      const rs = [...socket.rooms].filter(isLiveRoom);
      setImmediate(() => rs.forEach((r) => onLeft(io, r)));
    });
  });
}

module.exports = { attach };
