export type TranslationParams = Record<string, string | number>;

export interface TranslationDict {
  // Navigation & Sidebar
  home: string;
  radio: string;
  library: string;
  recentlyPlayed: string;
  account: string;

  // Common Buttons & Actions
  login: string;
  logout: string;
  search: string;
  close: string;

  // Home Screen
  newReleases: string;
  favoriteArtists: string;
  classicalMasterworks: string;

  // Player & Controls
  play: string;
  pause: string;
  previousTrack: string;
  nextTrack: string;
  rewind10s: string;
  forward10s: string;
  volume: string;
  queue: string;
  historyQueue: string;
  emptyHistory: string;

  // Live Lyrics & Karaoke
  lyrics: string;
  karaokeSync: string;
  instrumentalIntro: string;
  expandFullScreen: string;
  closeLyrics: string;
  loadingLyrics: string;
  noLyricsTitle: string;
  noLyricsDesc: string;

  // Member / Account / Dashboard
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  deleteAccount: string;
  deleteAccountHint: string;
  deleteAccountConfirm: string;
  accountSignInHint: string;
  language: string;
  dateOfBirth: string;
  location: string;
  googleLinkedHint: string;
  nickname: string;
  username: string;
  phoneNumber: string;
  musicTaste: string;
  phonePlaceholder: string;
  devicesSyncing: string;
  workspaceHint: string;
}

export type TranslationKey = keyof TranslationDict;
