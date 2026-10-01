import { Song } from '../../store/useStore';

// Common post grouping for Library pages (and for "your" sections — same function, just different inputs:
// The whole store or the article has dropped hearts). Album = REAL RELEASE (song.album, from source item), no speculation.
export type Collection = {
  key: string; title: string; subtitle: string; cover?: string; songs: Song[];
  year?: number; kind?: string; color?: string; description?: string; genre?: string;
  addedAt?: number; // when the latest post of the episode is added to the repository (ms) — for "newly released"
};

const group = (songs: Song[], keyOf: (s: Song) => string | null, make: (s: Song, key: string) => Omit<Collection, 'songs'>) => {
  const map = new Map<string, Collection>();
  for (const s of songs) {
    const key = keyOf(s);
    if (!key) continue;
    const c = map.get(key) ?? { ...make(s, key), songs: [] };
    if (!c.cover && s.coverArt) c.cover = s.coverArt;
    if (!c.color && s.coverColor) c.color = s.coverColor;
    c.addedAt = Math.max(c.addedAt ?? 0, Date.parse(s.createdAt || '') || 0);
    c.songs.push(s);
    map.set(key, c);
  }
  return [...map.values()];
};

export const artistsOf = (songs: Song[]) =>
  group(songs, (s) => s.artist || null, (s, key) => ({ key, title: s.artist, subtitle: '' }))
    .map((c) => ({ ...c, subtitle: `${c.songs.length} bài` }))
    .sort((a, b) => b.songs.length - a.songs.length);

// Type a release by its ORIGINAL NUMBER OF TRACKS (Apple Music convention): 1–3 tracks = single, 4–6 = EP, ≥ 7 = album.
function releaseKind(trackCount?: number) {
  if (!trackCount) return 'ALBUM';
  if (trackCount <= 3) return 'ĐĨA ĐƠN';
  if (trackCount <= 6) return 'EP';
  return 'ALBUM';
}

const byTrack = (a: Song, b: Song) => (a.album?.trackNo ?? 999) - (b.album?.trackNo ?? 999) || a.title.localeCompare(b.title);
const firstGenre = (g?: string) => g?.split(/[;,/]/)[0].trim() || undefined;

export const albumsOf = (songs: Song[]) =>
  group(
    songs,
    (s) => s.album?.sourceId ?? null,
    (s, key) => ({
      key,
      title: s.album!.title,
      subtitle: s.album!.artist || s.artist,
      year: s.album!.year,
      kind: releaseKind(s.album!.trackCount),
      description: s.album!.description,
      genre: firstGenre(s.genre),
    }),
  )
    .map((c) => ({ ...c, songs: [...c.songs].sort(byTrack) }))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));

// New releases are added to the repository first (according to the actual add date, not the original release year).
export const releasesByNewest = (songs: Song[]) => [...albumsOf(songs)].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
