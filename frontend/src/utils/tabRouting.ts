export type TabId =
  | 'home'
  | 'search'
  | 'new'
  | 'radio'
  | 'party'
  | 'library'
  | 'recently-added'
  | 'genres'
  | 'countries'
  | 'artists'
  | 'albums'
  | 'songs'
  | 'playlists'
  | 'account'
  ;

export const TAB_SCREENS: Record<TabId, string> = {
  home: 'Home',
  search: 'Search',
  new: 'New',
  radio: 'Radio',
  party: 'Party',
  library: 'Library',
  'recently-added': 'RecentlyAdded',
  genres: 'Genres',
  countries: 'Countries',
  artists: 'Artists',
  albums: 'Albums',
  songs: 'Songs',
  playlists: 'Playlists',
  account: 'Account',
};

