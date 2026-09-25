const express = require('express');
const {
  createPlaylist,
  getMyPlaylists,
  updatePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
} = require('../controllers/playlistController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // every playlist route requires a logged-in user

router.route('/')
  .get(getMyPlaylists)
  .post(createPlaylist);

router.patch('/:id', updatePlaylist);
router.delete('/:id', deletePlaylist);
router.post('/:id/songs', addSongToPlaylist);
router.delete('/:id/songs/:songId', removeSongFromPlaylist);

module.exports = router;
