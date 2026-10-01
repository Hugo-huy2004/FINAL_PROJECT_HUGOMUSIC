import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import CoverArt from '../../../components/CoverArt';
import { api } from '../../../api/api';
import { showAlert } from '../../../lib/alert';
import { formatTime } from '../../../lib/format';
import type { AdminRoom } from '../../../rooms/types';
import RoomManager from '../components/RoomManager';
import { ActionButton, Badge, Card, EmptyState, ErrorText, SearchField, SegmentedControl, Sheet } from 'hugo-music';
import { C, useLoader, s } from '../ui';

type Pick = { _id: string; title: string; artist: string; coverArt?: string; duration?: number; genre?: string; popularity?: number };
type Live = {
  now: { song: Pick; startedAt: number } | null;
  queue: { id: string; song: Pick; addedByName: string; votes: number; priority: boolean }[];
  listeners: { userId: string; name: string }[];
};

// Listening room: create/edit/hide room and song selection rules (RoomManager), plus "Select song" table for each channel 24/7:
// - Currently playing: current song, listener, queue (admin ranked post + listener's suggestion) — remove/skip.
// - Selected articles: list of admins selected for the channel, given priority before the law when the channel chooses its own articles.
// - Suggestion: legal songs of the channel (popular first) or search in the whole store → choose for channel / continue playing.
export default function RoomsPanel() {
  const [curating, setCurating] = useState<AdminRoom | null>(null);
  return (
    <View>
      <Text style={[s.rowSub, { marginBottom: 16 }]}>
        Kênh 24/7 phát liên tục theo luật; người nghe đề xuất và bầu bài nếu kênh cho phép. Bấm “Chọn bài” để chọn nhạc cho kênh và điều khiển kênh đang phát.
      </Text>
      <RoomManager onCurate={setCurating} />
      {curating && <Curator room={curating} onClose={() => setCurating(null)} />}
    </View>
  );
}

function Curator({ room, onClose }: { room: AdminRoom; onClose: () => void }) {
  const [tab, setTab] = useState<'live' | 'pinned' | 'suggest'>('live');
  const [pinned, setPinned] = useState<Pick[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const live = useLoader<Live>(() => api.roomLive(room.id), [room.id]);
  const suggestions = useLoader<{ songs: Pick[]; matchedRules: boolean }>(() => api.roomSuggestions(room.id, q), [room.id, q], 300);
  useEffect(() => { api.roomPinnedSongs(room.id).then((r) => setPinned(r.songs)).catch((e) => setError(e.message)); }, [room.id]);
  // Now playing changes in real time — refreshing every 10 seconds while watching.
  useEffect(() => {
    if (tab !== 'live') return;
    const t = setInterval(live.reload, 10000);
    return () => clearInterval(t);
  }, [tab, live.reload]);

  const savePinned = async (next: Pick[]) => {
    const prev = pinned;
    setPinned(next);
    try {
      await api.updateRoom(room.id, { pinned: next.map((p) => p._id) });
      suggestions.reload();
    } catch (e: any) {
      setPinned(prev);
      showAlert(e.message);
    }
  };
  const control = async (fn: () => Promise<Live>) => {
    try {
      live.setData(await fn());
    } catch (e: any) {
      showAlert(e.message);
    }
  };

  const songRow = (p: Pick, i: number, actions: React.ReactNode, meta?: string) => (
    <View key={p._id + i} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
      <CoverArt uri={p.coverArt} title={p.title} size={40} radius={6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{p.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{p.artist}{meta ? ` · ${meta}` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>{actions}</View>
    </View>
  );

  const l = live.data;
  return (
    <Sheet closeLabel="Đóng" visible title={room.name} subtitle={room.tagline} onClose={onClose}>
      <ErrorText message={error || live.error} />
      <SegmentedControl value={tab} onChange={(k) => setTab(k as typeof tab)} segments={[
        { key: 'live', label: 'Đang phát' }, { key: 'pinned', label: `Đã chọn (${pinned.length})` }, { key: 'suggest', label: 'Gợi ý & tìm bài' },
      ]} />

      {tab === 'live' && (
        <View>
          <Card title="Bài đang phát" subtitle={l ? `${l.listeners.length} người đang nghe` : undefined}
            right={<ActionButton variant="glass" size="sm" icon="play-skip-forward" title="Bỏ qua" onPress={() => control(() => api.roomSkip(room.id))} />}>
            {l?.now ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CoverArt uri={l.now.song.coverArt} title={l.now.song.title} size={56} radius={8} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rowTitle, { fontSize: 16 }]} numberOfLines={1}>{l.now.song.title}</Text>
                  <Text style={s.rowSub}>{l.now.song.artist} · {formatTime(l.now.song.duration || 0)}</Text>
                </View>
              </View>
            ) : <EmptyState icon="radio-outline" title="Kênh chưa phát bài nào" />}
          </Card>
          <Card title="Hàng chờ" subtitle="Bài admin xếp phát trước; còn lại theo số phiếu bầu" padded={false}>
            {l?.queue.map((e, i) => songRow(e.song, i, (
              <>
                {e.priority ? <Badge label="Admin xếp" tone="violet" /> : <Badge label={`${e.votes} phiếu`} tone="gray" />}
                <ActionButton size="sm" variant="danger" icon="trash-outline" accessibilityLabel={`Gỡ ${e.song.title} khỏi hàng chờ`} onPress={() => control(() => api.roomDequeue(room.id, e.id))} />
              </>
            ), e.priority ? undefined : `đề xuất bởi ${e.addedByName}`))}
            {l && !l.queue.length && <EmptyState icon="list-outline" title="Hàng chờ trống" hint="Kênh sẽ tự chọn bài: bài đã chọn trước, rồi tới bài hợp luật." />}
          </Card>
        </View>
      )}

      {tab === 'pinned' && (
        <Card padded={false} title="Bài đã chọn cho kênh" subtitle="Khi hàng chờ trống, kênh ưu tiên phát các bài này (không lặp bài vừa phát)">
          {pinned.map((p, i) => songRow(p, i, (
            <>
              <ActionButton variant="glass" size="sm" icon="play-forward-outline" accessibilityLabel={`Phát tiếp ${p.title}`} onPress={() => control(() => api.roomEnqueue(room.id, p._id))} />
              <ActionButton size="sm" variant="danger" icon="remove-circle-outline" accessibilityLabel={`Bỏ chọn ${p.title}`} onPress={() => savePinned(pinned.filter((x) => x._id !== p._id))} />
            </>
          ), p.genre))}
          {!pinned.length && <EmptyState icon="bookmark-outline" title="Chưa chọn bài nào" hint="Vào “Gợi ý & tìm bài” để chọn. Không chọn thì kênh phát theo luật." />}
        </Card>
      )}

      {tab === 'suggest' && (
        <View>
          <View style={[s.toolbar, { marginBottom: 12 }]}><SearchField style={{ flex: 1, minWidth: 200 }} value={q} onChangeText={setQ} placeholder="Tìm trong cả kho theo tên bài hoặc nghệ sĩ…" /></View>
          <Card padded={false}
            title={q ? 'Kết quả tìm kiếm' : 'Gợi ý theo luật của kênh'}
            subtitle={q ? undefined : 'Bài hợp luật, phổ biến toàn cầu trước, chưa chọn cho kênh'}>
            {suggestions.data?.songs.map((p, i) => songRow(p, i, (
              <>
                <ActionButton variant="glass" size="sm" icon="play-forward-outline" title="Phát tiếp" onPress={() => control(() => api.roomEnqueue(room.id, p._id))} />
                <ActionButton size="sm" variant="primary" icon="add" title="Chọn" onPress={() => savePinned([...pinned, p])} />
              </>
            ), p.popularity ? `${p.popularity.toLocaleString('vi-VN')} lượt toàn cầu` : p.genre))}
            {suggestions.data && !suggestions.data.songs.length && <EmptyState icon="search-outline" title="Không có bài nào" />}
          </Card>
        </View>
      )}
      <Text style={[s.rowSub, { color: C.faint }]}>Mọi thay đổi có hiệu lực ngay với người đang nghe.</Text>
    </Sheet>
  );
}
