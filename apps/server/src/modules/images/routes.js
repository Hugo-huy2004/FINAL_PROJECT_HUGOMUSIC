const express = require('express');
const { doc } = require('hugo-server');
const { proxyImage } = require('./controller');

const router = express.Router();

router.get('/proxy', doc('Cover image through Node (fallback when no CDN is configured)', {'query': {'key': 'covers/…'}, 'returns': 'image/*'}), proxyImage);

// Mounted automatically at /api/images (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Images',
  description: 'Image delivery fallback when no CDN is configured.',
  guide: `A fallback for cover images when no CDN is configured: the API server reads the image from object storage and returns it with long cache headers. With a CDN in place clients load covers from the CDN directly and never call this route.`,
};

module.exports = router;
