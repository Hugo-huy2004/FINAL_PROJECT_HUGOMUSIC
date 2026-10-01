// Nơi đến chính — giống thanh tab Apple Music trên iOS:
//   home    — Trang chủ: cá nhân hoá (mix cho bạn, nghe gần đây, đài cho bạn...)
//   new     — Mới: nổi bật, mới phát hành, mới theo thể loại
//   radio   — Radio: Đài Hugo 24/7 + đài trực tuyến
//   library — Thư viện: danh sách mục (Danh sách phát, Nghệ sĩ, Album, Dành cho bạn, Bài hát,
//             Đã tải về, Phòng nghe chung), bấm vào là vào trang của mục
//   search  — nút tìm kiếm tròn cạnh thanh tab (gồm duyệt thể loại/danh mục/quốc gia)
//   account — mở từ avatar
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

// Đường dẫn/tên tab cũ vẫn mở đúng chỗ.
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
