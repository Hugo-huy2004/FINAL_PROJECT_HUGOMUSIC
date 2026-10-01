const express = require('express');
const { doc } = require('../utils/apiDocs');
const { protect, isAdmin } = require('../middleware/authMiddleware');
const a = require('../controllers/adminController');

// Trang quản trị — mọi route cần phiên admin. Phòng nghe ở /api/rooms/admin (cần trạng thái đang phát).
const router = express.Router();
router.use(protect, isAdmin);

router.get('/overview', doc('Tổng quan: việc cần xử lý, lượt nghe 14 ngày, bài nghe nhiều', {'returns': '{ songs, users, listening, topSongs, pipeline, rooms }'}), a.overview);
router.get('/songs', doc('Tìm/lọc toàn kho (phân trang)', {'query': {'q': '', 'status': 'pending | published | rejected', 'license': 'missing | <loại>', 'genre': '', 'page': '', 'limit': '≤ 100'}, 'returns': '{ total, page, limit, songs }'}), a.listSongs);
router.post('/songs/bulk', doc('Duyệt / từ chối hàng loạt (vẫn kiểm tra bản quyền từng bài)', {'body': {'ids': 'songId[] (≤ 200)', 'action': 'publish | reject', 'note': ''}, 'returns': '{ done, failed, results }'}), a.bulkSongs);
router.get('/artists', doc('Nghệ sĩ suy từ kho + ảnh/tiểu sử', {'query': {'q': '', 'page': ''}, 'returns': '{ total, artists }'}), a.listArtists);
router.patch('/artists', doc('Đổi tên / gộp nghệ sĩ trên mọi bài, sửa ảnh, tiểu sử', {'body': {'name': 'tên hiện tại', 'newName': '', 'photo': 'https URL', 'bio': ''}, 'returns': '{ ok, name, renamedSongs }'}), a.updateArtist);
router.get('/albums', doc('Album (gom theo nguồn phát hành)', {'query': {'q': '', 'page': ''}, 'returns': '{ total, albums }'}), a.listAlbums);
router.get('/albums/:key', doc('Các bài trong một album', {'returns': '{ key, title, artist, year, songs }'}), a.albumDetail);
router.patch('/albums/:key', doc('Sửa thông tin album trên mọi bài của album', {'body': {'title': '', 'artist': '', 'year': ''}, 'returns': '{ ok, updated }'}), a.updateAlbum);
router.get('/pipeline', doc('Trạng thái xử lý sau duyệt (lần chạy mới nhất mỗi bài)', {'query': {'status': 'failed | running | ok', 'page': ''}, 'returns': '{ total, counts, runs }'}), a.listPipeline);
router.post('/pipeline/:songId/retry', doc('Chạy lại chuỗi xử lý (bỏ qua bước đã xong)', {'returns': '{ ok }'}), a.retryPipeline);
router.get('/users', doc('Tìm/lọc tài khoản', {'query': {'q': '', 'role': 'user | admin', 'status': 'active | disabled', 'page': ''}, 'returns': '{ total, users }'}), a.listUsers);
router.get('/users/:id', doc('Chi tiết một người dùng: thói quen nghe, thiết bị, danh sách phát…', {'returns': '{ user, stats, topSongs, topGenres, recent, platforms, activity, playlists, favorites }'}), a.userDetail);
router.patch('/users/:id', doc('Khoá / mở khoá tài khoản (khoá = thu hồi mọi phiên)', {'body': {'disabled': 'true | false'}, 'returns': '{ ok, disabled }'}), a.updateUser);
router.post('/users/:id/revoke-sessions', doc('Đăng xuất người dùng khỏi mọi thiết bị', {'returns': '{ ok }'}), a.revokeSessions);
router.delete('/users/:id', doc('Xoá tài khoản (giữ số liệu nghe ẩn danh)', {'returns': '{ ok }'}), a.deleteUser);

module.exports = router;
