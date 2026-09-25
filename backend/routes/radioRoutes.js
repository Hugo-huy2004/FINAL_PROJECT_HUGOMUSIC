const express = require('express');
const { getNowPlaying, getStations } = require('../controllers/radioController');

const router = express.Router();

// Public — no login required, same as the rest of the Radio screen ("Phát sóng tự do
// không cần đăng nhập").
router.get('/stations', getStations); // real third-party live streams (see scripts/radio/importRadioStations.js)
router.get('/:stationId/now-playing', getNowPlaying); // simulated stations built from this app's own catalog

module.exports = router;
