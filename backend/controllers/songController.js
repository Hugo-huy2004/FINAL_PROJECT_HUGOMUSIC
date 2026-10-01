const path = require('path');
const { PassThrough, pipeline } = require('stream');
const Song = require('../models/Song');
const User = require('../models/User');
const PlaybackMetric = require('../models/PlaybackMetric');
const asyncHandler = require('../utils/asyncHandler');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { findLyrics } = require('../utils/lyricsLookup');
const { mintToken, verifyToken, TTL_SECONDS } = require('../utils/playbackToken');
const { guestMayPlay, GUEST_FREE_SONGS } = require('../utils/guestQuota');
const { playbackSources } = require('../utils/cdnSources');
const { removeSongCompletely } = require('../utils/songRemoval');

const { spawn } = require('child_process');
const {
  uploadToR2, getR2Stream, keyFromR2Url, deleteFromR2,
} = require('../utils/r2');
const { reviewSong, isHttpUrl, LICENSE_TYPES } = require('../utils/songReview');

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

// Ảnh bìa tải lên: tối đa 5 MB, chỉ ảnh; tên tệp theo bài + thời điểm (Worker cache vĩnh viễn theo key).
const COVER_MAX = 5 * 1024 * 1024;
function checkCover(file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw Object.assign(new Error('Ảnh bìa phải là JPEG, PNG hoặc WebP'), { status: 400 });
  if (file.size > COVER_MAX) throw Object.assign(new Error('Ảnh bìa tối đa 5 MB'), { status: 400 });
  return file;
}
const coverExt = (mime) => ({ 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.jpg');

// Thông tin album nhập tay (bài tải lên lẻ không có nguồn phát hành để tra).
function albumFields(body) {
  const out = {};
  if (typeof body.albumTitle === 'string' && body.albumTitle.trim()) out.title = body.albumTitle.trim().slice(0, 200);
  const year = Number(body.albumYear);
  if (body.albumYear) {
    if (!Number.isInteger(year) || year < 1850 || year > new Date().getFullYear() + 1) throw Object.assign(new Error('Năm phát hành không hợp lệ'), { status: 400 });
    out.year = year;
  }
  const track = Number(body.trackNo);
  if (body.trackNo) {
    if (!Number.isInteger(track) || track < 1 || track > 999) throw Object.assign(new Error('Số thứ tự bài không hợp lệ'), { status: 400 });
    out.trackNo = track;
  }
  return out;
}

const uploadSong = asyncHandler(async (req, res) => {
  const audio = req.files?.audio?.[0];
  if (!audio) {
    return res.status(400).json({ message: 'Chọn tệp nhạc để tải lên' });
  }
  const coverFile = checkCover(req.files?.cover?.[0]);
  req.file = audio; // phần dưới dùng req.file như trước

  const { title, artist, category, genre, licenseType, sourceUrl, licenseUrl, attribution } = req.body;
  if ((title && title.length > 200) || (artist && artist.length > 120)) {
    return res.status(400).json({ message: 'Tên bài tối đa 200 ký tự, nghệ sĩ tối đa 120 ký tự' });
  }
  const album = albumFields(req.body);
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
  if (duration < 5) return res.status(400).json({ message: 'Không đọc được thời lượng — tệp nhạc hỏng hoặc quá ngắn' });

  // Trùng bài đã có (cùng tên + nghệ sĩ, không phân biệt hoa thường): hỏi lại thay vì tạo bản sao âm thầm.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dup = await Song.findOne({ title: new RegExp(`^${esc(parsedTitle)}$`, 'i'), artist: new RegExp(`^${esc(parsedArtist)}$`, 'i') }).select('_id status').lean();
  if (dup && req.body.allowDuplicate !== 'true') {
    return res.status(409).json({ message: `Đã có bài "${parsedTitle}" của ${parsedArtist} trong kho (${dup.status}). Gửi lại với allowDuplicate=true nếu vẫn muốn tải.`, duplicateOf: dup._id });
  }

  // Hậu tố ngẫu nhiên: Worker cache tệp vĩnh viễn (immutable) theo key, nên hai
  // bài trùng tên không được ghi đè lên nhau.
  const safeBaseName = `${sanitizeFilename(parsedArtist + '-' + parsedTitle)}-${Date.now().toString(36)}`;
  const audioExt = path.extname(req.file.originalname) || '.mp3';
  const audioKey = `audio/${safeBaseName}${audioExt}`;

  const publicAudioUrl = await uploadToR2(buffer, audioKey, req.file.mimetype);
  let publicCoverUrl = '';

  // Ảnh bìa: tệp admin chọn được ưu tiên; không có thì lấy ảnh nhúng trong tệp nhạc.
  if (coverFile) {
    publicCoverUrl = await uploadToR2(coverFile.buffer, `covers/${safeBaseName}${coverExt(coverFile.mimetype)}`, coverFile.mimetype);
  } else if (metadata.common.picture && metadata.common.picture.length > 0) {
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
    ...(Object.keys(album).length ? { album } : {}),
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
  const cached = await cacheGet(SONGS_CACHE_KEY);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }
  // Lyrics text is fetched on-demand via GET /api/songs/:id/lyrics, not on every
  // list load - plainLyrics/syncedLyrics can be several KB each across hundreds of songs.
  const songs = await Song.find({ status: 'published' }).select('-plainLyrics -syncedLyrics').sort({ createdAt: -1 });
  res.setHeader('X-Cache', 'MISS');
  await cacheSet(SONGS_CACHE_KEY, songs, SONGS_CACHE_TTL_SECONDS);
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
  if (!req.user && !(await guestMayPlay(req.ip, String(song._id)))) {
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
    // Cùng bài trên mọi CDN đang bật — client chọn và chuyển CDN (utils/cdnSources.js).
    sources: playbackSources({ fileKey, hlsKey }),
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
// Thả tim mới nhất đứng đầu (favorites được push theo thứ tự thả tim), bỏ bài đã bị xoá khỏi kho
// (populate trả null cho id không còn).
const getLikedSongs = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('favorites');
  res.json(user.favorites.filter(Boolean).reverse());
});

// DELETE /api/songs/:id — admin-only (see routes/songRoutes.js), any admin can
// remove any catalog song, not just ones they personally uploaded.
const deleteSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id);
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }

  // Gỡ bản ghi, mọi tham chiếu và tệp trên R2 (utils/songRemoval.js).
  const { storageCleaned } = await removeSongCompletely(song);
  await cacheDel(SONGS_CACHE_KEY);
  res.json({ message: 'Song deleted', storageCleaned });
});

// ---------- HÀNG CHỜ DUYỆT (admin) ----------
//
// Mọi bài mới vào kho ở trạng thái 'pending'. Admin nghe thử, sửa thông tin nếu
// cần, rồi duyệt hoặc từ chối. Tầng bản quyền của utils/songReview.js là cổng
// cứng: thiếu nguồn/giấy phép/ghi công thì không duyệt được.

const REVIEW_FIELDS = 'title artist coverArt duration category genre sourceUrl license licenseUrl licenseType '
  + 'attribution status reviewNote reviewedAt hlsPath hlsTiers pslLadder filePath createdAt album plainLyrics syncedLyrics';
const EDITABLE_FIELDS = ['title', 'artist', 'category', 'genre', 'sourceUrl', 'licenseUrl', 'licenseType', 'attribution'];
const FIELD_MAX = { title: 200, artist: 120, category: 60, genre: 60, sourceUrl: 500, licenseUrl: 500, attribution: 200 };

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
    if (req.body[f] === undefined) continue;
    const v = typeof req.body[f] === 'string' ? req.body[f].trim() : req.body[f];
    if (typeof v !== 'string' || v.length > FIELD_MAX[f]) return res.status(400).json({ message: `${f}: tối đa ${FIELD_MAX[f]} ký tự` });
    if ((f === 'title' || f === 'artist') && !v) return res.status(400).json({ message: 'Tên bài và nghệ sĩ không được trống' });
    if ((f === 'sourceUrl' || f === 'licenseUrl') && v && !isHttpUrl(v)) return res.status(400).json({ message: `${f} phải là URL http/https` });
    song[f] = v;
  }
  if (song.licenseType && !LICENSE_TYPES.includes(song.licenseType)) {
    return res.status(400).json({ message: 'Giấy phép không hợp lệ' });
  }
  // Album (nhúng trong bài) và lời bài hát — lời có mốc thời gian phải đúng định dạng LRC "[mm:ss.xx] lời".
  const album = albumFields({ albumTitle: req.body.albumTitle, albumYear: req.body.albumYear, trackNo: req.body.trackNo });
  for (const [k, v] of Object.entries(album)) song.set(`album.${k}`, v);
  if (req.body.plainLyrics !== undefined) song.plainLyrics = String(req.body.plainLyrics || '').slice(0, 20000) || undefined;
  if (req.body.syncedLyrics !== undefined) {
    const lrc = String(req.body.syncedLyrics || '').trim();
    if (lrc && !lrc.split('\n').some((l) => /^\[\d{1,2}:\d{2}(\.\d{1,3})?\]/.test(l.trim()))) {
      return res.status(400).json({ message: 'Lời có mốc thời gian phải theo định dạng LRC: [mm:ss.xx] lời' });
    }
    song.syncedLyrics = lrc.slice(0, 40000) || undefined;
  }
  if (req.body.plainLyrics !== undefined || req.body.syncedLyrics !== undefined) {
    song.lyricsSource = 'admin';
    song.lyricsCheckedAt = new Date();
  }
  await song.save();
  if (song.status === 'published') await cacheDel(SONGS_CACHE_KEY);
  res.json(withReview(song));
});

// Sau khi duyệt: chạy chuỗi xử lý bài (pipeline/: thông tin phát hành & ảnh bìa → PSL → chuyển bài →
// HLS) ở TIẾN TRÌNH CON — các bước gọi FFmpeg/Python đồng bộ, chạy trong tiến trình API sẽ chặn mọi
// request khác. Tiến trình con tự ghi từng bước vào PipelineRun (DB), API không cần theo dõi.
// ponytail: chưa có hàng đợi — duyệt dồn nhiều bài cùng lúc sẽ chạy nhiều tiến trình song song; thêm hàng đợi khi cần.
function runApprovalPipeline(songId) {
  const cli = path.join(__dirname, '..', 'pipeline', 'cli.js');
  spawn(process.execPath, [cli, 'approve', `--id=${songId}`, '--trigger=approve'], { stdio: 'ignore', detached: true }).unref();
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

  const processing = song.status === 'published';
  if (processing) runApprovalPipeline(song._id);
  res.json({ ...withReview(song), pipelineStarted: processing });
});

// PATCH /api/songs/:id/cover (multipart: cover) — đổi ảnh bìa một bài. Ảnh cũ bị xoá khỏi R2 nếu không còn bài
// nào dùng chung (ảnh album dùng chung giữa các bài cùng album thì giữ).
const updateSongCover = asyncHandler(async (req, res) => {
  const file = checkCover(req.file);
  if (!file) return res.status(400).json({ message: 'Chọn ảnh bìa' });
  const song = await Song.findById(req.params.id).select(REVIEW_FIELDS);
  if (!song) return res.status(404).json({ message: 'Song not found' });
  const old = song.coverArt;
  song.coverArt = await uploadToR2(file.buffer, `covers/admin/${song._id}-${Date.now().toString(36)}${coverExt(file.mimetype)}`, file.mimetype);
  song.coverSourceUrl = 'admin-upload';
  await song.save();
  const oldKey = keyFromR2Url(old);
  if (oldKey?.startsWith('covers/') && !(await Song.exists({ coverArt: old }))) await deleteFromR2(oldKey).catch(() => {});
  await cacheDel(SONGS_CACHE_KEY);
  res.json(withReview(song));
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
  getReviewQueue, updateSong, reviewSongDecision, updateSongCover,
  runApprovalPipeline, withReview, REVIEW_FIELDS, SONGS_CACHE_KEY,
};
