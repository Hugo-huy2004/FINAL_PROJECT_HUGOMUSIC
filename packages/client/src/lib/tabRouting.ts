// Primary destination — similar to the Apple Music tab bar on iOS:
// home — Home: personalization (mixes for you, recent listens, stations for you...)
// new — New: featured, newly released, new by genre
// radio — Radio: Radio Hugo 24/7 + online station
// library — Library: list items (Playlists, Artists, Albums, For you, Songs,
// Downloaded, General Listening Room), click to go to the section's page
// search — circular search button next to the tab bar (includes genre/category/country browsing)
// account — opens from avatar
export type TabId = 'home' | 'new' | 'radio' | 'library' | 'search' | 'account';

export type LibrarySection = 'playlists' | 'artists' | 'albums' | 'made-for-you' | 'songs' | 'downloaded' | 'party';
export const LIBRARY_SECTIONS: LibrarySection[] = ['playlists', 'artists', 'albums', 'made-for-you', 'songs', 'downloaded', 'party'];

export const TAB_SCREENS: Record<TabId, string> = {
  home: 'Home',
  new: 'New',
  radio: 'Radio',
  library: 'Library',
  search: 'Search',
  account: 'Account',
};

// The old path/tab name still opens in the right place.
const LEGACY: Record<string, TabId> = {
  'recently-added': 'new',
  genres: 'search',
  countries: 'search',
};

export function resolveTab(id: string): { tab: TabId; section?: LibrarySection } {
  if (LIBRARY_SECTIONS.includes(id as LibrarySection)) return { tab: 'library', section: id as LibrarySection };
  if (id in TAB_SCREENS) return { tab: id as TabId };
  return { tab: LEGACY[id] ?? 'home' };
}
