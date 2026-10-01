// Blind listening room — the second form of a general listening room, and also a research tool: validation
// PSL scale (measured by ViSQOL) by human ear. Rooms are provided by Hugo, created/edited by admin (rooms/admin.js).
//
// One take: the whole room listens to the SAME piece of music at two quality levels — A then B, no level indicated
// which one — then choose the better or "indistinguishable" version. The server keeps a schedule based on server time.
//
// Fast: the machine pre-loads BOTH A and B when preparing (two decks), so B goes in immediately without waiting to be loaded; everyone
// Once you've chosen, announce it right away, don't wait for the timer to end.
// Smart:
// - adaptive difficulty (ladder): most people hear the higher version → the next pair is closer together (difficult
// more); can't hear → farther pair. The results converge to the discrimination threshold of that room itself;
// - number of tests (~1/6): A and B are EXACTLY the same, the correct answer is "no difference" — filter people
// random guess, votes marked `control` for separate analysis;
// - Excerpts are in the body of the article (avoid intro/outro according to TransitionJob), do not repeat the article.
// Clearly: announce to each person whether they are right/wrong, the cumulative score and the room's scoreboard.
//
// ponytail: the level key (low/high/original) is sent to the machine so that the machine can download the correct variant, so people
// If you know how to open the Network tab, you'll know. Sufficient for collaborative testing; Formal research then
// Needs a closed player (server automatically issues opaque URL).
const assert = require('assert');
const mongoose = require('mongoose');
const Song = require('../songs/Song');
const ListeningVote = require('./ListeningVote');
const ListeningRoom = require('./ListeningRoom');
const { ensureSeeded } = require('./catalog');

const PREPARE_S = 3;   // pre-loading machines A and B
const EXCERPT_S = 8;
const GAP_S = 1;
const VOTE_S = 12;     // maximum after B ends; Everyone chooses and closes early
const REVEAL_S = 5;
const CONTROL_RATE = 1 / 6;
const LEVEL_STEP = 0.25;
const PASS_RATIO = 0.6; // The correct percentage of listeners to consider "the whole room heard"
const RECENT = 30;
const LEADERBOARD = 5;
const FIXED_KBPS = { low: 64, mid: 128, high: 256 }; // fixed ladder level name (pipeline/jobs/HlsJob.js)
const ORIGINAL_KBPS = 1411; // just for ranking/distance measurement: the original file is always the highest

const rooms = new Map(); // id -> live status (see ensure)
const roomName = (id) => `blind:${id}`;
const listenerCount = (io, id) => io.sockets.adapter.rooms.get(roomName(id))?.size || 0;

// ---------- pure logic (with self-checking) ----------

// Listenable levels of a song: each HLS variant + original file, from low to high.
function conditionsFor(song) {
  const tiers = (song.hlsTiers || [])
    .map((key, i) => ({ key, kbps: song.hlsKbps?.[i] ?? FIXED_KBPS[key] }))
    .filter((c) => c.kbps);
  const all = song.filePath ? [...tiers, { key: 'original', kbps: null }] : tiers;
  return all.sort((x, y) => rank(x) - rank(y));
}
const rank = (c) => (c.key === 'original' ? ORIGINAL_KBPS : c.kbps);
const label = (c) => (c.key === 'original' ? 'Tệp gốc' : `${c.kbps} kbps`);

// Pair according to difficulty: level 0 = two levels furthest apart (easy), level 1 = two levels closest together (hard).
function pairFor(conds, level) {
  const pairs = [];
  for (let i = 0; i < conds.length; i++) for (let j = i + 1; j < conds.length; j++) pairs.push([conds[i], conds[j]]);
  pairs.sort((p, q) => Math.log(rank(q[1]) / rank(q[0])) - Math.log(rank(p[1]) / rank(p[0]))); // far → near
  return pairs[Math.round(Math.max(0, Math.min(1, level)) * (pairs.length - 1))];
}

// A correct or incorrect vote: check → must choose "same"; Regular turn → must choose higher version.
function isCorrect(trial, choice) {
  if (trial.control) return choice === 'same';
  if (choice === 'same') return false;
  const chosen = choice === 'A' ? trial.a : trial.b;
  const other = choice === 'A' ? trial.b : trial.a;
  return rank(chosen) > rank(other);
}

// Difficulty next turn: mostly correct → harder, otherwise easier. Number of checks / no one selected: keep the same.
function nextLevel(level, trial, choices) {
  if (trial.control || !choices.length) return level;
  const ratio = choices.filter((c) => isCorrect(trial, c)).length / choices.length;
  const next = ratio >= PASS_RATIO ? level + LEVEL_STEP : level - LEVEL_STEP;
  return Math.max(0, Math.min(1, next));
}

// Excerpts in the body of the article: around the middle of the article but do not encroach on the measured intro/outro.
function excerptStartFor(song) {
  const dur = song.duration || 0;
  const lo = song.transition?.introEnd ?? 0;
  const hi = (song.transition?.outroStart ?? dur) - EXCERPT_S;
  const mid = dur / 2 - EXCERPT_S / 2;
  return Math.max(0, Math.round(hi > lo ? Math.min(hi, Math.max(lo, mid)) : mid));
}

const difficultyLabel = (level) => (level < 0.34 ? 'Dễ' : level < 0.67 ? 'Vừa' : 'Khó');

// ---------- room status ----------

async function ensure(id) {
  if (rooms.has(id)) return rooms.get(id);
  const doc = await ListeningRoom.findOne({ _id: id, kind: 'blind', active: true }).lean().catch(() => null);
  if (!doc) return null;
  const room = {
    id: String(doc._id), name: doc.name, tagline: doc.tagline, colors: doc.colors,
    trial: null, trialNo: 0, votes: new Map(), timers: [], level: 0, recent: [],
    scores: new Map(), // userId -> { name, correct, total }
  };
  rooms.set(room.id, room);
  return room;
}

const clearTimers = (room) => { room.timers.forEach(clearTimeout); room.timers = []; };
const later = (room, at, fn) => room.timers.push(setTimeout(() => fn().catch((e) => console.warn('[blind]', e.message)), Math.max(0, at - Date.now())));

async function pickTrialSong(room) {
  const base = { status: 'published', hlsPath: { $ne: null }, 'hlsTiers.0': { $exists: true }, duration: { $gte: 40 } };
  const recent = room.recent.map((x) => new mongoose.Types.ObjectId(x));
  for (const match of [{ ...base, _id: { $nin: recent } }, base]) {
    for (let i = 0; i < 4; i++) {
      const [song] = await Song.aggregate([
        { $match: match },
        { $sample: { size: 1 } },
        { $project: { title: 1, artist: 1, coverArt: 1, coverColor: 1, duration: 1, filePath: 1, hlsPath: 1, hlsTiers: 1, hlsKbps: 1, transition: 1 } },
      ]);
      if (song && conditionsFor(song).length >= 2) return { ...song, _id: String(song._id) };
    }
  }
  return null;
}

const leaderboard = (room) => [...room.scores.entries()]
  .map(([userId, s]) => ({ userId, ...s }))
  .sort((a, b) => b.correct - a.correct || a.total - b.total)
  .slice(0, LEADERBOARD);

async function startTrial(io, room) {
  clearTimers(room);
  const song = await pickTrialSong(room);
  if (!song) {
    room.trial = null;
    io.to(roomName(room.id)).emit('blind:error', { message: 'Kho chưa có bài đủ mức chất lượng để so sánh' });
    return;
  }
  const conds = conditionsFor(song);
  // The check is not on the first turn (new players need a regular turn to understand how to play).
  const control = room.trialNo > 0 && Math.random() < CONTROL_RATE;
  const pair = control ? [conds[conds.length - 1], conds[conds.length - 1]] : pairFor(conds, room.level);
  const [a, b] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
  const aAt = Date.now() + PREPARE_S * 1000;
  const bAt = aAt + (EXCERPT_S + GAP_S) * 1000;
  const voteUntil = bAt + (EXCERPT_S + VOTE_S) * 1000;
  room.trial = {
    id: `${room.id}-${++room.trialNo}`, no: room.trialNo, song, a, b, control,
    excerptStart: excerptStartFor(song), excerptSeconds: EXCERPT_S,
    aAt, bAt, voteFrom: bAt, voteUntil, revealUntil: voteUntil + REVEAL_S * 1000,
    difficulty: difficultyLabel(room.level),
  };
  room.recent = [...room.recent, song._id].slice(-RECENT);
  room.votes = new Map();
  io.to(roomName(room.id)).emit('blind:trial', publicTrial(room.trial));
  later(room, voteUntil, () => reveal(io, room));
}

// Do not reveal the test count before publishing (the machine only needs to know the level to load the correct variant).
const publicTrial = (t) => (t ? { ...t, control: undefined } : null);

// Everyone in the room also chose → close the ballot early (but not before B finishes distributing it).
function maybeCloseEarly(io, room) {
  const trial = room.trial;
  const count = listenerCount(io, room.id);
  io.to(roomName(room.id)).emit('blind:votes', { trialId: trial.id, voted: room.votes.size, listeners: count });
  if (room.votes.size < count) return;
  const at = Math.max(Date.now(), trial.bAt + EXCERPT_S * 1000);
  if (at >= trial.voteUntil) return;
  clearTimers(room);
  trial.voteUntil = at;
  trial.revealUntil = at + REVEAL_S * 1000;
  io.to(roomName(room.id)).emit('blind:closing', { trialId: trial.id, voteUntil: trial.voteUntil, revealUntil: trial.revealUntil });
  later(room, at, () => reveal(io, room));
}

async function reveal(io, room) {
  const trial = room.trial;
  if (!trial) return;
  clearTimers(room);
  const entries = [...room.votes];
  const correct = Object.fromEntries(entries.map(([user, v]) => [user, isCorrect(trial, v.choice)]));
  for (const [user, v] of entries) {
    const s = room.scores.get(user) || { name: v.name, correct: 0, total: 0 };
    s.total += 1;
    if (correct[user]) s.correct += 1;
    room.scores.set(user, s);
  }
  // Save first then publish. Only save each person's last vote (you can change your mind until the end of time).
  if (entries.length) {
    await ListeningVote.insertMany(entries.map(([user, v]) => ({
      room: room.id, trialId: trial.id, song: trial.song._id, excerptStart: trial.excerptStart,
      excerptSeconds: trial.excerptSeconds, a: trial.a, b: trial.b, choice: v.choice, user,
      control: trial.control, correct: correct[user], level: room.level,
    })));
  }
  const choices = entries.map(([, v]) => v.choice);
  room.level = nextLevel(room.level, trial, choices);
  io.to(roomName(room.id)).emit('blind:reveal', {
    trialId: trial.id, a: trial.a, b: trial.b, control: trial.control,
    tally: tally(choices), correct, leaderboard: leaderboard(room), nextDifficulty: difficultyLabel(room.level),
  });
  later(room, trial.revealUntil, async () => {
    if (listenerCount(io, room.id)) await startTrial(io, room);
    else room.trial = null;
  });
}

function tally(choices) {
  const t = { A: 0, B: 0, same: 0 };
  for (const c of choices) t[c] += 1;
  return t;
}

function snapshot(io, room) {
  return {
    room: { id: room.id, name: room.name, tagline: room.tagline, colors: room.colors },
    trial: publicTrial(room.trial),
    listenerCount: listenerCount(io, room.id),
    leaderboard: leaderboard(room),
    serverTime: Date.now(),
  };
}

async function join(io, socket, id) {
  const room = await ensure(String(id));
  if (!room) throw new Error('Phòng không tồn tại hoặc đã tạm dừng');
  socket.join(roomName(room.id));
  if (!room.trial || Date.now() > room.trial.revealUntil) await startTrial(io, room);
  io.to(roomName(room.id)).emit('blind:listeners', { count: listenerCount(io, room.id) });
  return snapshot(io, room);
}

function left(io, id) {
  const room = rooms.get(id);
  if (!room) return;
  const count = listenerCount(io, id);
  io.to(roomName(id)).emit('blind:listeners', { count });
  if (!count) {
    clearTimers(room);
    room.trial = null;
  } else if (room.trial && Date.now() < room.trial.voteUntil) {
    maybeCloseEarly(io, room); // The person who just left may be the only person who hasn't chosen yet
  }
}

function vote(io, socket, id, trialId, choice) {
  const room = rooms.get(String(id));
  const trial = room?.trial;
  if (!trial || trial.id !== trialId || !socket.rooms.has(roomName(room.id))) throw new Error('Lượt nghe đã kết thúc');
  const now = Date.now();
  if (now < trial.voteFrom || now > trial.voteUntil) throw new Error('Chưa tới lúc chọn');
  if (!['A', 'B', 'same'].includes(choice)) throw new Error('Lựa chọn không hợp lệ');
  room.votes.set(socket.data.userId, { choice, name: socket.data.name });
  maybeCloseEarly(io, room);
  return { ok: true };
}

// Admin edits/hides/deletes rooms.
async function refresh(io, doc) {
  const room = rooms.get(String(doc._id));
  if (!room) return;
  if (!doc.active) return close(io, room.id);
  Object.assign(room, { name: doc.name, tagline: doc.tagline, colors: doc.colors });
}
function close(io, id) {
  const room = rooms.get(id);
  if (room) clearTimers(room);
  rooms.delete(id);
  io.to(roomName(id)).emit('room:closed', { kind: 'blind', id });
}

// --- REST ---

// GET /api/rooms/blind — blind listening rooms are open (public).
async function listRooms(req, res) {
  await ensureSeeded('blind');
  const io = req.app.get('io');
  const docs = await ListeningRoom.find({ kind: 'blind', active: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({
    rooms: docs.map((d) => {
      const id = String(d._id);
      return { id, name: d.name, tagline: d.tagline, colors: d.colors, trialNo: rooms.get(id)?.trialNo || 0, listenerCount: listenerCount(io, id) };
    }),
  });
}

// Two-sided binomial test (p = 0.5): is there a significant bias towards the higher level?
function binomialTwoSided(k, n) {
  if (!n) return 1;
  const logC = [0];
  for (let i = 1; i <= n; i++) logC[i] = logC[i - 1] + Math.log(n - i + 1) - Math.log(i);
  const pmf = (i) => Math.exp(logC[i] - n * Math.LN2);
  const pk = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) if (pmf(i) <= pk * (1 + 1e-9)) p += pmf(i);
  return Math.min(1, p);
}

// Aggregate by pair of levels (skip the test — report the accuracy of the test separately).
function summarize(votes) {
  const pairs = new Map();
  let controlN = 0;
  let controlCorrect = 0;
  for (const v of votes) {
    if (v.control || v.a.key === v.b.key) {
      controlN += 1;
      if (v.choice === 'same') controlCorrect += 1;
      continue;
    }
    const [lo, hi] = rank(v.a) < rank(v.b) ? [v.a, v.b] : [v.b, v.a];
    const key = `${label(lo)} vs ${label(hi)}`;
    const row = pairs.get(key) || { pair: key, n: 0, preferHigher: 0, preferLower: 0, same: 0 };
    row.n += 1;
    if (v.choice === 'same') row.same += 1;
    else {
      const chosen = v.choice === 'A' ? v.a : v.b;
      if (rank(chosen) === rank(hi)) row.preferHigher += 1;
      else row.preferLower += 1;
    }
    pairs.set(key, row);
  }
  return {
    pairs: [...pairs.values()].map((r) => ({ ...r, pValue: Number(binomialTwoSided(r.preferHigher, r.preferHigher + r.preferLower).toFixed(4)) })),
    control: { n: controlN, correct: controlCorrect },
  };
}

// GET /api/rooms/blind/results — admin: aggregate all votes by pair of quality levels.
async function results(req, res) {
  const votes = await ListeningVote.find().select('a b choice control').lean();
  res.json({ totalVotes: votes.length, ...summarize(votes) });
}

function selfCheck() {
  const lo = { key: 'low', kbps: 64 };
  const mid = { key: 'mid', kbps: 128 };
  const orig = { key: 'original', kbps: null };
  assert.deepStrictEqual(conditionsFor({ hlsTiers: ['mid', 'low'], filePath: 'x' }).map((c) => c.key), ['low', 'mid', 'original']);
  assert.deepStrictEqual(conditionsFor({ hlsTiers: ['low', 't1'], hlsKbps: [48, 96] }).map((c) => c.kbps), [48, 96]);
  assert.strictEqual(conditionsFor({ hlsTiers: ['t1'] }).length, 0, 'không biết kbps thì bỏ');
  // Difficulty level: easy = furthest (64 vs original), difficult = closest (64 vs 128).
  assert.deepStrictEqual(pairFor([lo, mid, orig], 0).map((c) => c.key), ['low', 'original']);
  assert.deepStrictEqual(pairFor([lo, mid, orig], 1).map((c) => c.key), ['low', 'mid']);
  // Right/wrong.
  assert.strictEqual(isCorrect({ a: lo, b: orig }, 'B'), true);
  assert.strictEqual(isCorrect({ a: lo, b: orig }, 'A'), false);
  assert.strictEqual(isCorrect({ a: lo, b: orig }, 'same'), false);
  assert.strictEqual(isCorrect({ control: true, a: orig, b: orig }, 'same'), true);
  // Scale: majority correct → more difficult; wrong → easier; clamp in [0, 1]; The number of checks remains unchanged.
  const t = { a: lo, b: orig };
  assert.strictEqual(nextLevel(0, t, ['B', 'B', 'A']), 0.25);
  assert.strictEqual(nextLevel(0.5, t, ['same', 'A']), 0.25);
  assert.strictEqual(nextLevel(0, t, ['A']), 0);
  assert.strictEqual(nextLevel(1, t, ['B']), 1);
  assert.strictEqual(nextLevel(0.5, { ...t, control: true }, ['same']), 0.5);
  // Excerpts avoid intro/outro.
  assert.strictEqual(excerptStartFor({ duration: 200 }), 96);
  assert.strictEqual(excerptStartFor({ duration: 200, transition: { introEnd: 120, outroStart: 190 } }), 120);
  assert.strictEqual(excerptStartFor({ duration: 200, transition: { introEnd: 0, outroStart: 60 } }), 52);
  // Statistics: 10/10 choose the higher version → p = 2/1024; separate checks.
  assert.ok(Math.abs(binomialTwoSided(10, 10) - 2 / 1024) < 1e-12);
  assert.strictEqual(binomialTwoSided(5, 10), 1);
  const s = summarize([
    { a: lo, b: orig, choice: 'B' }, { a: orig, b: lo, choice: 'A' }, { a: lo, b: orig, choice: 'same' },
    { a: orig, b: orig, choice: 'same', control: true }, { a: orig, b: orig, choice: 'A', control: true },
  ]);
  assert.deepStrictEqual(s.pairs[0], { pair: '64 kbps vs Tệp gốc', n: 3, preferHigher: 2, preferLower: 0, same: 1, pValue: 0.5 });
  assert.deepStrictEqual(s.control, { n: 2, correct: 1 });
}

module.exports = { join, left, vote, refresh, close, listRooms, results, selfCheck };

if (require.main === module) {
  selfCheck();
  console.log('blindTest self-check: ok');
}
