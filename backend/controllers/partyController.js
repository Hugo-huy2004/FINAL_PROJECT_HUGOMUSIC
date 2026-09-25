const asyncHandler = require('../utils/asyncHandler');
const PartyRoom = require('../models/PartyRoom');

// Helper to generate a 6-digit numeric room code
const generateUniqueCode = async () => {
  for (let i = 0; i < 10; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await PartyRoom.findOne({ code, isActive: true });
    if (!existing) return code;
  }
  return (Date.now() % 1000000).toString().padStart(6, '0');
};

// @desc    Create a new party room or return host's current active room
// @route   POST /api/party/create
// @access  Private (Logged in user required to be Host)
const createRoom = asyncHandler(async (req, res) => {
  const hostId = req.user._id;
  const hostName = req.user.nickname || req.user.username || 'Host';
  const hostAvatar = req.user.avatarUrl || '';
  const { name, roomName, description, isPublic, genre, forceNew, currentSong, queue } = req.body;

  const finalName = (name || roomName || '').trim() || `Phòng của ${hostName}`;
  const finalDesc = (description || '').trim();
  const finalIsPublic = isPublic !== undefined ? Boolean(isPublic) : true;
  const finalGenre = (genre || 'Tổng hợp').trim();

  // Check if host already has an active room
  const existingRoom = await PartyRoom.findOne({ host: hostId, isActive: true });

  if (existingRoom && !forceNew) {
    // Re-use and update host's existing room if still active
    if (name || roomName) existingRoom.name = finalName;
    if (description !== undefined) existingRoom.description = finalDesc;
    if (isPublic !== undefined) existingRoom.isPublic = finalIsPublic;
    if (genre !== undefined) existingRoom.genre = finalGenre;
    if (currentSong) existingRoom.currentSong = currentSong;
    if (queue && queue.length > 0) existingRoom.queue = queue;
    existingRoom.lastSyncTime = new Date();
    await existingRoom.save();
    return res.status(200).json({ success: true, room: existingRoom, isHost: true, resumed: true });
  }

  if (existingRoom && forceNew) {
    // Deactivate previous room before creating a new one
    existingRoom.isActive = false;
    await existingRoom.save();
  }

  // Evict user from any other rooms where they might have joined as a guest
  try {
    await PartyRoom.updateMany(
      { host: { $ne: hostId }, isActive: true, "participants.userId": hostId },
      { $pull: { participants: { userId: hostId } } }
    );
  } catch (e) {
    console.warn('Error evicting host from guest rooms:', e.message);
  }

  const code = await generateUniqueCode();
  const newRoom = new PartyRoom({
    code,
    name: finalName,
    description: finalDesc,
    isPublic: finalIsPublic,
    genre: finalGenre,
    host: hostId,
    hostName,
    hostAvatar,
    currentSong: currentSong || null,
    queue: queue || [],
    queueIndex: 0,
    isPlaying: false,
    position: 0,
    lastSyncTime: new Date(),
    participants: [{
      userId: hostId,
      name: hostName,
      avatar: hostAvatar,
      role: 'host',
      isOnline: true,
      joinedAt: new Date(),
    }],
    isActive: true,
  });

  await newRoom.save();
  res.status(201).json({ success: true, room: newRoom, isHost: true });
});

const getRoomWithEstimatedPosition = (room) => {
  const roomObj = room.toObject ? room.toObject() : { ...room };
  if (roomObj.isPlaying && roomObj.lastSyncTime) {
    const elapsedSec = (Date.now() - new Date(roomObj.lastSyncTime).getTime()) / 1000;
    roomObj.position = Math.max(0, (roomObj.position || 0) + elapsedSec);
  }
  return roomObj;
};

// @desc    Get all active public party rooms
// @route   GET /api/party/rooms
// @access  Public / Optional Auth
const getPublicRooms = asyncHandler(async (req, res) => {
  const rooms = await PartyRoom.find({ isActive: true, isPublic: true })
    .sort({ updatedAt: -1 })
    .limit(50);

  const formatted = rooms.map((room) => {
    const roomObj = getRoomWithEstimatedPosition(room);
    const onlineCount = (roomObj.participants || []).filter((p) => p.isOnline).length;
    return {
      _id: roomObj._id,
      code: roomObj.code,
      name: roomObj.name,
      description: roomObj.description,
      genre: roomObj.genre,
      isPublic: roomObj.isPublic,
      hostName: roomObj.hostName,
      hostAvatar: roomObj.hostAvatar,
      currentSong: roomObj.currentSong,
      isPlaying: roomObj.isPlaying,
      queueLength: (roomObj.queue || []).length,
      onlineCount,
      participantCount: (roomObj.participants || []).length,
      updatedAt: roomObj.updatedAt,
    };
  });

  res.status(200).json({ success: true, rooms: formatted });
});

// @desc    Get all party rooms created by the logged-in user
// @route   GET /api/party/my-rooms
// @access  Private
const getMyRooms = asyncHandler(async (req, res) => {
  const rooms = await PartyRoom.find({ host: req.user._id })
    .sort({ createdAt: -1 })
    .limit(30);

  const formatted = rooms.map((room) => {
    const roomObj = getRoomWithEstimatedPosition(room);
    const onlineCount = (roomObj.participants || []).filter((p) => p.isOnline).length;
    return {
      ...roomObj,
      onlineCount,
    };
  });

  res.status(200).json({ success: true, rooms: formatted });
});

// @desc    Get current user's active hosted room (if any)
// @route   GET /api/party/my-room
// @access  Private
const getMyActiveRoom = asyncHandler(async (req, res) => {
  const room = await PartyRoom.findOne({ host: req.user._id, isActive: true });
  if (!room) {
    return res.status(200).json({ success: true, room: null });
  }
  res.status(200).json({ success: true, room: getRoomWithEstimatedPosition(room), isHost: true });
});

// @desc    Get room state by code
// @route   GET /api/party/room/:code
// @access  Public
const getRoomByCode = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại hoặc đã bị xóa bởi Host' });
  }

  const isHost = req.user ? room.host.toString() === req.user._id.toString() : false;
  res.status(200).json({ success: true, room: getRoomWithEstimatedPosition(room), isHost });
});

// @desc    Join an existing party room
// @route   POST /api/party/room/:code/join
// @access  Public / Optional Auth
const joinRoom = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại hoặc đã bị xóa bởi Host' });
  }

  const userId = req.user ? req.user._id : null; // never trust body.userId (spoofable eviction below)
  const userName = req.user ? (req.user.nickname || req.user.username) : (req.body.name || 'Khách');
  const userAvatar = req.user ? req.user.avatarUrl : (req.body.avatar || '');
  const socketId = req.body.socketId || '';

  // Host status only from the verified session — body.userId/name are client-controlled.
  const isHost = Boolean(req.user && room.host.toString() === req.user._id.toString());

  // Anti-collision: Evict user from any OTHER active party rooms in Database
  if (userId) {
    try {
      await PartyRoom.updateMany(
        { code: { $ne: code }, isActive: true, "participants.userId": userId },
        { $pull: { participants: { userId: userId } } }
      );
    } catch (e) {
      console.warn('Error evicting user from other rooms:', e.message);
    }
  }

  // Check if participant already exists in target room
  let existingParticipant = null;
  if (isHost) {
    existingParticipant = room.participants.find(p => 
      p.role === 'host' || 
      (userId && p.userId && p.userId.toString() === userId.toString()) ||
      (userName && p.name === userName)
    );
  } else {
    if (userId) {
      existingParticipant = room.participants.find(p => p.userId && p.userId.toString() === userId.toString());
    }
    if (!existingParticipant && socketId) {
      existingParticipant = room.participants.find(p => p.socketId === socketId);
    }
    if (!existingParticipant && userName && userName !== 'Khách') {
      existingParticipant = room.participants.find(p => p.name === userName && p.role !== 'host');
    }
  }

  if (existingParticipant) {
    existingParticipant.isOnline = true;
    if (socketId) existingParticipant.socketId = socketId;
    if (userId && !existingParticipant.userId) existingParticipant.userId = userId;
    existingParticipant.name = userName;
    existingParticipant.avatar = userAvatar;
    if (isHost) existingParticipant.role = 'host';
  } else {
    room.participants.push({
      userId: userId || undefined,
      socketId,
      name: userName,
      avatar: userAvatar,
      role: isHost ? 'host' : 'guest',
      isOnline: true,
      joinedAt: new Date(),
    });
  }

  // Strict deduplication: keep only unique host and unique users/names
  const seenParticipants = new Set();
  room.participants = room.participants.filter(p => {
    if (p.role === 'host') {
      if (seenParticipants.has('host')) return false;
      seenParticipants.add('host');
      return true;
    }
    // Drop any non-host participant with host's name or host's userId
    if (p.name === room.hostName) return false;
    if (p.userId && room.host && p.userId.toString() === room.host.toString()) return false;

    const key = p.userId ? `u_${p.userId.toString()}` : `n_${p.name}`;
    if (seenParticipants.has(key)) return false;
    seenParticipants.add(key);
    return true;
  });

  await room.save();
  res.status(200).json({ success: true, room: getRoomWithEstimatedPosition(room), isHost });
});

// @desc    Leave party room (participant leaves, room remains active!)
// @route   POST /api/party/room/:code/leave
// @access  Public / Optional Auth
const leaveRoom = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(200).json({ success: true, message: 'Phòng không tồn tại' });
  }

  const userId = req.user ? req.user._id : null;
  const socketId = req.body.socketId;

  // Mark participant offline instead of destroying room
  const participant = room.participants.find(p => 
    (userId && p.userId && p.userId.toString() === userId.toString()) ||
    (socketId && p.socketId === socketId)
  );

  if (participant) {
    participant.isOnline = false;
    await room.save();
  }

  res.status(200).json({ success: true, message: 'Đã rời phòng' });
});

// @desc    Delete party room (ONLY HOST can delete!)
// @route   DELETE /api/party/room/:code
// @access  Private (Host only)
const deleteRoom = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại' });
  }

  if (room.host.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Chỉ Host mới có quyền xóa phòng này' });
  }

  if (req.query.permanent === 'true') {
    await PartyRoom.deleteOne({ _id: room._id });
  } else {
    room.isActive = false;
    await room.save();
  }

  // Socket notification can be triggered by calling server IO helper if available
  const io = req.app.get('io');
  if (io) {
    io.to(code).emit('party:room_closed', { code, message: 'Phòng đã bị xóa bởi Host' });
  }

  res.status(200).json({ success: true, message: 'Đã xóa phòng thành công' });
});

// @desc    Update party room metadata (name, description, isPublic, genre)
// @route   PUT /api/party/room/:code
// @access  Private (Host only)
const updateRoom = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại' });
  }

  if (room.host.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Chỉ Host mới có quyền chỉnh sửa phòng này' });
  }

  const { name, description, isPublic, genre } = req.body;

  if (name !== undefined) room.name = name.trim() || room.name;
  if (description !== undefined) room.description = description.trim();
  if (isPublic !== undefined) room.isPublic = Boolean(isPublic);
  if (genre !== undefined) room.genre = genre.trim() || room.genre;

  await room.save();

  const io = req.app.get('io');
  if (io) {
    io.to(code).emit('party:room_updated', { room });
  }

  res.status(200).json({ success: true, room });
});

// @desc    Host updates playback state (play, pause, seek, current track)
// @route   POST /api/party/room/:code/sync
// @access  Private (Host only)
const syncPlayback = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại' });
  }

  if (room.host.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Chỉ Host mới có quyền điều khiển phát nhạc của phòng' });
  }

  const { currentSong, position, isPlaying, queueIndex, queue } = req.body;

  if (currentSong !== undefined) room.currentSong = currentSong;
  if (position !== undefined) room.position = position;
  if (isPlaying !== undefined) room.isPlaying = isPlaying;
  if (queueIndex !== undefined) room.queueIndex = queueIndex;
  if (queue !== undefined) room.queue = queue;
  room.lastSyncTime = new Date();

  await room.save();

  // Emit socket event to all members in room
  const io = req.app.get('io');
  if (io) {
    io.to(code).emit('party:sync_playback', {
      code,
      currentSong: room.currentSong,
      position: room.position,
      isPlaying: room.isPlaying,
      queueIndex: room.queueIndex,
      queue: room.queue,
      lastSyncTime: room.lastSyncTime,
    });
  }

  res.status(200).json({ success: true, room });
});

// @desc    Host updates queue (add/remove songs)
// @route   POST /api/party/room/:code/queue
// @access  Private (Host only)
const updateQueue = asyncHandler(async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const room = await PartyRoom.findOne({ code, isActive: true });

  if (!room) {
    return res.status(404).json({ message: 'Phòng không tồn tại' });
  }

  if (room.host.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Chỉ Host mới có quyền cập nhật danh sách bài hát của phòng' });
  }

  const { queue } = req.body;
  if (Array.isArray(queue)) {
    room.queue = queue;
    await room.save();

    const io = req.app.get('io');
    if (io) {
      io.to(code).emit('party:queue_updated', { code, queue: room.queue });
    }
  }

  res.status(200).json({ success: true, queue: room.queue });
});

module.exports = {
  createRoom,
  getMyActiveRoom,
  getMyRooms,
  getPublicRooms,
  getRoomByCode,
  updateRoom,
  joinRoom,
  leaveRoom,
  deleteRoom,
  syncPlayback,
  updateQueue,
};
