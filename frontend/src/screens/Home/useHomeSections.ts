import { useMemo } from 'react';
import { useStore, Song } from '../../store/useStore';
import { GENRE_GROUPS } from '../../utils/genreGroups';
import { isRealCover } from '../../components/CoverArt';
import { byNewest } from '../../utils/songOrder';

// Dữ liệu của Trang chủ, dùng chung cho bản desktop (lưới) và bản điện thoại (kệ ngang).
export type Mix = { key: string; title: string; artists: string; colors: [string, string]; songs: Song[] };

export const hasLyrics = (s: Song) => !!s.lyricsSource;

const MIX_MIN_SONGS = 5;
const MIX_SIZE = 40;

export function useHomeSections(rowCount: number) {
  const songs = useStore((s) => s.songs);
  const historySongs = useStore((s) => s.historySongs);

  return useMemo(() => {
    // Sắp theo mốc thêm vào kho (createdAt), mới nhất trước — mọi kệ "mới" đều dựa vào đây.
    const music = byNewest(songs.filter((s) => s.category !== 'Podcast'));

    // Băng chuyền nổi bật: ưu tiên bài có ảnh bìa thật (kính nổi trên ảnh mới đẹp).
    const withArt = music.filter((s) => isRealCover(s.coverArt));
    const featured = (withArt.length >= 3 ? withArt : music).slice(0, 6);
    const recentlyPlayed = (historySongs?.length ? historySongs : music).slice(0, rowCount);
    // Bỏ qua các bài đã lên băng chuyền nổi bật.
    const newReleases = music.filter((s) => !featured.includes(s)).slice(0, rowCount);
    const withLyrics = music.filter(hasLyrics).slice(0, rowCount);
    const classical = music.filter((s) => GENRE_GROUPS.find((g) => g.key === 'classical')!.match.test(s.genre || ''));
    const classicalPicks = (classical.length ? classical : music).slice(0, rowCount);

    const artistMap = new Map<string, Song>();
    for (const s of music) if (s.artist && !artistMap.has(s.artist)) artistMap.set(s.artist, s);
    const artists = [...artistMap.values()];

    // "Mix" theo nhóm thể loại: đủ bài thì mới thành mix.
    const mixes: Mix[] = GENRE_GROUPS.map((g) => {
      const list = music.filter((s) => g.match.test(s.genre || '')).slice(0, MIX_SIZE);
      const names = [...new Set(list.map((s) => s.artist).filter(Boolean))];
      return {
        key: g.key,
        title: `${g.label} Mix`,
        artists: names.slice(0, 5).join(', ') + (names.length > 5 ? ' và nhiều hơn' : ''),
        colors: g.colors,
        songs: list,
      };
    }).filter((m) => m.songs.length >= MIX_MIN_SONGS);

    return { featured, recentlyPlayed, newReleases, withLyrics, classicalPicks, artists, mixes };
  }, [songs, historySongs, rowCount]);
}
