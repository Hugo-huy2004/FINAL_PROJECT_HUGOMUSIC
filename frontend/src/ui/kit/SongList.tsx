import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import ListRow from './ListRow';
import { openSongActions, SongMenu } from '../../components/SongActions/SongActions';

// Một dòng bài: chạm để phát (cả `list` thành hàng chờ), bài đang phát tô màu nhấn, bài đã tải
// về có dấu ↓, nút "…" mở menu thao tác (thích, thêm vào danh sách phát, tải về, chia sẻ...).
// Dùng lẻ trong FlatList (danh sách dài) hoặc qua <SongList> (danh sách ngắn).
export type SongRowProps = {
  song: Song; list: Song[]; last?: boolean; subtitle?: (s: Song) => string;
  onPlay?: (song: Song) => void;
  onRemove?: (song: Song) => void; // có → menu "…" hiện "Xoá khỏi danh sách này"
};

export function SongRow({ song, list, last = false, subtitle = (s) => s.artist, onPlay, onRemove }: SongRowProps) {
  const { colors } = useAppTheme();
  const playOrToggleSong = useStore((s) => s.playOrToggleSong);
  const active = useStore((s) => s.currentSong?._id === song._id);
  const isPlaying = useStore((s) => s.isPlaying);
  const downloaded = useStore((s) => s.offlineSongIds.includes(song._id));
  const remove = onRemove ? () => onRemove(song) : undefined;
  return (
    <SongMenu song={song} onRemove={remove}>
    <ListRow
      art={song.coverArt}
      title={song.title}
      subtitle={subtitle(song)}
      active={active}
      separator={!last}
      onPress={() => (onPlay ? onPlay(song) : playOrToggleSong(song, list))}
      right={
        <View style={styles.right}>
          {active ? <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={18} color={colors.accent} />
            : downloaded ? <Ionicons name="arrow-down-circle" size={16} color={colors.textTertiary} accessibilityLabel="Đã tải về" />
            : null}
          <Pressable
            onPress={() => openSongActions(song, remove ? { onRemove: remove } : {})}
            style={styles.more}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Tuỳ chọn cho ${song.title}`}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    />
    </SongMenu>
  );
}

export default function SongList({ songs, ...rest }: { songs: Song[] } & Omit<SongRowProps, 'song' | 'list' | 'last'>) {
  return (
    <>
      {songs.map((song, i) => (
        <SongRow key={song._id} song={song} list={songs} last={i === songs.length - 1} {...rest} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
