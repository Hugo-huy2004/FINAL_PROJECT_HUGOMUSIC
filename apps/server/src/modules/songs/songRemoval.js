const Song = require('./Song');
const User = require('../auth/User');
const Playlist = require('../playlists/Playlist');
const ListeningRoom = require('../rooms/ListeningRoom');
const { deleteFromR2, deletePrefixFromR2, keyFromR2Url } = require('../../core/r2');

// Completely remove a post from the system — the ONLY way (admin clicks delete, script to remove post violates copyright):
// 1. delete the record + all references (playlists, liked songs, songs chosen by the admin for the listening room);
// 2. Clean up files on R2: original audio, HLS folder, cover art if there are no more shared songs.
// Orphaned files both take up space and can still be played with old tokens — so they have to be cleaned up. Cleanup error R2 does not damage
// removal from the repository (the article can no longer be played via API), just report it to clean up later.
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
    // Cover art can be used for the entire album — only delete when there are no more songs pointing to it.
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
