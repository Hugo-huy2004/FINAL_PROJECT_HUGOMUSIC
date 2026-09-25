import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CoverArt from '../../../components/CoverArt';
import { LICENSE_LABELS } from '../../../components/LicenseBadge';
import { useStore } from '../../../store/useStore';
import { ReviewedSong } from '../hooks/useSongManager';
import LicensePicker from './LicensePicker';

const NO_DERIVATIVE = ['cc-by-nd', 'cc-by-nc-nd'];
const EDIT_FIELDS: [keyof ReviewedSong, string][] = [
  ['title', 'Tên bài'],
  ['artist', 'Nghệ sĩ'],
  ['genre', 'Thể loại'],
  ['sourceUrl', 'URL nguồn'],
  ['attribution', 'Ghi công tác giả'],
];

interface Props {
  song: ReviewedSong;
  onUpdate: (id: string, fields: Record<string, string>) => Promise<boolean>;
  onReview: (id: string, decision: 'publish' | 'reject', note?: string) => Promise<boolean>;
  onDelete: (id: string, title: string) => void;
}

// Một bài trong hàng chờ: kết quả kiểm tra hai tầng + các thao tác của admin.
export const SongListItem = React.memo(({ song, onUpdate, onReview, onDelete }: Props) => {
  const { copyright, quality } = song.review;
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const isCurrent = useStore((s) => s.currentSong?._id === song._id);
  const isPlaying = useStore((s) => s.isPlaying) && isCurrent;
  const playSong = useStore((s) => s.playSong);
  const togglePlay = useStore((s) => s.togglePlay);

  const startEdit = () => {
    const d: Record<string, string> = { licenseType: song.licenseType || '' };
    EDIT_FIELDS.forEach(([k]) => { d[k as string] = (song[k] as string) || ''; });
    setDraft(d);
    setMode('edit');
  };

  const hlsLabel = song.hlsPath
    ? `HLS: ${song.hlsTiers?.join(' / ')}`
    : NO_DERIVATIVE.includes(song.licenseType || '') ? 'Tệp gốc (giấy phép ND)' : 'Đang dựng HLS…';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <CoverArt uri={song.coverArt} size={48} />
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
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => (isCurrent ? togglePlay() : playSong(song, [song]))}
          accessibilityLabel={isPlaying ? 'Dừng nghe thử' : 'Nghe thử'}
        >
          <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle'} size={30} color="#07875F" />
        </TouchableOpacity>
      </View>

      {/* Kết quả xét duyệt hai tầng (backend/utils/songReview.js) */}
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
          {EDIT_FIELDS.map(([k, label]) => (
            <TextInput
              key={k as string}
              style={styles.input}
              placeholder={label}
              placeholderTextColor="#888"
              value={draft[k as string]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [k as string]: v }))}
              autoCapitalize={k === 'sourceUrl' ? 'none' : 'sentences'}
            />
          ))}
          <LicensePicker value={draft.licenseType} onChange={(v) => setDraft((d) => ({ ...d, licenseType: v }))} />
          <View style={styles.actions}>
            <Action label="Lưu" color="#07875F" onPress={async () => { if (await onUpdate(song._id, draft)) setMode('view'); }} />
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

function Action({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.action, { borderColor: color }, disabled && { opacity: 0.35 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
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
  input: {
    height: 40, borderWidth: 1, borderColor: '#eee', borderRadius: 8, paddingHorizontal: 12,
    fontSize: 14, marginBottom: 8, color: '#333', backgroundColor: '#fafafa',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
