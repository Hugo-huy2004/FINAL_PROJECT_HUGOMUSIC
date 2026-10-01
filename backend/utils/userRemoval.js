const Playlist = require('../models/Playlist');
const PlaybackMetric = require('../models/PlaybackMetric');
const ListeningVote = require('../models/ListeningVote');
const { deleteFromR2, keyFromR2Url } = require('./r2');

// Xoá hẳn một tài khoản — đường DUY NHẤT (người dùng tự xoá, admin xoá): danh sách phát của họ, ảnh đại diện
// trên R2, rồi bản ghi người dùng. Số liệu nghe và phiếu nghe mù được GIỮ nhưng bỏ liên kết với người (ẩn danh)
// — đó là dữ liệu đo của hệ thống (thí nghiệm PSL, thống kê), không phải nội dung cá nhân.
async function removeUserCompletely(user) {
  await Promise.all([
    Playlist.deleteMany({ owner: user._id }),
    PlaybackMetric.updateMany({ user: user._id }, { $unset: { user: 1 } }),
    ListeningVote.updateMany({ user: user._id }, { $unset: { user: 1 } }),
  ]);
  const avatarKey = user.avatarUrl?.startsWith('avatars/') ? user.avatarUrl : keyFromR2Url(user.avatarUrl);
  if (avatarKey?.startsWith('avatars/')) await deleteFromR2(avatarKey).catch(() => {});
  await user.deleteOne();
}

module.exports = { removeUserCompletely };
