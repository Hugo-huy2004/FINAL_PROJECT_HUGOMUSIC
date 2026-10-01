import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { PinnedRow, SearchField, SongRow } from '../../ui/kit';
import { useCollapseOnScroll } from '../../ui/chrome';
import { type, space, radius, GUTTER } from '../../ui/tokens';
import CollectionDetail from '../../components/CollectionDetail/CollectionDetail';
import type { LibraryTabProps } from './LibraryScreen';
import { byNewest, newestFirst, useTopSongs } from '../../utils/songOrder';

// Tab Bài hát. Cá nhân hoá: "Nghe gần đây" (lịch sử nghe của bạn). Dưới là toàn bộ kho: lọc
// không phân biệt dấu, sắp xếp (mới nhất theo createdAt / nghe nhiều / tên / nghệ sĩ), phát, trộn. Kho ~1.200
// bài nên dùng FlatList (chỉ vẽ phần đang thấy).
type Sort = 'new' | 'plays' | 'title' | 'artist';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'Mới nhất' },
  { id: 'plays', label: 'Nghe nhiều' },
  { id: 'title', label: 'Tên bài' },
  { id: 'artist', label: 'Nghệ sĩ' },
];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SongsTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const collapse = useCollapseOnScroll();
  const songs = useStore((s) => s.songs);
  const history = useStore((s) => s.historySongs);
  const playSong = useStore((s) => s.playSong);
  const shufflePlay = useStore((s) => s.shufflePlay);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [showHistory, setShowHistory] = useState(false);
  const { top: ranking } = useTopSongs(0, 200);
  const plays = useMemo(() => new Map(ranking.map((t) => [t.song._id, t.plays])), [ranking]);

  const list = useMemo(() => {
    const q = fold(query.trim());
    const hit = q ? songs.filter((s) => fold(`${s.title} ${s.artist}`).includes(q)) : songs;
    if (sort === 'new') return byNewest(hit);
    if (sort === 'plays') {
      // Lượt nghe mọi lúc; bài chưa ai nghe xếp sau, trong nhóm đó mới nhất trước.
      return [...hit].sort((a, b) => (plays.get(b._id) || 0) - (plays.get(a._id) || 0) || newestFirst(a, b));
    }
    const key = (s: Song) => fold(sort === 'title' ? s.title : `${s.artist} ${s.title}`);
    return [...hit].sort((a, b) => key(a).localeCompare(key(b)));
  }, [songs, query, sort, plays]);

  if (showHistory) {
    return (
      <CollectionDetail
        kind="CỦA BẠN"
        title="Nghe gần đây"
        subtitle="30 bài bạn nghe gần nhất"
        coverUri={history[0]?.coverArt}
        songs={history}
        emptyText="Chưa nghe bài nào — phát một bài bất kỳ nhé."
        onBack={() => setShowHistory(false)}
      />
    );
  }

  const top = (
    <>
      {header}
      <View style={styles.pad}>
        <PinnedRow
          icon="time"
          colors={['#30D158', '#0A84FF']}
          title="Nghe gần đây"
          subtitle={history.length ? `${history.length} bài · mới nhất: ${history[0].title}` : 'Các bài bạn nghe sẽ hiện ở đây.'}
          onPress={() => setShowHistory(true)}
        />
        <View style={{ marginTop: space.xxl }}>
          <SearchField value={query} onChangeText={setQuery} placeholder={`Lọc trong ${songs.length} bài`} />
        </View>
        <View style={styles.bar}>
          {SORTS.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSort(s.id)}
              style={[styles.chip, { backgroundColor: sort === s.id ? colors.accent : colors.fill }]}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === s.id }}
            >
              <Text style={[type.subhead, { color: sort === s.id ? '#fff' : colors.text, fontWeight: '600' }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => list[0] && playSong(list[0], list)} accessibilityRole="button">
            <Ionicons name="play" size={18} color={colors.accent} />
            <Text style={[type.headline, { color: colors.accent }]}>Phát</Text>
          </Pressable>
          <Pressable style={[styles.action, { backgroundColor: colors.fill }]} onPress={() => shufflePlay(list)} accessibilityRole="button">
            <Ionicons name="shuffle" size={18} color={colors.accent} />
            <Text style={[type.headline, { color: colors.accent }]}>Trộn bài</Text>
          </Pressable>
        </View>
      </View>
    </>
  );

  return (
    <FlatList
      {...collapse}
      data={list}
      keyExtractor={(s) => s._id}
      ListHeaderComponent={top}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 200 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      windowSize={10}
      renderItem={({ item, index }) => (
        <View style={styles.pad}>
          <SongRow song={item} list={list} last={index === list.length - 1} />
        </View>
      )}
      ListEmptyComponent={<Text style={[type.subhead, styles.pad, { color: colors.textSecondary, marginTop: space.md }]}>Không có bài nào khớp "{query}".</Text>}
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: 18, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md, marginBottom: space.sm },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.md },
});
