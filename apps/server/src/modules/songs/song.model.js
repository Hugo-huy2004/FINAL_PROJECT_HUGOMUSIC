/**
 * =============================================================================
 * SONG MODEL (Song Database Schema — Mongoose)
 * =============================================================================
 * WHAT IT DOES:
 *    - Defines how a song is stored in MongoDB:
 *        + Basic info: title, artist, audioUrl, coverUrl, duration
 *        + Acoustic data: bpm, key, outroStart, transition (for DJ Autoplay)
 *        + Music licensing: licenseType, sourceUrl, attribution
 *        + Compound text search index for fast keyword search.
 * 
 * WHO CALLS THIS FILE:
 *    - `song.controller.js`: Calls `Song.find()`, `Song.create()`, `Song.findById()`
 * =============================================================================
 */

const mongoose = require('mongoose');
const { LICENSE_TYPES } = require('./songReview');

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  filePath: { type: String, required: true },
  coverArt: { type: String },
  // Cover image taken from the source item itself (eg archive.org) — original link for attribution (pipeline/jobs/ReleaseJob.js).
  coverSourceUrl: { type: String },
  // REAL release containing tracks (album/EP/single) — read from source item (pipeline/jobs/ReleaseJob.js),
  // do not extrapolate from the list. trackCount = original song number of the release (app calls ALBUM/EP/SINGLE accordingly).
  album: {
    version: Number,
    sourceId: String,
    title: String,
    artist: String,
    year: Number,
    trackCount: Number,
    trackNo: Number,
    description: String, // release description from source (plain text)
    fetchedAt: Date,
  },
  // Global release popularity (archive.org downloads) — ranking (pipeline/jobs/GlobalStatsJob.js).
  globalStats: {
    total: Number,
    week: Number,
    month: Number,
    source: String,
    fetchedAt: Date,
  },
  // Cover main color (#rrggbb) — the album/player page has its background colored (ReleaseJob).
  coverColor: { type: String },
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
  // Original file code on Internet Archive, only available in articles of the original restocking.
  // research/auditSourceCeiling.js uses it to find a higher quality version at the source.
  externalId: { type: String, unique: true, sparse: true },
  sourceUrl: { type: String },
  license: { type: String },
  licenseUrl: { type: String },
  // Master multi-tier HLS playlist (pipeline/jobs/HlsJob.js). The article carries ND license
  // This field is absent because derivative creation is prohibited — the client plays the original file.
  hlsPath: { type: String },
  hlsTiers: [{ type: String }],
  // Tier scale measured by PSL (pipeline/jobs/PslJob.js, docs/PSL_TECHNIQUE.md).
  // Inferring from the perceived quality saturation point of this OWN article, it is not
  // A fixed scale applies to the entire warehouse — because the quality of sources within the warehouse varies
  // up to ~11 times. HlsJob reads this field to know which tiers to build.
  pslLadder: [{ type: Number }],       // for example [64, 96, 128, 192]
  pslMos: { type: Object },            // MOS-LQO points for each tier, to check again
  pslTau: { type: Number },            // threshold used, for comparison between measurements
  pslMeasuredAt: { type: Date },
  // Codec used when measuring. Only results measured with the correct HLS codec ('aac') will be used;
  // Old measurements by MP3 are considered unmeasured and will be re-measured.
  pslCodec: { type: String },
  // Seamless transfer data (pipeline/jobs/TransitionJob.js) — calculated once at a time
  // Review the song: cut beginning/ending silence, loudness (volume balance), intro/outro, rhythm + beats.
  transition: {
    version: Number,
    trimStart: Number,
    trimEnd: Number,
    introEnd: Number,
    outroStart: Number,
    lufs: Number,
    truePeak: Number,
    bpm: Number,
    beatOffset: Number,
    beatConfidence: Number,
    analyzedAt: Date,
  },
  // Specific license — required for admin uploads (see utils/songReview.js).
  // The string `license` is just a description for the reader; This field is only used for filtering/checking.
  licenseType: { type: String, enum: LICENSE_TYPES },
  attribution: { type: String },
  // Waiting queue: all new articles entering the warehouse are 'pending' until the admin approves.
  // Only 'published' will be visible to the listener and will be given a broadcast token.
  // The license layer (utils/songReview.js) is the hard gate of the review step.
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

// Compound text index for high-performance server-side search
songSchema.index({
  title: 'text',
  artist: 'text',
  'album.title': 'text',
  genre: 'text',
  category: 'text',
}, {
  weights: {
    title: 10,
    artist: 8,
    'album.title': 5,
    genre: 3,
    category: 2,
  },
  name: 'SongTextSearchIndex',
});
songSchema.index({ createdAt: -1 });
songSchema.index({ likesCount: -1 });

const Song = mongoose.model('Song', songSchema);
module.exports = Song;
