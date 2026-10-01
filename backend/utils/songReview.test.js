const assert = require('assert');
const { reviewSong } = require('./songReview');

const okSong = {
  title: 'Glass Waltz',
  artist: 'Kevin',
  sourceUrl: 'https://archive.org/details/x',
  licenseType: 'cc-by',
  attribution: 'Kevin',
  coverArt: 'https://cdn/x.jpg',
  genre: 'Jazz',
  duration: 200,
};

// 1. Valid song passes all checks
assert.deepStrictEqual(reviewSong(okSong), {
  copyright: { pass: true, issues: [] },
  quality: { pass: true, issues: [] },
});

// 2. Invalid source URL fails copyright gate
assert.strictEqual(
  reviewSong({ ...okSong, sourceUrl: 'archive.org/x' }).copyright.pass,
  false,
  'source must be a valid HTTP URL'
);

// 3. Unknown license type fails copyright gate
assert.strictEqual(
  reviewSong({ ...okSong, licenseType: 'mit' }).copyright.pass,
  false,
  'license must be in approved LICENSE_TYPES'
);

// 4. Quality issues (artifacts in title, missing genre) do NOT block copyright pass
const q = reviewSong({ ...okSong, title: '01 - track_128kbps', genre: undefined });
assert.strictEqual(q.copyright.pass, true, 'quality issues never block copyright');
assert.deepStrictEqual(q.quality.issues, ['chưa có thể loại', 'tên còn dấu vết tên file']);

// 5. Fallback cover art triggers quality issue
const fallbackCoverSong = reviewSong({ ...okSong, coverArt: 'https://images.unsplash.com/photo-123' });
assert.strictEqual(fallbackCoverSong.quality.pass, false);
assert.ok(fallbackCoverSong.quality.issues.includes('ảnh bìa mặc định'));

console.log('✓ backend/utils/songReview.test.js passed');
