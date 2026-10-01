import { useContext } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile, ContentWidthContext } from '../../utils/responsive';
import { PinnedRow, GradientTile } from '../../ui/kit';
import { type, space, GUTTER } from '../../ui/tokens';
import { useHomeSections } from '../Home/useHomeSections';
import type { LibraryTabProps } from './LibraryScreen';

// Dành cho bạn: mix trộn từ chính bài bạn đã thả tim (luôn ghim đầu) + các mix theo thể loại.
export default function MadeForYouTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measured = useContext(ContentWidthContext);
  const likedSongs = useStore((s) => s.likedSongs);
  const shufflePlay = useStore((s) => s.shufflePlay);
  const playSong = useStore((s) => s.playSong);
  const { mixes } = useHomeSections(12);

  const inner = (measured ?? width) - GUTTER * 2;
  const columns = isMobile ? 2 : Math.max(3, Math.floor((inner + space.md) / (220 + space.md)));
  const tile = Math.floor((inner - space.md * (columns - 1)) / columns);

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      {header}
      <View style={styles.pad}>
        <PinnedRow
          icon="heart-circle"
          colors={['#FF375F', '#FF9F0A']}
          title="Mix bài bạn thích"
          subtitle={likedSongs.length ? `Trộn ngẫu nhiên ${likedSongs.length} bài bạn đã thả tim` : 'Thả tim vài bài để có mix của riêng bạn.'}
          onPress={likedSongs.length ? () => shufflePlay(likedSongs) : undefined}
        />
        <Text style={[type.title3, { color: colors.text, marginTop: space.xxl, marginBottom: space.md }]}>Mix theo thể loại</Text>
        <View style={styles.grid}>
          {mixes.map((mix) => (
            <GradientTile
              key={mix.key}
              icon="shuffle"
              title={mix.title}
              subtitle={mix.artists}
              colors={mix.colors}
              width={tile}
              height={tile * 1.1}
              label={`Phát ${mix.title}`}
              onPress={() => playSong(mix.songs[0], mix.songs)}
            />
          ))}
        </View>
      </View>
    </ChromeScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
});
