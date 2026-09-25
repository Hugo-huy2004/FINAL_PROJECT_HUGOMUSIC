const mongoose = require('mongoose');

// Mốc đo cho Source-Aware ABR: phải có số liệu của kiến trúc hiện tại (một
// chất lượng duy nhất, đẩy qua proxy Node) thì sau này mới chứng minh được
// thang bitrate bám theo nguồn tiết kiệm bao nhiêu băng thông.
//
// Chia làm hai nguồn ghi, vì mỗi bên chỉ biết một nửa sự thật:
//   - 'stream'   do backend ghi (controllers/songController.js -> streamSong):
//                biết chính xác số byte đã đẩy đi, client không đo được.
//   - 'playback' do client gửi lên (utils/audioEngine.ts):
//                biết độ trễ ra tiếng, số lần đứt tiếng, nghe được bao lâu —
//                server không nhìn thấy.
const playbackMetricSchema = new mongoose.Schema({
  kind: { type: String, enum: ['stream', 'playback'], required: true },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- kind: 'stream' (server ghi) ---
  bytesSent: { type: Number },
  wasRange: { type: Boolean },
  fileSize: { type: Number },

  // --- kind: 'playback' (client gửi) ---
  startupMs: { type: Number },      // bấm play -> ra tiếng đầu tiên
  rebufferCount: { type: Number },  // số lần đứt tiếng giữa chừng
  rebufferMs: { type: Number },
  playedMs: { type: Number },       // nghe thực tế bao lâu (dùng để nhận diện skip)
  completed: { type: Boolean },

  // --- bối cảnh, dùng để tách nhóm khi phân tích ---
  tier: { type: String, default: 'original' }, // sau này: aac64 | aac128 | flac | alac...
  sourceBitrateKbps: { type: Number },         // trần chất lượng thật của bài
  platform: { type: String },                  // ios | android | web
}, { timestamps: true });

// Truy vấn phân tích luôn gom theo bài hoặc theo mốc thời gian.
playbackMetricSchema.index({ song: 1, createdAt: -1 });
playbackMetricSchema.index({ kind: 1, createdAt: -1 });

module.exports = mongoose.model('PlaybackMetric', playbackMetricSchema);
