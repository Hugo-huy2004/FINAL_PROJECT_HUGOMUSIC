// Hugo Music's 24/7 general listening channel (Lofi · Chill, Study with Hugo...) — either form
// common listening room. Channel created/edited by admin (rooms/admin.js); Posts are selected according to the channel's rules
// (rooms/catalog.js compileRules), listeners can suggest/vote articles if the channel allows.
//
// The server is the station's clock: broadcast status consists only of { post, startedAt } with startedAt
// calculated according to SERVER hours. Each machine deduces its own location = server time − startedAt (server time
// get via clock:ping, see rooms/index.js), so there's no need for anyone to send "heartbeat" and there's no
// Which host leaves room for backup when the host shuts down? When you run out of posts, the server automatically transfers them: the post has many votes
// first in the queue, if the queue is empty, choose a song of the same genre.
//
// ponytail: broadcast state is in the memory of ONE Node process; run a lot
// process then switches to Redis + a process keeps the clock.
const mongoose = require('mongoose');
const Song = require('../songs/Song');
const ListeningRoom = require('./ListeningRoom');
const { compileRules, ensureSeeded } = require('./catalog');

const LEAD_MS = 2000;          // Announce the start time of the lesson in advance so that all devices can load and play at the same time from second 0
const MAX_QUEUE = 30;
const MAX_PENDING_PER_USER = 3;
const RECENT = 40;             // Do not re-select the song you just played
const RECENT_ARTISTS = 4;      // Do not play the same artist consecutively
const POPULAR_POOL = 300;      // "popular" channel: randomly selected from the N most popular global articles
const PLAYABLE = 'title artist coverArt coverColor duration genre filePath hlsPath hlsTiers transition';

const live = new Map(); // stationId -> { meta, now, queue, recent, recentArtists, timer, seq }
const roomName = (id) => `station:${id}`;

const toSong = (doc) => ({ ...doc, _id: String(doc._id) });
const ended = (st) => !st.now || Date.now() >= st.now.startedAt + st.now.song.duration * 1000;

const metaOf = (doc) => ({
  id: String(doc._id), name: doc.name, tagline: doc.tagline, colors: doc.colors,
  allowRequests: doc.allowRequests !== false, rules: doc.rules || {},
  pinned: (doc.pinned || []).map(String),
});

async function ensure(id) {
  if (live.has(id)) return live.get(id);
  const doc = await ListeningRoom.findOne({ _id: id, kind: 'station', active: true }).lean().catch(() => null);
  if (!doc) return null;
  const st = { meta: metaOf(doc), now: null, queue: [], recent: [], recentArtists: [], timer: null, seq: 0 };
  live.set(id, st);
  return st;
}

// Admin edits the channel: updates the configuration of the currently running channel (the currently playing song stays the same, the next song follows the new rules).
async function refresh(io, doc) {
  const id = String(doc._id);
  const st = live.get(id);
  if (!st) return;
  if (!doc.active) return close(io, id);
  st.meta = metaOf(doc);
  if (!st.meta.allowRequests) st.queue = [];
  await broadcast(io, id);
}

// Admin delete/hide channel: kick out listener and remove status from memory.
function close(io, id) {
  clearTimeout(live.get(id)?.timer);
  live.delete(id);
  io.to(roomName(id)).emit('room:closed', { kind: 'station', id });
}

// Select songs automatically according to channel rules. Gradually: legal + not played recently + medium different artist
// broadcast → legal + not recently broadcast → legal → whole store (channel is never silent).
async function autoPick(st) {
  const base = { status: 'published', duration: { $gt: 30 } };
  const rules = compileRules(st.meta.rules);
  const recentIds = st.recent.map((id) => new mongoose.Types.ObjectId(id));
  const recent = { _id: { $nin: recentIds } };
  // The song the admin chooses for the channel is ahead of the rules (not played recently); When finished, return to normal rules.
  if (st.meta.pinned.length) {
    const pinned = st.meta.pinned.map((id) => new mongoose.Types.ObjectId(id));
    const [doc] = await Song.aggregate([
      { $match: { ...base, _id: { $in: pinned, $nin: recentIds } } }, { $sample: { size: 1 } }, { $project: projection() },
    ]);
    if (doc) return toSong(doc);
  }
  const otherArtist = { artist: { $nin: st.recentArtists } };
  const popular = st.meta.rules.popular
    ? [{ $sort: { 'globalStats.total': -1 } }, { $limit: POPULAR_POOL }]
    : [];
  for (const match of [
    { ...base, ...rules, ...recent, ...otherArtist },
    { ...base, ...rules, ...recent },
    { ...base, ...rules },
    base,
  ]) {
    const [doc] = await Song.aggregate([{ $match: match }, ...popular, { $sample: { size: 1 } }, { $project: projection() }]);
    if (doc) return toSong(doc);
  }
  return null;
}
const projection = () => Object.fromEntries(PLAYABLE.split(' ').map((f) => [f, 1]));

// The admin's post will be sent first to everyone; remaining: with the most votes first, with the same number of votes, the proposal will be earlier.
function takeTopVoted(st) {
  if (!st.queue.length) return null;
  let best = 0;
  st.queue.forEach((e, i) => {
    const b = st.queue[best];
    const better = !!e.priority !== !!b.priority ? !!e.priority
      : e.votes.size !== b.votes.size ? e.votes.size > b.votes.size
      : e.addedAt < b.addedAt;
    if (better) best = i;
  });
  return st.queue.splice(best, 1)[0].song;
}

function schedule(io, id) {
  const st = live.get(id);
  clearTimeout(st.timer);
  const ms = st.now.startedAt + st.now.song.duration * 1000 - Date.now();
  st.timer = setTimeout(() => advance(io, id).catch((e) => console.warn('[station] advance:', e.message)), Math.max(0, ms));
}

async function advance(io, id) {
  const st = live.get(id);
  clearTimeout(st.timer);
  st.timer = null;
  const song = takeTopVoted(st) || (await autoPick(st));
  st.now = song ? { song, startedAt: Date.now() + LEAD_MS } : null;
  if (song) {
    st.recent = [...st.recent, song._id].slice(-RECENT);
    st.recentArtists = [...st.recentArtists, song.artist].slice(-RECENT_ARTISTS);
    schedule(io, id);
  }
  await broadcast(io, id);
}

async function listeners(io, id) {
  const sockets = await io.in(roomName(id)).fetchSockets();
  const byUser = new Map(sockets.map((s) => [s.data.userId, { userId: s.data.userId, name: s.data.name }]));
  return [...byUser.values()];
}

async function snapshot(io, id) {
  const st = live.get(id);
  return {
    station: st.meta,
    now: st.now,
    queue: st.queue.map((e) => ({
      id: e.id, song: e.song, addedBy: e.addedBy, addedByName: e.addedByName, votes: e.votes.size, voters: [...e.votes],
      priority: !!e.priority,
    })),
    listeners: await listeners(io, id),
    serverTime: Date.now(),
  };
}

async function broadcast(io, id) {
  io.to(roomName(id)).emit('station:state', await snapshot(io, id));
}

// Channels broadcast continuously 24/7 even when no one is listening: first asked (channel list or available)
// people come in) then go on air, then set a timer to automatically change the song. Entering the channel means listening to the exact moment it is playing.
// ponytail: one setTimeout per channel + one query per post — cheap for a few dozen channels.
async function wake(io, id) {
  const st = await ensure(String(id));
  if (!st) return null;
  if (ended(st)) await advance(io, st.meta.id);
  else if (!st.timer) schedule(io, st.meta.id);
  return st;
}

async function join(io, socket, id) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đã tạm dừng');
  socket.join(roomName(st.meta.id));
  await broadcast(io, st.meta.id);
  return snapshot(io, st.meta.id);
}

// Call after a socket leaves the room: snooze listener list (channel continues to broadcast).
async function left(io, id) {
  if (live.has(id)) await broadcast(io, id);
}

function inRoom(socket, id) {
  const st = live.get(String(id));
  if (!st || !socket.rooms.has(roomName(st.meta.id))) throw new Error('Bạn chưa vào đài này');
  return st;
}

async function suggest(io, socket, id, songId) {
  const st = inRoom(socket, id);
  const userId = socket.data.userId;
  if (!st.meta.allowRequests) throw new Error('Kênh này không nhận đề xuất bài');
  if (st.queue.length >= MAX_QUEUE) throw new Error('Hàng chờ đã đầy');
  if (st.queue.filter((e) => e.addedBy === userId).length >= MAX_PENDING_PER_USER) {
    throw new Error(`Mỗi người tối đa ${MAX_PENDING_PER_USER} bài đang chờ`);
  }
  if (st.now?.song._id === String(songId) || st.queue.some((e) => e.song._id === String(songId))) {
    throw new Error('Bài này đang phát hoặc đã có trong hàng chờ');
  }
  const doc = await Song.findOne({ _id: String(songId), status: 'published', duration: { $gt: 30 } }).select(PLAYABLE).lean().catch(() => null);
  if (!doc) throw new Error('Không tìm thấy bài');
  st.queue.push({
    id: `${st.meta.id}-${++st.seq}`, song: toSong(doc), addedBy: userId, addedByName: socket.data.name,
    addedAt: Date.now(), votes: new Set([userId]),
  });
  await broadcast(io, st.meta.id);
  return { ok: true };
}

async function vote(io, socket, id, entryId) {
  const st = inRoom(socket, id);
  const entry = st.queue.find((e) => e.id === entryId);
  if (!entry) throw new Error('Bài không còn trong hàng chờ');
  const userId = socket.data.userId;
  if (entry.votes.has(userId)) entry.votes.delete(userId);
  else entry.votes.add(userId);
  await broadcast(io, st.meta.id);
  return { ok: true };
}

// The proposer or admin can remove the post from the queue.
async function remove(io, socket, id, entryId) {
  const st = inRoom(socket, id);
  const i = st.queue.findIndex((e) => e.id === entryId);
  if (i < 0) return { ok: true };
  const userId = socket.data.userId;
  if (st.queue[i].addedBy !== userId && socket.data.role !== 'admin') {
    throw new Error('Bạn không gỡ được bài này');
  }
  st.queue.splice(i, 1);
  await broadcast(io, st.meta.id);
  return { ok: true };
}

// --- Admin direct control (REST in rooms/admin.js) ---

async function adminSnapshot(io, id) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  return snapshot(io, st.meta.id);
}

// Schedule a song to play RIGHT AFTER the currently playing song (surpassing the listener's queue).
async function adminEnqueue(io, id, songId, admin) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  if (st.queue.some((e) => e.song._id === String(songId))) throw new Error('Bài đã có trong hàng chờ');
  const doc = await Song.findOne({ _id: String(songId), status: 'published', duration: { $gt: 30 } }).select(PLAYABLE).lean().catch(() => null);
  if (!doc) throw new Error('Không tìm thấy bài (chưa xuất bản hoặc quá ngắn)');
  st.queue.push({
    id: `${st.meta.id}-${++st.seq}`, song: toSong(doc), addedBy: String(admin._id), addedByName: 'Quản trị viên',
    addedAt: Date.now(), votes: new Set(), priority: true,
  });
  await broadcast(io, st.meta.id);
  return snapshot(io, st.meta.id);
}

async function adminRemove(io, id, entryId) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  st.queue = st.queue.filter((e) => e.id !== entryId);
  await broadcast(io, st.meta.id);
  return snapshot(io, st.meta.id);
}

// Skip the currently playing song: immediately move to the next song (every device receives the new station:state and moves at the same time).
async function adminSkip(io, id) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  await advance(io, st.meta.id);
  return snapshot(io, st.meta.id);
}

// --- REST ---

// GET /api/rooms/stations — open (public) channels, with number of listeners and currently playing songs.
async function listStations(req, res) {
  await ensureSeeded('station');
  const io = req.app.get('io');
  const docs = await ListeningRoom.find({ kind: 'station', active: true }).sort({ order: 1, createdAt: 1 }).lean();
  await Promise.all(docs.map((d) => wake(io, String(d._id))));
  res.json({
    stations: docs.map((d) => {
      const id = String(d._id);
      const st = live.get(id);
      return {
        ...metaOf(d),
        listenerCount: io.sockets.adapter.rooms.get(roomName(id))?.size || 0,
        now: st && !ended(st) ? { title: st.now.song.title, artist: st.now.song.artist, coverArt: st.now.song.coverArt } : null,
      };
    }),
  });
}

module.exports = { join, left, suggest, vote, remove, refresh, close, listStations, adminSnapshot, adminEnqueue, adminRemove, adminSkip };

if (require.main === module) {
  const assert = require('assert');
  const e = (id, votes, addedAt) => ({ id, song: { _id: id }, votes: new Set(votes), addedAt });
  const st = { queue: [e('a', ['u1'], 1), e('b', ['u1', 'u2'], 2), e('c', ['u3', 'u4'], 3)] };
  assert.strictEqual(takeTopVoted(st)._id, 'b', 'nhiều phiếu nhất; bằng phiếu thì đề xuất sớm hơn');
  assert.strictEqual(takeTopVoted(st)._id, 'c');
  assert.strictEqual(takeTopVoted(st)._id, 'a');
  assert.strictEqual(takeTopVoted(st), null);
  const pr = { queue: [e('x', ['u1', 'u2', 'u3'], 1), { ...e('admin', [], 5), priority: true }] };
  assert.strictEqual(takeTopVoted(pr)._id, 'admin', 'bài admin xếp phát tiếp đi trước mọi phiếu bầu');
  console.log('stations self-check: ok');
}
