export interface LanguageMeta {
  code: string;
  name: string;
  nativeName: string;
  direction?: 'ltr' | 'rtl';
}

export type TranslationParams = Record<string, string | number>;

export interface TranslationDict {
  // Navigation & Sidebar
  home: string;
  browse: string;
  radio: string;
  library: string;
  recentlyAdded: string;
  recentlyPlayed: string;
  songs: string;
  favorites: string;
  artists: string;
  albums: string;
  playlists: string;
  allPlaylists: string;
  librarySection: string;
  account: string;
  admin: string;
  genres: string;
  countries: string;

  // Common Buttons & Actions
  login: string;
  logout: string;
  search: string;
  cancel: string;
  create: string;
  listenLive: string;
  partySync: string;
  back: string;
  close: string;
  seeAll: string;

  // Home Screen
  newReleases: string;
  favoriteArtists: string;
  classicalMasterworks: string;
  singAlongWithHugo: string;

  // Browse Screen
  categoryAll: string;
  categoryPodcast: string;
  categoryLiturgical: string;
  categoryInstrumental: string;
  categoryPop: string;
  categoryInternational: string;
  categoryAnthems: string;
  categoryAcoustic: string;
  tracksCount: string;

  // Radio Screen
  radioSubtitle: string;
  featuredLiveBroadcast: string;
  publicStations: string;
  worldRadio: string;
  worldRadioDesc: string;
  tuningIn: string;
  liveNow: string;
  tuneIn: string;
  connecting: string;

  // Library Screen

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
  lyricsBadge: string;

  // Member / Account / Dashboard
  profileTitle: string;
  saveProfile: string;
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  dangerZone: string;
  deleteAccount: string;
  deleteAccountHint: string;
  deleteAccountConfirm: string;
  language: string;
  languageDesc: string;
  additionalInfo: string;
  dateOfBirth: string;
  location: string;
  artistRole: string;
  offlineBannerDesc: string;
  publicStationsDesc: string;
  googleLinkedHint: string;
  explore: string;
  openLibrary: string;
  nickname: string;
  username: string;
  phoneNumber: string;
  musicTaste: string;
  phonePlaceholder: string;
  devicesSyncing: string;
  workspaceHint: string;
  switchLanguage: string;
  moreLanguages: string;
  searchLanguagePlaceholder: string;
}

export type TranslationKey = keyof TranslationDict;
export type Language = string;
