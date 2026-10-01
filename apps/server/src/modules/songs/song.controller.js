/**
 * =============================================================================
 * SONG CONTROLLER (Song Business Logic & Operations)
 * =============================================================================
 * WHAT IT DOES:
 *    - Manages song catalog: get songs, search by keyword, filter by genre, pagination.
 *    - Creates secure playback tokens and routes audio via CDN (R2 / Cloudflare).
 *    - Handles song uploads: parses ID3 metadata, audio tags, and album cover art.
 *    - Song review: admin publishes or rejects songs, and triggers audio processing.
 *    - Like / unlike songs, and fetches plain and time-synced lyrics (LRC).
 * 
 * WHO CALLS THIS FILE:
 *    - `song.routes.js`: Receives HTTP requests from the client and calls these functions.
 * 
 * WHAT THIS FILE CALLS:
 *    - `song.model.js`: Reads and writes song records in MongoDB.
 *    - `../../pipeline/queue.js`: Adds songs to the background audio processing queue.
 *    - `../../config/redis.js`: Caches song catalog data for fast response.
 * =============================================================================
 */

const path = require('path');
const { PassThrough, pipeline } = require('stream');
const Song = require('./Song');
const User = require('../auth/User');
const PlaybackMetric = require('../metrics/PlaybackMetric');
const asyncHandler = require('../../core/asyncHandler');
const { cacheGet, cacheSet, cacheDel } = require('../../config/redis');
const { findLyrics } = require('./lyricsLookup');
const { mintToken, verifyToken, TTL_SECONDS } = require('hugo-stream');
const { guestMayPlay, GUEST_FREE_SONGS } = require('./guestQuota');
const { playbackSources } = require('./cdnSources');
const { removeSongCompletely } = require('./songRemoval');

const { spawn } = require('child_process');
const {
  uploadToR2, getR2Stream, keyFromR2Url, deleteFromR2,
} = require('../../core/r2');
const { reviewSong, isHttpUrl, LICENSE_TYPES } = require('./songReview');

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

// Cover photo upload: maximum 5 MB, photo only; File name by post + time (Worker cache permanently by key).
const COVER_MAX = 5 * 1024 * 1024;
function checkCover(file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw Object.assign(new Error('Ảnh bìa phải là JPEG, PNG hoặc WebP'), { status: 400 });
  if (file.size > COVER_MAX) throw Object.assign(new Error('Ảnh bìa tối đa 5 MB'), { status: 400 });
  return file;
}
const coverExt = (mime) => ({ 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.jpg');

// Album information is manually imported (individually uploaded articles do not have a release source to look up).
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
  req.file = audio; // The below part uses req.file as before

  const { title, artist, category, genre, licenseType, sourceUrl, licenseUrl, attribution } = req.body;
  if ((title && title.length > 200) || (artist && artist.length > 120)) {
    return res.status(400).json({ message: 'Tên bài tối đa 200 ký tự, nghệ sĩ tối đa 120 ký tự' });
  }
  const album = albumFields(req.body);
  // The copyright level is checked BEFORE the effort of pushing the file to R2: CC/PD post
  // without license and source it can never be played.
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

  // Duplicate existing song (same name + artist, regardless of case): ask again instead of silently creating a copy.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dup = await Song.findOne({ title: new RegExp(`^${esc(parsedTitle)}$`, 'i'), artist: new RegExp(`^${esc(parsedArtist)}$`, 'i') }).select('_id status').lean();
  if (dup && req.body.allowDuplicate !== 'true') {
    return res.status(409).json({ message: `Đã có bài "${parsedTitle}" của ${parsedArtist} trong kho (${dup.status}). Gửi lại với allowDuplicate=true nếu vẫn muốn tải.`, duplicateOf: dup._id });
  }

  // Random suffix: Worker caches immutable files by key, so two
  // Articles with the same name cannot overwrite each other.
  const safeBaseName = `${sanitizeFilename(parsedArtist + '-' + parsedTitle)}-${Date.now().toString(36)}`;
  const audioExt = path.extname(req.file.originalname) || '.mp3';
  const audioKey = `audio/${safeBaseName}${audioExt}`;

  const publicAudioUrl = await uploadToR2(buffer, audioKey, req.file.mimetype);
  let publicCoverUrl = '';

  // Cover image: admin file preferred; If not, get the image embedded in the music file.
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
    status: 'pending', // wait in line; Only visible to listeners after admin approval
    uploadedBy: req.user._id,
    plainLyrics: lyricsResult?.plainLyrics,
    syncedLyrics: lyricsResult?.syncedLyrics,
    lyricsSource: lyricsResult?.lyricsSource,
    lyricsCheckedAt: new Date(),
  });

  res.status(201).json(song);
});

// GET /api/songs — published catalog with optional full-text search, genre filter & pagination.
// - Unfiltered listing (default): Cached in Redis for 60s (SONGS_CACHE_KEY) to protect DB.
// - Filtered / Paginated / Search query: Executes indexed MongoDB query with regex fallback.
const SONGS_CACHE_KEY = 'songs:all';
const SONGS_CACHE_TTL_SECONDS = 60;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getSongs = asyncHandler(async (req, res) => {
  const { q, genre, page, limit, paginate } = req.query;
  const isFiltered = Boolean(q || genre || page || limit);

  // Default path: full catalog with Redis cache-aside (compatible with all existing screens)
  if (!isFiltered) {
    const cached = await cacheGet(SONGS_CACHE_KEY);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const songs = await Song.find({ status: 'published' })
      .select('-plainLyrics -syncedLyrics')
      .sort({ createdAt: -1 });
    res.setHeader('X-Cache', 'MISS');
    await cacheSet(SONGS_CACHE_KEY, songs, SONGS_CACHE_TTL_SECONDS);
    return res.json(songs);
  }

  // Filtered / Search path
  const filter = { status: 'published' };

  if (genre && String(genre).trim()) {
    filter.genre = new RegExp(`^${escapeRegex(String(genre).trim())}$`, 'i');
  }

  if (q && String(q).trim()) {
    const keyword = String(q).trim();
    filter.$or = [
      { title: new RegExp(escapeRegex(keyword), 'i') },
      { artist: new RegExp(escapeRegex(keyword), 'i') },
      { 'album.title': new RegExp(escapeRegex(keyword), 'i') },
      { genre: new RegExp(escapeRegex(keyword), 'i') },
    ];
  }

  const hasPagination = Boolean(page || limit || paginate === 'true');
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  if (hasPagination) {
    const [total, songs] = await Promise.all([
      Song.countDocuments(filter),
      Song.find(filter)
        .select('-plainLyrics -syncedLyrics')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Cache', 'BYPASS');

    if (paginate === 'true' || page) {
      return res.json({
        songs,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      });
    }

    return res.json(songs);
  }

  // Search without pagination parameters -> returns Song[] matching criteria
  const songs = await Song.find(filter)
    .select('-plainLyrics -syncedLyrics')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.setHeader('X-Total-Count', String(songs.length));
  res.setHeader('X-Cache', 'BYPASS');
  res.json(songs);
});

// Count the number of bytes ACTUALLY pushed to the listener, not the file size: user rewind
// or if you quit in the middle, the connection will break early and the rest will never be played
// send. This is the actual bandwidth figure to compare with Source-Aware ABR later.
//
// Returns a counter stream to insert between: R2 -> counter -> res.
//
// Record in 'close' event (always fires, even when client interrupts) instead of 'finish'
// (only shoot when sending completely), otherwise just skips — which is wasteful
// the most useless bandwidth — is omitted from the statistics.
//
// Count the OUTPUT, not the input. If attached to the read stream from R2, then when
// The user quits midway, the data is still read from R2 and is counted as 100% —
// The correct skip, the thing we need to check the most, was wrongly recorded as listening to the entire song.
// Thanks to the backpressure mechanism, this stream only releases data at human speed
// sounds really received.
//
// Do not use socket.bytesWritten because the socket accumulates across all requests
// a keep-alive connection will overcount many times.
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
      // Failure to measure should not damage music playback.
    });
  });

  return counter;
}

// GET /api/songs/:id/playback — the ONLY point that determines who gets to listen how much.
//
// Logged in -> token (original file + HLS). Guest -> same, but only for
// GUEST_FREE_SONGS songs a day, then 401 requiresLogin. The edge worker and the Node proxy
// only verify the signature (hugo-stream); they never decide who may listen.
const getPlaybackToken = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select('filePath hlsPath status');
  // Unpublished songs are playable by admins only (to listen before approving).
  if (!song || (song.status !== 'published' && req.user?.role !== 'admin')) {
    return res.status(404).json({ message: 'Song not found' });
  }

  // Guests play a few full songs, then must sign in (guestQuota.js).
  if (!req.user && !(await guestMayPlay(req.ip, String(song._id)))) {
    return res.status(401).json({
      message: `Đăng nhập để nghe tiếp — khách được nghe ${GUEST_FREE_SONGS} bài mỗi ngày`,
      requiresLogin: true,
    });
  }

  const fileKey = keyFromR2Url(song.filePath);
  const hlsKey = keyFromR2Url(song.hlsPath);
  res.json({
    fileToken: fileKey ? await mintToken(fileKey, process.env.JWT_SECRET) : null,
    hlsToken: hlsKey ? await mintToken(hlsKey, process.env.JWT_SECRET) : null,
    expiresIn: TTL_SECONDS,
    // The same song on every enabled CDN — the client picks and switches CDN (cdnSources.js).
    sources: await playbackSources({ fileKey, hlsKey }),
  });
});

// GET /api/songs/stream/:id?token=... — proxy via Node without a Worker configured
// CDN (and for browsers with ORB errors, see below). Same rules as Worker: no
// has a valid token -> 401.
//
// Don't redirect directly to R2 pre-signed URLs: Chrome blocks that response
// using Opaque Response Blocking because the raw R2 endpoint does not have a CORS header, which
// the web player loads via fetch/XHR rather than a pure <audio> tag.
const streamSong = asyncHandler(async (req, res) => {
  const song = await Song.findById(req.params.id).select('filePath duration');
  if (!song) {
    return res.status(404).json({ message: 'Song not found' });
  }
  const key = keyFromR2Url(song.filePath);
  if (!key || !(await verifyToken(key, req.query.token, process.env.JWT_SECRET))) {
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
  // With a range request, ContentLength is just the length of the segment — the actual size
  // of the entire file is after the "/" in ContentRange.
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
// The newest heart drop is at the top (favorites are pushed in order of heart drop), the discarded card is removed from the inventory
// (populate returns null for no longer id).
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

  // Remove records, all references, and files on R2 (utils/songRemoval.js).
  const { storageCleaned } = await removeSongCompletely(song);
  await cacheDel(SONGS_CACHE_KEY);
  res.json({ message: 'Song deleted', storageCleaned });
});

// ---------- APPROVEMENT QUEUE (admin) ----------
//
// All new articles entering the warehouse are in 'pending' status. Admin listen and edit information if possible
// needed, then approve or reject. The license layer of utils/songReview.js is the gateway
// Hard: If source/license/attribution is missing, it cannot be approved.

const REVIEW_FIELDS = 'title artist coverArt duration category genre sourceUrl license licenseUrl licenseType '
  + 'attribution status reviewNote reviewedAt hlsPath hlsTiers pslLadder filePath createdAt album plainLyrics syncedLyrics';
const EDITABLE_FIELDS = ['title', 'artist', 'category', 'genre', 'sourceUrl', 'licenseUrl', 'licenseType', 'attribution'];
const FIELD_MAX = { title: 200, artist: 120, category: 60, genre: 60, sourceUrl: 500, licenseUrl: 500, attribution: 200 };

const withReview = (song) => ({ ...song.toObject(), review: reviewSong(song) });

// GET /api/songs/admin/queue?status=pending|published|rejected
const getReviewQueue = asyncHandler(async (req, res) => {
  const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const [songs, counts] = await Promise.all([
    // The published repository has more than a thousand articles; admin only needs the latest part.
    Song.find({ status }).select(REVIEW_FIELDS).sort({ createdAt: -1 }).limit(100),
    Song.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    status,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    songs: songs.map(withReview),
  });
});

// PATCH /api/songs/:id — edit song information (to pass review).
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
  // Album (embedded in article) and lyrics — lyrics with timestamps must be in LRC format "[mm:ss.xx] lyrics".
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

const { enqueueSong } = require('../../pipeline/queue');

// After approval: push the article into the processing QUUE (pipeline/queue.js: release information & cover image → PSL → transfer article →
// HLS). Concurrency control queue (default 1) to avoid clogging the server's CPU/RAM when browsing many articles at the same time.
function runApprovalPipeline(songId, options = {}) {
  return enqueueSong(songId, options);
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

// PATCH /api/songs/:id/cover (multipart: cover) — change the cover image of a song. Old photos are deleted from R2 if there are no more posts
// Whichever is shared (album images shared between songs in the same album should be kept).
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
