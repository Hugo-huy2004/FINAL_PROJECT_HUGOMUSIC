// Phòng nghe chung của Hugo: đồng bộ giờ với server + hai hình thức phòng — kênh 24/7 (stations.js)
// và phòng nghe mù (blindTest.js); admin quản lý phòng ở admin.js. Vào phòng bắt buộc đăng nhập.
const User = require('../models/User');
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
    // Đồng bộ giờ kiểu NTP rút gọn: client đo thời gian khứ hồi và lấy mẫu có RTT nhỏ
    // nhất, lệch giờ = giờ server + RTT/2 − giờ máy (frontend/src/rooms/serverClock.ts).
    socket.on('clock:ping', (ack) => typeof ack === 'function' && ack(Date.now()));

    // Mọi thao tác trong phòng: cần đăng nhập, trả lỗi qua ack thay vì ném ra ngoài.
    const handle = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!socket.data.userId) return reply({ error: 'Đăng nhập để vào phòng' });
      try {
        reply(await fn(payload || {}));
      } catch (e) {
        reply({ error: e.message });
      }
    };

    // Mỗi máy chỉ ở một phòng: vào phòng mới là rời phòng cũ.
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
    // Lúc 'disconnecting' socket vẫn còn trong phòng — đợi nó rời hẳn rồi mới đếm lại.
    socket.on('disconnecting', () => {
      const rs = [...socket.rooms].filter(isLiveRoom);
      setImmediate(() => rs.forEach((r) => onLeft(io, r)));
    });
  });
}

module.exports = { attach };
