const express = require('express');
const { doc } = require('hugo-server');
const { protect, isAdmin } = require('../../core/middleware/auth');
const a = require('./controller');

// Admin page — every route needs an admin session. Listening room is in /api/rooms/admin (needs playing status).
const router = express.Router();
router.use(protect, isAdmin);

router.get('/overview', doc('Dashboard overview: pending work, 14-day listening, top songs', {'returns': '{ songs, users, listening, topSongs, pipeline, rooms }'}), a.overview);
router.get('/songs', doc('Search and filter the whole catalog (paginated)', {'query': {'q': '', 'status': 'pending | published | rejected', 'license': 'missing | <license type>', 'genre': '', 'page': '', 'limit': '≤ 100'}, 'returns': '{ total, page, limit, songs }'}), a.listSongs);
router.post('/songs/bulk', doc('Bulk publish / reject (license check still runs per song)', {'body': {'ids': 'songId[] (≤ 200)', 'action': 'publish | reject', 'note': ''}, 'returns': '{ done, failed, results }'}), a.bulkSongs);
router.get('/artists', doc('Artists derived from the catalog, with photo and bio', {'query': {'q': '', 'page': ''}, 'returns': '{ total, artists }'}), a.listArtists);
router.patch('/artists', doc('Rename / merge an artist across all songs, edit photo and bio', {'body': {'name': 'current name', 'newName': '', 'photo': 'https URL', 'bio': ''}, 'returns': '{ ok, name, renamedSongs }'}), a.updateArtist);
router.get('/albums', doc('Albums (grouped by release source)', {'query': {'q': '', 'page': ''}, 'returns': '{ total, albums }'}), a.listAlbums);
router.get('/albums/:key', doc('Songs in one album', {'returns': '{ key, title, artist, year, songs }'}), a.albumDetail);
router.patch('/albums/:key', doc('Edit album info on every song of the album', {'body': {'title': '', 'artist': '', 'year': ''}, 'returns': '{ ok, updated }'}), a.updateAlbum);
router.get('/pipeline', doc('Post-approval processing status (latest run per song)', {'query': {'status': 'failed | running | ok', 'page': ''}, 'returns': '{ total, counts, runs }'}), a.listPipeline);
router.post('/pipeline/:songId/retry', doc('Re-run the processing pipeline (completed steps are skipped)', {'returns': '{ ok }'}), a.retryPipeline);
router.get('/users', doc('Search and filter accounts', {'query': {'q': '', 'role': 'user | admin', 'status': 'active | disabled', 'page': ''}, 'returns': '{ total, users }'}), a.listUsers);
router.get('/users/:id', doc('User detail: listening habits, devices, playlists…', {'returns': '{ user, stats, topSongs, topGenres, recent, platforms, activity, playlists, favorites }'}), a.userDetail);
router.patch('/users/:id', doc('Disable / enable an account (disabling revokes every session)', {'body': {'disabled': 'true | false'}, 'returns': '{ ok, disabled }'}), a.updateUser);
router.post('/users/:id/revoke-sessions', doc('Sign the user out of every device', {'returns': '{ ok }'}), a.revokeSessions);
router.delete('/users/:id', doc('Delete the account (listening stats are kept anonymised)', {'returns': '{ ok }'}), a.deleteUser);

// Mounted automatically at /api/admin (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Admin',
  description: 'Catalog, artists, albums, pipeline and user management. Every route requires an admin session.',
  guide: `Every screen of the admin dashboard goes through this group. All routes require an administrator session (password sign-in followed by the one-time code step).

**Catalog.** \`GET /songs\` searches the whole catalog with filters for status, license and genre. \`POST /songs/bulk\` publishes or rejects up to 200 songs at once; the license check still runs for every song, so a bulk publish can never skip it — songs that fail are returned in \`failed\` with the reason.

**Artists and albums** are derived from the songs rather than stored twice. Renaming an artist rewrites the artist on every song (which also merges duplicates); editing an album updates every track of that album.

**Processing pipeline.** Publishing a song starts a background run: release details and cover → perceptual bitrate ladder → transition analysis → adaptive streaming build. \`GET /pipeline\` shows the latest run per song; \`POST /pipeline/:songId/retry\` re-runs it and skips the steps that already succeeded.

**Users.** Search accounts, open a detail view (listening habits, devices, playlists), disable an account (which revokes every session), sign a user out everywhere, or delete an account — listening statistics are kept, anonymised.`,
};

module.exports = router;
