const Playlist = require('../playlists/Playlist');
const PlaybackMetric = require('../metrics/PlaybackMetric');
const ListeningVote = require('../rooms/ListeningVote');
const { deleteFromR2, keyFromR2Url } = require('../../core/r2');

// Completely delete an account — ONLY way (user deletes, admin deletes): their playlist, profile picture
// on R2, then user records. Listening data and blind listening reports are KEPT but unlinked to (anonymous) people.
// — it's system measurement data (PSL experiments, statistics), not individual content.
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
