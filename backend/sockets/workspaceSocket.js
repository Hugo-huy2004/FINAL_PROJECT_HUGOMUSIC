// Quản lý đồng bộ không gian phát giữa các thiết bị của cùng một tài khoản
// Phòng riêng `workspace:<userId>`: chỉ chính chủ vào được, server lưu trạng thái cuối
const WORKSPACE_PREFIX = 'workspace:';
const workspaceState = new Map();

const broadcastMemberCount = (io, roomId, excludeSocketId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  const count = room ? room.size - (excludeSocketId && room.has(excludeSocketId) ? 1 : 0) : 0;
  io.to(roomId).emit('room_members', { roomId, count });
};

function attachWorkspaceSocket(io) {
  io.on('connection', (socket) => {
    const ownRoom = (roomId) =>
      Boolean(socket.data.userId) && String(roomId) === `${WORKSPACE_PREFIX}${socket.data.userId}`;

    socket.on('join_room', (roomId) => {
      if (!ownRoom(roomId)) return;
      socket.join(roomId);
      const state = workspaceState.get(roomId);
      if (state) socket.emit('room_state', state);
      broadcastMemberCount(io, roomId);
    });

    socket.on('play_sync', (data) => {
      if (!data || !ownRoom(data.roomId) || !socket.rooms.has(data.roomId)) return;
      workspaceState.set(data.roomId, data);
      io.to(data.roomId).emit('sync_playback', data);
    });

    socket.on('leave_room', (roomId) => {
      if (!ownRoom(roomId)) return;
      socket.leave(roomId);
      broadcastMemberCount(io, roomId);
    });

    socket.on('disconnecting', () => {
      for (const r of socket.rooms) {
        if (r.startsWith(WORKSPACE_PREFIX)) broadcastMemberCount(io, r, socket.id);
      }
    });
  });
}

module.exports = { attachWorkspaceSocket };
