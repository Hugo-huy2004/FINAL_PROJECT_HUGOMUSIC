const fs = require('fs');
const path = require('path');
const { PassThrough, pipeline } = require('stream');
const Song = require('../models/Song');
const User = require('../models/User');
const PlaybackMetric = require('../models/PlaybackMetric');
const asyncHandler = require('../utils/asyncHandler');
const { cacheGet, cacheSet, cacheDel } = require('../utils/redisClient');
const { findLyrics } = require('../utils/lyricsLookup');
const { mintToken, verifyToken, guestMayPlay, TTL_SECONDS, GUEST_FREE_SONGS } = require('../utils/playbackToken');

const { spawn } = require('child_process');
const {
  uploadToR2, getR2Stream, deleteFromR2, deletePrefixFromR2, keyFromR2Url,
} = require('../utils/r2');
const { reviewSong, isHttpUrl, LICENSE_TYPES, NO_DERIVATIVE } = require('../utils/songReview');

let mm;
async function loadMusicMetadata() {
  if (!mm) {
    mm = await import('music-metadata');
  }
  return mm;
}

function sanitizeFilename(name) {
  return name
    .normalize('NFD') // Decompose accents
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/đ/g, 'd').replace(/Đ/g, 'D') // Handle Vietnamese D
    .replace(/[^a-z0-9]+/gi, '-') // Replace spaces and special chars with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .toLowerCase();
}

const uploadSong = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No audio file uploaded' });
  }

  const { title, artist, category, genre, licenseType, sourceUrl, licenseUrl, attribution } = req.body;
  // Tầng bản quyền được kiểm TRƯỚC khi tốn công đẩy tệp lên R2: bài CC/PD
  // không có giấy phép và nguồn thì không bao giờ được phát.
  if (!LICENSE_TYPES.includes(licenseType)) {
    return res.status(400).json({ message: 'Chọn giấy phép của bài' });
  }
  if (!isHttpUrl(sourceUrl)) {
    return res.status(400).json({ message: 'Nhập URL nguồn (http/https) của bài' });
  }
  const buffer = req.file.buffer;
  
  // Parse metadata from buffer
  const metadataLib = await loadMusicMetadata();
  const metadata = await metadataLib.parseBuffer(buffer, req.file.mimetype);
  const parsedTitle = title || metadata.common.title || 'Unknown Title';
  const parsedArtist = artist || metadata.common.artist || 'Unknown Artist';
  const duration = Math.round(metadata.format.duration || 0);

  // Hậu tố ngẫu nhiên: Worker cache tệp vĩnh viễn (immutable) theo key, nên hai
  // bài trùng tên không được ghi đè lên nhau.
  const safeBaseName = `${sanitizeFilename(parsedArtist + '-' + parsedTitle)}-${Date.now().toString(36)}`;
  const audioExt = path.extname(req.file.originalname) || '.mp3';
  const audioKey = `audio/${safeBaseName}${audioExt}`;

  const publicAudioUrl = await uploadToR2(buffer, audioKey, req.file.mimetype);
  let publicCoverUrl = '';

  // Extract and Upload Cover Art if exists
  if (metadata.common.picture && metadata.common.picture.length > 0) {
    const picture = metadata.common.picture[0];
    const imageExt = picture.format === 'image/png' ? '.png' : '.jpg';
    const coverKey = `covers/${safeBaseName}${imageExt}`;

    publicCoverUrl = await uploadToR2(picture.data, coverKey, picture.format);
  }
  
  // Automatic lyrics detection at upload time: ID3-embedded lyrics first (same file,
  // guaranteed correct), then LRCLIB by title+artist. See utils/lyricsLookup.js.
  const lyricsResult = await findLyrics({ metadataCommon: metadata.common, title: parsedTitle, artist: parsedArtist });

  const song = await Song.create({
    title: parsedTitle,
    artist: parsedArtist,
    filePath: publicAudioUrl,
    coverArt: publicCoverUrl,
    duration,
    category: category || 'Nhạc trẻ',
    genre: genre || metadata.common.genre?.[0],
    licenseType,
    sourceUrl: sourceUrl.trim(),
    licenseUrl,
    attribution: attribution || parsedArtist,
    status: 'pending', // vào hàng chờ; chỉ hiện với người nghe sau khi admin duyệt
    uploadedBy: req.user._id,
    plainLyrics: lyricsResult?.plainLyrics,
    syncedLyrics: lyricsResult?.syncedLyrics,
    lyricsSource: lyricsResult?.lyricsSource,
    lyricsCheckedAt: new Date(),
  });

  res.status(201).json(song);
});

// GET /api/songs?q=search+term — plain listing, or a case-insensitive title/artist search.
// Cache-aside on the unfiltered listing only: it's the one every Home/Browse load hits
// identically, so it's the read Redis actually protects the DB from. Search queries are too varied to be
// worth caching per-query.
const SONGS_CACHE_KEY = 'songs:all';
const SONGS_CACHE_TTL_SECONDS = 60;

const getSongs = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) {
    const cached = await cacheGet(SONGS_CACHE_KEY);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
  }

  let filter = { status: 'published' };
  if (q && q.trim()) {
    const trimmed = q.trim();
    const escapedQ = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQ, 'i');

    const orConditions = [
      { title: regex },
      { artist: regex },
      { category: regex },
    ];

    // Category aliases mapping
    const lower = trimmed.toLowerCase();
    if (lower.includes('acoustic') || lower.includes('lofi') || lower.includes('mộc')) {
      orConditions.push({ category: 'Acoustic & Lofi' });
    }
    if (lower.includes('pop') || lower.includes('nhạc trẻ') || lower.includes('v-pop') || lower.includes('modern')) {
      orConditions.push({ category: 'Nhạc trẻ' });
    }
    if (lower.includes('quốc tế') || lower.includes('international') || lower.includes('indie')) {
      orConditions.push({ category: 'Nhạc Quốc Tế' });
    }
    if (lower.includes('phụng vụ') || lower.includes('thánh ca') || lower.includes('liturgical') || lower.includes('hymn')) {
      orConditions.push({ category: 'Nhạc Phụng Vụ' });
    }
    if (lower.includes('hòa tấu') || lower.includes('cổ điển') || lower.includes('classical') || lower.includes('instrumental')) {
      orConditions.push({ category: 'Hòa tấu' });
    }
    if (lower.includes('podcast') || lower.includes('radio') || lower.includes('bưu thiếp')) {
      orConditions.push({ category: 'Podcast' });
    }

    filter = { status: 'published', $or: orConditions };
  }

  // Lyrics text is fetched on-demand via GET /api/songs/:id/lyrics, not on every
  // list load - plainLyrics/syncedLyrics can be several KB each across hundreds of songs.
  const songs = await Song.find(filter).select('-plainLyrics -syncedLyrics').sort({ createdAt: -1 });
  if (!q) {
    res.setHeader('X-Cache', 'MISS');
    await cacheSet(SONGS_CACHE_KEY, songs, SONGS_CACHE_TTL_SECONDS);
  }
  res.json(songs);
});

// Đếm số byte THỰC SỰ đẩy tới người nghe, không phải kích thước file: user tua
// hoặc bỏ bài giữa chừng thì kết nối đứt sớm và phần còn lại không bao giờ được
// gửi. Đây là con số băng thông thật để so với Source-Aware ABR sau này.
//
// Trả về một luồng đếm để chèn vào giữa: R2 -> counter -> res.
//
// Ghi ở sự kiện 'close' (luôn bắn, kể cả khi client ngắt) thay vì 'finish'
// (chỉ bắn khi gửi trọn vẹn), nếu không thì đúng những lượt skip — thứ tốn
// băng thông vô ích nhất — lại bị bỏ sót khỏi thống kê.
//
// Phải đếm ở ĐẦU RA chứ không phải đầu vào. Nếu gắn vào luồng đọc từ R2 thì khi
// user bỏ bài giữa chừng, dữ liệu vẫn được đọc hết từ R2 và bị tính đủ 100% —
// đúng lượt skip, thứ ta cần soi nhất, lại bị ghi sai thành nghe trọn bài.
// Nhờ cơ chế backpressure, luồng này chỉ nhả dữ liệu theo đúng tốc độ người
// nghe thật sự nhận được.
//
// Không dùng socket.bytesWritten vì socket cộng dồn qua mọi request trên cùng
// một kết nối keep-alive nên sẽ đếm lố nhiều lần.
function recordStreamBytes(res, song, userId, { wasRange, fileSize }) {
  const counter = new PassThrough();
  let bytesSent = 0;
  counter.on('data', (chunk) => {
    bytesSent += chunk.length;
  });

  res.on('close', () => {
    if (!bytesSent) return;
    PlaybackMetric.create({
      kind: 'stream',
      song: song._id,
      user: userId,
      bytesSent,
      wasRange,
      fileSize,
      sourceBitrateKbps: song.duration ? Math.round((fileSize * 8) / song.duration / 1000) : undefined,
    }).catch(() => {
      // Đo đạc hỏng thì không được làm hỏng việc phát nhạc.
    });
  });

  return counter;
}

// GET /api/songs/:id/playback — điểm DUY NHẤT quyết định ai được nghe bao nhiêu.
//
// Đã đăng nhập -> token (file gốc + HLS). Khách -> cũng vậy, nhưng chỉ cho
// GUEST_FREE_SONGS bài mỗi ngày, sau đó 401 requiresLogin. Worker và proxy Node
// chỉ kiểm tra chữ ký, không tự quyết định quyền. Xem utils/playbackToken.js.
const getPlaybackToken = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select('filePath hlsPath status');
  // Bài chưa xuất bản chỉ admin nghe được (để nghe thử trước khi duyệt).
  if (!song || (song.status !== 'published' && req.user?.role !== 'admin')) {
    return res.status(404).json({ message: 'Song not found' });
  }

  // Khách nghe trọn vài bài đầu, sau đó bắt buộc đăng nhập (utils/playbackToken.js).
  if (!req.user && !guestMayPlay(req.ip, String(song._id))) {
    return res.status(401).json({
      message: `Đăng nhập để nghe tiếp — khách được nghe ${GUEST_FREE_SONGS} bài mỗi ngày`,
      requiresLogin: true,
    });
  }

  const fileKey = keyFromR2Url(song.filePath);
  const hlsKey = keyFromR2Url(song.hlsPath);
  res.json({
    fileToken: fileKey ? mintToken(fileKey) : null,
    hlsToken: hlsKey ? mintToken(hlsKey) : null,
    expiresIn: TTL_SECONDS,
  });
});

// GET /api/songs/stream/:id?token=... — proxy qua Node khi chưa cấu hình Worker
// CDN (và cho trình duyệt dính lỗi ORB, xem dưới). Cùng luật với Worker: không
// có token hợp lệ -> 401.
//
// Không chuyển hướng thẳng sang URL ký sẵn của R2: Chrome chặn phản hồi đó
// bằng Opaque Response Blocking vì endpoint R2 thô không có header CORS, mà
// trình phát web tải qua fetch/XHR chứ không qua thẻ <audio> thuần.
const streamSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select('filePath duration');
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }
  const key = keyFromR2Url(song.filePath);
  if (!key || !verifyToken(key, req.query.token)) {
    return res.status(401).json({ message: 'Đăng nhập để nghe bài này' });
  }

  const range = req.headers.range;
  const s3Res = await getR2Stream(key, range);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', s3Res.ContentType || 'audio/mpeg');
  if (s3Res.ContentLength) res.setHeader('Content-Length', s3Res.ContentLength);
  if (s3Res.ContentRange) {
    res.setHeader('Content-Range', s3Res.ContentRange);
    res.status(206);
  }
  // Với range request thì ContentLength chỉ là độ dài đoạn — kích thước thật
  // của cả file nằm sau dấu "/" trong ContentRange.
  const totalSize = s3Res.ContentRange ? parseInt(s3Res.ContentRange.split('/')[1], 10) : s3Res.ContentLength;
  const counter = recordStreamBytes(res, song, req.user?._id, { wasRange: Boolean(range), fileSize: totalSize });
  // pipeline (not .pipe) tears down the R2 body when the listener skips/closes;
  // .pipe left it open, leaking one R2 socket per skipped track until the SDK's
  // connection pool ran dry and every new stream stalled.
  return pipeline(s3Res.Body, counter, res, () => {});
});

// POST /api/songs/:id/like — toggles the song in the current user's favorites.
const toggleLikeSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id);
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }

  const user = await User.findById(req.user._id);
  const idx = user.favorites.findIndex((id) => id.toString() === song._id.toString());
  let liked;
  if (idx === -1) {
    user.favorites.push(song._id);
    liked = true;
  } else {
    user.favorites.splice(idx, 1);
    liked = false;
  }
  await Promise.all([
    user.save(),
    Song.updateOne({ _id: song._id }, { $inc: { likesCount: liked ? 1 : -1 } }),
  ]);

  res.json({ liked, favorites: user.favorites });
});

// GET /api/songs/liked/mine — the current user's liked songs.
const getLikedSongs = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('favorites');
  res.json(user.favorites);
});

// DELETE /api/songs/:id — admin-only (see routes/songRoutes.js), any admin can
// remove any catalog song, not just ones they personally uploaded.
const deleteSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id);
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }

  await song.deleteOne();
  await cacheDel(SONGS_CACHE_KEY);

  // Dọn tệp trên R2 sau khi đã gỡ khỏi kho: tệp mồ côi vừa tốn chỗ vừa còn
  // phát được bằng token cũ. Lỗi dọn dẹp không được làm hỏng việc xoá.
  let storageCleaned = true;
  try {
    const audioKey = keyFromR2Url(song.filePath);
    if (audioKey) await deleteFromR2(audioKey);
    await deletePrefixFromR2(`hls/${song._id}/`);
    // Ảnh bìa có thể dùng chung cho cả album — chỉ xoá khi không còn bài nào trỏ tới.
    const coverKey = keyFromR2Url(song.coverArt);
    if (coverKey?.startsWith('covers/') && !(await Song.exists({ coverArt: song.coverArt }))) {
      await deleteFromR2(coverKey);
    }
  } catch (err) {
    storageCleaned = false;
    console.warn(`Không dọn được R2 cho bài ${song._id}: ${err.message}`);
  }
  res.json({ message: 'Song deleted', storageCleaned });
});

// ---------- HÀNG CHỜ DUYỆT (admin) ----------
//
// Mọi bài mới vào kho ở trạng thái 'pending'. Admin nghe thử, sửa thông tin nếu
// cần, rồi duyệt hoặc từ chối. Tầng bản quyền của utils/songReview.js là cổng
// cứng: thiếu nguồn/giấy phép/ghi công thì không duyệt được.

const REVIEW_FIELDS = 'title artist coverArt duration category genre sourceUrl license licenseUrl licenseType '
  + 'attribution status reviewNote reviewedAt hlsPath hlsTiers pslLadder filePath createdAt';
const EDITABLE_FIELDS = ['title', 'artist', 'category', 'genre', 'sourceUrl', 'licenseUrl', 'licenseType', 'attribution'];

const withReview = (song) => ({ ...song.toObject(), review: reviewSong(song) });

// GET /api/songs/admin/queue?status=pending|published|rejected
const getReviewQueue = asyncHandler(async (req, res) => {
  const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const [songs, counts] = await Promise.all([
    // Kho đã xuất bản có hơn nghìn bài; admin chỉ cần phần mới nhất.
    Song.find({ status }).select(REVIEW_FIELDS).sort({ createdAt: -1 }).limit(100),
    Song.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    status,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    songs: songs.map(withReview),
  });
});

// PATCH /api/songs/:id — sửa thông tin bài (để qua được xét duyệt).
const updateSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select(REVIEW_FIELDS);
  if (!song) return res.status(404).json({ message: 'Song not found' });

  for (const f of EDITABLE_FIELDS) {
    if (req.body[f] !== undefined) song[f] = typeof req.body[f] === 'string' ? req.body[f].trim() : req.body[f];
  }
  if (song.licenseType && !LICENSE_TYPES.includes(song.licenseType)) {
    return res.status(400).json({ message: 'Giấy phép không hợp lệ' });
  }
  await song.save();
  if (song.status === 'published') await cacheDel(SONGS_CACHE_KEY);
  res.json(withReview(song));
});

// Đo PSL (ViSQOL) rồi dựng HLS cho bài vừa xuất bản, chạy nền để không chặn phản hồi.
// Cùng script với lúc dựng hàng loạt nên cùng một quy tắc (thang PSL, đoạn 4 s,
// BANDWIDTH đo thật). Kết quả ghi vào logs/pipeline.log.
// ponytail: tiến trình con không có hàng đợi — duyệt dồn nhiều bài cùng lúc sẽ chạy
// nhiều ViSQOL/FFmpeg song song; thêm hàng đợi khi cần.
const PIPELINE_LOG = path.join(__dirname, '..', 'logs', 'pipeline.log');
function buildHlsInBackground(songId) {
  const script = path.join(__dirname, '..', 'scripts', 'streaming', 'buildHls.js');
  fs.mkdirSync(path.dirname(PIPELINE_LOG), { recursive: true });
  const log = fs.openSync(PIPELINE_LOG, 'a');
  spawn(process.execPath, [script, `--id=${songId}`], { stdio: ['ignore', log, log], detached: true }).unref();
  fs.closeSync(log);
}

// POST /api/songs/:id/review  { decision: 'publish' | 'reject', note? }
const reviewSongDecision = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['publish', 'reject'].includes(decision)) {
    return res.status(400).json({ message: 'decision phải là publish hoặc reject' });
  }
  const song = await Song.findById(req.params.id).select(REVIEW_FIELDS);
  if (!song) return res.status(404).json({ message: 'Song not found' });

  const review = reviewSong(song);
  if (decision === 'publish' && !review.copyright.pass) {
    return res.status(409).json({ message: `Chưa qua tầng bản quyền: ${review.copyright.issues.join(', ')}`, review });
  }

  song.status = decision === 'publish' ? 'published' : 'rejected';
  song.reviewNote = note?.trim() || undefined;
  song.reviewedBy = req.user._id;
  song.reviewedAt = new Date();
  await song.save();
  await cacheDel(SONGS_CACHE_KEY);

  const buildsHls = song.status === 'published' && !song.hlsPath && !NO_DERIVATIVE.includes(song.licenseType);
  if (buildsHls) buildHlsInBackground(song._id);
  res.json({ ...withReview(song), hlsBuildStarted: buildsHls });
});

// GET /api/songs/:id/lyrics — fetched on demand (not on the list endpoint) since
// lyrics text is heavy across hundreds of songs. Lyrics are filled in at upload
// (utils/lyricsLookup.js); a song that was checked and genuinely has
// none returns hasLyrics:false rather than a 404, so the player can show "no lyrics"
// instead of treating it as an error.
const getLyrics = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select('plainLyrics syncedLyrics lyricsSource lyricsCheckedAt');
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }
  res.json({
    hasLyrics: !!(song.plainLyrics || song.syncedLyrics),
    plainLyrics: song.plainLyrics || null,
    syncedLyrics: song.syncedLyrics || null,
    source: song.lyricsSource || null,
    checked: !!song.lyricsCheckedAt,
  });
});

module.exports = {
  uploadSong, getSongs, streamSong, getPlaybackToken, toggleLikeSong, getLikedSongs, deleteSong, getLyrics,
  getReviewQueue, updateSong, reviewSongDecision,
};
