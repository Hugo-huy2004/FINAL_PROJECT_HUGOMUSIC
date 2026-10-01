const mongoose = require('mongoose');
const Playlist = require('../models/Playlist');
const Song = require('../models/Song');
const asyncHandler = require('../utils/asyncHandler');

// Danh sách phát của người dùng. Mọi thao tác chỉ trên danh sách của CHÍNH mình (findOwnedPlaylist).
const NAME_MAX = 80;
const DESC_MAX = 300;
const MAX_SONGS = 1000;
const MAX_BATCH = 200;
// Bài trong danh sách: không kèm lời bài hát (vài KB mỗi bài × hàng trăm bài) — lời tải riêng khi mở.
const SONG_FIELDS = '-plainLyrics -syncedLyrics';
const withSongs = (p) => p.populate({ path: 'songs', select: SONG_FIELDS, match: { status: 'published' } });

function cleanFields(body, { requireName }) {
  const out = {};
  if (body.name !== undefined || requireName) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw Object.assign(new Error('Đặt tên cho danh sách phát'), { status: 400 });
    if (name.length > NAME_MAX) throw Object.assign(new Error(`Tên tối đa ${NAME_MAX} ký tự`), { status: 400 });
    out.name = name;
  }
  if (body.description !== undefined) {
    const d = typeof body.description === 'string' ? body.description.trim() : '';
    if (d.length > DESC_MAX) throw Object.assign(new Error(`Mô tả tối đa ${DESC_MAX} ký tự`), { status: 400 });
    out.description = d;
  }
  return out;
}

// POST /api/playlists { name, description? }
const createPlaylist = asyncHandler(async (req, res) => {
  const playlist = await Playlist.create({ ...cleanFields(req.body, { requireName: true }), owner: req.user._id, songs: [] });
  res.status(201).json(playlist);
});

// GET /api/playlists
const getMyPlaylists = asyncHandler(async (req, res) => {
  const playlists = await Playlist.find({ owner: req.user._id })
    .populate({ path: 'songs', select: SONG_FIELDS, match: { status: 'published' } })
    .sort({ updatedAt: -1 });
  res.json(playlists);
});

async function findOwnedPlaylist(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw Object.assign(new Error('Không tìm thấy danh sách phát'), { status: 404 });
  const playlist = await Playlist.findById(req.params.id);
  if (!playlist) throw Object.assign(new Error('Không tìm thấy danh sách phát'), { status: 404 });
  if (String(playlist.owner) !== String(req.user._id)) throw Object.assign(new Error('Đây không phải danh sách phát của bạn'), { status: 403 });
  return playlist;
}

// PATCH /api/playlists/:id { name?, description? }
const updatePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req);
  const fields = cleanFields(req.body, { requireName: false });
  if (!Object.keys(fields).length) return res.status(400).json({ message: 'Không có gì để sửa' });
  playlist.set(fields);
  await playlist.save();
  res.json(await withSongs(playlist));
});

// POST /api/playlists/:id/songs { songId } | { songIds: [] } — thêm một hoặc nhiều bài trong MỘT request.
// Chỉ nhận bài có thật và đã xuất bản; bài đã có thì bỏ qua (không trùng).
const addSongToPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req);
  const ids = [...new Set([].concat(req.body.songIds || req.body.songId || []).map(String))];
  if (!ids.length || ids.length > MAX_BATCH) return res.status(400).json({ message: `Chọn 1–${MAX_BATCH} bài` });
  const valid = await Song.find({ _id: { $in: ids.filter((id) => mongoose.isValidObjectId(id)) }, status: 'published' }).distinct('_id');
  const have = new Set(playlist.songs.map(String));
  const toAdd = valid.map(String).filter((id) => !have.has(id));
  if (playlist.songs.length + toAdd.length > MAX_SONGS) {
    return res.status(400).json({ message: `Danh sách phát tối đa ${MAX_SONGS} bài` });
  }
  playlist.songs.push(...toAdd);
  await playlist.save();
  res.json(await withSongs(playlist));
});

// PUT /api/playlists/:id/songs { songIds } — sắp xếp lại: phải đúng tập bài hiện có, chỉ khác thứ tự.
const reorderPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req);
  const order = Array.isArray(req.body.songIds) ? req.body.songIds.map(String) : null;
  const current = playlist.songs.map(String);
  const same = order && order.length === current.length && new Set(order).size === order.length && order.every((id) => current.includes(id));
  if (!same) return res.status(400).json({ message: 'Thứ tự mới phải gồm đúng các bài đang có trong danh sách' });
  playlist.songs = order;
  await playlist.save();
  res.json(await withSongs(playlist));
});

// DELETE /api/playlists/:id/songs/:songId
const removeSongFromPlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req);
  playlist.songs = playlist.songs.filter((id) => String(id) !== req.params.songId);
  await playlist.save();
  res.json(await withSongs(playlist));
});

// DELETE /api/playlists/:id
const deletePlaylist = asyncHandler(async (req, res) => {
  const playlist = await findOwnedPlaylist(req);
  await playlist.deleteOne();
  res.json({ message: 'Đã xoá danh sách phát' });
});

module.exports = {
  createPlaylist, getMyPlaylists, updatePlaylist, addSongToPlaylist, reorderPlaylist, removeSongFromPlaylist, deletePlaylist,
};
