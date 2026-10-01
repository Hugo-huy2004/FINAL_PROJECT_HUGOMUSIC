import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import CoverArt from '../../../components/CoverArt';
import { useLicenseLabels } from '../../../lib/meta';
import { api } from '../../../api/api';
import { showAlert, confirmAlert } from '../../../lib/alert';
import { ActionButton, Badge, Card, Chips, EmptyState, ErrorText, Icon, Pager, SearchField, Sheet } from 'hugo-music';
import { C, useLoader, s, Tone } from '../ui';
import { SongListItem } from '../components/SongListItem';
import UploadForm from '../components/UploadForm';
import type { ReviewedSong } from '../hooks/useSongManager';

type Row = ReviewedSong & { album?: { title?: string }; pipeline: 'queued' | 'running' | 'ok' | 'failed' | null };
type Page = { total: number; page: number; limit: number; songs: Row[] };

export const STATUS: Record<string, [string, Tone]> = {
  pending: ['Chờ duyệt', 'amber'], published: ['Đã xuất bản', 'green'], rejected: ['Từ chối', 'red'],
};
const PIPE: Record<string, [string, Tone]> = { queued: ['Đang chờ', 'amber'], running: ['Đang xử lý', 'blue'], ok: ['Xử lý xong', 'gray'], failed: ['Xử lý lỗi', 'red'] };

// Music management: search/filter the entire store, select multiple songs to approve/reject at the same time, click a song to preview, edit,
// browse, delete (SongListItem — same two-tier checker with queue).
export default function SongsPanel({ initial }: { initial?: Record<string, string> }) {
  const LICENSE_LABELS = useLicenseLabels(); // GET /api/meta
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initial?.status || '');
  const [license, setLicense] = useState(initial?.license || '');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Row | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useLoader<Page>(
    () => api.admin.songs({ q, status, license, page, limit: 30 }), [q, status, license, page], 300,
  );
  const filter = (fn: () => void) => { fn(); setPage(1); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (action: 'publish' | 'reject') => {
    const ids = [...selected];
    if (action === 'reject' && !(await confirmAlert(`Từ chối ${ids.length} bài? Bài sẽ bị gỡ khỏi kho nghe.`))) return;
    setBusy(true);
    try {
      const r = await api.admin.bulkSongs(ids, action);
      showAlert(r.failed.length
        ? `Xong ${r.done} bài. ${r.failed.length} bài chưa qua tầng bản quyền:\n${r.failed.slice(0, 5).map((f: any) => `• ${f.reason}`).join('\n')}`
        : `Xong ${r.done} bài.`);
      setSelected(new Set());
      reload();
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Operations on a post (reuse SongListItem) — then reload the table and update the details table.
  const act = async (fn: () => Promise<any>) => {
    try {
      const updated = await fn();
      await reload();
      if (updated?._id) setOpen((o) => (o ? { ...o, ...updated } : o));
      return true;
    } catch (e: any) {
      showAlert(e.message);
      return false;
    }
  };

  const upload = async (form: FormData) => {
    setUploading(true);
    try {
      try {
        await api.uploadSong(form);
      } catch (e: any) {
        // Duplicate items already in stock: ask again instead of silently creating a copy.
        if (e.status !== 409 || !(await confirmAlert(`${e.message}\n\nVẫn tải lên?`))) throw e;
        form.append('allowDuplicate', 'true');
        await api.uploadSong(form);
      }
      setShowUpload(false);
      filter(() => setStatus('pending'));
      showAlert('Đã tải lên — bài đang chờ duyệt.');
      return true;
    } catch (e: any) {
      showAlert(e.message);
      return false;
    } finally {
      setUploading(false);
    }
  };

  return (
    <View>
      <View style={s.toolbar}>
        <SearchField style={{ flex: 1, minWidth: 200 }} value={q} onChangeText={(v) => filter(() => setQ(v))} placeholder="Tìm tên bài, nghệ sĩ, album…" />
        <ActionButton variant="primary" icon="cloud-upload-outline" title="Tải bài lên" onPress={() => setShowUpload(true)} />
      </View>
      <View style={[s.toolbar, { marginBottom: 16 }]}>
        <Chips value={status} onChange={(k) => filter(() => setStatus(k))} options={[
          { key: '', label: 'Mọi trạng thái' }, { key: 'pending', label: 'Chờ duyệt' },
          { key: 'published', label: 'Đã xuất bản' }, { key: 'rejected', label: 'Từ chối' },
        ]} />
        <Chips value={license} onChange={(k) => filter(() => setLicense(k))} options={[
          { key: '', label: 'Mọi giấy phép' }, { key: 'missing', label: 'Thiếu giấy phép' },
          ...Object.entries(LICENSE_LABELS).map(([key, label]) => ({ key, label })),
        ]} />
      </View>

      <ErrorText message={error} />

      {selected.size > 0 && (
        <View style={[s.toolbar, { backgroundColor: C.infoBg, padding: 10, borderRadius: 12 }]}>
          <Text style={{ flex: 1, fontWeight: '600', color: C.info }}>Đã chọn {selected.size} bài</Text>
          <ActionButton size="sm" variant="primary" icon="checkmark" title="Xuất bản" onPress={() => bulk('publish')} loading={busy} />
          <ActionButton size="sm" variant="danger" icon="close" title="Từ chối" onPress={() => bulk('reject')} disabled={busy} />
          <ActionButton size="sm" variant="plain" title="Bỏ chọn" onPress={() => setSelected(new Set())} />
        </View>
      )}

      <Card padded={false} title={data ? `${data.total.toLocaleString('vi-VN')} bài` : 'Đang tải…'} subtitle={loading && data ? 'Đang cập nhật…' : undefined}>
        {data?.songs.map((song, i) => {
          const [statusLabel, statusTone] = STATUS[song.status || 'pending'];
          const on = selected.has(song._id);
          return (
            <Pressable key={song._id} onPress={() => setOpen(song)} style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.sunken }]}>
              <Pressable onPress={() => toggle(song._id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Chọn ${song.title}`}>
                <Icon name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? C.accent : C.faint} />
              </Pressable>
              <CoverArt uri={song.coverArt} title={song.title} size={40} radius={6} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{song.artist}{song.album?.title ? ` · ${song.album.title}` : ''}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 360 }}>
                <Badge label={statusLabel} tone={statusTone} />
                {song.licenseType
                  ? <Badge label={LICENSE_LABELS[song.licenseType]} tone="gray" icon="shield-checkmark-outline" />
                  : <Badge label="Thiếu giấy phép" tone="red" icon="shield-outline" />}
                {song.pipeline && <Badge label={PIPE[song.pipeline][0]} tone={PIPE[song.pipeline][1]} />}
                {!song.review.quality.pass && <Badge label="Cần bổ sung" tone="amber" />}
              </View>
            </Pressable>
          );
        })}
        {data && !data.songs.length && <EmptyState icon="musical-notes-outline" title="Không có bài nào khớp bộ lọc" />}
      </Card>
      {data && <Pager labels={{ previous: 'Trang trước', next: 'Trang sau', page: 'Trang', items: 'mục' }} page={page} total={data.total} limit={data.limit} onPage={setPage} />}

      <Sheet closeLabel="Đóng" visible={!!open} title={open?.title || ''} subtitle={open?.artist} onClose={() => setOpen(null)}>
        {open && (
          <SongListItem
            song={open}
            onUpdate={(id, fields) => act(() => api.updateSong(id, fields))}
            onReview={(id, decision, note) => act(() => api.reviewSong(id, decision, note))}
            onCoverChange={(id, form) => act(() => api.updateSongCover(id, form))}
            onDelete={async (id, title) => {
              if (await confirmAlert(`Xoá hẳn "${title}" (cả tệp trên R2)?`) && (await act(() => api.deleteSong(id)))) setOpen(null);
            }}
          />
        )}
      </Sheet>

      <Sheet closeLabel="Đóng" visible={showUpload} title="Tải bài lên" subtitle="Bài mới vào hàng chờ duyệt" onClose={() => setShowUpload(false)}>
        <UploadForm isUploading={uploading} onUpload={upload} />
      </Sheet>
    </View>
  );
}
