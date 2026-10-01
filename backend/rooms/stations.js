// Kênh nghe chung 24/7 của Hugo Music (Lofi · Chill, Study with Hugo...) — một trong hai hình thức
// phòng nghe chung. Kênh do admin tạo/sửa (rooms/admin.js); bài chọn theo luật của kênh
// (rooms/catalog.js compileRules), người nghe được đề xuất/bầu bài nếu kênh cho phép.
//
// Server là đồng hồ của đài: trạng thái phát chỉ gồm { bài, startedAt } với startedAt
// tính theo giờ SERVER. Mỗi máy tự suy ra vị trí = giờ server − startedAt (giờ server
// lấy qua clock:ping, xem rooms/index.js), nên không cần ai gửi "heartbeat" và không có
// host nào để phòng đứng khi host tắt máy. Hết bài server tự chuyển: bài được bầu nhiều
// nhất trong hàng chờ, hàng chờ rỗng thì tự chọn một bài cùng nhóm thể loại.
//
// ponytail: trạng thái phát nằm trong bộ nhớ của MỘT tiến trình Node; chạy nhiều tiến
// trình thì chuyển sang Redis + một tiến trình giữ đồng hồ.
const mongoose = require('mongoose');
const Song = require('../models/Song');
const ListeningRoom = require('../models/ListeningRoom');
const { compileRules, ensureSeeded } = require('./catalog');

const LEAD_MS = 2000;          // báo trước giờ bắt đầu bài để mọi máy kịp nạp rồi cùng phát từ giây 0
const MAX_QUEUE = 30;
const MAX_PENDING_PER_USER = 3;
const RECENT = 40;             // không tự chọn lại bài vừa phát
const RECENT_ARTISTS = 4;      // không phát cùng nghệ sĩ liền nhau
const POPULAR_POOL = 300;      // kênh "phổ biến": chọn ngẫu nhiên trong N bài phổ biến toàn cầu nhất
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

// Admin sửa kênh: cập nhật cấu hình của kênh đang chạy ngay (bài đang phát giữ nguyên, bài sau theo luật mới).
async function refresh(io, doc) {
  const id = String(doc._id);
  const st = live.get(id);
  if (!st) return;
  if (!doc.active) return close(io, id);
  st.meta = metaOf(doc);
  if (!st.meta.allowRequests) st.queue = [];
  await broadcast(io, id);
}

// Admin xoá/ẩn kênh: đuổi người nghe ra và bỏ trạng thái trong bộ nhớ.
function close(io, id) {
  clearTimeout(live.get(id)?.timer);
  live.delete(id);
  io.to(roomName(id)).emit('room:closed', { kind: 'station', id });
}

// Chọn bài tự động theo luật của kênh. Nới dần: đúng luật + chưa phát gần đây + khác nghệ sĩ vừa
// phát → đúng luật + chưa phát gần đây → đúng luật → cả kho (kênh không bao giờ im).
async function autoPick(st) {
  const base = { status: 'published', duration: { $gt: 30 } };
  const rules = compileRules(st.meta.rules);
  const recentIds = st.recent.map((id) => new mongoose.Types.ObjectId(id));
  const recent = { _id: { $nin: recentIds } };
  // Bài admin chọn cho kênh đi trước luật (chưa phát gần đây); hết thì quay về luật như thường.
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

// Bài admin xếp phát tiếp đi trước tất cả; còn lại: nhiều phiếu nhất trước, bằng phiếu thì đề xuất sớm hơn.
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

// Kênh phát liên tục 24/7 kể cả khi không ai nghe: lần đầu được hỏi tới (danh sách kênh hoặc có
// người vào) thì lên sóng, sau đó hẹn giờ tự chuyển bài mãi. Vào kênh là nghe đúng khoảnh khắc đang phát.
// ponytail: mỗi kênh một setTimeout + một truy vấn mỗi bài — rẻ với vài chục kênh.
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

// Gọi sau khi một socket rời phòng: báo lại danh sách người nghe (kênh vẫn phát tiếp).
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
  const doc = await Song.findOne({ _id: songId, status: 'published', duration: { $gt: 30 } }).select(PLAYABLE).lean().catch(() => null);
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

// Người đề xuất hoặc admin được gỡ bài khỏi hàng chờ.
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

// --- Admin điều khiển trực tiếp (REST ở rooms/admin.js) ---

async function adminSnapshot(io, id) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  return snapshot(io, st.meta.id);
}

// Xếp một bài phát NGAY SAU bài đang phát (vượt hàng chờ của người nghe).
async function adminEnqueue(io, id, songId, admin) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  if (st.queue.some((e) => e.song._id === String(songId))) throw new Error('Bài đã có trong hàng chờ');
  const doc = await Song.findOne({ _id: songId, status: 'published', duration: { $gt: 30 } }).select(PLAYABLE).lean().catch(() => null);
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

// Bỏ qua bài đang phát: chuyển ngay sang bài kế (mọi máy nhận station:state mới và cùng chuyển).
async function adminSkip(io, id) {
  const st = await wake(io, id);
  if (!st) throw new Error('Kênh không tồn tại hoặc đang ẩn');
  await advance(io, st.meta.id);
  return snapshot(io, st.meta.id);
}

// --- REST ---

// GET /api/rooms/stations — các kênh đang mở (công khai), kèm số người nghe và bài đang phát.
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
