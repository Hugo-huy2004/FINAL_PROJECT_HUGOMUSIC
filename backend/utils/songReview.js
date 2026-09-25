// XÉT DUYỆT HAI TẦNG — dùng chung cho hàng chờ duyệt của admin
// (controllers/songController.js) và script kiểm toàn kho (scripts/catalog/reviewCatalog.js).
//
// TẦNG 1 — BẢN QUYỀN (cổng cứng: trượt thì KHÔNG được xuất bản)
//   Nhạc CC và Public Domain đều BẮT BUỘC nêu nguồn + giấy phép + ghi công khi
//   phổ biến lại, nên đây là nghĩa vụ pháp lý chứ không phải tiêu chí "cho đẹp".
//
// TẦNG 2 — CHẤT LƯỢNG SẢN PHẨM (cảnh báo: admin vẫn xuất bản được, nhưng thấy rõ
//   cần sửa gì)
//
// Hai tầng tách bạch vì hệ quả khác nhau: trượt bản quyền là không được phát,
// trượt chất lượng chỉ là cần bổ sung. Gộp chung sẽ chặn nhầm nhạc hợp lệ.

const LICENSE_TYPES = ['public-domain', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nd', 'cc-by-nc-sa', 'cc-by-nc-nd', 'cc-other'];
// Giấy phép cấm tạo bản phái sinh -> không chuyển mã sang HLS (xem scripts/streaming/buildHls.js).
const NO_DERIVATIVE = ['cc-by-nc-nd', 'cc-by-nd'];

// Ảnh mặc định dùng chung khi không tìm được ảnh bìa thật ở nguồn.
const FALLBACK_COVER = /unsplash\.com/i;
// Dấu vết còn sót của tên file: gạch dưới liên tiếp, số thứ tự đầu, đuôi bitrate.
const FILENAME_ARTIFACT = /_{2,}|^\d{1,3}[\s\-_.]|\b(vbr|\d{2,3}kb|kbps)\b/i;

const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+$/i.test(s.trim());

/**
 * @param song  tài liệu Song (hoặc object thường cùng trường)
 * @param ceiling  kết quả kiểm trần nguồn (research/auditSourceCeiling.js), nếu có
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
