import { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CoverArt from '../../../components/CoverArt';
import { api } from '../../../utils/api';
import { showAlert } from '../../../utils/alert';
import { C, Card, Badge, Btn, Chips, Segmented, Pager, Empty, ErrorLine, useLoader, timeAgo, s, Tone } from '../ui';
import { SongListItem } from '../components/SongListItem';
import { useSongManager } from '../hooks/useSongManager';

// Trạng thái đăng tải = hai chặng: (1) hàng chờ duyệt — admin nghe thử, sửa, duyệt/từ chối; (2) xử lý sau
// duyệt — pipeline (thông tin phát hành → PSL → chuyển bài → HLS) chạy nền, bước nào lỗi thì chạy lại.
export default function PublishingPanel({ initial }: { initial?: Record<string, string> }) {
  const [tab, setTab] = useState(initial?.tab === 'pipeline' ? 'pipeline' : 'queue');
  return (
    <View>
      <Segmented value={tab} onChange={setTab} options={[{ key: 'queue', label: 'Hàng chờ duyệt' }, { key: 'pipeline', label: 'Xử lý sau duyệt' }]} />
      {tab === 'queue' ? <Queue /> : <Pipeline />}
    </View>
  );
}

function Queue() {
  const { status, setStatus, songs, counts, handleUpdate, handleReview, handleDelete, handleCoverChange } = useSongManager();
  return (
    <View>
      <View style={[s.toolbar, { marginBottom: 16 }]}>
        <Chips value={status} onChange={(k) => setStatus(k as typeof status)} options={[
          { key: 'pending', label: 'Chờ duyệt', count: counts.pending || 0 },
          { key: 'rejected', label: 'Đã từ chối', count: counts.rejected || 0 },
          { key: 'published', label: 'Mới xuất bản', count: counts.published || 0 },
        ]} />
      </View>
      <Text style={[s.rowSub, { marginBottom: 12 }]}>
        Tầng bản quyền là cổng cứng: thiếu nguồn, giấy phép hoặc ghi công thì không xuất bản được. Tầng chất lượng chỉ nhắc cần bổ sung.
      </Text>
      {songs.map((song) => (
        <SongListItem key={song._id} song={song} onUpdate={handleUpdate} onReview={handleReview} onDelete={handleDelete} onCoverChange={handleCoverChange} />
      ))}
      {!songs.length && <Card><Empty icon="checkmark-done-outline" title={status === 'pending' ? 'Hàng chờ trống — không có bài nào cần duyệt' : 'Không có bài nào'} /></Card>}
    </View>
  );
}

type Stage = { job: string; status: 'pending' | 'running' | 'ok' | 'failed' | 'skipped'; note: string };
type Run = { id: string; status: 'running' | 'ok' | 'failed'; startedAt: string; finishedAt?: string; trigger: string; stages: Stage[]; song: { _id: string; title: string; artist: string; coverArt?: string } | null };
const RUN: Record<string, [string, Tone]> = { running: ['Đang chạy', 'blue'], ok: ['Hoàn tất', 'green'], failed: ['Lỗi', 'red'] };
const STAGE_ICON: Record<Stage['status'], [keyof typeof Ionicons.glyphMap, string]> = {
  ok: ['checkmark-circle', C.accent], failed: ['close-circle', C.danger], running: ['sync-circle', C.info],
  pending: ['ellipse-outline', C.faint], skipped: ['remove-circle-outline', C.faint],
};
const JOB_LABEL: Record<string, string> = { release: 'Phát hành & bìa', psl: 'PSL', transition: 'Chuyển bài', hls: 'HLS', global: 'Độ phổ biến' };

function Pipeline() {
  const [status, setStatus] = useState('failed');
  const [page, setPage] = useState(1);
  const [retrying, setRetrying] = useState<string | null>(null);
  const { data, error, reload } = useLoader<{ total: number; page: number; limit: number; counts: Record<string, number>; runs: Run[] }>(
    () => api.admin.pipeline({ status, page, limit: 20 }), [status, page],
  );
  const retry = async (songId: string) => {
    setRetrying(songId);
    try {
      await api.admin.retryPipeline(songId);
      showAlert('Đã chạy lại — các bước đã xong được bỏ qua.');
      setTimeout(reload, 1500);
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setRetrying(null);
    }
  };
  const c = data?.counts || {};
  return (
    <View>
      <View style={[s.toolbar, { marginBottom: 16 }]}>
        <Chips value={status} onChange={(k) => { setStatus(k); setPage(1); }} options={[
          { key: 'failed', label: 'Lỗi', count: c.failed || 0 }, { key: 'running', label: 'Đang chạy', count: c.running || 0 },
          { key: 'ok', label: 'Hoàn tất', count: c.ok || 0 }, { key: '', label: 'Tất cả' },
        ]} />
        <Btn small icon="refresh" label="Làm mới" onPress={reload} />
      </View>
      <ErrorLine message={error} />
      <Card padded={false}>
        {data?.runs.map((r, i) => (
          <View key={r.id} style={[s.row, { alignItems: 'flex-start' }, i === 0 && { borderTopWidth: 0 }]}>
            <CoverArt uri={r.song?.coverArt} title={r.song?.title} size={44} radius={6} />
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.rowTitle, { flexShrink: 1 }]} numberOfLines={1}>{r.song?.title || '(bài đã xoá)'}</Text>
                <Badge label={RUN[r.status][0]} tone={RUN[r.status][1]} />
              </View>
              <Text style={s.rowSub}>{r.song?.artist} · bắt đầu {timeAgo(r.startedAt)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {r.stages.map((st) => (
                  <View key={st.job} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={STAGE_ICON[st.status][0]} size={15} color={STAGE_ICON[st.status][1]} />
                    <Text style={{ fontSize: 12, color: C.sub }}>{JOB_LABEL[st.job] || st.job}</Text>
                  </View>
                ))}
              </View>
              {r.stages.filter((st) => st.status === 'failed').map((st) => (
                <Text key={st.job} style={{ fontSize: 12, color: C.danger }} numberOfLines={3}>{JOB_LABEL[st.job] || st.job}: {st.note}</Text>
              ))}
            </View>
            {r.status === 'failed' && r.song && (
              <Btn small icon="refresh" label="Chạy lại" onPress={() => retry(r.song!._id)} loading={retrying === r.song._id} />
            )}
          </View>
        ))}
        {data && !data.runs.length && (
          <Empty icon="construct-outline" title={status === 'failed' ? 'Không có bài nào xử lý lỗi' : 'Chưa có lần xử lý nào'}
            hint="Mỗi bài được duyệt sẽ chạy: thông tin phát hành & ảnh bìa → PSL → phân tích chuyển bài → dựng HLS." />
        )}
      </Card>
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}
    </View>
  );
}
