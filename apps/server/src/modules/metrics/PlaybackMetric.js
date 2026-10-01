const mongoose = require('mongoose');
const { kindScope } = require('../../core/kindScope');

// Benchmark for Source-Aware ABR: must have metrics of current architecture (one
// only quality, push through Node proxy) can be proven later
// Source-based bitrate scaling saves how much bandwidth.
//
// Divided into two sources, because each side only knows half the truth:
//   - 'stream'   do backend ghi (controllers/songController.js -> streamSong):
// know the exact number of bytes pushed, the client cannot measure it.
// - 'playback' sent by client (utils/audioEngine.ts):
// Know the sound delay, the number of times the sound breaks, how long you can listen —
// The server cannot see it.
const playbackMetricSchema = new mongoose.Schema({
  kind: { type: String, enum: ['stream', 'playback'], required: true },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- kind: 'stream' (server ghi) ---
  bytesSent: { type: Number },
  wasRange: { type: Boolean },
  fileSize: { type: Number },

  // --- kind: 'playback' (client sent) ---
  startupMs: { type: Number },      // Click play -> the first sound comes out
  rebufferCount: { type: Number },  // Number of times the sound breaks mid-sentence
  rebufferMs: { type: Number },
  playedMs: { type: Number },       // How long does it actually take to listen (used to detect skips)
  completed: { type: Boolean },

  // --- context, used to separate groups when analyzing ---
  tier: { type: String, default: 'original' }, // later: aac64 | aac128 | flac | alac...
  sourceBitrateKbps: { type: Number },         // bare the true quality of the article
  platform: { type: String },                  // ios | android | web
  cdn: { type: String },                       // cloudflare | bunny | origin | offline (multi-CDN)
}, { timestamps: true });

// Analytical queries are always grouped by post or by timeline.
playbackMetricSchema.index({ song: 1, createdAt: -1 });
playbackMetricSchema.index({ kind: 1, createdAt: -1 });
playbackMetricSchema.index({ user: 1, createdAt: -1 }); // one user details (admin page)

// Generic collection `events` (models/kindScope.js): all measurable system events — plays, bytes
// transmission, blind vote (ListeningVote)… New event = add a `kind`, not add a collection.
playbackMetricSchema.plugin(kindScope, { kinds: ['stream', 'playback'] });
module.exports = mongoose.model('PlaybackMetric', playbackMetricSchema, 'events');
