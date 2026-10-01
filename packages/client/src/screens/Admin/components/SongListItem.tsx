import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CoverArt from '../../../components/CoverArt';
import { useLicenseLabels, useNoDerivativeLicenses } from '../../../lib/meta';
import { useStore } from '../../../store/useStore';
import { ReviewedSong } from '../hooks/useSongManager';
import LicensePicker from './LicensePicker';
import { ActionButton, DropletPressable, Icon, Spinner } from 'hugo-music';

// Editable, grouped, labeled fields (backend checks each field: length, URL, year, LRC format).
type Field = { key: string; label: string; hint?: string; multiline?: boolean; numeric?: boolean; url?: boolean };
const GROUPS: { title: string; fields: Field[] }[] = [
  { title: 'Thông tin bài', fields: [{ key: 'title', label: 'Tên bài' }, { key: 'artist', label: 'Nghệ sĩ' }, { key: 'genre', label: 'Thể loại' }, { key: 'category', label: 'Danh mục' }] },
  { title: 'Album', fields: [{ key: 'albumTitle', label: 'Tên album' }, { key: 'albumYear', label: 'Năm phát hành', numeric: true }, { key: 'trackNo', label: 'Số thứ tự trong album', numeric: true }] },
  { title: 'Bản quyền', fields: [{ key: 'sourceUrl', label: 'URL nguồn', url: true }, { key: 'licenseUrl', label: 'URL giấy phép', url: true }, { key: 'attribution', label: 'Ghi công tác giả' }] },
  { title: 'Lời bài hát', fields: [{ key: 'plainLyrics', label: 'Lời thường', multiline: true }, { key: 'syncedLyrics', label: 'Lời có mốc thời gian (LRC)', hint: '[00:12.30] Câu hát…', multiline: true }] },
];


interface Props {
  onCoverChange?: (id: string, form: FormData) => Promise<boolean>;
  song: ReviewedSong;
  onUpdate: (id: string, fields: Record<string, string>) => Promise<boolean>;
  onReview: (id: string, decision: 'publish' | 'reject', note?: string) => Promise<boolean>;
  onDelete: (id: string, title: string) => void;
}

// One post in the queue: two-tier test results + admin actions.
export const SongListItem = React.memo(({ song, onUpdate, onReview, onDelete, onCoverChange }: Props) => {
  const LICENSE_LABELS = useLicenseLabels(); // GET /api/meta
  const NO_DERIVATIVE = useNoDerivativeLicenses();
  const { copyright, quality } = song.review;
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const isCurrent = useStore((s) => s.currentSong?._id === song._id);
  const isPlaying = useStore((s) => s.isPlaying) && isCurrent;
  const playSong = useStore((s) => s.playSong);
  const togglePlay = useStore((s) => s.togglePlay);

  const [uploadingCover, setUploadingCover] = useState(false);
  const startEdit = () => {
    const x = song as any;
    setDraft({
      licenseType: song.licenseType || '', title: song.title || '', artist: song.artist || '', genre: x.genre || '', category: x.category || '',
      albumTitle: x.album?.title || '', albumYear: x.album?.year ? String(x.album.year) : '', trackNo: x.album?.trackNo ? String(x.album.trackNo) : '',
      sourceUrl: x.sourceUrl || '', licenseUrl: x.licenseUrl || '', attribution: x.attribution || '',
      plainLyrics: x.plainLyrics || '', syncedLyrics: x.syncedLyrics || '',
    });
    setMode('edit');
  };
  // Only send changed fields — don't overwrite lyrics/albums with empty strings if the admin doesn't touch them.
  const save = async () => {
    const x = song as any;
    const before: Record<string, string> = {
      licenseType: song.licenseType || '', title: song.title || '', artist: song.artist || '', genre: x.genre || '', category: x.category || '',
      albumTitle: x.album?.title || '', albumYear: x.album?.year ? String(x.album.year) : '', trackNo: x.album?.trackNo ? String(x.album.trackNo) : '',
      sourceUrl: x.sourceUrl || '', licenseUrl: x.licenseUrl || '', attribution: x.attribution || '', plainLyrics: x.plainLyrics || '', syncedLyrics: x.syncedLyrics || '',
    };
    const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== before[k]));
    if (!Object.keys(changed).length) return setMode('view');
    if (await onUpdate(song._id, changed)) setMode('view');
  };
  const pickCover = async () => {
    if (!onCoverChange) return;
    const send = async (form: FormData) => { setUploadingCover(true); try { await onCoverChange(song._id, form); } finally { setUploadingCover(false); } };
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => { const f = input.files?.[0]; if (f) { const form = new FormData(); form.append('cover', f); send(form); } };
      input.click();
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    const a = res.assets?.[0];
    if (res.canceled || !a) return;
    const form = new FormData();
    form.append('cover', { uri: a.uri, name: a.fileName || 'cover.jpg', type: a.mimeType || 'image/jpeg' } as any);
    send(form);
  };

  const hlsLabel = song.hlsPath
    ? `HLS: ${song.hlsTiers?.join(' / ')}`
    : NO_DERIVATIVE.includes(song.licenseType || '') ? 'Tệp gốc (giấy phép ND)' : 'Đang dựng HLS…';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <CoverArt uri={song.coverArt} title={song.title} size={48} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {song.artist}
            {song.licenseType ? ` · ${LICENSE_LABELS[song.licenseType]}` : ''}
            {song.genre ? ` · ${song.genre}` : ''}
          </Text>
          {song.sourceUrl ? (
            <Text style={styles.link} numberOfLines={1} onPress={() => Linking.openURL(song.sourceUrl!)}>
              {song.sourceUrl}
            </Text>
          ) : null}
        </View>
        <DropletPressable onPress={() => (isCurrent ? togglePlay() : playSong(song, [song]))} label={isPlaying ? 'Dừng nghe thử' : 'Nghe thử'} style={styles.iconBtn}>
          <Icon name={isPlaying ? 'pause-circle' : 'play-circle'} size={30} color="#07875F" />
        </DropletPressable>
      </View>

      {/* Two-tier review results (apps/server/src/modules/songs/songReview.js) */}
      <View style={styles.checks}>
        <Text style={[styles.check, { color: copyright.pass ? '#07875F' : '#FF3B30' }]}>
          {copyright.pass ? '✓ Bản quyền đạt' : `✗ Bản quyền: ${copyright.issues.join(', ')}`}
        </Text>
        <Text style={[styles.check, { color: quality.pass ? '#07875F' : '#C77700' }]}>
          {quality.pass ? '✓ Chất lượng đạt' : `! Chất lượng: ${quality.issues.join(', ')}`}
        </Text>
        {song.status === 'published' && <Text style={styles.meta}>{hlsLabel}</Text>}
        {song.status === 'rejected' && song.reviewNote ? (
          <Text style={styles.meta}>Lý do từ chối: {song.reviewNote}</Text>
        ) : null}
      </View>

      {mode === 'edit' && (
        <View style={styles.panel}>
          {onCoverChange && (
            <View style={styles.coverRow}>
              <CoverArt uri={song.coverArt} title={song.title} size={72} radius={8} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.groupTitle}>Ảnh bìa</Text>
                <Text style={styles.hint}>JPEG, PNG hoặc WebP, tối đa 5 MB. Ảnh cũ bị xoá nếu không bài nào khác dùng.</Text>
                <ActionButton variant="glass" size="sm" icon="image-outline" title="Đổi ảnh bìa" loading={uploadingCover} onPress={pickCover} style={{ alignSelf: 'flex-start' }} />
              </View>
            </View>
          )}
          {GROUPS.map((g) => (
            <View key={g.title} style={{ marginBottom: 8 }}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              {g.title === 'Bản quyền' && <LicensePicker value={draft.licenseType} onChange={(v) => setDraft((d) => ({ ...d, licenseType: v }))} />}
              {g.fields.map((f) => (
                <View key={f.key}>
                  <Text style={styles.label}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, f.multiline && styles.multiline]}
                    placeholder={f.hint}
                    placeholderTextColor="#aaa"
                    value={draft[f.key]}
                    onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: f.numeric ? v.replace(/\D/g, '') : v }))}
                    autoCapitalize={f.url ? 'none' : 'sentences'}
                    keyboardType={f.numeric ? 'number-pad' : f.url ? 'url' : 'default'}
                    multiline={f.multiline}
                  />
                </View>
              ))}
            </View>
          ))}
          <View style={styles.actions}>
            <Action label="Lưu thay đổi" color="#07875F" onPress={save} />
            <Action label="Huỷ" color="#666" onPress={() => setMode('view')} />
          </View>
        </View>
      )}

      {mode === 'reject' && (
        <View style={styles.panel}>
          <TextInput
            style={styles.input}
            placeholder="Lý do từ chối (vd. giấy phép không khớp nguồn)"
            placeholderTextColor="#888"
            value={note}
            onChangeText={setNote}
          />
          <View style={styles.actions}>
            <Action label="Xác nhận từ chối" color="#FF3B30" onPress={() => onReview(song._id, 'reject', note)} />
            <Action label="Huỷ" color="#666" onPress={() => setMode('view')} />
          </View>
        </View>
      )}

      {mode === 'view' && (
        <View style={styles.actions}>
          {song.status !== 'published' && (
            <Action
              label="Duyệt và xuất bản"
              color="#07875F"
              disabled={!copyright.pass}
              onPress={() => onReview(song._id, 'publish')}
            />
          )}
          {song.status === 'pending' && <Action label="Từ chối" color="#FF3B30" onPress={() => setMode('reject')} />}
          <Action label="Sửa" color="#007AFF" onPress={startEdit} />
          <Action label="Xoá" color="#FF3B30" onPress={() => onDelete(song._id, song.title)} />
        </View>
      )}
    </View>
  );
});

SongListItem.displayName = 'SongListItem';

// Colour → library variant: red is destructive, green the primary action, anything else secondary.
function Action({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  const variant = color === '#FF3B30' ? 'danger' : color === '#07875F' ? 'primary' : 'glass';
  return <ActionButton variant={variant} size="sm" title={label} onPress={onPress} disabled={disabled} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, marginLeft: 16 },
  title: { fontSize: 16, fontWeight: '600', color: '#333' },
  sub: { fontSize: 13, color: '#888', marginTop: 2 },
  link: { fontSize: 12, color: '#007AFF', marginTop: 2 },
  iconBtn: { padding: 6 },
  checks: { marginTop: 10, gap: 2 },
  check: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666' },
  panel: { marginTop: 12 },
  coverRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: '#101828', marginTop: 8, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  label: { fontSize: 12, fontWeight: '600', color: '#475467', marginBottom: 4 },
  hint: { fontSize: 12, color: '#667085' },
  multiline: { height: 110, paddingTop: 10, textAlignVertical: 'top' },
  input: {
    height: 40, borderWidth: 1, borderColor: '#eee', borderRadius: 8, paddingHorizontal: 12,
    fontSize: 14, marginBottom: 8, color: '#333', backgroundColor: '#fafafa',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
