const express = require('express');
const { doc } = require('../utils/apiDocs');
const { recordPlayback, getPlaybackSummary, getTopSongs } = require('../controllers/metricController');
const { protect, optionalAuth, isAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Không bắt buộc đăng nhập: khách vãng lai cũng nghe được nhạc, mà số liệu
// băng thông của họ vẫn cần vào mốc so sánh.
router.post('/playback', doc('Gửi số liệu một lượt phát (độ trễ ra tiếng, đứt tiếng, CDN…)', {'body': {'songId': '', 'startupMs': '', 'rebufferCount': '', 'rebufferMs': '', 'playedMs': '', 'completed': '', 'platform': '', 'cdn': ''}, 'returns': '204'}), optionalAuth, recordPlayback);
// Bảng xếp hạng theo lượt nghe — công khai (tab Mới, sắp xếp "Nghe nhiều").
router.get('/top', doc('Bảng xếp hạng: lượt nghe trên Hugo + độ phổ biến toàn cầu', {'query': {'days': '7 | 30 | 0 (mọi lúc)', 'limit': '≤ 200', 'group': 'nhóm thể loại'}, 'returns': 'Song[] + điểm'}), getTopSongs);
// Số liệu tổng hợp của cả hệ thống — chỉ admin xem.
router.get('/summary', doc('Tổng hợp số liệu phát, theo từng CDN', {'returns': '{ stream, playback, byCdn }'}), protect, isAdmin, getPlaybackSummary);

module.exports = router;
