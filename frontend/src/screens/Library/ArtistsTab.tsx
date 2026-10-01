import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { PinnedRow, ListRow, Shelf, MediaTile, SearchField } from '../../ui/kit';
import { useCollapseOnScroll } from '../../ui/chrome';
import { type, space, GUTTER } from '../../ui/tokens';
import CollectionDetail from '../../components/CollectionDetail/CollectionDetail';
import { artistsOf } from './libraryData';
import type { LibraryTabProps } from './LibraryScreen';

// Tab Nghệ sĩ. Cá nhân hoá: "Nghệ sĩ bạn yêu thích" = nghệ sĩ của các bài đã thả tim (nhiều
// tim nhất đứng trước). Dưới là toàn bộ nghệ sĩ, có ô lọc; trang nghệ sĩ có ảnh thật và tiểu
// sử khi kho có (backend/models/Artist.js — ảnh Wikipedia), không thì dùng ảnh bìa bài hát.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ArtistsTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const collapse = useCollapseOnScroll();
  const songs = useStore((s) => s.songs);
  const likedSongs = useStore((s) => s.likedSongs);
  const artistInfo = useStore((s) => s.artists);
  const fetchArtists = useStore((s) => s.fetchArtists);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!artistInfo.length) fetchArtists();
  }, []);

  const info = useMemo(() => new Map(artistInfo.map((a) => [a.name, a])), [artistInfo]);
  const all = useMemo(() => artistsOf(songs), [songs]);
  const mine = useMemo(() => artistsOf(likedSongs), [likedSongs]);
  const shown = useMemo(() => (query.trim() ? all.filter((a) => fold(a.title).includes(fold(query.trim()))) : all), [all, query]);
  // Chỉ ảnh thật của nghệ sĩ — không mượn bìa album (utils/artistPhoto.ts).
  const photo = (name: string, _fallback?: string) => info.get(name)?.photo || undefined;

  const artist = open ? all.find((a) => a.key === open) : undefined;
  if (artist) {
    return (
      <CollectionDetail
        kind="NGHỆ SĨ"
        title={artist.title}
        subtitle={artist.subtitle}
        coverUri={photo(artist.title, artist.cover)}
        about={info.get(artist.title)?.bio}
        tint={artist.songs.find((x) => x.coverColor)?.coverColor}
        songs={artist.songs}
        onBack={() => setOpen(null)}
      />
    );
  }

  const top = (
    <>
      {header}
      {mine.length > 0 ? (
        <Shelf title="Nghệ sĩ bạn yêu thích" gap={16}>
          {mine.slice(0, 15).map((a) => (
            <MediaTile key={a.key} round uri={photo(a.title, a.cover)} title={a.title} subtitle={`${a.songs.length} bài bạn thích`} size={96} onPress={() => setOpen(a.key)} />
          ))}
        </Shelf>
      ) : (
        <View style={styles.pad}>
          <PinnedRow icon="mic" colors={['#FF9F0A', '#FF375F']} title="Nghệ sĩ bạn yêu thích" subtitle="Thả tim bài hát — nghệ sĩ của những bài đó sẽ hiện ở đây." />
        </View>
      )}
      <View style={[styles.pad, { marginTop: space.xxl }]}>
        <Text style={[type.title3, { color: colors.text, marginBottom: space.sm }]}>Tất cả nghệ sĩ · {all.length}</Text>
        <SearchField value={query} onChangeText={setQuery} placeholder="Lọc nghệ sĩ" />
      </View>
    </>
  );

  return (
    <FlatList
      {...collapse}
      data={shown}
      keyExtractor={(a) => a.key}
      ListHeaderComponent={top}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 200 }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      renderItem={({ item, index }) => (
        <View style={styles.pad}>
          <ListRow
            art={photo(item.title, item.cover) ?? ''}
            round
            title={item.title}
            subtitle={item.subtitle}
            separator={index < shown.length - 1}
            onPress={() => setOpen(item.key)}
            right={<Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={[type.subhead, styles.pad, { color: colors.textSecondary, marginTop: space.md }]}>Không có nghệ sĩ nào khớp "{query}".</Text>}
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
});
