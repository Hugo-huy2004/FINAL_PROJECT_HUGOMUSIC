import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { PinnedRow, SongList } from '../../ui/kit';
import { type, space, radius, GUTTER } from '../../ui/tokens';
import type { LibraryTabProps } from './LibraryScreen';
import { Icon } from 'hugo-music';
import { offlineManager, formatBytes } from '../../audio/offlineManager';

// Downloaded: songs stored locally for offline playback. Manage downloads via song action menu ("...").
export default function DownloadedTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const offline = useStore((s) => s.offlineSongs);
  const playSong = useStore((s) => s.playSong);
  const shufflePlay = useStore((s) => s.shufflePlay);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  useEffect(() => {
    offlineManager.getTotalOfflineSize().then(setTotalBytes);
  }, [offline.length]);

  const handleClearAll = () => {
    Alert.alert(
      'Xoá tất cả bài đã tải',
      'Bạn có chắc chắn muốn xoá toàn bộ bài hát đã tải về máy để giải phóng dung lượng không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá tất cả',
          style: 'destructive',
          onPress: async () => {
            await offlineManager.clearAllOffline();
            useStore.getState().loadOfflineSongs();
            setTotalBytes(0);
          },
        },
      ]
    );
  };

  const storageInfo = totalBytes > 0 ? ` (${formatBytes(totalBytes)})` : '';

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
      {header}
      <View style={styles.pad}>
        <PinnedRow
          icon="cloud-offline"
          colors={['#64D2FF', '#5E5CE6']}
          title={`${offline.length} bài trên máy${storageInfo}`}
          subtitle={offline.length ? 'Nghe được cả khi không có mạng.' : 'Bấm "…" ở một bài → "Tải về" để nghe khi mất mạng.'}
        />
        {offline.length > 0 && (
          <View style={styles.actions}>
            <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => playSong(offline[0], offline)} accessibilityRole="button">
              <Icon name="play" size={18} color={colors.accent} />
              <Text style={[type.headline, { color: colors.accent }]}>Phát</Text>
            </Pressable>
            <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => shufflePlay(offline)} accessibilityRole="button">
              <Icon name="shuffle" size={18} color={colors.accent} />
              <Text style={[type.headline, { color: colors.accent }]}>Trộn bài</Text>
            </Pressable>
            <Pressable style={[styles.actionSquare, { backgroundColor: colors.fill }]} onPress={handleClearAll} accessibilityRole="button" accessibilityLabel="Xoá tất cả bài đã tải">
              <Icon name="trash-outline" size={18} color="#FF453A" />
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
  actionSquare: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
