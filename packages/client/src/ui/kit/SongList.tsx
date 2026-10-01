import { View, Pressable, StyleSheet } from 'react-native';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../theme';
import { Icon, ListRow } from 'hugo-music';
import { openSongActions, SongMenu } from '../../components/SongActions/SongActions';

// A line of cards: touch to play (the whole `list` becomes a queue), the song currently playing is highlighted in color, the song has been loaded
// There is a ↓ mark, the "..." button opens the action menu (like, add to playlist, download, share...).
// Use odd in FlatList (long list) or via <SongList> (short list).
export type SongRowProps = {
  song: Song;
  /** Queue used when the row is played. */
  list: Song[];
  /** Hides the separator below the last row. */
  last?: boolean;
  /** Builds each row's subtitle; defaults to the artist. */
  subtitle?: (s: Song) => string;
  /** Overrides the default play behaviour. */
  onPlay?: (song: Song) => void;
  /** When set, the row menu offers “Remove from this list”. */
  onRemove?: (song: Song) => void;
// yes → menu "..." shows "Remove from this list"
};

/**
 * One song in a list: artwork, title, artist and a “…” menu. Prefer SongList for whole arrays of songs.
 *
 * @example <SongRow song={s} list={songs} onRemove={removeFromPlaylist} />
 */
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
          {active ? <Icon name={isPlaying ? 'volume-high' : 'pause'} size={18} color={colors.accent} />
            : downloaded ? <Icon name="arrow-down-circle" size={16} color={colors.textTertiary} accessibilityLabel="Đã tải về" />
            : null}
          <Pressable
            onPress={() => openSongActions(song, remove ? { onRemove: remove } : {})}
            style={styles.more}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Tuỳ chọn cho ${song.title}`}
          >
            <Icon name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    />
    </SongMenu>
  );
}

/**
 * A list of songs rendered as SongRow items; tapping a row plays the song with the list as the queue.
 *
 * @example <SongList songs={album.songs} />
 */
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
