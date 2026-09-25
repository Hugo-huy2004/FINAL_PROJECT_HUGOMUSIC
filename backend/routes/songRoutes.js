const express = require('express');
const multer = require('multer');
const {
  uploadSong,
  getSongs,
  streamSong,
  getPlaybackToken,
  toggleLikeSong,
  getLikedSongs,
  deleteSong,
  getLyrics,
  getReviewQueue,
  updateSong,
  reviewSongDecision,
} = require('../controllers/songController');
const { protect, optionalAuth, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio files are allowed'));
    }
    cb(null, true);
  },
});

router.get('/', getSongs); // supports ?q=<search term>
router.get('/liked/mine', protect, getLikedSongs);
router.get('/stream/:id', streamSong);
router.get('/:id/lyrics', getLyrics);
// Cấp token phát — không bắt buộc đăng nhập: khách được nghe trọn vài bài mỗi ngày.
router.get('/:id/playback', optionalAuth, getPlaybackToken);
router.post('/:id/like', protect, toggleLikeSong);

// Quản lý kho — chỉ admin. Bài mới vào hàng chờ ('pending'), admin duyệt mới
// xuất bản; xem controllers/songController.js.
router.get('/admin/queue', protect, isAdmin, getReviewQueue);
router.post('/upload', protect, isAdmin, upload.single('audio'), uploadSong);
router.patch('/:id', protect, isAdmin, updateSong);
router.post('/:id/review', protect, isAdmin, reviewSongDecision);
router.delete('/:id', protect, isAdmin, deleteSong);

module.exports = router;
