const express = require('express');
const { doc } = require('../utils/apiDocs');
const { proxyImage } = require('../controllers/imageController');

const router = express.Router();

router.get('/proxy', doc('Ảnh bìa qua Node (dự phòng khi không có CDN)', {'query': {'key': 'covers/…'}, 'returns': 'image/*'}), proxyImage);

module.exports = router;
