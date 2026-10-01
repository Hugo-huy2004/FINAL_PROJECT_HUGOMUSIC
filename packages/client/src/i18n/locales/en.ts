import { TranslationDict } from '../types';

export const en: TranslationDict = {
  // Navigation & Sidebar
  home: 'Home',
  radio: 'Radio',
  library: 'Library',
  recentlyPlayed: 'Recently Played',
  account: 'My Account',

  // Common Buttons & Actions
  login: 'Sign In',
  logout: 'Sign Out',
  search: 'Search',
  close: 'Close',

  // Home Screen
  newReleases: 'New Releases',
  favoriteArtists: 'Favorite Artists',
  classicalMasterworks: 'Classical & Masterworks',

  // Player & Controls
  play: 'Play',
  pause: 'Pause',
  previousTrack: 'Previous Track',
  nextTrack: 'Next Track',
  rewind10s: 'Rewind 10 seconds',
  forward10s: 'Forward 10 seconds',
  volume: 'Volume',
  queue: 'Queue',
  historyQueue: 'History & Queue',
  emptyHistory: 'No songs in the history list',

  // Live Lyrics & Karaoke
  lyrics: 'Lyrics',
  karaokeSync: 'Karaoke Sync',
  instrumentalIntro: '♫ Intro',
  expandFullScreen: 'Expand Full Screen',
  closeLyrics: 'Close Lyrics',
  loadingLyrics: 'Loading lyrics...',
  noLyricsTitle: 'No lyrics available for this song',
  noLyricsDesc: 'Lyrics for "{title}" are not yet synchronized in our database.',

  // Member / Account / Dashboard
  changePassword: 'Change Password',
  currentPassword: 'Current Password',
  newPassword: 'New Password (min 6 chars)',
  deleteAccount: 'Delete Account',
  deleteAccountHint: 'Permanently delete your account and playlists. This cannot be undone.',
  deleteAccountConfirm: 'Are you sure you want to delete your account? This cannot be undone.',
  accountSignInHint: 'Sign in to see your profile, playlists and playback settings.',
  language: 'Language',
  dateOfBirth: 'Date of Birth',
  location: 'Location',
  googleLinkedHint: 'Signed in with Google — password changes are handled by Google.',
  nickname: 'Display Nickname',
  username: 'Username',
  phoneNumber: 'Phone Number',
  musicTaste: 'Favorite Music Genres',
  phonePlaceholder: 'None yet — can be used to sign in instead of email',
  devicesSyncing: '{count} devices currently syncing',
  workspaceHint: 'All devices signed in with the same account automatically sync playback rhythm — no room code needed.',
};
