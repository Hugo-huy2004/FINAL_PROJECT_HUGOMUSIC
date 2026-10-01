import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { ActionButton, Gradient, Icon, Spinner, TextField } from 'hugo-music';
import ChromeScrollView from '../../ui/ChromeScrollView';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { confirmAlert, showAlert } from '../../lib/alert';
import { PinnedRow, ListRow } from '../../ui/kit';
import { type, space, radius, GUTTER } from '../../ui/tokens';
import CollectionDetail from '../../components/CollectionDetail/CollectionDetail';
import type { LibraryTabProps } from './LibraryScreen';

// Playlist tab. The personalization section is always pinned at the top: MY PLAYLIST = every post the user has dropped
// heart (removing the heart means the card leaves here). Below is a self-created playlist: create new, open, edit name/description, sort
// (▲▼), delete list, remove item from list (menu "..."). Add articles to the list: menu "..." in any article.
const HEART: [string, string] = ['#FF375F', '#BF5AF2'];

// The "+" button at the top of the Library page opens the page with the create new list box open.
let pendingCreate = false;
export const requestNewPlaylist = () => {
  pendingCreate = true;
};

export default function PlaylistsTab({ header }: LibraryTabProps) {
  const { colors } = useAppTheme();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const playlists = useStore((s) => s.playlists);
  const likedSongs = useStore((s) => s.likedSongs);
  const fetchPlaylists = useStore((s) => s.fetchPlaylists);
  const fetchLikedSongs = useStore((s) => s.fetchLikedSongs);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  const removeSongFromPlaylist = useStore((s) => s.removeSongFromPlaylist);
  const updatePlaylist = useStore((s) => s.updatePlaylist);
  const reorderPlaylistSongs = useStore((s) => s.reorderPlaylistSongs);
  const [reordering, setReordering] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const toggleLike = useStore((s) => s.toggleLike);
  const [open, setOpen] = useState<string | null>(null); // 'mine' = My Playlist, remaining = list id
  const [creating, setCreating] = useState(() => {
    const v = pendingCreate;
    pendingCreate = false;
    return v;
  });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchPlaylists();
    fetchLikedSongs();
  }, [user?._id]);

  const requireLogin = () => {
    if (user) return true;
    setLoginModalVisible(true);
    return false;
  };

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createPlaylist(name.trim());
      setName('');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  if (open === 'mine') {
    return (
      <CollectionDetail
        kind="MY PLAYLIST"
        title="My Playlist"
        subtitle="Bài hát bạn đã thả tim"
        songs={likedSongs}
        heroArt={(size) => (
          <Gradient colors={HEART} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.heart, { width: size, height: size }]}>
            <Icon name="heart" size={size * 0.34} color="#fff" />
          </Gradient>
        )}
        onRemoveSong={(s) => toggleLike(s._id)}
        emptyText="Thả tim ♥ một bài bất kỳ — bài đó sẽ vào My Playlist."
        onBack={() => setOpen(null)}
      />
    );
  }
  const playlist = playlists.find((p) => p._id === open);
  if (playlist) {
    return (
      <>
      <CollectionDetail
        kind="DANH SÁCH PHÁT"
        title={playlist.name}
        subtitle={user?.nickname || user?.username || ''}
        about={playlist.description || undefined}
        coverUri={playlist.songs[0]?.coverArt}
        songs={playlist.songs}
        onRemoveSong={(s) => removeSongFromPlaylist(playlist._id, s._id)}
        onMoveSong={reordering ? (song, dir) => {
          const ids = playlist.songs.map((x) => x._id);
          const i = ids.indexOf(song._id);
          [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
          reorderPlaylistSongs(playlist._id, ids).catch((e) => showAlert(e.message));
        } : undefined}
        emptyText='Bấm "…" ở một bài bất kỳ → "Thêm vào danh sách phát".'
        actions={[
          ...(playlist.songs.length > 1 ? [{ icon: reordering ? 'checkmark' : 'swap-vertical', label: reordering ? 'Xong sắp xếp' : 'Sắp xếp bài', onPress: () => setReordering((x) => !x) } as const] : []),
          { icon: 'create-outline', label: 'Sửa tên và mô tả', onPress: () => setEditingMeta(true) },
          {
            icon: 'trash-outline',
            label: 'Xoá danh sách phát',
            danger: true,
            onPress: async () => {
              if (!(await confirmAlert(`Xoá danh sách phát "${playlist.name}"?`))) return;
              await deletePlaylist(playlist._id);
              setOpen(null);
            },
          },
        ]}
        onBack={() => { setReordering(false); setOpen(null); }}
      />
      <PlaylistEditor
        visible={editingMeta}
        initial={{ name: playlist.name, description: playlist.description || '' }}
        onClose={() => setEditingMeta(false)}
        onSave={(fields) => updatePlaylist(playlist._id, fields)}
      />
      </>
    );
  }

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {header}
      <View style={styles.body}>
        <PinnedRow
          icon="heart"
          colors={HEART}
          title="My Playlist"
          subtitle={user ? `${likedSongs.length} bài bạn đã thả tim` : 'Đăng nhập rồi thả tim để lưu bài vào đây'}
          onPress={() => requireLogin() && setOpen('mine')}
        />

        <Text style={[type.title3, styles.heading, { color: colors.text }]}>Danh sách phát của bạn</Text>
        <ListRow
          icon="add-circle-outline"
          title="Danh sách phát mới…"
          separator={playlists.length > 0 || creating}
          onPress={() => requireLogin() && setCreating((c) => !c)}
        />
        {creating && (
          <View style={styles.form}>
            <TextField
              value={name}
              onChangeText={setName}
              onSubmitEditing={create}
              placeholder="Tên danh sách phát"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text, backgroundColor: colors.fill }]}
              maxLength={60}
              autoFocus
            />
            <ActionButton
              variant="primary"
              size="md"
              title={saving ? undefined : 'Tạo'}
              icon={saving ? <Spinner color={colors.accent} /> : undefined}
              onPress={create}
              disabled={!name.trim() || saving}
            />
          </View>
        )}
        {playlists.map((p, i) => (
          <ListRow
            key={p._id}
            art={p.songs[0]?.coverArt ?? ''}
            title={p.name}
            subtitle={`${p.songs.length} bài`}
            separator={i < playlists.length - 1}
            onPress={() => setOpen(p._id)}
            right={<Icon name="chevron-forward" size={18} color={colors.textTertiary} />}
          />
        ))}
        {user && playlists.length === 0 && !creating && (
          <Text style={[type.footnote, styles.hint, { color: colors.textSecondary }]}>
            Chưa có danh sách nào. Tạo một danh sách rồi dùng nút "…" ở bài hát để thêm bài.
          </Text>
        )}
      </View>
    </ChromeScrollView>
  );
}

// Edit playlist name + description (dialog). Error from server (empty name/too long) appears right in the box.
function PlaylistEditor({ visible, initial, onClose, onSave }: {
  visible: boolean; initial: { name: string; description: string }; onClose: () => void;
  onSave: (fields: { name: string; description: string }) => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) { setName(initial.name); setDescription(initial.description); setError(null); } }, [visible]);
  const save = async () => {
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const field = [styles.input, { color: colors.text, backgroundColor: colors.fill, flex: 0 }];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[styles.sheetWrap, { pointerEvents: 'box-none' }]}>
        <View style={[styles.sheet, { backgroundColor: colors.modalBg }]}>
          <Text style={[type.title3, { color: colors.text, marginBottom: space.md }]}>Sửa danh sách phát</Text>
          <TextField value={name} onChangeText={setName} placeholder="Tên danh sách phát" placeholderTextColor={colors.textTertiary} style={field} maxLength={80} autoFocus />
          <TextField value={description} onChangeText={setDescription} placeholder="Mô tả (tuỳ chọn)" placeholderTextColor={colors.textTertiary} style={[...field, { marginTop: space.sm }]} maxLength={300} />
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.xs }]}>{description.length}/300</Text>
          {!!error && <Text style={{ color: '#FF453A', marginTop: space.sm }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg, justifyContent: 'flex-end' }}>
            <ActionButton variant="glass" size="md" title="Huỷ" onPress={onClose} />
            <ActionButton variant="primary" size="md" title={saving ? undefined : 'Lưu'} icon={saving ? <Spinner color={colors.accent} /> : undefined} onPress={save} disabled={!name.trim() || saving} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: GUTTER },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.xl, padding: space.xl },
  body: { paddingHorizontal: GUTTER, paddingTop: space.sm },
  heading: { marginTop: space.xxl, marginBottom: space.xs },
  heart: { alignItems: 'center', justifyContent: 'center' },
  form: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm },
  input: { flex: 1, minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  hint: { marginTop: space.md },
});
