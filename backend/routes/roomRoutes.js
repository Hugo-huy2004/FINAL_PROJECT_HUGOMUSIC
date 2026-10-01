const express = require('express');
const { doc } = require('../utils/apiDocs');
const { protect, isAdmin } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const stations = require('../rooms/stations');
const blind = require('../rooms/blindTest');
const admin = require('../rooms/admin');

const router = express.Router();

// Xem danh sách phòng thì ai cũng được; vào nghe cần đăng nhập (socket kiểm tra).
// Phòng do Hugo cung cấp — chỉ admin tạo/sửa/xoá.
router.get('/stations', doc('Các kênh 24/7 đang mở + bài đang phát + số người nghe', {'returns': '{ stations }'}), asyncHandler(stations.listStations));
router.get('/blind', doc('Các phòng nghe mù đang mở', {'returns': '{ rooms }'}), asyncHandler(blind.listRooms));
router.get('/blind/results', doc('Kết quả thử nghe mù (thống kê theo cặp chất lượng)', {'returns': 'thống kê'}), protect, isAdmin, asyncHandler(blind.results));

router.get('/admin', doc('Mọi phòng (kể cả đang ẩn) + lựa chọn cho form', {'returns': '{ rooms, genres, categories }'}), protect, isAdmin, asyncHandler(admin.list));
router.post('/admin', doc('Tạo phòng', {'body': {'kind': 'station | blind', 'name': '', 'tagline': '', 'colors': '[hex, hex]', 'allowRequests': '', 'rules': '{ groups, excludeGroups, categories, instrumental, calm, popular }'}, 'returns': 'Room'}), protect, isAdmin, asyncHandler(admin.create));
router.post('/admin/preview', doc('Xem trước luật chọn bài: số bài hợp luật + bài mẫu', {'body': {'rules': ''}, 'returns': '{ count, sample }'}), protect, isAdmin, asyncHandler(admin.preview));
router.patch('/admin/:id', doc('Sửa phòng (có hiệu lực ngay với người đang nghe)', {'body': {'name': '', 'tagline': '', 'colors': '', 'active': '', 'allowRequests': '', 'rules': '', 'pinned': 'songId[] — bài admin chọn cho kênh'}, 'returns': 'Room'}), protect, isAdmin, asyncHandler(admin.update));
router.delete('/admin/:id', doc('Xoá phòng (đưa người đang nghe ra)', {'returns': '{ ok }'}), protect, isAdmin, asyncHandler(admin.remove));
router.get('/admin/:id/songs', doc('Bài admin đã chọn cho kênh', {'returns': '{ songs }'}), protect, isAdmin, asyncHandler(admin.pinnedSongs));
router.get('/admin/:id/suggestions', doc('Gợi ý bài cho kênh (theo luật) hoặc tìm trong kho', {'query': {'q': 'tìm theo tên bài / nghệ sĩ (tuỳ chọn)'}, 'returns': '{ songs, matchedRules }'}), protect, isAdmin, asyncHandler(admin.suggestions));
router.get('/admin/:id/live', doc('Trạng thái kênh đang phát: bài, hàng chờ, người nghe', {'returns': '{ now, queue, listeners }'}), protect, isAdmin, asyncHandler(admin.live));
router.post('/admin/:id/queue', doc('Xếp một bài phát ngay sau bài hiện tại', {'body': {'songId': ''}, 'returns': 'trạng thái kênh'}), protect, isAdmin, asyncHandler(admin.enqueue));
router.delete('/admin/:id/queue/:entryId', doc('Gỡ một bài khỏi hàng chờ', {'returns': 'trạng thái kênh'}), protect, isAdmin, asyncHandler(admin.dequeue));
router.post('/admin/:id/skip', doc('Bỏ qua bài đang phát', {'returns': 'trạng thái kênh'}), protect, isAdmin, asyncHandler(admin.skip));

module.exports = router;
