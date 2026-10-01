const express = require('express');
const { doc } = require('hugo-server');
const { getStations } = require('./controller');

const router = express.Router();

// Public — view station list without logging in.
router.get('/stations', doc('Live third-party internet radio stations', {'query': {'country': 'country code (optional)'}, 'returns': 'RadioStation[]'}), getStations); // real third-party live streams (see scripts/radio/importRadioStations.js)

// Mounted automatically at /api/radio (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Radio',
  description: 'Third-party live internet radio.',
  guide: `Live third-party internet radio stations. The list is imported by a maintenance script and a periodic liveness check removes stations that stopped broadcasting. Filter by a two-letter \`country\` code. Stations stream from their own servers — playback never goes through the API.`,
};

module.exports = router;
