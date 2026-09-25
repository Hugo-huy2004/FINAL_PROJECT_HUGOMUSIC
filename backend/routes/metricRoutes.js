const express = require('express');
const { recordPlayback, getPlaybackSummary } = require('../controllers/metricController');
const { protect, optionalAuth, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Không bắt buộc đăng nhập: khách vãng lai cũng nghe được nhạc, mà số liệu
// băng thông của họ vẫn cần vào mốc so sánh.
router.post('/playback', optionalAuth, recordPlayback);
// Số liệu tổng hợp của cả hệ thống — chỉ admin xem.
router.get('/summary', protect, isAdmin, getPlaybackSummary);

module.exports = router;
