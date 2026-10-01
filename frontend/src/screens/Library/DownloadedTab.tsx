import { View, Text, StyleSheet, Pressable } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { PinnedRow, SongList } from '../../ui/kit';
import { type, space, radius, GUTTER } from '../../ui/tokens';
import type { LibraryTabProps } from './LibraryScreen';

// Đã tải về: bài lưu trên máy, nghe được khi mất mạng. Xoá bản tải về ở menu "…" của từng bài.
export default function DownloadedTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const offline = useStore((s) => s.offlineSongs);
  const playSong = useStore((s) => s.playSong);
  const shufflePlay = useStore((s) => s.shufflePlay);
  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      {header}
      <View style={styles.pad}>
        <PinnedRow
          icon="cloud-offline"
          colors={['#64D2FF', '#5E5CE6']}
          title={`${offline.length} bài trên máy`}
          subtitle={offline.length ? 'Nghe được cả khi không có mạng.' : 'Bấm "…" ở một bài → "Tải về" để nghe khi mất mạng.'}
        />
        {offline.length > 0 && (
          <View style={styles.actions}>
            <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => playSong(offline[0], offline)} accessibilityRole="button">
              <Ionicons name="play" size={18} color={colors.accent} />
              <Text style={[type.headline, { color: colors.accent }]}>Phát</Text>
            </Pressable>
            <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => shufflePlay(offline)} accessibilityRole="button">
              <Ionicons name="shuffle" size={18} color={colors.accent} />
              <Text style={[type.headline, { color: colors.accent }]}>Trộn bài</Text>
            </Pressable>
          </View>
        )}
        <SongList songs={offline} />
      </View>
    </ChromeScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  actions: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.md },
});
