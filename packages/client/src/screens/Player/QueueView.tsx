import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useStore } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import { Icon } from 'hugo-music';

// Queue: songs after the currently playing song; Tap to jump forward.
// On Apple Music iOS 17, the Shuffle and Repeat button is right at the top of the Up Next list.
export default function QueueView() {
  const queue = useStore((s) => s.queue);
  const queueIndex = useStore((s) => s.queueIndex);
  const playSong = useStore((s) => s.playSong);
  const liveRoom = useStore((s) => s.liveRoom);
  const shuffle = useStore((s) => s.shuffle);
  const repeat = useStore((s) => s.repeat);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const cycleRepeat = useStore((s) => s.cycleRepeat);
  const upcoming = queue.slice(queueIndex + 1);

  if (liveRoom) return <Text style={styles.empty}>Trong phòng nghe chung, đài quyết định bài tiếp theo.</Text>;

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Tiếp theo</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.headerBtn, shuffle && styles.headerBtnActive]}
            onPress={toggleShuffle}
            accessibilityRole="button"
            accessibilityLabel="Trộn bài"
          >
            <Icon name="shuffle" size={18} color={shuffle ? '#000000' : '#FFFFFF'} />
          </Pressable>
          <Pressable
            style={[styles.headerBtn, repeat !== 'off' && styles.headerBtnActive]}
            onPress={cycleRepeat}
            accessibilityRole="button"
            accessibilityLabel="Lặp lại"
          >
            <Icon name="repeat" size={18} color={repeat !== 'off' ? '#000000' : '#FFFFFF'} />
            {repeat === 'one' && <Text style={styles.repeatBadge}>1</Text>}
          </Pressable>
        </View>
      </View>

      {!upcoming.length ? (
        <Text style={styles.empty}>Không còn bài nào trong hàng chờ.</Text>
      ) : (
        upcoming.map((song) => (
          <Pressable
            key={song._id}
            onPress={() => playSong(song, queue)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
            accessibilityRole="button"
            accessibilityLabel={`Phát ${song.title}`}
          >
            <CoverArt uri={song.coverArt} title={song.title} size={44} radius={8} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
              <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  heading: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  headerBtnActive: { backgroundColor: '#FFFFFF' },
  repeatBadge: { position: 'absolute', right: 4, bottom: 2, fontSize: 9, fontWeight: '800', color: '#000' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' },
  artist: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
