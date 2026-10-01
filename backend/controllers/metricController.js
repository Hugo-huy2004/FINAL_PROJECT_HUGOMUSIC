const PlaybackMetric = require('../models/PlaybackMetric');
const Song = require('../models/Song');
const { rank, perTrack, globalFieldFor } = require('../ranking/score');
const { GENRE_GROUPS } = require('../utils/genreGroups');
const asyncHandler = require('../utils/asyncHandler');

// Nhận số liệu phát nhạc từ client. Chỉ client biết được độ trễ từ lúc bấm play
// tới lúc ra tiếng, số lần đứt tiếng và nghe thực tế bao lâu — server đứng ngoài
// không đo được.
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

  // Client gửi số liệu theo kiểu "bắn rồi quên", không cần chờ phản hồi.
  res.status(204).end();
});

// Tổng hợp mốc hiện tại để so sánh trước/sau khi áp Source-Aware ABR.
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

  // Theo từng CDN (multi-CDN, frontend/src/utils/cdnSteering.ts): so sánh độ trễ ra tiếng và đứt tiếng
  // trên CÙNG người nghe thật — bằng chứng cho việc chọn CDN theo số đo thay vì cố định.
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

// Một lượt nghe được tính khi nghe ≥ 30 giây hoặc nghe hết bài (bài ngắn) — như cách các
// nền tảng lớn đếm lượt stream; bấm vào rồi bỏ ngay không tính.
const COUNTED_PLAY = { $or: [{ playedMs: { $gte: 30000 } }, { completed: true }] };
const TOP_MAX = 200;

// GET /api/metrics/top?days=7&limit=50[&group=chill] — bảng xếp hạng trong N ngày gần nhất (days=0: mọi lúc),
// tuỳ chọn chỉ trong một nhóm thể loại (utils/genreGroups.js).
// Trộn hai nguồn (ranking/score.js): lượt nghe THẬT trên Hugo Music (PlaybackMetric) + độ phổ biến
// TOÀN CẦU của bản phát hành (Song.globalStats — lượt tải archive.org cùng khoảng thời gian, chia đều
// theo số bài). Ứng viên = bài có lượt nghe trên Hugo ∪ bài phổ biến toàn cầu nhất trong khoảng đó.
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
    // Khách (user = null) không đếm là một người nghe riêng.
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
