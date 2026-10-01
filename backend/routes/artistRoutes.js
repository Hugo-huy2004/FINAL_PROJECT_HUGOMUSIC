const express = require('express');
const { doc } = require('../utils/apiDocs');
const { getArtists } = require('../controllers/artistController');

const router = express.Router();

router.get('/', doc('Nghệ sĩ có ảnh/tiểu sử (nguồn Wikimedia)', {'returns': 'Artist[]'}), getArtists);

module.exports = router;
