import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import CoverArt from '../../../components/CoverArt';
import { useLicenseLabels } from '../../../lib/meta';
import { api } from '../../../api/api';
import { showAlert, confirmAlert } from '../../../lib/alert';
import { formatTime } from '../../../lib/format';
import { ActionButton, Badge, Card, EmptyState, ErrorText, FormField, Pager, SearchField, SegmentedControl, Sheet } from 'hugo-music';
import { C, useLoader, s } from '../ui';
import { STATUS } from './SongsPanel';

type Artist = { name: string; songs: number; published: number; albums: number; cover?: string; photo: string | null; bio: string; popularity: number };
type Album = { key: string; title: string; artist: string; year?: number; tracks: number; published: number; cover?: string; licenses: string[] };
type Paged<K extends string, T> = { total: number; page: number; limit: number } & Record<K, T[]>;

// Artist & album: inferred from the music store itself (no separate album table — albums embedded in each song from the source
// release). Editing here is editing on EVERY related article at the same time.
export default function CatalogPanel() {
  const [tab, setTab] = useState<'artists' | 'albums'>('artists');
  return (
    <View>
      <SegmentedControl value={tab} onChange={(k) => setTab(k as typeof tab)} segments={[{ key: 'artists', label: 'Nghệ sĩ' }, { key: 'albums', label: 'Album' }]} />
      {tab === 'artists' ? <Artists /> : <Albums />}
    </View>
  );
}

function Artists() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Artist | null>(null);
  const { data, error, reload } = useLoader<Paged<'artists', Artist>>(() => api.admin.artists({ q, page, limit: 30 }), [q, page], 300);

  return (
    <View>
      <View style={s.toolbar}><SearchField style={{ flex: 1, minWidth: 200 }} value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Tìm nghệ sĩ…" /></View>
      <ErrorText message={error} />
      <Card padded={false} title={data ? `${data.total.toLocaleString('vi-VN')} nghệ sĩ` : 'Đang tải…'} subtitle="Sắp theo số bài trong kho">
        {data?.artists.map((a, i) => (
          <Pressable key={a.name} onPress={() => setOpen(a)} style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.sunken }]}>
            {a.photo
              ? <Image source={{ uri: a.photo }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              : <CoverArt title={a.name} size={40} radius={20} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{a.name}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{a.songs} bài · {a.albums} album · {a.published} đã xuất bản</Text>
            </View>
            {!a.photo && <Badge label="Chưa có ảnh" tone="gray" />}
          </Pressable>
        ))}
        {data && !data.artists.length && <EmptyState icon="person-outline" title="Không có nghệ sĩ nào khớp" />}
      </Card>
      {data && <Pager labels={{ previous: 'Trang trước', next: 'Trang sau', page: 'Trang', items: 'mục' }} page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      {open && <ArtistSheet artist={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload(); }} />}
    </View>
  );
}

function ArtistSheet({ artist, onClose, onSaved }: { artist: Artist; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(artist.name);
  const [photo, setPhoto] = useState(artist.photo || '');
  const [bio, setBio] = useState(artist.bio);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const renaming = name.trim() && name.trim() !== artist.name;
    if (renaming && !(await confirmAlert(`Đổi "${artist.name}" thành "${name.trim()}" trên ${artist.songs} bài? Nếu tên mới đã tồn tại, hai nghệ sĩ sẽ được gộp làm một.`))) return;
    setSaving(true);
    try {
      const r = await api.admin.updateArtist({
        name: artist.name, newName: renaming ? name.trim() : undefined,
        photo: photo.trim() !== (artist.photo || '') ? photo.trim() : undefined,
        bio: bio !== artist.bio ? bio : undefined,
      });
      if (r.renamedSongs) showAlert(`Đã đổi tên trên ${r.renamedSongs} bài.`);
      onSaved();
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet closeLabel="Đóng" visible title={artist.name} subtitle={`${artist.songs} bài · ${artist.albums} album`} onClose={onClose}
      footer={<><ActionButton variant="primary" icon="checkmark" title="Lưu" onPress={save} loading={saving} /><ActionButton variant="glass" title="Huỷ" onPress={onClose} /></>}>
      <FormField label="Tên nghệ sĩ (đổi để sửa lỗi chính tả hoặc gộp hai cách viết)" value={name} onChange={setName} />
      <FormField label="Ảnh (URL https)" value={photo} onChange={setPhoto} placeholder="https://…" />
      {!!photo && /^https:\/\//.test(photo) && <Image source={{ uri: photo }} style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 12 }} />}
      <FormField label="Tiểu sử" value={bio} onChange={setBio} multiline />
      <Text style={[s.rowSub, { marginTop: 4 }]}>Ảnh nghệ sĩ phải có nguồn hợp pháp (vd. Wikimedia Commons) — ghi nguồn trong tiểu sử.</Text>
    </Sheet>
  );
}

function Albums() {
  const LICENSE_LABELS = useLicenseLabels(); // GET /api/meta
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useLoader<Paged<'albums', Album>>(() => api.admin.albums({ q, page, limit: 30 }), [q, page], 300);

  return (
    <View>
      <View style={s.toolbar}><SearchField style={{ flex: 1, minWidth: 200 }} value={q} onChangeText={(v) => { setQ(v); setPage(1); }} placeholder="Tìm album hoặc nghệ sĩ…" /></View>
      <ErrorText message={error} />
      <Card padded={false} title={data ? `${data.total.toLocaleString('vi-VN')} album` : 'Đang tải…'}>
        {data?.albums.map((a, i) => (
          <Pressable key={a.key} onPress={() => setOpen(a.key)} style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.sunken }]}>
            <CoverArt uri={a.cover} title={a.title} size={44} radius={6} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{a.title || '(chưa đặt tên)'}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{a.artist}{a.year ? ` · ${a.year}` : ''} · {a.tracks} bài · {a.published} đã xuất bản</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {a.licenses.length ? a.licenses.slice(0, 2).map((l) => <Badge key={l} label={LICENSE_LABELS[l] || l} tone="gray" />) : <Badge label="Thiếu giấy phép" tone="red" />}
            </View>
          </Pressable>
        ))}
        {data && !data.albums.length && <EmptyState icon="disc-outline" title="Không có album nào khớp" />}
      </Card>
      {data && <Pager labels={{ previous: 'Trang trước', next: 'Trang sau', page: 'Trang', items: 'mục' }} page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      {open && <AlbumSheet albumKey={open} onClose={() => setOpen(null)} onSaved={reload} />}
    </View>
  );
}

function AlbumSheet({ albumKey, onClose, onSaved }: { albumKey: string; onClose: () => void; onSaved: () => void }) {
  const LICENSE_LABELS = useLicenseLabels(); // GET /api/meta
  const { data, error, reload } = useLoader<any>(() => api.admin.album(albumKey), [albumKey]);
  const [draft, setDraft] = useState<{ title: string; artist: string; year: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const d = draft ?? (data ? { title: data.title || '', artist: data.artist || '', year: data.year ? String(data.year) : '' } : null);
  const save = async () => {
    if (!d) return;
    setSaving(true);
    try {
      await api.admin.updateAlbum(albumKey, { title: d.title, artist: d.artist, ...(d.year ? { year: Number(d.year) } : {}) });
      setDraft(null);
      await reload();
      onSaved();
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet closeLabel="Đóng" visible title={data?.title || 'Album'} subtitle={data ? `${data.songs.length} bài` : undefined} onClose={onClose}
      footer={draft ? <><ActionButton variant="primary" icon="checkmark" title="Lưu cho mọi bài" onPress={save} loading={saving} /><ActionButton variant="glass" title="Huỷ" onPress={() => setDraft(null)} /></> : undefined}>
      <ErrorText message={error} />
      {d && (
        <>
          <FormField label="Tên album" value={d.title} onChange={(v) => setDraft({ ...d, title: v })} />
          <FormField label="Nghệ sĩ của album" value={d.artist} onChange={(v) => setDraft({ ...d, artist: v })} />
          <FormField label="Năm phát hành" value={d.year} onChange={(v) => setDraft({ ...d, year: v.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" />
        </>
      )}
      <Text style={[s.fieldLabel, { marginTop: 8 }]}>Danh sách bài</Text>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' }}>
        {data?.songs.map((t: any, i: number) => {
          const [label, tone] = STATUS[t.status || 'pending'];
          return (
            <View key={t._id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={{ width: 22, color: C.faint, fontWeight: '700' }}>{t.album?.trackNo || i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{t.artist} · {formatTime(t.duration || 0)}{t.licenseType ? ` · ${LICENSE_LABELS[t.licenseType]}` : ''}</Text>
              </View>
              <Badge label={label} tone={tone} />
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
