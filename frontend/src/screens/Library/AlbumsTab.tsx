import { useContext, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions } from 'react-native';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile, ContentWidthContext } from '../../utils/responsive';
import { PinnedRow, Shelf, MediaTile } from '../../ui/kit';
import { useCollapseOnScroll } from '../../ui/chrome';
import { type, space, GUTTER } from '../../ui/tokens';
import CollectionDetail from '../../components/CollectionDetail/CollectionDetail';
import { albumsOf, Collection } from './libraryData';
import type { LibraryTabProps } from './LibraryScreen';

// Tab Album — theo BẢN PHÁT HÀNH THẬT (song.album, ReleaseJob): tên, nghệ sĩ, năm, loại (album/EP/đĩa
// đơn theo số bài gốc), thứ tự bài theo track. Cá nhân hoá: "Album bạn yêu thích" = bản phát hành có
// bài bạn đã thả tim. Kho có hàng trăm bản phát hành nên lưới dùng FlatList (chỉ vẽ phần đang thấy).
const metaOf = (a: Collection) => [a.genre, a.year].filter(Boolean).join(' · ');
const tileLine = (a: Collection) => [a.kind === 'ALBUM' ? a.subtitle : `${a.kind === 'EP' ? 'EP' : 'Đĩa đơn'} · ${a.subtitle}`, a.year].filter(Boolean).join(' · ');

export function AlbumDetail({ album, onBack }: { album: Collection; onBack: () => void }) {
  return (
    <CollectionDetail
      kind={album.kind || 'ALBUM'}
      title={album.title}
      subtitle={album.subtitle}
      coverUri={album.cover}
      songs={album.songs}
      tint={album.color}
      meta={metaOf(album)}
      about={album.description}
      numbered
      onBack={onBack}
    />
  );
}

export default function AlbumsTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const collapse = useCollapseOnScroll();
  const isMobile = useIsMobile();
  const { width } = useWindowDimensions();
  const measured = useContext(ContentWidthContext);
  const songs = useStore((s) => s.songs);
  const likedIds = useStore((s) => s.likedSongIds);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const all = useMemo(() => albumsOf(songs), [songs]);
  const mine = useMemo(() => all.filter((a) => a.songs.some((s) => likedIds.includes(s._id))), [all, likedIds]);

  const inner = (measured ?? width) - GUTTER * 2;
  const columns = isMobile ? 2 : Math.max(3, Math.floor((inner + space.md) / (190 + space.md)));
  const tile = Math.floor((inner - space.md * (columns - 1)) / columns);

  const open = openKey ? all.find((a) => a.key === openKey) : undefined;
  if (open) return <AlbumDetail album={open} onBack={() => setOpenKey(null)} />;

  const top = (
    <>
      {header}
      {mine.length > 0 ? (
        <Shelf title="Album bạn yêu thích">
          {mine.slice(0, 15).map((a) => (
            <MediaTile key={a.key} uri={a.cover} title={a.title} subtitle={tileLine(a)} size={isMobile ? 150 : 170} onPress={() => setOpenKey(a.key)} />
          ))}
        </Shelf>
      ) : (
        <View style={styles.pad}>
          <PinnedRow icon="albums" colors={['#5E5CE6', '#0A84FF']} title="Album bạn yêu thích" subtitle="Thả tim bài hát — album chứa bài đó sẽ hiện ở đây." />
        </View>
      )}
      <Text style={[type.title3, styles.pad, { color: colors.text, marginTop: space.xxl, marginBottom: space.md }]}>Tất cả · {all.length}</Text>
    </>
  );

  return (
    <FlatList
      {...collapse}
      key={columns} // đổi số cột bắt buộc dựng lại FlatList
      data={all}
      keyExtractor={(a) => a.key}
      numColumns={columns}
      ListHeaderComponent={top}
      columnWrapperStyle={{ gap: space.md, paddingHorizontal: GUTTER }}
      contentContainerStyle={{ paddingBottom: 200, rowGap: space.lg }}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      renderItem={({ item }) => (
        <MediaTile uri={item.cover} title={item.title} subtitle={tileLine(item)} size={tile} onPress={() => setOpenKey(item.key)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
});
