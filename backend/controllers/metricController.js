const PlaybackMetric = require('../models/PlaybackMetric');
const Song = require('../models/Song');
const asyncHandler = require('../utils/asyncHandler');

// Nhận số liệu phát nhạc từ client. Chỉ client biết được độ trễ từ lúc bấm play
// tới lúc ra tiếng, số lần đứt tiếng và nghe thực tế bao lâu — server đứng ngoài
// không đo được.
const recordPlayback = asyncHandler(async (req, res) => {
  const { songId, startupMs, rebufferCount, rebufferMs, playedMs, completed, tier, platform } = req.body;

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

  res.json({
    stream: streamStats || { requests: 0 },
    playback: playbackStats || { plays: 0 },
  });
});

module.exports = { recordPlayback, getPlaybackSummary };
