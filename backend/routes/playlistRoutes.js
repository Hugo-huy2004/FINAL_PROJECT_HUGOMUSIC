const express = require('express');
const { doc } = require('../utils/apiDocs');
const {
  createPlaylist,
  getMyPlaylists,
  updatePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  reorderPlaylist,
  deletePlaylist,
} = require('../controllers/playlistController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // every playlist route requires a logged-in user

router.route('/')
  .get(doc('Danh sách phát của tôi', { returns: 'Playlist[]' }), getMyPlaylists)
  .post(doc('Tạo danh sách phát', { body: { name: '≤ 80 ký tự', description: '≤ 300 ký tự (tuỳ chọn)' }, returns: 'Playlist' }), createPlaylist);

router.patch('/:id', doc('Đổi tên / mô tả danh sách phát', {'body': {'name': '≤ 80 ký tự', 'description': '≤ 300 ký tự'}, 'returns': 'Playlist'}), updatePlaylist);
router.delete('/:id', doc('Xoá danh sách phát', {'returns': '{ message }'}), deletePlaylist);
router.post('/:id/songs', doc('Thêm một hoặc nhiều bài (chỉ bài đã xuất bản, bỏ qua bài trùng)', {'body': {'songId': 'một bài', 'songIds': 'hoặc nhiều bài (≤ 200)'}, 'returns': 'Playlist'}), addSongToPlaylist);
router.put('/:id/songs', doc('Sắp xếp lại bài trong danh sách (đúng tập bài hiện có, khác thứ tự)', { body: { songIds: 'songId[] theo thứ tự mới' }, returns: 'Playlist' }), reorderPlaylist);
router.delete('/:id/songs/:songId', doc('Gỡ bài khỏi danh sách phát', {'returns': 'Playlist'}), removeSongFromPlaylist);

module.exports = router;
