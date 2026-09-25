const mongoose = require('mongoose');
const { LICENSE_TYPES } = require('../utils/songReview');

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  filePath: { type: String, required: true },
  coverArt: { type: String },
  duration: { type: Number, default: 0 },
  category: { type: String, default: 'Nhạc trẻ' },
  // Real genre tag - from the source's own subject/tag metadata (archive.org items)
  // or the file's embedded ID3 genre (TCON) - never guessed. `category` is the broad
  // browse section; `genre` is the finer-grained real signal.
  genre: { type: String },
  // Real country of origin - only on songs from the original country-tagged catalogue
  // import; songs uploaded by an admin leave it empty rather than guess.
  country: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likesCount: { type: Number, default: 0 },
  // Mã tệp gốc trên Internet Archive, chỉ có ở các bài của đợt nhập kho ban đầu.
  // research/auditSourceCeiling.js dùng nó để tìm lại bản chất lượng cao hơn ở nguồn.
  externalId: { type: String, unique: true, sparse: true },
  sourceUrl: { type: String },
  license: { type: String },
  licenseUrl: { type: String },
  // Master playlist HLS đa tier (scripts/streaming/buildHls.js). Bài mang giấy phép ND
  // không có trường này vì bị cấm tạo bản phái sinh — client phát file gốc.
  hlsPath: { type: String },
  hlsTiers: [{ type: String }],
  // Thang tier do PSL đo được (scripts/streaming/buildPslLadder.js, docs/PSL_TECHNIQUE.md).
  // Suy ra từ điểm bão hoà chất lượng cảm nhận của CHÍNH bài này, không phải
  // một thang cố định áp cho cả kho — vì chất lượng nguồn trong kho chênh nhau
  // tới ~11 lần. buildHls.js đọc trường này để biết cần dựng những tier nào.
  pslLadder: [{ type: Number }],       // ví dụ [64, 96, 128, 192]
  pslMos: { type: Object },            // điểm MOS-LQO từng tier, để tra lại
  pslTau: { type: Number },            // ngưỡng đã dùng, để so sánh giữa các lần đo
  pslMeasuredAt: { type: Date },
  // Giấy phép cụ thể — bắt buộc khi admin tải lên (xem utils/songReview.js).
  // Chuỗi `license` chỉ là mô tả cho người đọc; trường này mới dùng để lọc/kiểm tra.
  licenseType: { type: String, enum: LICENSE_TYPES },
  attribution: { type: String },
  // Hàng chờ duyệt: mọi bài mới vào kho đều ở 'pending' cho tới khi admin duyệt.
  // Chỉ 'published' mới hiện với người nghe và mới được cấp token phát.
  // Tầng bản quyền (utils/songReview.js) là cổng cứng của bước duyệt.
  status: { type: String, enum: ['pending', 'published', 'rejected'], default: 'pending', index: true },
  reviewNote: { type: String },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  // Lookup order: embedded ID3 lyrics (exact, same file) -> LRCLIB (free, open,
  // built for this exact use case) -> left unset, meaning "genuinely has none found"
  // rather than an empty string meaning "not checked yet".
  plainLyrics: { type: String },
  syncedLyrics: { type: String }, // LRC-timestamped, e.g. "[00:12.34]line"
  lyricsSource: { type: String }, // 'id3' | 'lrclib' | undefined
  lyricsCheckedAt: { type: Date },
}, { timestamps: true });

const Song = mongoose.model('Song', songSchema);
module.exports = Song;
