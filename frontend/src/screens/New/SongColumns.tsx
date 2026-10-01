import { useContext } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { Song } from '../../store/useStore';
import { useIsMobile, ContentWidthContext } from '../../utils/responsive';
import { SongRow } from '../../ui/kit';
import { space, GUTTER } from '../../ui/tokens';

// Lưới bài theo CỘT (kiểu "Add These Viral Hits" của Apple Music): mỗi cột `rows` bài, cuộn ngang
// theo từng cột. Điện thoại: một cột gần kín màn hình, hé cột sau để biết còn nữa; desktop: ~3 cột.
export default function SongColumns({ songs, rows = 4, subtitle }: { songs: Song[]; rows?: number; subtitle?: (s: Song) => string }) {
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measured = useContext(ContentWidthContext);
  const inner = (measured ?? width) - GUTTER * 2;
  const col = isMobile ? inner - 28 : Math.max(300, Math.floor((inner - space.lg * 2) / 3));
  const columns: Song[][] = [];
  for (let i = 0; i < songs.length; i += rows) columns.push(songs.slice(i, i + rows));
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={col + space.lg}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.lg }}
    >
      {columns.map((c, i) => (
        <View key={i} style={{ width: col }}>
          {c.map((s, k) => (
            <SongRow key={s._id} song={s} list={songs} last={k === c.length - 1} subtitle={subtitle} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
