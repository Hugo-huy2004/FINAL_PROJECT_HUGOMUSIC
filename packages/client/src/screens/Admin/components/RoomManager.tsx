import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, TouchableOpacity } from 'react-native';
import { api } from '../../../api/api';
import { confirmAlert } from '../../../lib/alert';
import type { AdminRoom, RoomRules } from '../../../rooms/types';
import { Gradient, Spinner } from 'hugo-music';

// Administration › Listening rooms: admin create/edit/hide/delete all channels 24/7 and blind listening rooms (apps/server/src/modules/rooms/admin.js).
// Editing the currently broadcast channel takes effect immediately: the currently playing song remains the same, the next song follows the new rules. Law of choice
// The article has a preview of the number of legal articles + some sample articles before saving.
type Option = { key: string; label: string };
type Draft = Omit<AdminRoom, 'id' | 'order' | 'slug'> & { id?: string };

const HEX = /^#[0-9a-f]{6}$/i;
const RULE_FLAGS: { key: 'instrumental' | 'calm' | 'popular'; label: string }[] = [
  { key: 'instrumental', label: 'Không lời' },
  { key: 'calm', label: 'Nhẹ nhàng (tempo chậm, không quá lớn)' },
  { key: 'popular', label: 'Phổ biến toàn cầu' },
];
const blank = (kind: AdminRoom['kind']): Draft => ({
  kind, name: '', tagline: '', colors: ['#5AC8FA', '#5856D6'], active: true, allowRequests: kind === 'station', rules: {},
});
const toggle = (xs: string[] | undefined, x: string) => (xs?.includes(x) ? xs.filter((y) => y !== x) : [...(xs || []), x]);

export default function RoomManager({ onCurate }: { onCurate?: (room: AdminRoom) => void }) {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [genres, setGenres] = useState<Option[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.adminRooms();
      setRooms(res.rooms);
      setGenres(res.genres);
      setCategories(res.categories);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      // `pinned` is managed separately by the "Select cards" panel — this form does not override that list.
      const { id, pinned: _pinned, ...fields } = draft as Draft & { pinned?: string[] };
      if (id) await api.updateRoom(id, fields);
      else await api.createRoom(fields);
      setDraft(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const setActive = async (r: AdminRoom, active: boolean) => {
    setRooms((xs) => xs.map((x) => (x.id === r.id ? { ...x, active } : x)));
    await api.updateRoom(r.id, { active }).catch((e: any) => setError(e.message));
  };
  const remove = async (r: AdminRoom) => {
    if (!(await confirmAlert(`Xoá "${r.name}"? Người đang nghe sẽ bị đưa ra khỏi phòng.`))) return;
    await api.deleteRoom(r.id).catch((e: any) => setError(e.message));
    if (draft?.id === r.id) setDraft(null);
    load();
  };

  const section = (kind: AdminRoom['kind'], title: string, addLabel: string) => (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setDraft(blank(kind))}>
          <Text style={styles.addText}>+ {addLabel}</Text>
        </TouchableOpacity>
      </View>
      {draft && !draft.id && draft.kind === kind && (
        <Editor draft={draft} onChange={setDraft} genres={genres} categories={categories} saving={saving} onSave={save} onCancel={() => setDraft(null)} />
      )}
      {rooms.filter((r) => r.kind === kind).map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}>
            <Gradient colors={r.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, !r.active && { color: '#999' }]} numberOfLines={1}>{r.name}{r.active ? '' : ' · đang ẩn'}</Text>
              {!!r.tagline && <Text style={styles.meta} numberOfLines={1}>{r.tagline}</Text>}
            </View>
            <Switch value={r.active} onValueChange={(v) => setActive(r, v)} accessibilityLabel={`Hiện ${r.name}`} />
            {r.kind === 'station' && onCurate && (
              <TouchableOpacity onPress={() => onCurate(r)} style={styles.linkBtn}>
                <Text style={styles.link}>Chọn bài</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setDraft(draft?.id === r.id ? null : { ...r })} style={styles.linkBtn}>
              <Text style={styles.link}>{draft?.id === r.id ? 'Đóng' : 'Sửa'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(r)} style={styles.linkBtn}>
              <Text style={[styles.link, { color: '#FF3B30' }]}>Xoá</Text>
            </TouchableOpacity>
          </View>
          {draft?.id === r.id && (
            <Editor draft={draft} onChange={setDraft} genres={genres} categories={categories} saving={saving} onSave={save} onCancel={() => setDraft(null)} />
          )}
        </View>
      ))}
    </View>
  );

  return (
    <View>
      {error && <Text style={styles.error}>{error}</Text>}
      {section('station', 'Kênh 24/7', 'Kênh mới')}
      {section('blind', 'Phòng nghe mù', 'Phòng mới')}
    </View>
  );
}

function Editor({ draft, onChange, genres, categories, saving, onSave, onCancel }: {
  draft: Draft; onChange: (d: Draft) => void; genres: Option[]; categories: string[];
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setRules = (patch: Partial<RoomRules>) => set({ rules: { ...draft.rules, ...patch } });
  const station = draft.kind === 'station';
  const colorsOk = draft.colors.every((c) => HEX.test(c));

  // Preview the rules: wait for the admin to stop clicking for 400 ms and then ask the server how many posts meet the rules.
  const rulesKey = JSON.stringify(draft.rules);
  useEffect(() => {
    if (!station) return;
    const t = setTimeout(() => api.previewRoomRules(draft.rules).then(setPreview).catch(() => setPreview(null)), 400);
    return () => clearTimeout(t);
  }, [rulesKey, station]);

  const chips = (options: Option[], selected: string[] | undefined, onPick: (k: string) => void, tone = '#007AFF') => (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected?.includes(o.key);
        return (
          <TouchableOpacity key={o.key} onPress={() => onPick(o.key)} style={[styles.chip, on && { backgroundColor: tone, borderColor: tone }]}>
            <Text style={[styles.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.editor}>
      <Gradient colors={colorsOk ? draft.colors : ['#ccc', '#999']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <Text style={styles.bannerTitle} numberOfLines={1}>{draft.name || 'Tên phòng'}</Text>
        {!!draft.tagline && <Text style={styles.bannerSub} numberOfLines={2}>{draft.tagline}</Text>}
      </Gradient>

      <Text style={styles.label}>Tên</Text>
      <TextInput value={draft.name} onChangeText={(name) => set({ name })} maxLength={40} style={styles.input} placeholder="Lofi · Chill" />
      <Text style={styles.label}>Khẩu hiệu</Text>
      <TextInput value={draft.tagline} onChangeText={(tagline) => set({ tagline })} maxLength={120} style={styles.input} placeholder="Giai điệu thư thái chạy suốt 24/7" />
      <Text style={styles.label}>Màu (mã hex)</Text>
      <View style={styles.row}>
        {[0, 1].map((i) => (
          <TextInput
            key={i}
            value={draft.colors[i]}
            onChangeText={(c) => set({ colors: (i ? [draft.colors[0], c] : [c, draft.colors[1]]) as [string, string] })}
            autoCapitalize="none"
            maxLength={7}
            style={[styles.input, { flex: 1 }, !HEX.test(draft.colors[i]) && { borderColor: '#FF3B30' }]}
          />
        ))}
      </View>

      {station && (
        <>
          <View style={[styles.row, styles.toggleRow]}>
            <Text style={styles.toggleLabel}>Cho người nghe đề xuất/bầu bài</Text>
            <Switch value={!!draft.allowRequests} onValueChange={(allowRequests) => set({ allowRequests })} />
          </View>

          <Text style={styles.label}>Chỉ phát thể loại</Text>
          {chips(genres, draft.rules.groups, (k) => setRules({ groups: toggle(draft.rules.groups, k) }))}
          <Text style={styles.label}>Loại trừ thể loại</Text>
          {chips(genres, draft.rules.excludeGroups, (k) => setRules({ excludeGroups: toggle(draft.rules.excludeGroups, k) }), '#FF3B30')}
          <Text style={styles.label}>Danh mục</Text>
          {chips(categories.map((c) => ({ key: c, label: c })), draft.rules.categories, (k) => setRules({ categories: toggle(draft.rules.categories, k) }))}
          {RULE_FLAGS.map((f) => (
            <View key={f.key} style={[styles.row, styles.toggleRow]}>
              <Text style={styles.toggleLabel}>{f.label}</Text>
              <Switch value={!!draft.rules[f.key]} onValueChange={(v) => setRules({ [f.key]: v })} />
            </View>
          ))}

          <View style={styles.preview}>
            {preview ? (
              <>
                <Text style={[styles.previewCount, !preview.count && { color: '#FF3B30' }]}>
                  {preview.count ? `${preview.count} bài hợp luật` : 'Không bài nào hợp luật — kênh sẽ phát cả kho'}
                </Text>
                {preview.sample.map((s) => <Text key={s} style={styles.meta} numberOfLines={1}>♪ {s}</Text>)}
              </>
            ) : <Spinner />}
          </View>
        </>
      )}

      <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 12 }]}>
        <TouchableOpacity onPress={onCancel} style={styles.linkBtn}><Text style={styles.link}>Huỷ</Text></TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={saving || !draft.name.trim() || !colorsOk}
          style={[styles.saveBtn, (saving || !draft.name.trim() || !colorsOk) && { opacity: 0.4 }]}
        >
          {saving ? <Spinner color="#fff" /> : <Text style={styles.saveText}>{draft.id ? 'Lưu' : 'Tạo'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 32 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(0,122,255,0.1)', borderRadius: 20 },
  addText: { color: '#007AFF', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 8 },
  name: { fontSize: 15, fontWeight: '600', color: '#000' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  linkBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  link: { color: '#007AFF', fontWeight: '600' },
  error: { color: '#FF3B30', marginBottom: 12 },
  editor: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  banner: { borderRadius: 12, padding: 16, minHeight: 88, justifyContent: 'flex-end', marginBottom: 8 },
  bannerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  bannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#000' },
  toggleRow: { justifyContent: 'space-between', marginTop: 12 },
  toggleLabel: { fontSize: 15, color: '#000', flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#ddd' },
  chipText: { fontSize: 13, color: '#000' },
  preview: { marginTop: 16, padding: 12, backgroundColor: '#f4f4f6', borderRadius: 8, minHeight: 44, justifyContent: 'center' },
  previewCount: { fontSize: 15, fontWeight: '700', color: '#34C759', marginBottom: 4 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
});
