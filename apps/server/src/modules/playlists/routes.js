const express = require('express');
const { doc } = require('hugo-server');
const {
  createPlaylist,
  getMyPlaylists,
  updatePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  reorderPlaylist,
  deletePlaylist,
} = require('./controller');
const { protect } = require('../../core/middleware/auth');

const router = express.Router();

router.use(protect); // every playlist route requires a logged-in user

router.route('/')
  .get(doc('My playlists', { returns: 'Playlist[]' }), getMyPlaylists)
  .post(doc('Create a playlist', { body: { name: '≤ 80 characters', description: '≤ 300 characters (optional)' }, returns: 'Playlist' }), createPlaylist);

router.patch('/:id', doc('Rename / edit the playlist description', {'body': {'name': '≤ 80 characters', 'description': '≤ 300 characters'}, 'returns': 'Playlist'}), updatePlaylist);
router.delete('/:id', doc('Delete a playlist', {'returns': '{ message }'}), deletePlaylist);
router.post('/:id/songs', doc('Add one or many songs (published only, duplicates skipped)', {'body': {'songId': 'one song', 'songIds': 'or many songs (≤ 200)'}, 'returns': 'Playlist'}), addSongToPlaylist);
router.put('/:id/songs', doc('Reorder songs (same set of songs, new order)', { body: { songIds: 'songId[] in the new order' }, returns: 'Playlist' }), reorderPlaylist);
router.delete('/:id/songs/:songId', doc('Remove a song from the playlist', {'returns': 'Playlist'}), removeSongFromPlaylist);

// Mounted automatically at /api/playlists (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Playlists',
  description: 'Personal playlists. Every route requires a signed-in user.',
  guide: `Personal playlists. Every route requires a signed-in user, and every route checks that the playlist belongs to that user.

- Names are up to 80 characters, descriptions up to 300.
- \`POST /:id/songs\` adds one song (\`songId\`) or up to 200 (\`songIds\`) in one call. Only published songs are accepted and duplicates are skipped silently.
- \`PUT /:id/songs\` reorders: send the same set of song ids in the new order; a different set is rejected with 400.
- Responses return the whole playlist with its songs, so the client can replace its copy directly.`,
};

module.exports = router;
