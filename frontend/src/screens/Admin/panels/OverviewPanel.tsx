import { View, Text } from 'react-native';
import CoverArt from '../../../components/CoverArt';
import { api } from '../../../utils/api';
import { C, Card, Stat, Bars, Empty, ErrorLine, useLoader, s } from '../ui';
import type { AdminSection } from '../AdminDashboard';

type Overview = {
  songs: { published?: number; pending?: number; rejected?: number; licenseMissing: number };
  users: { total: number; new7d: number; active7d: number; disabled: number };
  listening: { plays7d: number; minutes7d: number; listeners7d: number; series: { day: string; plays: number }[] };
  topSongs: { _id: string; title: string; artist: string; coverArt?: string; plays: number }[];
  pipeline: Record<string, number>;
  rooms: { stations: number; blind: number };
};

// Tổng quan: số liệu cần hành động nằm trên cùng (chờ duyệt, thiếu giấy phép, xử lý lỗi) — bấm vào là
// tới đúng mục đã lọc sẵn.
export default function OverviewPanel({ go }: { go: (section: AdminSection, filter?: Record<string, string>) => void }) {
  const { data, error } = useLoader<Overview>(() => api.admin.overview(), []);
  if (!data) return <><ErrorLine message={error} />{!error && <Empty icon="hourglass-outline" title="Đang tải…" />}</>;
  const { songs, users, listening, pipeline, rooms } = data;

  return (
    <View>
      <ErrorLine message={error} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.faint, marginBottom: 10, letterSpacing: 0.4 }}>CẦN XỬ LÝ</Text>
      <View style={s.grid}>
        <Stat icon="time-outline" tone={songs.pending ? 'amber' : 'gray'} label="Bài chờ duyệt" value={songs.pending || 0}
          hint={songs.pending ? 'Mở hàng chờ →' : undefined} onPress={() => go('publishing')} />
        <Stat icon="shield-outline" tone={songs.licenseMissing ? 'red' : 'green'} label="Đã xuất bản nhưng thiếu giấy phép" value={songs.licenseMissing}
          hint={songs.licenseMissing ? 'Xem danh sách →' : 'Đủ giấy phép'} onPress={() => go('songs', { license: 'missing', status: 'published' })} />
        <Stat icon="construct-outline" tone={pipeline.failed ? 'red' : 'gray'} label="Xử lý sau duyệt bị lỗi" value={pipeline.failed || 0}
          hint={pipeline.running ? `${pipeline.running} đang chạy` : undefined} onPress={() => go('publishing', { tab: 'pipeline' })} />
        <Stat icon="lock-closed-outline" tone="gray" label="Tài khoản bị khoá" value={users.disabled} onPress={() => go('users', { status: 'disabled' })} />
      </View>

      <Text style={{ fontSize: 13, fontWeight: '700', color: C.faint, marginBottom: 10, letterSpacing: 0.4 }}>7 NGÀY QUA</Text>
      <View style={s.grid}>
        <Stat icon="play-circle-outline" tone="green" label="Lượt nghe" value={listening.plays7d} />
        <Stat icon="headset-outline" tone="blue" label="Phút nghe" value={listening.minutes7d} />
        <Stat icon="people-outline" tone="violet" label="Người dùng hoạt động" value={users.active7d} hint={`+${users.new7d} tài khoản mới`} onPress={() => go('users')} />
        <Stat icon="musical-notes-outline" tone="gray" label="Bài đã xuất bản" value={songs.published || 0} hint={`${songs.rejected || 0} bị từ chối`} onPress={() => go('songs')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Card title="Lượt nghe 14 ngày" subtitle={`${listening.listeners7d} người nghe trong 7 ngày · ${rooms.stations} kênh 24/7 đang mở`} style={{ flexGrow: 2, flexBasis: 420 }}>
          <Bars data={listening.series.map((d) => ({ label: d.day.slice(5).split('-').reverse().join('/'), value: d.plays }))} />
        </Card>
        <Card title="Nghe nhiều trong tuần" style={{ flexGrow: 1, flexBasis: 300 }} padded={false}>
          {data.topSongs.length ? data.topSongs.map((t, i) => (
            <View key={t._id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
              <Text style={{ width: 18, fontWeight: '700', color: C.faint }}>{i + 1}</Text>
              <CoverArt uri={t.coverArt} title={t.title} size={36} radius={6} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{t.artist}</Text>
              </View>
              <Text style={{ fontWeight: '700', color: C.text }}>{t.plays}</Text>
            </View>
          )) : <Empty icon="stats-chart-outline" title="Chưa có lượt nghe tính được" hint="Một lượt được tính khi nghe ≥ 30 giây hoặc hết bài." />}
        </Card>
      </View>
    </View>
  );
}
