const express = require('express');
const { doc } = require('hugo-server');
const { getMeta } = require('./controller');

const router = express.Router();

router.get('/', doc('Reference data for clients: genre groups (with match rules and colours), licenses, preference genres, song statuses', { returns: '{ genreGroups, licenses, preferenceGenres, songStatuses }' }), getMeta);

// Mounted automatically at /api/meta (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Meta',
  description: 'Reference data the clients render from: genres, genre groups, license types, song statuses.',
  guide: `Reference data the clients render from, owned by the server: genre groups with their match rules and colours, the licenses a song can carry (and which of them forbid derivative works), the genres listeners can pick as preferences, and the song review statuses (read from the database schema).

Clients load it once at start-up and keep the last copy for offline launches. Changing a table on the server changes every client — no app release needed.`,
};

module.exports = router;
