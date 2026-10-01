// Shared listening room management — admin only (routes/roomRoutes.js uses protect + isAdmin). Create/edit/hide/delete
// every room; Editing running rooms will take effect immediately (stations.refresh / blind.refresh).
const mongoose = require('mongoose');
const ListeningRoom = require('./ListeningRoom');
const Song = require('../songs/Song');
const { GENRE_GROUPS } = require('../meta/genreGroups');
const { compileRules, ensureSeeded } = require('./catalog');
const stations = require('./stations');
const blind = require('./blindTest');

const ENGINES = { station: stations, blind };
const HEX = /^#[0-9a-f]{6}$/i;
const PREVIEW_SAMPLE = 5;
const MAX_PINNED = 200;
const PICK = 'title artist coverArt duration genre category globalStats.total';

// Only accept allowed, properly typed fields — don't trust submitted data.
function clean(body, kind) {
  const out = {};
  if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 40);
  if (typeof body.tagline === 'string') out.tagline = body.tagline.trim().slice(0, 120);
  if (Array.isArray(body.colors) && body.colors.length === 2 && body.colors.every((c) => HEX.test(c))) out.colors = body.colors;
  if (Number.isFinite(body.order)) out.order = body.order;
  if (typeof body.active === 'boolean') out.active = body.active;
  if (kind === 'station') {
    if (typeof body.allowRequests === 'boolean') out.allowRequests = body.allowRequests;
    if (body.rules && typeof body.rules === 'object') out.rules = cleanRules(body.rules);
    if (Array.isArray(body.pinned)) {
      out.pinned = [...new Set(body.pinned.map(String))].filter((id) => mongoose.isValidObjectId(id)).slice(0, MAX_PINNED);
    }
  }
  return out;
}
function cleanRules(r) {
  const keys = (xs) => (Array.isArray(xs) ? xs.filter((k) => GENRE_GROUPS[k] && k !== 'all') : []);
  return {
    groups: keys(r.groups),
    excludeGroups: keys(r.excludeGroups),
    categories: Array.isArray(r.categories) ? r.categories.filter((c) => typeof c === 'string').slice(0, 10) : [],
    instrumental: !!r.instrumental,
    calm: !!r.calm,
    popular: !!r.popular,
  };
}

const view = (d) => ({
  id: String(d._id), kind: d.kind, slug: d.slug, name: d.name, tagline: d.tagline, colors: d.colors,
  order: d.order, active: d.active, allowRequests: d.allowRequests, rules: d.rules || {},
  pinned: (d.pinned || []).map(String),
});

// GET /api/rooms/admin — all rooms (even hidden) + options for form (category group, category).
async function list(req, res) {
  await Promise.all([ensureSeeded('station'), ensureSeeded('blind')]);
  const [docs, categories] = await Promise.all([
    ListeningRoom.find().sort({ kind: -1, order: 1, createdAt: 1 }).lean(),
    Song.distinct('category', { status: 'published' }),
  ]);
  res.json({
    rooms: docs.map(view),
    genres: Object.entries(GENRE_GROUPS).filter(([k]) => k !== 'all').map(([key, g]) => ({ key, label: g.label })),
    categories: categories.filter(Boolean).sort(),
  });
}

// POST /api/rooms/admin { kind, name, ... }
async function create(req, res) {
  const kind = req.body.kind === 'blind' ? 'blind' : 'station';
  const fields = clean(req.body, kind);
  if (!fields.name) return res.status(400).json({ message: 'Đặt tên cho phòng' });
  const last = await ListeningRoom.findOne({ kind }).sort({ order: -1 }).lean();
  const doc = await ListeningRoom.create({ kind, order: (last?.order ?? 0) + 1, ...fields });
  res.status(201).json(view(doc));
}

// PATCH /api/rooms/admin/:id
async function update(req, res) {
  const doc = await ListeningRoom.findById(req.params.id).catch(() => null);
  if (!doc) return res.status(404).json({ message: 'Phòng không tồn tại' });
  const fields = clean(req.body, doc.kind);
  if (fields.name === '') return res.status(400).json({ message: 'Tên phòng không được trống' });
  doc.set(fields);
  await doc.save();
  await ENGINES[doc.kind].refresh(req.app.get('io'), doc.toObject());
  res.json(view(doc));
}

// DELETE /api/rooms/admin/:id — kick out the listener before deleting.
async function remove(req, res) {
  const doc = await ListeningRoom.findById(req.params.id).catch(() => null);
  if (!doc) return res.status(404).json({ message: 'Phòng không tồn tại' });
  ENGINES[doc.kind].close(req.app.get('io'), String(doc._id));
  await doc.deleteOne();
  res.json({ ok: true });
}

// POST /api/rooms/admin/preview { rules } — how many posts are legal + some sample posts (see before saving).
async function preview(req, res) {
  const match = { status: 'published', duration: { $gt: 30 }, ...compileRules(cleanRules(req.body.rules || {})) };
  const [count, sample] = await Promise.all([
    Song.countDocuments(match),
    Song.aggregate([{ $match: match }, { $sample: { size: PREVIEW_SAMPLE } }, { $project: { title: 1, artist: 1 } }]),
  ]);
  res.json({ count, sample: sample.map((s) => `${s.title} — ${s.artist}`) });
}

const songView = (x) => ({
  _id: String(x._id), title: x.title, artist: x.artist, coverArt: x.coverArt, duration: x.duration,
  genre: x.genre, category: x.category, popularity: x.globalStats?.total || 0,
});
const stationDoc = async (id) => {
  const doc = await ListeningRoom.findById(id).lean().catch(() => null);
  if (!doc || doc.kind !== 'station') throw Object.assign(new Error('Kênh không tồn tại'), { status: 404 });
  return doc;
};
const escapeRegex = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/rooms/admin/:id/songs — details of the songs the admin has selected for the channel (in the correct order).
async function pinnedSongs(req, res) {
  const doc = await stationDoc(req.params.id);
  const songs = await Song.find({ _id: { $in: doc.pinned || [] } }).select(PICK).lean();
  const byId = new Map(songs.map((x) => [String(x._id), x]));
  res.json({ songs: (doc.pinned || []).map((id) => byId.get(String(id))).filter(Boolean).map(songView) });
}

// GET /api/rooms/admin/:id/suggestions?q= — suggested articles to choose for the channel. Yes q: search by song title/artist
// in the whole warehouse. No q: channel's LATEST songs, most popular first, skip selected songs.
async function suggestions(req, res) {
  const doc = await stationDoc(req.params.id);
  const q = String(req.query.q || '').trim().slice(0, 60);
  const base = { status: 'published', duration: { $gt: 30 }, _id: { $nin: doc.pinned || [] } };
  const match = q
    ? { ...base, $or: [{ title: new RegExp(escapeRegex(q), 'i') }, { artist: new RegExp(escapeRegex(q), 'i') }] }
    : { ...base, ...compileRules(doc.rules || {}) };
  const songs = await Song.find(match).select(PICK).sort({ 'globalStats.total': -1, createdAt: -1 }).limit(30).lean();
  res.json({ songs: songs.map(songView), matchedRules: !q });
}

// Active channel control (24/7 channels only) — effective immediately for everyone listening.
const liveCall = (fn) => async (req, res) => {
  await stationDoc(req.params.id);
  try {
    res.json(await fn(req.app.get('io'), req));
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
// GET /api/rooms/admin/:id/live
const live = liveCall((io, req) => stations.adminSnapshot(io, req.params.id));
// POST /api/rooms/admin/:id/queue { songId } — plays immediately after the current song
const enqueue = liveCall((io, req) => stations.adminEnqueue(io, req.params.id, req.body.songId, req.user));
// DELETE /api/rooms/admin/:id/queue/:entryId
const dequeue = liveCall((io, req) => stations.adminRemove(io, req.params.id, req.params.entryId));
// POST /api/rooms/admin/:id/skip
const skip = liveCall((io, req) => stations.adminSkip(io, req.params.id));

module.exports = { list, create, update, remove, preview, pinnedSongs, suggestions, live, enqueue, dequeue, skip };
