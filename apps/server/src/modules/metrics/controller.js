const PlaybackMetric = require('./PlaybackMetric');
const Song = require('../songs/Song');
const { rank, perTrack, globalFieldFor } = require('../../ranking/score');
const { GENRE_GROUPS } = require('../meta/genreGroups');
const asyncHandler = require('../../core/asyncHandler');

// Receive music playback data from client. Only the client knows the delay from the moment the play button is pressed
// until the sound comes out, the number of times the sound breaks and how long it actually takes to listen — the server stands outside
// cannot be measured.
const recordPlayback = asyncHandler(async (req, res) => {
  const { songId, startupMs, rebufferCount, rebufferMs, playedMs, completed, tier, platform, cdn } = req.body;

  if (!songId) {
    return res.status(400).json({ message: 'songId is required' });
  }
  const song = await Song.findById(songId).select('_id');
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }

  await PlaybackMetric.create({
    kind: 'playback',
    song: song._id,
    user: req.user?._id,
    startupMs,
    rebufferCount,
    rebufferMs,
    playedMs,
    completed,
    tier: tier || 'original',
    platform,
    cdn: typeof cdn === 'string' ? cdn.slice(0, 32) : undefined,
  });

  // The client sends data in a "fire and forget" manner, without waiting for a response.
  res.status(204).end();
});

// Synthesize current benchmarks to compare before/after applying Source-Aware ABR.
const getPlaybackSummary = asyncHandler(async (req, res) => {
  const [streamStats] = await PlaybackMetric.aggregate([
    { $match: { kind: 'stream' } },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        totalBytes: { $sum: '$bytesSent' },
        avgBytes: { $avg: '$bytesSent' },
        avgSourceKbps: { $avg: '$sourceBitrateKbps' },
      },
    },
  ]);

  const [playbackStats] = await PlaybackMetric.aggregate([
    { $match: { kind: 'playback' } },
    {
      $group: {
        _id: null,
        plays: { $sum: 1 },
        avgStartupMs: { $avg: '$startupMs' },
        avgRebufferCount: { $avg: '$rebufferCount' },
        avgPlayedMs: { $avg: '$playedMs' },
        completedCount: { $sum: { $cond: ['$completed', 1, 0] } },
      },
    },
  ]);

  // According to each CDN (multi-CDN, hugo-stream's createSteering): compare audio output and audio dropout latency
  // on the SAME real listeners — proof of choosing a measured CDN instead of a fixed one.
  const byCdn = await PlaybackMetric.aggregate([
    { $match: { kind: 'playback', cdn: { $exists: true } } },
    {
      $group: {
        _id: '$cdn',
        plays: { $sum: 1 },
        avgStartupMs: { $avg: '$startupMs' },
        avgRebufferCount: { $avg: '$rebufferCount' },
        rebufferMsPerMinute: { $avg: { $cond: [{ $gt: ['$playedMs', 0] }, { $divide: [{ $multiply: ['$rebufferMs', 60000] }, '$playedMs'] }, 0] } },
      },
    },
    { $sort: { plays: -1 } },
  ]);

  res.json({
    stream: streamStats || { requests: 0 },
    playback: playbackStats || { plays: 0 },
    byCdn,
  });
});

// A listen is counted when listening for ≥ 30 seconds or listening to the entire song (short song) — as follows
// Large platforms count streams; Click on it and immediately leave it without counting.
const COUNTED_PLAY = { $or: [{ playedMs: { $gte: 30000 } }, { completed: true }] };
const TOP_MAX = 200;

// GET /api/metrics/top?days=7&limit=50[&group=chill] — rankings for the last N days (days=0: all time),
// option only in one category group (utils/genreGroups.js).
// Mixing two sources (ranking/score.js): REAL plays on Hugo Music (PlaybackMetric) + popularity
// GLOBAL of releases (Song.globalStats — archive.org downloads over the same time period, evenly split
// by article number). Candidate = song with views on Hugo ∪ most popular song globally in that slot.
const CANDIDATES = 400;
const getTopSongs = asyncHandler(async (req, res) => {
  const days = Math.max(0, Number(req.query.days ?? 7) || 0);
  const limit = Math.min(TOP_MAX, Math.max(1, Number(req.query.limit) || 50));
  const field = globalFieldFor(days);
  const genre = GENRE_GROUPS[req.query.group]?.match;
  const inGroup = genre ? { genre } : {};
  const match = { kind: 'playback', ...COUNTED_PLAY };
  if (days > 0) match.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };

  const local = await PlaybackMetric.aggregate([
    { $match: match },
    { $group: { _id: '$song', plays: { $sum: 1 }, users: { $addToSet: '$user' } } },
    // Guest (user = null) does not count as a private listener.
    { $project: { plays: 1, listeners: { $size: { $setDifference: ['$users', [null]] } } } },
  ]);
  const localById = new Map(local.map((r) => [String(r._id), r]));

  const fields = 'title artist coverArt coverColor duration album genre category hlsPath hlsTiers filePath transition globalStats licenseType';
  const [heard, popular] = await Promise.all([
    Song.find({ _id: { $in: local.map((r) => r._id) }, status: 'published', ...inGroup }).select(fields).lean(),
    Song.find({ status: 'published', ...inGroup, [`globalStats.${field}`]: { $gt: 0 } }).sort({ [`globalStats.${field}`]: -1 }).limit(CANDIDATES).select(fields).lean(),
  ]);
  const songs = new Map([...popular, ...heard].map((s) => [String(s._id), s]));

  const ranked = rank([...songs.values()].map((s) => ({
    id: String(s._id),
    local: localById.get(String(s._id))?.plays || 0,
    global: perTrack(s.globalStats, field, s.album?.trackCount),
  }))).slice(0, limit);

  res.json({
    days,
    group: genre ? req.query.group : 'all',
    top: ranked.map((r, i) => ({
      rank: i + 1,
      song: songs.get(r.id),
      plays: r.local,
      listeners: localById.get(r.id)?.listeners || 0,
      globalPlays: Math.round(r.global),
      score: Number(r.score.toFixed(4)),
    })),
  });
});

module.exports = { recordPlayback, getPlaybackSummary, getTopSongs };
