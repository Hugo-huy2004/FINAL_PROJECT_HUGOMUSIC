import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AppTextField from '../../ui/native/AppTextField';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme, ThemeColors } from '../../theme/theme';
import { useIsMobile } from '../../utils/responsive';
import { formatTime } from '../../utils/format';
import { useRooms, leaveRoom, suggestSong, voteEntry, removeEntry } from '../../rooms/useRooms';
import { serverNow } from '../../rooms/serverClock';
import CoverArt from '../../components/CoverArt';
import { LinearGradient } from 'expo-linear-gradient';
import { DropletPressable } from '../../ui/kit';

// Trong một kênh 24/7 của Hugo: đang phát (theo đồng hồ kênh), hàng chờ bầu chọn + đề xuất bài (nếu kênh
// cho phép), người đang nghe.
export default function StationView() {
  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const station = useRooms((s) => s.station);
  const user = useStore((s) => s.user);
  const isPlaying = useStore((s) => s.isPlaying);
  const togglePlay = useStore((s) => s.togglePlay);
  const songs = useStore((s) => s.songs);
  const [clock, setClock] = useState(serverNow());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(serverNow()), 500);
    return () => clearInterval(t);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return songs
      .filter((s) => (s.duration || 0) > 30 && `${s.title} ${s.artist}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, songs]);

  const styles = makeStyles(colors);
  if (!station) return <View style={{ flex: 1 }} />;

  const now = station.now;
  const elapsed = now ? Math.min(now.song.duration, Math.max(0, (clock - now.startedAt) / 1000)) : 0;
  const starting = now ? clock < now.startedAt : false;
  const queue = [...station.queue].sort((a, b) => b.votes - a.votes); // server giữ thứ tự đề xuất khi bằng phiếu
  const canRemove = (addedBy: string) => user && (addedBy === user._id || user.role === 'admin');
  const [c1, c2] = station.station.colors;

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  return (
    <ChromeScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: isMobile ? 16 : 28, paddingTop: isMobile ? 12 : 20, paddingBottom: isMobile ? 160 : 100 }}
      keyboardShouldPersistTaps="handled"
    >
      <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.livePill}><View style={styles.liveDotWhite} /><Text style={styles.livePillText}>TRỰC TIẾP · {station.listeners.length} đang nghe</Text></View>
          <DropletPressable onPress={() => leaveRoom()} label="Rời kênh" style={styles.leave}>
            <Text style={styles.leaveText}>Rời kênh</Text>
          </DropletPressable>
        </View>
        <Text style={[styles.heroTitle, { fontSize: isMobile ? 30 : 36 }]} numberOfLines={2}>{station.station.name}</Text>
        {station.station.tagline ? <Text style={styles.heroTagline} numberOfLines={2}>{station.station.tagline}</Text> : null}
      </LinearGradient>

      {now ? (
        <View style={[styles.nowCard, !isMobile && { flexDirection: 'row' }]}>
          <CoverArt uri={now.song.coverArt} size={isMobile ? 220 : 160} radius={12} style={{ alignSelf: 'center' }} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{starting ? 'SẮP PHÁT' : 'ĐANG PHÁT'}</Text>
            </View>
            <Text style={styles.songTitle} numberOfLines={2}>{now.song.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{now.song.artist}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(elapsed / now.song.duration) * 100}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.time}>{formatTime(elapsed)}</Text>
              <Text style={styles.time}>{formatTime(now.song.duration)}</Text>
            </View>
            <TouchableOpacity style={styles.playBtn} onPress={togglePlay} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Tạm dừng' : 'Nghe tiếp'}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
              <Text style={styles.playText}>{isPlaying ? 'Tạm dừng' : 'Nghe tiếp'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>Kênh đang chọn bài…</Text>
      )}

      {station.station.allowRequests && (<>
      <Text style={styles.section}>Tiếp theo</Text>
      {queue.length === 0 ? (
        <Text style={styles.muted}>Hàng chờ trống — kênh sẽ tự chọn bài. Đề xuất một bài bên dưới.</Text>
      ) : (
        queue.map((e, i) => {
          const voted = !!user && e.voters.includes(user._id);
          return (
            <View key={e.id} style={styles.queueRow}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.qTitle} numberOfLines={1}>{e.song.title}</Text>
                <Text style={styles.qMeta} numberOfLines={1}>{e.song.artist} · {e.addedByName} đề xuất</Text>
              </View>
              <TouchableOpacity
                style={[styles.vote, voted && styles.voteActive]}
                onPress={() => act(() => voteEntry(e.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: voted }}
                accessibilityLabel={`${voted ? 'Bỏ bầu' : 'Bầu'} ${e.song.title}, ${e.votes} phiếu`}
              >
                <Ionicons name={voted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={18} color={voted ? '#fff' : colors.accent} />
                <Text style={[styles.voteText, voted && { color: '#fff' }]}>{e.votes}</Text>
              </TouchableOpacity>
              {canRemove(e.addedBy) && (
                <TouchableOpacity onPress={() => act(() => removeEntry(e.id))} accessibilityLabel={`Gỡ ${e.song.title}`} style={{ padding: 6 }}>
                  <Ionicons name="close" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.section}>Đề xuất bài</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <AppTextField
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm tên bài hoặc nghệ sĩ"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
        />
      </View>
      {message && <Text style={styles.message}>{message}</Text>}
      {results.map((s) => (
        <TouchableOpacity
          key={s._id}
          style={styles.queueRow}
          onPress={() => act(() => suggestSong(s._id), `Đã thêm "${s.title}" vào hàng chờ`).then(() => setQuery(''))}
          accessibilityRole="button"
          accessibilityLabel={`Đề xuất ${s.title}`}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.qTitle} numberOfLines={1}>{s.title}</Text>
            <Text style={styles.qMeta} numberOfLines={1}>{s.artist}</Text>
          </View>
          <Ionicons name="add-circle" size={22} color={colors.accent} />
        </TouchableOpacity>
      ))}

      </>)}

      <Text style={styles.section}>Đang nghe</Text>
      <Text style={styles.muted}>{station.listeners.map((l) => l.name).join(', ')}</Text>
    </ChromeScrollView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, gap: 6, marginBottom: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  liveDotWhite: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF453A' },
  livePillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  leave: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  leaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  heroTitle: { color: '#fff', fontWeight: '800', letterSpacing: -0.6 },
  heroTagline: { color: 'rgba(255,255,255,0.88)', fontSize: 15 },
  nowCard: { marginTop: 16, gap: 16, padding: 16, borderRadius: 16, backgroundColor: c.surface },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF453A' },
  liveText: { color: '#FF453A', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  songTitle: { color: c.text, fontSize: 20, fontWeight: '700', marginTop: 6 },
  songArtist: { color: c.textSecondary, fontSize: 15, marginTop: 2 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: c.fill, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: c.accent },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { color: c.textTertiary, fontSize: 12, fontVariant: ['tabular-nums'] },
  playBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent, borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  playText: { color: '#fff', fontWeight: '700' },
  section: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 6 },
  muted: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rank: { color: c.textTertiary, width: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
  qTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
  qMeta: { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: c.fill },
  voteActive: { backgroundColor: c.accent },
  voteText: { color: c.accent, fontWeight: '700', fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.inputBg, borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: c.text, paddingVertical: 10, fontSize: 15 },
  message: { color: c.textSecondary, fontSize: 13, marginTop: 8 },
});
