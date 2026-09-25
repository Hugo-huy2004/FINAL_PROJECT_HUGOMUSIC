import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile, useIsWideDesktop } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';

/**
 * Duyệt nhạc theo THỂ LOẠI hoặc QUỐC GIA.
 *
 * Vì sao cần: kho này có 255 nghệ sĩ nhưng chỉ 2 người có ảnh thật, và gần như
 * không ai nghe đã biết tên họ. Giao diện lấy nghệ sĩ làm trung tâm (kiểu
 * Spotify) được xây cho kho nhạc có danh tính nghệ sĩ — kho này thì không.
 *
 * Ngược lại, 452/516 bài có thể loại và 117 bài có quốc gia. Người dùng không
 * tìm "Toxic Chicken" — họ tìm "nhạc Jazz" hoặc "nhạc Trung Quốc". Đây mới là
 * trục duyệt phù hợp với dữ liệu thật.
 *
 * Ảnh đại diện mỗi nhóm lấy từ ảnh bìa một bài trong nhóm — có thật 516/516,
 * không phải ảnh mặc định.
 */
export default function GenresView({ mode = 'genre' }: { mode?: 'genre' | 'country' }) {
  const songs = useStore((state) => state.songs);
  const fetchSongs = useStore((state) => state.fetchSongs);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const playSong = useStore((state) => state.playSong);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);

  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const isWide = useIsWideDesktop();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (songs.length === 0) fetchSongs();
  }, [songs.length, fetchSongs]);

  const isGenre = mode === 'genre';
  const title = isGenre ? 'Thể loại' : 'Quốc gia';
  const emptyHint = isGenre
    ? 'Chưa có bài nào được gắn thể loại.'
    : 'Chưa có bài nào được gắn quốc gia.';

  // Gom theo trường tương ứng. Bài thiếu trường đó bị bỏ qua thay vì dồn vào
  // một nhóm "Khác" — nhóm rác như vậy không giúp gì cho việc duyệt nhạc.
  const groups = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const s of songs) {
      const key = isGenre ? s.genre : s.country;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .map(([name, list]) => ({ name, songs: list }))
      .sort((a, b) => b.songs.length - a.songs.length);
  }, [songs, isGenre]);

  const cardWidth = isMobile ? '48%' : isWide ? '15.7%' : '31.5%';

  if (selected) {
    const group = groups.find((g) => g.name === selected);
    if (!group) {
      setSelected(null);
      return null;
    }
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelected(null)}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={[styles.backText, { color: colors.accent }]}>{title}</Text>
        </TouchableOpacity>

        <Text style={[styles.mainTitle, { color: colors.text }]}>{group.name}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {group.songs.length} bài hát
        </Text>

        <TouchableOpacity
          style={[styles.playAllBtn, { backgroundColor: colors.accent }]}
          onPress={() => playSong(group.songs[0], group.songs)}
        >
          <Ionicons name="play" size={16} color="#fff" />
          <Text style={styles.playAllText}>Phát tất cả</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 14 }}>
          {group.songs.map((song, i) => (
            <SongTableRow
              key={song._id}
              index={i + 1}
              song={song}
              colors={colors}
              isCurrent={currentSong?._id === song._id}
              isPlaying={isPlaying && currentSong?._id === song._id}
              isLiked={likedSongIds.includes(song._id)}
              onPlay={() => playOrToggleSong(song, group.songs)}
              onToggleLike={() => toggleLike(song._id)}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.mainTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {groups.length} {isGenre ? 'thể loại' : 'quốc gia'}
      </Text>

      {groups.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>{emptyHint}</Text>
      ) : (
        <View style={styles.grid}>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.name}
              style={[
                styles.card,
                { width: cardWidth as any, backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
              ]}
              onPress={() => setSelected(g.name)}
              activeOpacity={0.8}
            >
              <CoverArt uri={g.songs[0]?.coverArt} size={isWide ? 150 : 120} radius={10} />
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={[styles.cardCount, { color: colors.textSecondary }]}>
                {g.songs.length} bài
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 140 },
  mainTitle: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 18 },
  empty: { fontSize: 14, marginTop: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  cardCount: { fontSize: 12, marginTop: 2 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backText: { fontSize: 14, fontWeight: '600' },
  playAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20,
  },
  playAllText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
