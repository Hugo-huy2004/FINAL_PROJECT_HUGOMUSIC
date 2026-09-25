const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/partyController');

// Host only routes
router.post('/create', protect, createRoom);
router.get('/my-room', protect, getMyActiveRoom);
router.get('/my-rooms', protect, getMyRooms);
router.put('/room/:code', protect, updateRoom);
router.delete('/room/:code', protect, deleteRoom);
router.post('/room/:code/sync', protect, syncPlayback);
router.post('/room/:code/queue', protect, updateQueue);

// Public / Optional auth routes
router.get('/rooms', optionalAuth, getPublicRooms);
router.get('/room/:code', optionalAuth, getRoomByCode);
router.post('/room/:code/join', optionalAuth, joinRoom);
router.post('/room/:code/leave', optionalAuth, leaveRoom);

module.exports = router;
