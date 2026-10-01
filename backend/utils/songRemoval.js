const Song = require('../models/Song');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const ListeningRoom = require('../models/ListeningRoom');
const { deleteFromR2, deletePrefixFromR2, keyFromR2Url } = require('./r2');

// Gỡ hẳn một bài khỏi hệ thống — đường DUY NHẤT (admin bấm xoá, script gỡ bài vi phạm bản quyền):
//   1. xoá bản ghi + mọi tham chiếu (danh sách phát, bài đã thích, bài admin chọn cho phòng nghe);
//   2. dọn tệp trên R2: audio gốc, cả thư mục HLS, ảnh bìa nếu không còn bài nào dùng chung.
// Tệp mồ côi vừa tốn chỗ vừa còn phát được bằng token cũ — nên phải dọn. Lỗi dọn R2 không làm hỏng
// việc gỡ khỏi kho (bài đã không còn phát được qua API), chỉ báo lại để chạy dọn sau.
async function removeSongCompletely(song) {
  await song.deleteOne();
  await Promise.all([
    Playlist.updateMany({ songs: song._id }, { $pull: { songs: song._id } }),
    User.updateMany({ favorites: song._id }, { $pull: { favorites: song._id } }),
    ListeningRoom.updateMany({ pinned: song._id }, { $pull: { pinned: song._id } }),
  ]);
  const removed = [];
  try {
    const audioKey = keyFromR2Url(song.filePath);
    if (audioKey) { await deleteFromR2(audioKey); removed.push(audioKey); }
    await deletePrefixFromR2(`hls/${song._id}/`);
    removed.push(`hls/${song._id}/`);
    // Ảnh bìa có thể dùng chung cho cả album — chỉ xoá khi không còn bài nào trỏ tới.
    const coverKey = keyFromR2Url(song.coverArt);
    if (coverKey?.startsWith('covers/') && !(await Song.exists({ coverArt: song.coverArt }))) {
      await deleteFromR2(coverKey);
      removed.push(coverKey);
    }
    return { storageCleaned: true, removed };
  } catch (err) {
    console.warn(`Không dọn được R2 cho bài ${song._id}: ${err.message}`);
    return { storageCleaned: false, removed, error: err.message };
  }
}

module.exports = { removeSongCompletely };
