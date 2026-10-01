const express = require('express');
const { doc } = require('../utils/apiDocs');
const multer = require('multer');
const {
  updateSongCover,
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

// Multer: tệp nhạc (audio/*, ≤ 50 MB) + ảnh bìa tuỳ chọn (image/*, kiểm cỡ ≤ 5 MB ở controller).
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === 'cover' ? file.mimetype.startsWith('image/') : file.mimetype.startsWith('audio/');
    cb(ok ? null : Object.assign(new Error(file.fieldname === 'cover' ? 'Ảnh bìa phải là tệp ảnh' : 'Chỉ nhận tệp nhạc'), { status: 400 }), ok);
  },
});

router.get('/', doc('Toàn bộ kho đã xuất bản (cache Redis, hỗ trợ ETag/304)', {'returns': 'Song[]'}), getSongs);
router.get('/liked/mine', doc('Bài đã thích của tôi', {'returns': 'Song[]'}), protect, getLikedSongs);
router.get('/stream/:id', doc('Phát nhạc qua proxy Node (dự phòng khi CDN lỗi; hỗ trợ Range)', {'query': {'token': 'token phát từ /:id/playback'}, 'returns': 'audio/* (206)'}), streamSong);
router.get('/:id/lyrics', doc('Lời bài hát (thường và có mốc thời gian)', {'returns': '{ hasLyrics, plainLyrics, syncedLyrics, source, checked }'}), getLyrics);
// Cấp token phát — không bắt buộc đăng nhập: khách được nghe trọn vài bài mỗi ngày.
router.get('/:id/playback', doc('Xin token phát + URL đã ký trên mọi CDN (khách: 3 bài/ngày)', {'returns': '{ fileToken, hlsToken, expiresIn, sources: [{ cdn, file, hls }] }'}), optionalAuth, getPlaybackToken);
router.post('/:id/like', doc('Thích / bỏ thích một bài', {'returns': '{ liked, favorites }'}), protect, toggleLikeSong);

// Quản lý kho — chỉ admin. Bài mới vào hàng chờ ('pending'), admin duyệt mới
// xuất bản; xem controllers/songController.js.
router.get('/admin/queue', doc('Hàng chờ duyệt (kèm kết quả kiểm tra hai tầng)', {'query': {'status': 'pending | published | rejected'}, 'returns': '{ status, counts, songs }'}), protect, isAdmin, getReviewQueue);
router.post('/upload', doc('Tải bài lên (multipart) → vào hàng chờ duyệt', {'body': {'audio': 'tệp nhạc ≤ 50 MB', 'cover': 'ảnh bìa JPEG/PNG/WebP ≤ 5 MB (tuỳ chọn; không có thì lấy ảnh nhúng)', 'title': '', 'artist': '', 'genre': '', 'category': '', 'albumTitle': '', 'albumYear': '', 'trackNo': '', 'licenseType': 'bắt buộc', 'sourceUrl': 'bắt buộc', 'licenseUrl': '', 'attribution': '', 'allowDuplicate': 'true để tải dù trùng bài đã có'}, 'returns': 'Song (409 nếu trùng)'}), protect, isAdmin, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), uploadSong);
router.patch('/:id', doc('Sửa thông tin bài', {'body': {'title': '', 'artist': '', 'genre': '', 'category': '', 'sourceUrl': 'URL', 'licenseUrl': 'URL', 'licenseType': '', 'attribution': '', 'albumTitle': '', 'albumYear': '', 'trackNo': '', 'plainLyrics': '', 'syncedLyrics': 'định dạng LRC'}, 'returns': 'Song + review'}), protect, isAdmin, updateSong);
router.patch('/:id/cover', doc('Đổi ảnh bìa (multipart: cover)', { body: { cover: 'JPEG/PNG/WebP ≤ 5 MB' }, returns: 'Song + review' }), protect, isAdmin, upload.single('cover'), updateSongCover);
router.post('/:id/review', doc('Duyệt (chạy pipeline xử lý) hoặc từ chối bài', {'body': {'decision': 'publish | reject', 'note': 'tuỳ chọn'}, 'returns': 'Song + review + pipelineStarted'}), protect, isAdmin, reviewSongDecision);
router.delete('/:id', doc('Xoá hẳn bài: DB, tham chiếu, tệp R2', {'returns': '{ message, storageCleaned }'}), protect, isAdmin, deleteSong);

module.exports = router;
