import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { create } from 'zustand';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { shareSong } from '../../lib/share';
import CoverArt from '../CoverArt';
import { ContextMenu, Glass, Icon, Spinner, TextField, type MenuItem } from 'hugo-music';

// Menu "..." (like Apple Music) — ONE place for all song operations, accessible from any stream/stream
// play: openSongActions(song); or for a WHOLE COLLECTION of items (album, list): openCollectionActions().
// Inside, we always work on a list of items (one item = list of one element).
// <SongActionsHost/> attaches once to AppLayout. The open playlist passes onRemove to show "Remove from list".
type Target = { songs: Song[]; title: string; subtitle: string; cover?: string; single: boolean; onRemove?: () => void } | null;
const useSongActions = create<{ target: Target }>(() => ({ target: null }));

export const openSongActions = (song: Song, opts: { onRemove?: () => void } = {}) =>
  useSongActions.setState({ target: { songs: [song], title: song.title, subtitle: song.artist, cover: song.coverArt, single: true, ...opts } });
export const openCollectionActions = (c: { title: string; subtitle: string; cover?: string; songs: Song[] }) =>
  useSongActions.setState({ target: { ...c, single: false } });
const close = () => useSongActions.setState({ target: null });

// Same operations of the "..." menu but as a list of items for the long-press menu (ui/native/ContextMenu,
// ContextMenu SwiftUI on iPhone). Add to playlist is a submenu; "New list..." opens the sheet.
// Wrap a line of cards: press and hold to open the action menu (iPhone); Other places pay the full amount.
/** Wraps a trigger element and opens the song action menu for one song. */
export function SongMenu({ song, onRemove, children }: {
  song: Song;
  /** Adds “Remove from this list” to the menu. */
  onRemove?: () => void;
  children: React.ReactElement;
}) {
  return <ContextMenu items={useSongMenu(song, onRemove)}>{children}</ContextMenu>;
}

function useSongMenu(song: Song, onRemove?: () => void): MenuItem[] {
  const liked = useStore((s) => s.likedSongIds.includes(song._id));
  const downloaded = useStore((s) => s.offlineSongIds.includes(song._id));
  const playlists = useStore((s) => s.playlists);
  const signedIn = useStore((s) => !!s.user);
  const st = useStore.getState;
  const guard = (fn: () => unknown) => () => (signedIn ? fn() : st().setLoginModalVisible(true));
  return [
    { key: 'play', label: 'Phát', icon: 'play', onPress: () => st().playOrToggleSong(song, [song]) },
    { key: 'like', label: liked ? 'Bỏ khỏi My Playlist' : 'Thêm vào My Playlist', icon: liked ? 'heart-dislike-outline' : 'heart-outline', onPress: guard(() => st().toggleLike(song._id)) },
    {
      key: 'add', label: 'Thêm vào danh sách phát', icon: 'add-circle-outline',
      children: signedIn
        ? [
            ...playlists.map((p) => ({ key: p._id, label: p.name, icon: 'list-outline' as const, onPress: () => st().addSongToPlaylist(p._id, song._id) })),
            { key: 'new', label: 'Danh sách mới…', icon: 'add', onPress: () => openSongActions(song) },
          ]
        : [{ key: 'login', label: 'Đăng nhập để tạo danh sách', icon: 'person-circle-outline', onPress: () => st().setLoginModalVisible(true) }],
    },
    downloaded
      ? { key: 'dl', label: 'Xoá bản tải về', icon: 'trash-outline', onPress: () => st().removeSongOffline(song._id) }
      : { key: 'dl', label: 'Tải về', icon: 'arrow-down-circle-outline', onPress: () => st().downloadSongOffline(song) },
    { key: 'share', label: 'Chia sẻ bài hát', icon: 'share-outline', onPress: () => shareSong(song) },
    ...(onRemove ? [{ key: 'remove', label: 'Xoá khỏi danh sách này', icon: 'remove-circle-outline' as const, destructive: true, onPress: onRemove }] : []),
  ];
}

/** Mounts the shared song action sheet (add to playlist, like, share) once at the app root. */
export function SongActionsHost() {
  const target = useSongActions((s) => s.target);
  if (!target) return null;
  return <Sheet key={target.songs.map((s) => s._id).join()} target={target} />;
}

function Sheet({ target }: { target: NonNullable<Target> }) {
  const { songs, single, onRemove } = target;
  const song = songs[0];
  const { colors, isDark } = useAppTheme();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const liked = useStore((s) => songs.every((x) => s.likedSongIds.includes(x._id)));
  const toggleLike = useStore((s) => s.toggleLike);
  const downloaded = useStore((s) => songs.every((x) => s.offlineSongIds.includes(x._id)));
  const likedIds = useStore((s) => s.likedSongIds);
  const offlineIds = useStore((s) => s.offlineSongIds);
  const downloadSongOffline = useStore((s) => s.downloadSongOffline);
  const removeSongOffline = useStore((s) => s.removeSongOffline);
  const playlists = useStore((s) => s.playlists);
  const addSongsToPlaylist = useStore((s) => s.addSongsToPlaylist);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const needLogin = () => {
    if (user) return false;
    close();
    setLoginModalVisible(true);
    return true;
  };
  const run = async (key: string, fn: () => Promise<unknown> | void, keepOpen = false) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      if (!keepOpen) close();
    }
  };
  // Entire episode in ONE request (keep order); The server automatically discards cards already on the list.
  const addAll = (playlistId: string) => addSongsToPlaylist(playlistId, songs.map((x) => x._id));
  const addTo = (id: string) => run(id, () => addAll(id));
  // Like the whole episode: if you like it all, unlike it all, if not, like the missing songs.
  const toggleLikeAll = async () => {
    for (const x of songs) if (liked || !likedIds.includes(x._id)) await toggleLike(x._id);
  };
  const toggleDownloadAll = async () => {
    for (const x of songs) {
      if (downloaded) await removeSongOffline(x._id);
      else if (!offlineIds.includes(x._id)) await downloadSongOffline(x);
    }
  };
  const createAndAdd = () =>
    run('new', async () => {
      await createPlaylist(newName.trim());
      // createPlaylist inserts the newly created list into the HEAD of the array (names may be the same, so don't search by name).
      const made = useStore.getState().playlists[0];
      if (made) await addAll(made._id);
    });

  const row = (key: string, icon: keyof typeof Icon.glyphMap, label: string, onPress: () => void, tint = colors.text) => (
    <Pressable key={key} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button">
      <Text style={[styles.rowText, { color: tint }]}>{label}</Text>
      {busy === key ? <Spinner color={colors.accent} /> : <Icon name={icon} size={20} color={tint} />}
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)' }]} onPress={close} accessibilityLabel="Đóng" />
      <View style={[styles.wrap, { pointerEvents: 'box-none' }]}>
        <Glass radius={24} style={styles.sheet}>
          <View style={styles.head}>
            <CoverArt uri={target.cover} title={target.title} size={48} radius={8} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{target.title}</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{single ? target.subtitle : `${target.subtitle} · ${songs.length} bài`}</Text>
            </View>
          </View>
          <View style={[styles.sep, { backgroundColor: colors.border }]} />

          {picking ? (
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={styles.newRow}>
                <TextField
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Tên danh sách phát mới"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.fill }]}
                  onSubmitEditing={() => newName.trim() && createAndAdd()}
                  maxLength={60}
                />
                <Pressable disabled={!newName.trim()} onPress={createAndAdd} style={[styles.newBtn, { backgroundColor: colors.accent, opacity: newName.trim() ? 1 : 0.4 }]} accessibilityRole="button" accessibilityLabel="Tạo và thêm">
                  {busy === 'new' ? <Spinner color="#fff" /> : <Icon name="add" size={20} color="#fff" />}
                </Pressable>
              </View>
              {playlists.map((p) => row(p._id, 'list-outline', `${p.name} · ${p.songs.length} bài`, () => addTo(p._id)))}
              {row('back', 'chevron-back', 'Quay lại', () => setPicking(false), colors.textSecondary)}
            </ScrollView>
          ) : (
            <>
              {row('like', liked ? 'heart' : 'heart-outline', liked ? 'Bỏ khỏi My Playlist' : single ? 'Thêm vào My Playlist' : 'Thêm cả tập vào My Playlist', () => !needLogin() && run('like', toggleLikeAll), liked ? '#FF375F' : colors.text)}
              {row('add', 'add-circle-outline', single ? 'Thêm vào danh sách phát…' : 'Thêm cả tập vào danh sách phát…', () => !needLogin() && setPicking(true))}
              {onRemove && row('remove', 'remove-circle-outline', 'Xoá khỏi danh sách này', () => run('remove', onRemove), '#FF453A')}
              {row('dl', downloaded ? 'checkmark-circle' : 'arrow-down-circle-outline', downloaded ? 'Xoá bản tải về' : single ? 'Tải về để nghe ngoại tuyến' : 'Tải cả tập về máy', () => run('dl', toggleDownloadAll))}
              {row('share', 'share-outline', single ? 'Chia sẻ bài hát' : 'Chia sẻ', () => run('share', () => shareSong(single ? song : { ...song, title: target.title, artist: target.subtitle })))}
            </>
          )}
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 10 },
  sheet: { width: '100%', maxWidth: 440, paddingVertical: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 18 },
  rowText: { fontSize: 16, flex: 1, marginRight: 12 },
  newRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, fontSize: 15 },
  newBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
