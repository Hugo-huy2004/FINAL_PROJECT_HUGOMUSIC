const express = require('express');
const { doc } = require('hugo-server');
const { recordPlayback, getPlaybackSummary, getTopSongs } = require('./controller');
const { protect, optionalAuth, isAdmin } = require('../../core/middleware/auth');

const router = express.Router();

// No login required: visitors can also listen to music and data
// Their bandwidth still needs to be at the benchmark.
router.post('/playback', doc('Report one playback session (startup delay, rebuffering, CDN…)', {'body': {'songId': '', 'startupMs': '', 'rebufferCount': '', 'rebufferMs': '', 'playedMs': '', 'completed': '', 'platform': '', 'cdn': ''}, 'returns': '204'}), optionalAuth, recordPlayback);
// Ranking by listen — public (New tab, sorted by "Most listened to").
router.get('/top', doc('Charts: plays on Hugo combined with global popularity', {'query': {'days': '7 | 30 | 0 (all time)', 'limit': '≤ 200', 'group': 'genre group key (see /api/meta)'}, 'returns': 'Song[] with scores'}), getTopSongs);
// Summary data of the entire system — only admin can see.
router.get('/summary', doc('Playback metrics summary, per CDN', {'returns': '{ stream, playback, byCdn }'}), protect, isAdmin, getPlaybackSummary);

// Mounted automatically at /api/metrics (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Metrics',
  description: 'Playback telemetry and charts.',
  guide: `**Telemetry.** Clients send one \`POST /playback\` per listening session: startup delay, rebuffer count and time, played time, completion, platform and CDN. Signing in is optional; anonymous sessions are counted too.

**Charts.** \`GET /top\` ranks songs by plays on Hugo combined with global popularity. \`days\` picks the window (7, 30 or 0 for all time) and \`group\` narrows to a genre group key from \`/api/meta\`.

**Summary.** \`GET /summary\` (admin) aggregates the telemetry per CDN — the numbers behind the CDN steering decisions.`,
};

module.exports = router;
