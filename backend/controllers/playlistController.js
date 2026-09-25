const Playlist = require('../models/Playlist');
const asyncHandler = require('../utils/asyncHandler');

const createPlaylist = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Playlist name is required' });
  }
  const playlist = await Playlist.create({ name: name.trim(), owner: req.user._id, songs: [] });
  res.status(201).json(playlist);
});

const getMyPlaylists = asyncHandler(async (req, res) => {
  const playlists = await Playlist.find({ owner: req.user._id })
    .populate('songs')
    .sort({ createdAt: -1 });
  res.json(playlists);
});

const findOwnedPlaylist = async (req, res) => {
  const playlist = await Playlist.findById(req.params.id);
  if (!playlist) {
    res.status(404).json({ message: 'Playlist not found' });
    return null;
  }
  if (playlist.owner.toString() !== req.user._id.toString()) {
    res.status(403).json({ message: 'Not your playlist' });
    return null;
  }
  return playlist;
};

// PATCH /api/playlists/:id — rename only; songs are managed via the add/remove routes.
const updatePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req, res);
  if (!playlist) return;

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Playlist name is required' });
  }
  playlist.name = name.trim();
  await playlist.save();
  res.json(await playlist.populate('songs'));
});

const addSongToPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req, res);
  if (!playlist) return;

  const { songId } = req.body;
  if (!songId) {
    return res.status(400).json({ message: 'songId is required' });
  }
  if (!playlist.songs.some((id) => id.toString() === songId)) {
    playlist.songs.push(songId);
    await playlist.save();
  }
  res.json(await playlist.populate('songs'));
});

const removeSongFromPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req, res);
  if (!playlist) return;

  playlist.songs = playlist.songs.filter((id) => id.toString() !== req.params.songId);
  await playlist.save();
  res.json(await playlist.populate('songs'));
});

const deletePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req, res);
  if (!playlist) return;

  await playlist.deleteOne();
  res.json({ message: 'Playlist deleted' });
});

module.exports = {
  createPlaylist,
  getMyPlaylists,
  updatePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
};
