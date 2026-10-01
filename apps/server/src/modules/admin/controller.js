// Admin API (/api/admin/*, protect + isAdmin — routes/adminRoutes.js). Runs at API layer no
// status; listening room (needs playing status) is located in /api/rooms/admin (rooms/admin.js).
//
// Overview GET /overview
// Music GET /songs POST /songs/bulk
// Artists, albums GET /artists PATCH /artists GET/PATCH /albums[/:key]
// Post status GET /pipeline POST /pipeline/:songId/retry
// Users GET /users GET/PATCH/DELETE /users/:id POST /users/:id/revoke-sessions
//
// No role change API (user ↔ admin): according to models/User.js, promotion is only via scripts/admin/createAdmin.js
// — a captured admin account cannot create additional admins via HTTP.
const mongoose = require('mongoose');
const asyncHandler = require('../../core/asyncHandler');
const Song = require('../songs/Song');
const User = require('../auth/User');
const Artist = require('../artists/Artist');
const Playlist = require('../playlists/Playlist');
const PipelineRun = require('../../pipeline/PipelineRun');
const PlaybackMetric = require('../metrics/PlaybackMetric');
const ListeningRoom = require('../rooms/ListeningRoom');
const { reviewSong } = require('../songs/songReview');
const { removeUserCompletely } = require('../auth/userRemoval');
const { cacheDel } = require('../../config/redis');
const { runApprovalPipeline, withReview, REVIEW_FIELDS, SONGS_CACHE_KEY } = require('../songs/controller');

const DAY = 24 * 60 * 60 * 1000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textMatch = (q, fields) => {
  const t = String(q || '').trim().slice(0, 80);
  if (!t) return {};
  const re = new RegExp(escapeRegex(t), 'i');
  return { $or: fields.map((f) => ({ [f]: re })) };
};
const paging = (req, max = 100) => {
  const limit = Math.min(max, Math.max(1, Number(req.query.limit) || 30));
  const page = Math.max(1, Number(req.query.page) || 1);
  return { limit, page, skip: (page - 1) * limit };
};
const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Invalid ID'), { status: 400 });
  return new mongoose.Types.ObjectId(String(id));
};
const COUNTED_PLAY = { $or: [{ playedMs: { $gte: 30000 } }, { completed: true }] };

// ---------------- Overview ----------------

// GET /api/admin/overview
const overview = asyncHandler(async (req, res) => {
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY);
  const since14 = new Date(now - 14 * DAY);
  const [songStatus, licenseMissing, users, newUsers, activeUsers, disabledUsers, plays7, daily, topSongs, pipeline, rooms] = await Promise.all([
    Song.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Song.countDocuments({ status: 'published', licenseType: { $in: [null] } }),
    User.countDocuments({}),
    User.countDocuments({ createdAt: { $gte: since7 } }),
    User.countDocuments({ lastSeenAt: { $gte: since7 } }),
    User.countDocuments({ disabled: true }),
    PlaybackMetric.aggregate([
      { $match: { kind: 'playback', createdAt: { $gte: since7 } } },
      { $group: { _id: null, plays: { $sum: 1 }, ms: { $sum: '$playedMs' }, listeners: { $addToSet: '$user' } } },
    ]),
    PlaybackMetric.aggregate([
      { $match: { kind: 'playback', createdAt: { $gte: since14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, plays: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    PlaybackMetric.aggregate([
      { $match: { kind: 'playback', createdAt: { $gte: since7 }, ...COUNTED_PLAY } },
      { $group: { _id: '$song', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } }, { $limit: 5 },
      { $lookup: { from: 'songs', localField: '_id', foreignField: '_id', as: 's', pipeline: [{ $project: { title: 1, artist: 1, coverArt: 1 } }] } },
      { $unwind: '$s' },
    ]),
    latestRunsByStatus(),
    ListeningRoom.aggregate([{ $group: { _id: { kind: '$kind', active: '$active' }, n: { $sum: 1 } } }]),
  ]);
  const p = plays7[0] || { plays: 0, ms: 0, listeners: [] };
  const byDay = new Map(daily.map((d) => [d._id, d.plays]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * DAY).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    return { day: d, plays: byDay.get(d) || 0 };
  });
  res.json({
    songs: { ...Object.fromEntries(songStatus.map((s) => [s._id, s.n])), licenseMissing },
    users: { total: users, new7d: newUsers, active7d: activeUsers, disabled: disabledUsers },
    listening: { plays7d: p.plays, minutes7d: Math.round((p.ms || 0) / 60000), listeners7d: p.listeners.filter(Boolean).length, series },
    topSongs: topSongs.map((t) => ({ _id: String(t._id), title: t.s.title, artist: t.s.artist, coverArt: t.s.coverArt, plays: t.plays })),
    pipeline,
    rooms: {
      stations: rooms.filter((r) => r._id.kind === 'station' && r._id.active).reduce((a, r) => a + r.n, 0),
      blind: rooms.filter((r) => r._id.kind === 'blind' && r._id.active).reduce((a, r) => a + r.n, 0),
    },
  });
});

// ---------------- Music ----------------

// GET /api/admin/songs?q=&status=&license=missing|<type>&genre=&page=&limit=
const listSongs = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paging(req);
  const match = { ...textMatch(req.query.q, ['title', 'artist', 'album.title']) };
  if (['pending', 'published', 'rejected'].includes(req.query.status)) match.status = req.query.status;
  if (req.query.license === 'missing') match.licenseType = { $in: [null] };
  else if (req.query.license) match.licenseType = String(req.query.license);
  if (req.query.genre) match.genre = new RegExp(escapeRegex(String(req.query.genre)), 'i');
  const [songs, total] = await Promise.all([
    // REVIEW_FIELDS already selects the whole album, so album.title must not be listed again (path collision)
    Song.find(match).select(`${REVIEW_FIELDS} globalStats.total`).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Song.countDocuments(match),
  ]);
  const runs = await PipelineRun.aggregate([
    { $match: { song: { $in: songs.map((s) => s._id) } } },
    { $sort: { startedAt: -1 } },
    { $group: { _id: '$song', status: { $first: '$status' } } },
  ]);
  const runBy = new Map(runs.map((r) => [String(r._id), r.status]));
  res.json({ total, page, limit, songs: songs.map((s) => ({ ...withReview(s), pipeline: runBy.get(String(s._id)) || null })) });
});

// POST /api/admin/songs/bulk { ids: [], action: 'publish' | 'reject', note? } — bulk approval/rejection.
// Publishing still has to go through the copyright layer for each article (like individual approval); Failed lessons are reported, not silently ignored.
const bulkSongs = asyncHandler(async (req, res) => {
  const { ids, action, note } = req.body;
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) return res.status(400).json({ message: 'Select 1–200 songs' });
  if (!['publish', 'reject'].includes(action)) return res.status(400).json({ message: 'Action must be publish or reject' });
  const songs = await Song.find({ _id: { $in: ids.map(oid) } }).select(REVIEW_FIELDS);
  const results = [];
  for (const song of songs) {
    const review = reviewSong(song);
    if (action === 'publish' && !review.copyright.pass) {
      results.push({ id: String(song._id), ok: false, reason: review.copyright.issues.join(', ') });
      continue;
    }
    const wasPublished = song.status === 'published';
    song.status = action === 'publish' ? 'published' : 'rejected';
    song.reviewNote = typeof note === 'string' && note.trim() ? note.trim() : undefined;
    song.reviewedBy = req.user._id;
    song.reviewedAt = new Date();
    await song.save();
    if (action === 'publish' && !wasPublished) runApprovalPipeline(song._id);
    results.push({ id: String(song._id), ok: true });
  }
  await cacheDel(SONGS_CACHE_KEY);
  res.json({ done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results });
});

// ---------------- Artists & albums ----------------

// GET /api/admin/artists?q=&page= — artist from repository (Song.artist), with photo/biography if available (Artist).
const listArtists = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paging(req);
  const match = textMatch(req.query.q, ['artist']);
  const [rows, [{ n: total } = { n: 0 }]] = await Promise.all([
    Song.aggregate([
      { $match: match },
      { $group: {
        _id: '$artist', songs: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        albums: { $addToSet: '$album.title' }, cover: { $first: '$coverArt' },
        popularity: { $sum: { $ifNull: ['$globalStats.total', 0] } },
      } },
      { $sort: { songs: -1, _id: 1 } }, { $skip: skip }, { $limit: limit },
      { $lookup: { from: 'artists', localField: '_id', foreignField: 'name', as: 'a', pipeline: [{ $project: { photo: 1, bio: 1 } }] } },
    ]),
    Song.aggregate([{ $match: match }, { $group: { _id: '$artist' } }, { $count: 'n' }]),
  ]);
  res.json({
    total, page, limit,
    artists: rows.map((r) => ({
      name: r._id, songs: r.songs, published: r.published, albums: r.albums.filter(Boolean).length,
      cover: r.cover, popularity: r.popularity, photo: r.a[0]?.photo || null, bio: r.a[0]?.bio || '',
    })),
  });
});

// PATCH /api/admin/artists { name, newName?, photo?, bio? } — change artist name on EVERY post (incorporate two spellings
// of the same person), update photo/bio.
const updateArtist = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const newName = typeof req.body.newName === 'string' ? req.body.newName.trim().slice(0, 120) : '';
  if (!name) return res.status(400).json({ message: 'Missing artist name' });
  let renamed = 0;
  const finalName = newName || name;
  if (newName && newName !== name) {
    renamed = (await Song.updateMany({ artist: name }, { $set: { artist: newName } })).modifiedCount;
    // The new name already has a profile → keep that profile, discard the old profile; not yet → rename old profile.
    if (await Artist.exists({ name: newName })) await Artist.deleteOne({ name });
    else await Artist.updateOne({ name }, { $set: { name: newName } });
  }
  const photo = typeof req.body.photo === 'string' ? req.body.photo.trim() : undefined;
  const bio = typeof req.body.bio === 'string' ? req.body.bio.trim().slice(0, 2000) : undefined;
  if (photo !== undefined && photo && !/^https:\/\//.test(photo)) return res.status(400).json({ message: 'Photo must be an HTTPS URL' });
  if (photo || bio !== undefined) {
    const existing = await Artist.findOne({ name: finalName });
    if (existing) {
      if (photo) existing.photo = photo;
      if (bio !== undefined) existing.bio = bio;
      await existing.save();
    } else if (photo) {
      await Artist.create({ name: finalName, photo, bio: bio || '', sourceUrl: 'admin' });
    } else if (bio) {
      return res.status(400).json({ message: 'Artist has no profile yet — add a photo to create a profile' });
    }
  }
  await cacheDel(SONGS_CACHE_KEY);
  res.json({ ok: true, name: finalName, renamedSongs: renamed });
});

// Albums only exist embedded in each song (Song.album, from the release source) — grouped by album.sourceId.
// GET /api/admin/albums?q=&page=
const listAlbums = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paging(req);
  const match = { 'album.sourceId': { $exists: true, $ne: null }, ...textMatch(req.query.q, ['album.title', 'album.artist', 'artist']) };
  const [rows, [{ n: total } = { n: 0 }]] = await Promise.all([
    Song.aggregate([
      { $match: match },
      { $group: {
        _id: '$album.sourceId', title: { $first: '$album.title' }, artist: { $first: { $ifNull: ['$album.artist', '$artist'] } },
        year: { $first: '$album.year' }, tracks: { $sum: 1 }, cover: { $first: '$coverArt' },
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        licenses: { $addToSet: '$licenseType' },
      } },
      { $sort: { tracks: -1, title: 1 } }, { $skip: skip }, { $limit: limit },
    ]),
    Song.aggregate([{ $match: match }, { $group: { _id: '$album.sourceId' } }, { $count: 'n' }]),
  ]);
  res.json({ total, page, limit, albums: rows.map(({ _id, licenses, ...r }) => ({ key: _id, ...r, licenses: licenses.filter(Boolean) })) });
});

// GET /api/admin/albums/:key — album tracks in numerical order.
const albumDetail = asyncHandler(async (req, res) => {
  const songs = await Song.find({ 'album.sourceId': req.params.key })
    .select('title artist duration status licenseType coverArt album.trackNo album.title album.year album.artist')
    .sort({ 'album.trackNo': 1, title: 1 }).lean();
  if (!songs.length) return res.status(404).json({ message: 'Album not found' });
  res.json({ key: req.params.key, title: songs[0].album?.title, artist: songs[0].album?.artist || songs[0].artist, year: songs[0].album?.year, songs });
});

// PATCH /api/admin/albums/:key { title?, artist?, year? } — edit album information on all tracks of the album.
const updateAlbum = asyncHandler(async (req, res) => {
  const set = {};
  if (typeof req.body.title === 'string' && req.body.title.trim()) set['album.title'] = req.body.title.trim().slice(0, 200);
  if (typeof req.body.artist === 'string' && req.body.artist.trim()) set['album.artist'] = req.body.artist.trim().slice(0, 120);
  if (req.body.year !== undefined) {
    const y = Number(req.body.year);
    if (!Number.isInteger(y) || y < 1850 || y > new Date().getFullYear() + 1) return res.status(400).json({ message: 'Invalid year' });
    set['album.year'] = y;
  }
  if (!Object.keys(set).length) return res.status(400).json({ message: 'Nothing to update' });
  const r = await Song.updateMany({ 'album.sourceId': req.params.key }, { $set: set });
  if (!r.matchedCount) return res.status(404).json({ message: 'Album not found' });
  await cacheDel(SONGS_CACHE_KEY);
  res.json({ ok: true, updated: r.modifiedCount });
});

// ---------------- Upload status (pipeline) ----------------

// The LATEST run of each article determines its current status.
function latestRuns() {
  return [{ $sort: { startedAt: -1 } }, { $group: { _id: '$song', run: { $first: '$$ROOT' } } }, { $replaceWith: '$run' }];
}
async function latestRunsByStatus() {
  const rows = await PipelineRun.aggregate([...latestRuns(), { $group: { _id: '$status', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

// GET /api/admin/pipeline?status=failed|running|queued|ok&page=
const listPipeline = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paging(req, 50);
  const match = ['failed', 'running', 'queued', 'ok'].includes(req.query.status) ? { status: req.query.status } : {};
  const [rows, counts] = await Promise.all([
    PipelineRun.aggregate([
      ...latestRuns(), { $match: match }, { $sort: { startedAt: -1 } }, { $skip: skip }, { $limit: limit },
      { $lookup: { from: 'songs', localField: 'song', foreignField: '_id', as: 's', pipeline: [{ $project: { title: 1, artist: 1, coverArt: 1, status: 1 } }] } },
    ]),
    latestRunsByStatus(),
  ]);
  const total = match.status ? counts[match.status] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({
    total, page, limit, counts,
    runs: rows.map((r) => ({
      id: String(r._id), status: r.status, trigger: r.trigger, startedAt: r.startedAt, finishedAt: r.finishedAt, stages: r.stages,
      song: r.s[0] ? { _id: String(r.s[0]._id), title: r.s[0].title, artist: r.s[0].artist, coverArt: r.s[0].coverArt, status: r.s[0].status } : null,
    })),
  });
});

// POST /api/admin/pipeline/:songId/retry — rerun the processing chain (already completed steps are skipped).
const retryPipeline = asyncHandler(async (req, res) => {
  const song = await Song.findById(oid(req.params.songId)).select('status');
  if (!song) return res.status(404).json({ message: 'Song not found' });
  if (song.status !== 'published') return res.status(409).json({ message: 'Processing can only run for published songs' });
  if (await PipelineRun.exists({ song: song._id, status: { $in: ['running', 'queued'] }, startedAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } })) {
    return res.status(409).json({ message: 'Song is already processing or queued' });
  }
  await runApprovalPipeline(song._id, { trigger: 'retry', force: false });
  res.json({ ok: true });
});

// ---------------- User ----------------

const userSummary = (u) => ({
  _id: String(u._id), username: u.username, nickname: u.nickname, email: u.email, emailVerified: !!u.emailVerified,
  phone: u.phone, role: u.role, disabled: !!u.disabled, googleLinked: !!u.googleId, hasPassword: !!u.password,
  avatarUrl: u.avatarUrl, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, favorites: u.favorites?.length || 0,
});

// GET /api/admin/users?q=&role=&status=disabled|active&page=
const listUsers = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paging(req);
  const match = { ...textMatch(req.query.q, ['username', 'nickname', 'email', 'phone']) };
  if (['user', 'admin'].includes(req.query.role)) match.role = req.query.role;
  if (req.query.status === 'disabled') match.disabled = true;
  if (req.query.status === 'active') match.disabled = { $ne: true };
  const [users, total] = await Promise.all([
    User.find(match).select('-telegramChatId').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(match),
  ]);
  const ids = users.map((u) => u._id);
  const [plays, playlists] = await Promise.all([
    PlaybackMetric.aggregate([{ $match: { kind: 'playback', user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 }, ms: { $sum: '$playedMs' } } }]),
    Playlist.aggregate([{ $match: { owner: { $in: ids } } }, { $group: { _id: '$owner', n: { $sum: 1 } } }]),
  ]);
  const playBy = new Map(plays.map((p) => [String(p._id), p]));
  const plBy = new Map(playlists.map((p) => [String(p._id), p.n]));
  res.json({
    total, page, limit,
    users: users.map((u) => ({
      ...userSummary(u), plays: playBy.get(String(u._id))?.n || 0,
      minutes: Math.round((playBy.get(String(u._id))?.ms || 0) / 60000), playlists: plBy.get(String(u._id)) || 0,
    })),
  });
});

// GET /api/admin/users/:id — profile + everything related: listening habits, most listened to songs/genres, recent listens
// here, playlists, likes, devices, 30-day activity.
const userDetail = asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  const u = await User.findById(id).select('-password -telegramChatId').lean();
  if (!u) return res.status(404).json({ message: 'User not found' });
  const mine = { kind: 'playback', user: id };
  const [totals, topSongs, topGenres, recent, platforms, activity, playlists, favorites] = await Promise.all([
    PlaybackMetric.aggregate([{ $match: mine }, { $group: {
      _id: null, plays: { $sum: 1 }, ms: { $sum: '$playedMs' }, completed: { $sum: { $cond: ['$completed', 1, 0] } },
      startup: { $avg: '$startupMs' }, rebuffers: { $sum: '$rebufferCount' }, first: { $min: '$createdAt' },
    } }]),
    PlaybackMetric.aggregate([
      { $match: { ...mine, ...COUNTED_PLAY } }, { $group: { _id: '$song', plays: { $sum: 1 } } }, { $sort: { plays: -1 } }, { $limit: 5 },
      { $lookup: { from: 'songs', localField: '_id', foreignField: '_id', as: 's', pipeline: [{ $project: { title: 1, artist: 1, coverArt: 1 } }] } },
      { $unwind: '$s' },
    ]),
    PlaybackMetric.aggregate([
      { $match: mine },
      { $lookup: { from: 'songs', localField: 'song', foreignField: '_id', as: 's', pipeline: [{ $project: { genre: 1 } }] } },
      { $unwind: '$s' }, { $group: { _id: { $ifNull: ['$s.genre', 'Other'] }, plays: { $sum: 1 } } }, { $sort: { plays: -1 } }, { $limit: 5 },
    ]),
    PlaybackMetric.find(mine).sort({ createdAt: -1 }).limit(15).populate('song', 'title artist coverArt').lean(),
    PlaybackMetric.aggregate([{ $match: mine }, { $group: { _id: '$platform', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    PlaybackMetric.aggregate([
      { $match: { ...mine, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, plays: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Playlist.find({ owner: id }).select('name songs createdAt').lean(),
    Song.find({ _id: { $in: u.favorites || [] } }).select('title artist coverArt').limit(12).lean(),
  ]);
  const t = totals[0] || { plays: 0, ms: 0, completed: 0, startup: null, rebuffers: 0, first: null };
  res.json({
    user: { ...userSummary(u), dateOfBirth: u.dateOfBirth, address: u.address, musicGenres: u.musicGenres || [], passwordChangedAt: u.passwordChangedAt },
    stats: {
      plays: t.plays, minutes: Math.round(t.ms / 60000), completionRate: t.plays ? Math.round((t.completed / t.plays) * 100) : 0,
      avgStartupMs: t.startup ? Math.round(t.startup) : null, rebuffers: t.rebuffers, firstPlayAt: t.first,
    },
    topSongs: topSongs.map((x) => ({ _id: String(x._id), title: x.s.title, artist: x.s.artist, coverArt: x.s.coverArt, plays: x.plays })),
    topGenres: topGenres.map((g) => ({ genre: g._id, plays: g.plays })),
    recent: recent.filter((r) => r.song).map((r) => ({
      at: r.createdAt, playedMs: r.playedMs, completed: r.completed, platform: r.platform, cdn: r.cdn,
      song: { _id: String(r.song._id), title: r.song.title, artist: r.song.artist, coverArt: r.song.coverArt },
    })),
    platforms: platforms.map((p) => ({ platform: p._id || 'unknown', plays: p.n })),
    activity: activity.map((a) => ({ day: a._id, plays: a.plays })),
    playlists: playlists.map((p) => ({ _id: String(p._id), name: p.name, songs: p.songs?.length || 0, createdAt: p.createdAt })),
    favorites: favorites.map((f) => ({ _id: String(f._id), title: f.title, artist: f.artist, coverArt: f.coverArt })),
  });
});

// Admins do not lock/delete themselves, and do not lock/delete other admins via HTTP (same reason as not changing roles).
async function targetUser(req) {
  const u = await User.findById(oid(req.params.id));
  if (!u) throw Object.assign(new Error('User not found'), { status: 404 });
  if (String(u._id) === String(req.user._id)) throw Object.assign(new Error('Cannot perform this action on your own account'), { status: 409 });
  if (u.role === 'admin') throw Object.assign(new Error('Cannot modify admin account through this screen'), { status: 409 });
  return u;
}

// PATCH /api/admin/users/:id { disabled } — lock/unlock. The key is revoked for every session.
const updateUser = asyncHandler(async (req, res) => {
  const u = await targetUser(req);
  if (typeof req.body.disabled !== 'boolean') return res.status(400).json({ message: 'disabled must be true or false' });
  u.disabled = req.body.disabled;
  if (u.disabled) u.passwordChangedAt = new Date();
  await u.save();
  res.json({ ok: true, disabled: u.disabled });
});

// POST /api/admin/users/:id/revoke-sessions — logs users out from all devices (suspected session leak).
const revokeSessions = asyncHandler(async (req, res) => {
  const u = await targetUser(req);
  u.passwordChangedAt = new Date();
  await u.save();
  res.json({ ok: true });
});

// DELETE /api/admin/users/:id — delete account + playlist (like delete account yourself); Listening data is retained
// anonymous (unlink user) because it is system measurement data, not user content.
const deleteUser = asyncHandler(async (req, res) => {
  await removeUserCompletely(await targetUser(req)); // same path as user self-removal (utils/userRemoval.js)
  res.json({ ok: true });
});

module.exports = {
  overview, listSongs, bulkSongs, listArtists, updateArtist, listAlbums, albumDetail, updateAlbum,
  listPipeline, retryPipeline, listUsers, userDetail, updateUser, revokeSessions, deleteUser,
};
