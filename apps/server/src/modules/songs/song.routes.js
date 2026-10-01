/**
 * =============================================================================
 * SONG ROUTES (Mounted at /api/songs)
 * =============================================================================
 * WHAT IT DOES:
 *    - Declares REST API endpoints for songs:
 *        GET    /api/songs              -> Get songs (keyword search ?q=, pagination ?page=)
 *        GET    /api/songs/:id/playback -> Get playback token and signed CDN stream URLs
 *        GET    /api/songs/:id/lyrics   -> Get plain and time-synced lyrics
 *        POST   /api/songs/:id/like     -> Like or unlike a song
 *        POST   /api/songs/upload       -> Upload a new song file (Admin only)
 *        POST   /api/songs/:id/review   -> Publish or reject song (Admin only)
 *        DELETE /api/songs/:id          -> Permanently delete a song (Admin only)
 * 
 * WHO CALLS THIS FILE:
 *    - `apps/server/src/index.js`: Discovers and mounts this router on Express app.
 * 
 * WHAT THIS FILE CALLS:
 *    - `song.controller.js`: Forwards requests to business logic handlers.
 *    - `../../core/middleware/auth.js`: Protects routes with `protect` and `isAdmin`.
 * =============================================================================
 */

const express = require('express');
const { doc } = require('hugo-server');
const multer = require('multer');
const {
  updateSongCover,
  uploadSong,
  getSongs,
  streamSong,
  getPlaybackToken,
  toggleLikeSong,
  getLikedSongs,
  deleteSong,
  getLyrics,
  getReviewQueue,
  updateSong,
  reviewSongDecision,
} = require('./controller');
const { protect, optionalAuth, isAdmin } = require('../../core/middleware/auth');

const router = express.Router();

// Multer: music file (audio/*, ≤ 50 MB) + optional cover image (image/*, check size ≤ 5 MB in controller).
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === 'cover' ? file.mimetype.startsWith('image/') : file.mimetype.startsWith('audio/');
    cb(ok ? null : Object.assign(new Error(file.fieldname === 'cover' ? 'Cover image must be an image file' : 'Only audio files are accepted'), { status: 400 }), ok);
  },
});

router.get('/', doc('The published catalog with optional search, genre filter and pagination', {'query': {'q': 'optional search keyword', 'genre': 'filter by genre', 'page': 'page number', 'limit': 'items per page'}, 'returns': 'Song[]'}), getSongs);
router.get('/liked/mine', doc('My liked songs', {'returns': 'Song[]'}), protect, getLikedSongs);
router.get('/stream/:id', doc('Stream audio through Node (fallback when the CDN fails; supports Range)', {'query': {'token': 'playback token from /:id/playback'}, 'returns': 'audio/* (206)'}), streamSong);
router.get('/:id/lyrics', doc('Lyrics (plain and time-synced)', {'returns': '{ hasLyrics, plainLyrics, syncedLyrics, source, checked }'}), getLyrics);
// Issued tokens — no login required: guests can listen to a few full songs each day.
router.get('/:id/playback', doc('Get a playback token and signed URLs on every CDN (guests: 3 songs/day)', {'returns': '{ fileToken, hlsToken, expiresIn, sources: [{ cdn, file, hls }] }'}), optionalAuth, getPlaybackToken);
router.post('/:id/like', doc('Like / unlike a song', {'returns': '{ liked, favorites }'}), protect, toggleLikeSong);

// Inventory management — admin only. New post enters queue ('pending'), new admin approves
// publishing; see controllers/songController.js.
router.get('/admin/queue', doc('Review queue (with the two-tier check results)', {'query': {'status': 'pending | published | rejected'}, 'returns': '{ status, counts, songs }'}), protect, isAdmin, getReviewQueue);
router.post('/upload', doc('Upload a song (multipart) into the review queue', {'body': {'audio': 'audio file ≤ 50 MB', 'cover': 'JPEG/PNG/WebP cover ≤ 5 MB (optional; embedded art is used otherwise)', 'title': '', 'artist': '', 'genre': '', 'category': '', 'albumTitle': '', 'albumYear': '', 'trackNo': '', 'licenseType': 'required', 'sourceUrl': 'required', 'licenseUrl': '', 'attribution': '', 'allowDuplicate': 'true to upload even if the song already exists'}, 'returns': 'Song', errors: { 409: 'A song with the same title and artist exists — resend with allowDuplicate=true' }}), protect, isAdmin, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), uploadSong);
router.patch('/:id', doc('Edit song details', {'body': {'title': '', 'artist': '', 'genre': '', 'category': '', 'sourceUrl': 'URL', 'licenseUrl': 'URL', 'licenseType': '', 'attribution': '', 'albumTitle': '', 'albumYear': '', 'trackNo': '', 'plainLyrics': '', 'syncedLyrics': 'LRC format'}, 'returns': 'Song + review'}), protect, isAdmin, updateSong);
router.patch('/:id/cover', doc('Replace the cover (multipart: cover)', { body: { cover: 'JPEG/PNG/WebP ≤ 5 MB' }, returns: 'Song + review' }), protect, isAdmin, upload.single('cover'), updateSongCover);
router.post('/:id/review', doc('Publish (starts the processing pipeline) or reject a song', {'body': {'decision': 'publish | reject', 'note': 'optional'}, 'returns': 'Song + review + pipelineStarted'}), protect, isAdmin, reviewSongDecision);
router.delete('/:id', doc('Delete a song for good: database record, references, stored files', {'returns': '{ message, storageCleaned }'}), protect, isAdmin, deleteSong);

// Mounted automatically at /api/songs (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Songs & playback',
  description: 'Catalog, lyrics, likes, signed playback, uploads and review.',
  guide: `**Catalog.** \`GET /\` returns every published song (cached; send \`If-None-Match\` to get **304** when nothing changed). Lyrics come from \`GET /:id/lyrics\`, plain and time-synced.

**Playback.** \`GET /:id/playback\` returns a 5–10 minute token and signed URLs on every CDN (\`sources\`: original file and adaptive stream). Guests may play 3 different songs per day. If every CDN fails, \`GET /stream/:id?token=…\` streams through the API server with \`Range\` support.

**Likes.** \`POST /:id/like\` toggles a like and returns the updated favourites.

**Publishing (admin).** \`POST /upload\` (multipart: audio, optional cover, license and source URL required) puts a song in the review queue; a duplicate title and artist answers **409** unless \`allowDuplicate=true\`. \`POST /:id/review\` publishes — which starts the processing pipeline — or rejects. \`PATCH /:id\` and \`PATCH /:id/cover\` edit details; \`DELETE /:id\` removes the song, its references and its stored files.`,
};

module.exports = router;
