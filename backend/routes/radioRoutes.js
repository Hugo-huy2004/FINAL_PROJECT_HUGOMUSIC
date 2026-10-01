const express = require('express');
const { doc } = require('../utils/apiDocs');
const { getStations } = require('../controllers/radioController');

const router = express.Router();

// Public — xem danh sách đài không cần đăng nhập.
router.get('/stations', doc('Đài radio trực tuyến bên ngoài đang phát', {'query': {'country': 'mã quốc gia (tuỳ chọn)'}, 'returns': 'RadioStation[]'}), getStations); // real third-party live streams (see scripts/radio/importRadioStations.js)

module.exports = router;
