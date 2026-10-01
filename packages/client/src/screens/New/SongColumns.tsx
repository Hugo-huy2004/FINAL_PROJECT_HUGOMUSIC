import { useContext } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { Song } from '../../store/useStore';
import { useIsMobile, ContentWidthContext } from '../../lib/responsive';
import { SongRow } from '../../ui/kit';
import { space, GUTTER } from '../../ui/tokens';

// COLUMN grid of songs (Apple Music's "Add These Viral Hits" style): each column `rows` songs, scrolling horizontally
// by each column. Phone: one column almost covers the screen, open the back column to see what's more; desktop: ~3 columns.
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
