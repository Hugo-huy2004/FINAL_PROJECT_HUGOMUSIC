import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import CoverArt from '../../../components/CoverArt';
import { API_BASE_URL, api } from '../../../api/api';
import { showAlert, confirmAlert } from '../../../lib/alert';
import { ActionButton, Badge, BarChart, Card, Chips, EmptyState, ErrorText, Pager, SearchField, Sheet, StatCard } from 'hugo-music';
import { C, useLoader, timeAgo, s } from '../ui';

type UserRow = {
  _id: string; username: string; nickname?: string; email: string; emailVerified: boolean; phone?: string; role: 'user' | 'admin';
  disabled: boolean; googleLinked: boolean; hasPassword: boolean; avatarUrl?: string; createdAt: string; lastSeenAt?: string;
  favorites: number; plays: number; minutes: number; playlists: number;
};

const avatarUri = (u?: string) => (u && u.startsWith('/') ? `${API_BASE_URL}${u}` : u);
function Avatar({ user, size = 36 }: { user: { avatarUrl?: string; nickname?: string; username: string }; size?: number }) {
  const uri = avatarUri(user.avatarUrl);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.accentBg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.accent, fontWeight: '800', fontSize: size * 0.42 }}>{(user.nickname || user.username).slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

// User: find/filter accounts; click to see everything related to a person (listening habits, devices,
// playlists, likes) and account protection operations. There is no role change — only admin promotion
// qua script (apps/server/scripts/admin/createAdmin.js).
export default function UsersPanel({ initial }: { initial?: Record<string, string> }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState(initial?.status || '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, reload } = useLoader<{ total: number; page: number; limit: number; users: UserRow[] }>(
    () => api.admin.users({ q, role, status, page, limit: 30 }), [q, role, status, page], 300,
  );
  const filter = (fn: () => void) => { fn(); setPage(1); };

  return (
    <View>
      <View style={s.toolbar}><SearchField style={{ flex: 1, minWidth: 200 }} value={q} onChangeText={(v) => filter(() => setQ(v))} placeholder="Tìm tên, email, số điện thoại…" /></View>
      <View style={[s.toolbar, { marginBottom: 16 }]}>
        <Chips value={role} onChange={(k) => filter(() => setRole(k))} options={[{ key: '', label: 'Mọi vai trò' }, { key: 'user', label: 'Người dùng' }, { key: 'admin', label: 'Quản trị' }]} />
        <Chips value={status} onChange={(k) => filter(() => setStatus(k))} options={[{ key: '', label: 'Mọi trạng thái' }, { key: 'active', label: 'Đang hoạt động' }, { key: 'disabled', label: 'Đã khoá' }]} />
      </View>
      <ErrorText message={error} />
      <Card padded={false} title={data ? `${data.total.toLocaleString('vi-VN')} tài khoản` : 'Đang tải…'}>
        {data?.users.map((u, i) => (
          <Pressable key={u._id} onPress={() => setOpen(u._id)} style={({ pressed }) => [s.row, i === 0 && { borderTopWidth: 0 }, pressed && { backgroundColor: C.sunken }]}>
            <Avatar user={u} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{u.nickname || u.username} <Text style={{ color: C.faint, fontWeight: '400' }}>@{u.username}</Text></Text>
              <Text style={s.rowSub} numberOfLines={1}>{u.email} · {u.plays} lượt nghe · {u.playlists} danh sách · hoạt động {timeAgo(u.lastSeenAt)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {u.role === 'admin' && <Badge label="Quản trị" tone="violet" icon="shield-half-outline" />}
              {u.disabled && <Badge label="Đã khoá" tone="red" icon="lock-closed-outline" />}
              {u.googleLinked && <Badge label="Google" tone="blue" />}
              {!u.emailVerified && <Badge label="Email chưa xác minh" tone="amber" />}
            </View>
          </Pressable>
        ))}
        {data && !data.users.length && <EmptyState icon="people-outline" title="Không có tài khoản nào khớp" />}
      </Card>
      {data && <Pager labels={{ previous: 'Trang trước', next: 'Trang sau', page: 'Trang', items: 'mục' }} page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      {open && <UserSheet id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </View>
  );
}

function UserSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useLoader<any>(() => api.admin.user(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const u = data?.user;
  const protectedAccount = u?.role === 'admin';

  const act = async (key: string, confirm: string, fn: () => Promise<unknown>, done: string, close = false) => {
    if (!(await confirmAlert(confirm))) return;
    setBusy(key);
    try {
      await fn();
      showAlert(done);
      onChanged();
      if (close) onClose(); else await reload();
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const footer = u && !protectedAccount ? (
    <>
      <ActionButton variant="glass" icon={u.disabled ? 'lock-open-outline' : 'lock-closed-outline'} title={u.disabled ? 'Mở khoá' : 'Khoá tài khoản'} loading={busy === 'lock'}
        onPress={() => act('lock', u.disabled ? `Mở khoá ${u.username}?` : `Khoá ${u.username}? Người này bị đăng xuất khỏi mọi thiết bị và không đăng nhập được.`,
          () => api.admin.setUserDisabled(id, !u.disabled), u.disabled ? 'Đã mở khoá.' : 'Đã khoá tài khoản.')} />
      <ActionButton variant="glass" icon="log-out-outline" title="Đăng xuất mọi thiết bị" loading={busy === 'revoke'}
        onPress={() => act('revoke', `Đăng xuất ${u.username} khỏi mọi thiết bị?`, () => api.admin.revokeSessions(id), 'Đã thu hồi mọi phiên.')} />
      <ActionButton variant="danger" icon="trash-outline" title="Xoá tài khoản" loading={busy === 'delete'}
        onPress={() => act('delete', `Xoá vĩnh viễn ${u.username} và mọi danh sách phát? Không hoàn tác được.`, () => api.admin.deleteUser(id), 'Đã xoá tài khoản.', true)} />
    </>
  ) : undefined;

  return (
    <Sheet closeLabel="Đóng" visible title={u ? u.nickname || u.username : 'Người dùng'} subtitle={u ? `@${u.username} · ${u.email}` : undefined} onClose={onClose} footer={footer}>
      <ErrorText message={error} />
      {!u ? <EmptyState icon="hourglass-outline" title="Đang tải…" /> : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <Avatar user={u} size={56} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge label={u.role === 'admin' ? 'Quản trị' : 'Người dùng'} tone={u.role === 'admin' ? 'violet' : 'gray'} />
                {u.disabled && <Badge label="Đã khoá" tone="red" icon="lock-closed-outline" />}
                <Badge label={u.emailVerified ? 'Email đã xác minh' : 'Email chưa xác minh'} tone={u.emailVerified ? 'green' : 'amber'} />
                {u.googleLinked && <Badge label="Liên kết Google" tone="blue" />}
                {!u.hasPassword && <Badge label="Không có mật khẩu" tone="gray" />}
              </View>
              <Text style={s.rowSub}>Tạo {new Date(u.createdAt).toLocaleDateString('vi-VN')} · hoạt động {timeAgo(u.lastSeenAt)}{u.passwordChangedAt ? ` · đổi mật khẩu ${timeAgo(u.passwordChangedAt)}` : ''}</Text>
            </View>
          </View>
          {protectedAccount && (
            <Text style={[s.rowSub, { backgroundColor: C.violetBg, color: C.violet, padding: 10, borderRadius: 10, marginBottom: 16 }]}>
              Tài khoản quản trị không khoá/xoá được ở đây — đổi vai trò chỉ qua script trên máy chủ.
            </Text>
          )}

          <View style={s.grid}>
            <StatCard icon="play-circle-outline" tone="green" label="Lượt nghe" value={data.stats.plays} />
            <StatCard icon="headset-outline" tone="blue" label="Phút nghe" value={data.stats.minutes} />
            <StatCard icon="checkmark-done-outline" tone="violet" label="Nghe hết bài" value={`${data.stats.completionRate}%`} />
            <StatCard icon="speedometer-outline" tone="gray" label="Thời gian ra tiếng TB" value={data.stats.avgStartupMs ? `${data.stats.avgStartupMs} ms` : '—'} hint={data.stats.rebuffers ? `${data.stats.rebuffers} lần đứt tiếng` : undefined} />
          </View>

          <Card title="Hoạt động 30 ngày">
            {data.activity.length
              ? <BarChart height={80} data={data.activity.map((a: any) => ({ label: a.day.slice(5).split('-').reverse().join('/'), value: a.plays }))} />
              : <EmptyState icon="calendar-outline" title="Không nghe gì trong 30 ngày" />}
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Card title="Nghe nhiều nhất" style={{ flexGrow: 1, flexBasis: 240 }} padded={false}>
              {data.topSongs.map((t: any, i: number) => (
                <View key={t._id} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
                  <CoverArt uri={t.coverArt} title={t.title} size={32} radius={5} />
                  <View style={{ flex: 1, minWidth: 0 }}><Text style={s.rowTitle} numberOfLines={1}>{t.title}</Text><Text style={s.rowSub} numberOfLines={1}>{t.artist}</Text></View>
                  <Text style={{ fontWeight: '700' }}>{t.plays}</Text>
                </View>
              ))}
              {!data.topSongs.length && <EmptyState title="Chưa có" />}
            </Card>
            <Card title="Thể loại & thiết bị" style={{ flexGrow: 1, flexBasis: 200 }}>
              {data.topGenres.map((g: any) => <Text key={g.genre} style={[s.rowSub, { marginBottom: 4 }]}>{g.genre}: <Text style={{ fontWeight: '700', color: C.text }}>{g.plays}</Text></Text>)}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {data.platforms.map((p: any) => <Badge key={p.platform} label={`${p.platform} · ${p.plays}`} tone="blue" />)}
              </View>
              {!!u.musicGenres.length && <Text style={[s.rowSub, { marginTop: 10 }]}>Gu đã chọn: {u.musicGenres.join(', ')}</Text>}
            </Card>
          </View>

          <Card title="Nghe gần đây" padded={false}>
            {data.recent.map((r: any, i: number) => (
              <View key={i} style={[s.row, i === 0 && { borderTopWidth: 0 }]}>
                <CoverArt uri={r.song.coverArt} title={r.song.title} size={32} radius={5} />
                <View style={{ flex: 1, minWidth: 0 }}><Text style={s.rowTitle} numberOfLines={1}>{r.song.title}</Text><Text style={s.rowSub} numberOfLines={1}>{r.song.artist} · {Math.round((r.playedMs || 0) / 1000)} giây{r.cdn ? ` · ${r.cdn}` : ''}</Text></View>
                <Text style={s.rowSub}>{timeAgo(r.at)}</Text>
              </View>
            ))}
            {!data.recent.length && <EmptyState title="Chưa nghe bài nào" />}
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Card title={`Danh sách phát (${data.playlists.length})`} style={{ flexGrow: 1, flexBasis: 220 }}>
              {data.playlists.map((p: any) => <Text key={p._id} style={[s.rowSub, { marginBottom: 4 }]}>{p.name} · {p.songs} bài</Text>)}
              {!data.playlists.length && <Text style={s.rowSub}>Chưa có</Text>}
            </Card>
            <Card title={`Bài đã thích (${u.favorites})`} style={{ flexGrow: 1, flexBasis: 220 }}>
              {data.favorites.map((f: any) => <Text key={f._id} style={[s.rowSub, { marginBottom: 4 }]} numberOfLines={1}>{f.title} — {f.artist}</Text>)}
              {!data.favorites.length && <Text style={s.rowSub}>Chưa có</Text>}
            </Card>
          </View>

          <Card title="Thông tin hồ sơ">
            <Text style={s.rowSub}>Số điện thoại: {u.phone || '—'}</Text>
            <Text style={s.rowSub}>Ngày sinh: {u.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString('vi-VN') : '—'}</Text>
            <Text style={s.rowSub}>Địa chỉ: {[u.address?.detail, u.address?.ward, u.address?.province, u.address?.country].filter(Boolean).join(', ') || '—'}</Text>
          </Card>
        </>
      )}
    </Sheet>
  );
}
