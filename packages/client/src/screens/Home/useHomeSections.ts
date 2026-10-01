import { useMemo } from 'react';
import { useStore, Song } from '../../store/useStore';
import { useGenreGroups, useGroupLabel } from '../../lib/meta';
import { isRealCover } from '../../components/CoverArt';
import { byNewest } from '../../lib/songOrder';

// Home page data, shared for desktop version (grid) and mobile version (horizontal shelf).
export type Mix = { key: string; title: string; artists: string; colors: [string, string]; songs: Song[] };

export const hasLyrics = (s: Song) => !!s.lyricsSource;

const MIX_MIN_SONGS = 5;
const MIX_SIZE = 40;

export function useHomeSections(rowCount: number) {
  const songs = useStore((s) => s.songs);
  const historySongs = useStore((s) => s.historySongs);
  const groups = useGenreGroups();
  const groupLabel = useGroupLabel();

  return useMemo(() => {
    // Sort by createdAt, newest first — all "new" shelves are based on this.
    const music = byNewest(songs.filter((s) => s.category !== 'Podcast'));

    // Featured carousel: Prioritize articles with real cover photos (embossed glass on beautiful new photos).
    const withArt = music.filter((s) => isRealCover(s.coverArt));
    const featured = (withArt.length >= 3 ? withArt : music).slice(0, 6);
    const recentlyPlayed = (historySongs?.length ? historySongs : music).slice(0, rowCount);
    // Ignore articles that are already on the featured carousel.
    const newReleases = music.filter((s) => !featured.includes(s)).slice(0, rowCount);
    const withLyrics = music.filter(hasLyrics).slice(0, rowCount);
    const classicalRule = groups.find((g) => g.key === 'classical')?.match;
    const classical = classicalRule ? music.filter((s) => classicalRule.test(s.genre || '')) : [];
    const classicalPicks = (classical.length ? classical : music).slice(0, rowCount);

    const artistMap = new Map<string, Song>();
    for (const s of music) if (s.artist && !artistMap.has(s.artist)) artistMap.set(s.artist, s);
    const artists = [...artistMap.values()];

    // "Mix" according to genre groups: enough songs make it a mix.
    const mixes: Mix[] = groups.map((g) => {
      const list = music.filter((s) => g.match.test(s.genre || '')).slice(0, MIX_SIZE);
      const names = [...new Set(list.map((s) => s.artist).filter(Boolean))];
      return {
        key: g.key,
        title: `${groupLabel(g)} Mix`,
        artists: names.slice(0, 5).join(', ') + (names.length > 5 ? ' và nhiều hơn' : ''),
        colors: g.colors,
        songs: list,
      };
    }).filter((m) => m.songs.length >= MIX_MIN_SONGS);

    return { featured, recentlyPlayed, newReleases, withLyrics, classicalPicks, artists, mixes };
  }, [songs, historySongs, rowCount, groups, groupLabel]);
}
