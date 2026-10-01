const express = require('express');
const { doc } = require('hugo-server');
const { getArtists } = require('./controller');

const router = express.Router();

router.get('/', doc('Artists with photo and biography from an open encyclopedia', {'returns': 'Artist[]'}), getArtists);

// Mounted automatically at /api/artists (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Artists',
  description: 'Artist profiles with open encyclopedia photos and biographies.',
  guide: `A read-only list of artist profiles: photo, short biography and the source page they came from. Profiles are matched to songs by artist name, so the catalog stays the single source of truth for who performs what.

The list is built offline by a maintenance script and changes rarely; clients can cache it and revalidate with \`If-None-Match\`.`,
};

module.exports = router;
