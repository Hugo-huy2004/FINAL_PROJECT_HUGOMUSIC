// TWO-LAYER APPROVAL — used for admin approval queue
// (controllers/songController.js) and full inventory review script (scripts/catalog/reviewCatalog.js).
//
// FLOOR 1 — COPYRIGHT (hard gate: sliding will NOT be published)
// CC and Public Domain music are REQUIRED to state source + license + attribution when
// re-popularized, so this is a legal obligation, not a "beauty" criterion.
//
// FLOOR 2 — PRODUCT QUALITY (warning: admin can still publish, but it's obvious
// what needs to be fixed)
//
// The two levels are separate because of different consequences: copyright failure means not being released,
// Quality slippage is just in need of supplementation. Merging them together will mistakenly block valid music.

const LICENSE_TYPES = Object.keys(require('../meta/taxonomy').LICENSES);
// The license prohibits creating derivatives -> does not port code to HLS (see pipeline/jobs/HlsJob.js).
const NO_DERIVATIVE = ['cc-by-nc-nd', 'cc-by-nd'];

// The default image is shared when the actual cover image cannot be found at the source.
const FALLBACK_COVER = /unsplash\.com/i;
// Remaining traces of the file name: consecutive underscores, starting number, bitrate ending.
const FILENAME_ARTIFACT = /_{2,}|^\d{1,3}[\s\-_.]|\b(vbr|\d{2,3}kb|kbps)\b/i;

const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());

/**
 * @param song Song document (or object often in the same field)
 * @param ceiling source ceiling audit results (research/auditSourceCeiling.js), if any
 */
function reviewSong(song, { ceiling } = {}) {
  const copyright = [];
  if (!isHttpUrl(song.sourceUrl)) copyright.push('không có nguồn');
  if (!LICENSE_TYPES.includes(song.licenseType)) copyright.push('không có giấy phép');
  if (!song.attribution) copyright.push('không ghi công tác giả');

  const quality = [];
  if (ceiling?.verdict === 'REFETCH') {
    quality.push(`nguồn có bản tốt hơn (${ceiling.currentKbps} -> ${ceiling.bestKbps} kbps)`);
  }
  if (!song.coverArt || FALLBACK_COVER.test(song.coverArt)) quality.push('ảnh bìa mặc định');
  if (!song.genre) quality.push('chưa có thể loại');
  if (!song.duration) quality.push('chưa có thời lượng');
  if (FILENAME_ARTIFACT.test(song.title || '') || FILENAME_ARTIFACT.test(song.artist || '')) {
    quality.push('tên còn dấu vết tên file');
  }

  return {
    copyright: { pass: copyright.length === 0, issues: copyright },
    quality: { pass: quality.length === 0, issues: quality },
  };
}

module.exports = { reviewSong, isHttpUrl, LICENSE_TYPES, NO_DERIVATIVE };

if (require.main === module) {
  const assert = require('assert');
  const ok = {
    title: 'Glass Waltz', artist: 'Kevin', sourceUrl: 'https://archive.org/details/x',
    licenseType: 'cc-by', attribution: 'Kevin', coverArt: 'https://cdn/x.jpg', genre: 'Jazz', duration: 200,
  };
  assert.deepStrictEqual(reviewSong(ok), { copyright: { pass: true, issues: [] }, quality: { pass: true, issues: [] } });
  assert.strictEqual(reviewSong({ ...ok, sourceUrl: 'archive.org/x' }).copyright.pass, false, 'source must be a URL');
  assert.strictEqual(reviewSong({ ...ok, licenseType: 'mit' }).copyright.pass, false, 'unknown license');
  const q = reviewSong({ ...ok, title: '01 - track_128kbps', genre: undefined });
  assert.strictEqual(q.copyright.pass, true, 'quality issues never block copyright');
  assert.deepStrictEqual(q.quality.issues, ['chưa có thể loại', 'tên còn dấu vết tên file']);
  console.log('songReview self-check: ok');
}
