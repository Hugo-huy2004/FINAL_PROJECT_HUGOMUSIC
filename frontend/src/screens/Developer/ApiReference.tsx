import { useState } from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL, getAuthToken } from '../../utils/api';
import { confirmAlert } from '../../utils/alert';
import { C, Card, Badge, Btn, Chips, SearchBar, Empty, ErrorLine, useLoader, s as ui, Tone } from '../Admin/ui';

type Route = {
  method: string; path: string; params: string[]; auth: 'public' | 'optional' | 'user' | 'admin';
  rateLimited: boolean; upload: boolean; summary: string | null;
  query?: Record<string, string>; body?: Record<string, string>; returns?: string;
};
type Docs = {
  generatedAt: string;
  groups: { prefix: string; title: string; tier?: string; routes: Route[] }[];
  socketEvents: { dir: string; name: string; auth?: string; summary: string; payload: string }[];
};

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
const METHOD_TONE: Record<string, Tone> = { GET: 'blue', POST: 'green', PATCH: 'amber', PUT: 'amber', DELETE: 'red' };
const AUTH: Record<Route['auth'], [string, Tone]> = {
  public: ['Công khai', 'gray'], optional: ['Tuỳ chọn đăng nhập', 'blue'], user: ['Cần đăng nhập', 'violet'], admin: ['Chỉ admin', 'red'],
};

// Tài liệu API tự sinh: đọc GET /api/docs (backend/utils/apiDocs.js đi qua CHÍNH các route đang chạy), nên
// trang này luôn khớp code — route mới tự xuất hiện, mức quyền/giới hạn tần suất lấy từ middleware thật.
export default function ApiReference() {
  const { data, error } = useLoader<Docs>(() => fetch(`${API_BASE_URL}/api/docs`).then((r) => r.json()), []);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [auth, setAuth] = useState('');
  const all = data?.groups.flatMap((g) => g.routes.map((r) => ({ ...r, group: g.title, tier: g.tier }))) || [];
  const match = (r: Route & { group: string }) => (!group || r.group === group) && (!auth || r.auth === auth)
    && (!q || `${r.method} ${r.path} ${r.summary}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <View>
      <Guide />
      <ErrorLine message={error} />
      <View style={ui.toolbar}><SearchBar value={q} onChange={setQ} placeholder="Tìm endpoint: đường dẫn, mô tả…" /></View>
      <View style={[ui.toolbar, { marginBottom: 16 }]}>
        <Chips value={group} onChange={setGroup} options={[{ key: '', label: 'Mọi nhóm', count: all.length }, ...(data?.groups || []).map((g) => ({ key: g.title, label: g.title, count: g.routes.length }))]} />
        <Chips value={auth} onChange={setAuth} options={[{ key: '', label: 'Mọi quyền' }, ...Object.entries(AUTH).map(([k, [l]]) => ({ key: k, label: l }))]} />
      </View>
      {data?.groups.map((g) => {
        const routes = g.routes.filter((r) => match({ ...r, group: g.title }));
        if (!routes.length) return null;
        return (
          <Card key={g.prefix} title={g.title} subtitle={`${g.prefix}${g.tier === 'realtime' ? ' · chạy ở tầng realtime (bộ cân bằng tải định tuyến về đây)' : ''}`} padded={false}>
            {routes.map((r, i) => <Endpoint key={r.method + r.path} r={r} first={i === 0} />)}
          </Card>
        );
      })}
      {data && !all.some(match) && <Card><Empty icon="search-outline" title="Không có endpoint nào khớp" /></Card>}
      {data && <SocketEvents events={data.socketEvents} />}
      {data && <Text style={[ui.rowSub, { color: C.faint, textAlign: 'center' }]}>Sinh lúc {new Date(data.generatedAt).toLocaleString('vi-VN')} từ route đang chạy · {all.length} endpoint · {data.socketEvents.length} sự kiện realtime</Text>}
    </View>
  );
}

function Guide() {
  const items: [keyof typeof Ionicons.glyphMap, string, string][] = [
    ['server-outline', 'Địa chỉ', `Mọi endpoint nằm dưới ${API_BASE_URL}. Dữ liệu vào/ra là JSON (trừ endpoint nhận tệp: multipart/form-data).`],
    ['key-outline', 'Xác thực', 'Gửi header Authorization: Bearer <token>. Token lấy từ POST /api/auth/login (admin: thêm bước /verify-otp với mã Telegram). Token sống 30 ngày; đổi/đặt lại mật khẩu thì mọi token cũ hết hiệu lực.'],
    ['alert-circle-outline', 'Lỗi', 'Lỗi luôn có dạng { message }. 401 + sessionExpired: phiên đã chết → đăng nhập lại. 401 + requiresLogin: khách hết 3 bài nghe miễn phí trong ngày. 403: tài khoản bị khoá. 429: vượt giới hạn tần suất.'],
    ['speedometer-outline', 'Giới hạn & bộ đệm', 'Endpoint đánh dấu "Giới hạn tần suất" cho 50 request / 15 phút / IP (dùng chung giữa mọi máy chủ qua Redis). GET trả ETag — gửi If-None-Match để nhận 304 rỗng khi dữ liệu không đổi.'],
    ['musical-notes-outline', 'Phát nhạc', 'GET /api/songs/:id/playback trả token (5–10 phút) và URL đã ký trên mọi CDN (sources). Client chọn CDN theo độ trễ đo được; CDN lỗi thì chuyển CDN khác, cuối cùng là /api/songs/stream/:id.'],
    ['git-network-outline', 'Kiến trúc', 'Bộ cân bằng tải (lb/) chia REST cho nhiều máy chủ API; /api/rooms và Socket.IO đi về tầng realtime. Phản hồi có header X-Instance cho biết máy chủ nào đã xử lý.'],
  ];
  return (
    <Card title="Hướng dẫn dùng API" subtitle="Đọc trước khi gọi — áp dụng cho mọi endpoint bên dưới">
      <View style={{ gap: 14 }}>
        {items.map(([icon, t, d]) => (
          <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
            <Ionicons name={icon} size={18} color={C.accent} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={ui.rowTitle}>{t}</Text>
              <Text style={[ui.rowSub, { lineHeight: 19 }]}>{d}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Endpoint({ r, first }: { r: Route; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [auth, tone] = AUTH[r.auth];
  return (
    <View style={[{ borderTopWidth: first ? 0 : 1, borderColor: C.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={({ pressed }) => [ui.row, { borderTopWidth: 0 }, pressed && { backgroundColor: C.sunken }]} accessibilityRole="button" accessibilityLabel={`${r.method} ${r.path}`}>
        <View style={{ width: 64 }}><Badge label={r.method} tone={METHOD_TONE[r.method] || 'gray'} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: mono, fontSize: 13, fontWeight: '600', color: C.text }} numberOfLines={1}>{r.path}</Text>
          <Text style={ui.rowSub} numberOfLines={open ? undefined : 1}>{r.summary || 'Chưa mô tả — thêm doc() vào route'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 260 }}>
          <Badge label={auth} tone={tone} />
          {r.rateLimited && <Badge label="Giới hạn tần suất" tone="amber" />}
          {r.upload && <Badge label="Nhận tệp" tone="blue" />}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.faint} />
      </Pressable>
      {open && <Detail r={r} />}
    </View>
  );
}

function Fields({ title, fields }: { title: string; fields?: Record<string, string> }) {
  if (!fields || !Object.keys(fields).length) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={ui.fieldLabel}>{title}</Text>
      {Object.entries(fields).map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 10, paddingVertical: 3 }}>
          <Text style={{ fontFamily: mono, fontSize: 12, color: C.violet, minWidth: 140 }}>{k}</Text>
          <Text style={[ui.rowSub, { flex: 1, marginTop: 0 }]}>{v || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function Detail({ r }: { r: Route }) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(r.query ? Object.keys(r.query).map((k) => `${k}=`).join('&') : '');
  const [body, setBody] = useState(r.body && !r.upload ? JSON.stringify(Object.fromEntries(Object.keys(r.body).map((k) => [k, ''])), null, 2) : '');
  const [result, setResult] = useState<{ status: number; ms: number; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const url = () => {
    const path = r.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k] || `:${k}`));
    const qs = query.split('&').filter((p) => p && !p.endsWith('=')).join('&');
    return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  };
  const curl = [
    `curl -X ${r.method} '${url()}'`,
    r.auth !== 'public' ? "  -H 'Authorization: Bearer <token>'" : null,
    body && r.method !== 'GET' ? `  -H 'Content-Type: application/json' -d '${body.replace(/\s+/g, ' ')}'` : null,
  ].filter(Boolean).join(' \\\n');

  const send = async () => {
    if (r.method !== 'GET' && !(await confirmAlert(`Gửi ${r.method} ${r.path}? Lệnh này có thể thay đổi dữ liệu thật.`))) return;
    setSending(true);
    const t0 = Date.now();
    try {
      const token = getAuthToken();
      const res = await fetch(url(), {
        method: r.method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && r.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
        body: body && r.method !== 'GET' ? body : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* không phải JSON */ }
      setResult({ status: res.status, ms: Date.now() - t0, text: pretty.length > 6000 ? `${pretty.slice(0, 6000)}\n… (cắt bớt, tổng ${pretty.length} ký tự)` : pretty });
    } catch (e: any) {
      setResult({ status: 0, ms: Date.now() - t0, text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16, backgroundColor: C.sunken }}>
      <View style={{ paddingTop: 12 }}>
        <Fields title="Tham số truy vấn (query)" fields={r.query} />
        <Fields title={r.upload ? 'Body (multipart/form-data)' : 'Body (JSON)'} fields={r.body} />
        {!!r.returns && (
          <View style={{ marginBottom: 12 }}>
            <Text style={ui.fieldLabel}>Trả về</Text>
            <Text style={{ fontFamily: mono, fontSize: 12, color: C.violet }}>{r.returns}</Text>
          </View>
        )}
      </View>
      <Text style={ui.fieldLabel}>Ví dụ curl</Text>
      <View style={{ backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <Text selectable style={{ fontFamily: mono, fontSize: 12, color: '#E2E8F0', lineHeight: 18 }}>{curl}</Text>
      </View>

      <Text style={ui.fieldLabel}>Gửi thử (dùng phiên đăng nhập hiện tại{getAuthToken() ? '' : ' — đang là khách'})</Text>
      {r.params.map((p) => (
        <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text style={{ fontFamily: mono, fontSize: 12, width: 90, color: C.sub }}>:{p}</Text>
          <TextInput value={params[p] || ''} onChangeText={(v) => setParams({ ...params, [p]: v })} placeholder={p} placeholderTextColor={C.faint} style={[ui.input, { flex: 1 }]} autoCapitalize="none" />
        </View>
      ))}
      {!!r.query && <TextInput value={query} onChangeText={setQuery} placeholder="key=value&key2=value2" placeholderTextColor={C.faint} style={[ui.input, { fontFamily: mono, marginBottom: 8 }]} autoCapitalize="none" />}
      {!!body && <TextInput value={body} onChangeText={setBody} multiline style={[ui.input, { fontFamily: mono, height: 110, paddingTop: 8, textAlignVertical: 'top', marginBottom: 8 }]} autoCapitalize="none" />}
      {r.upload
        ? <Text style={ui.rowSub}>Endpoint nhận tệp — thử bằng curl với -F (multipart).</Text>
        : <Btn variant="primary" icon="paper-plane-outline" label="Gửi" onPress={send} loading={sending} style={{ alignSelf: 'flex-start' }} />}
      {result && (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <Badge label={result.status ? `HTTP ${result.status}` : 'Lỗi mạng'} tone={result.status >= 200 && result.status < 300 ? 'green' : result.status === 304 ? 'blue' : 'red'} />
            <Badge label={`${result.ms} ms`} tone="gray" />
          </View>
          <View style={{ backgroundColor: '#0F172A', borderRadius: 10, padding: 12, maxHeight: 360 }}>
            <Text selectable style={{ fontFamily: mono, fontSize: 12, color: '#E2E8F0', lineHeight: 18 }}>{result.text || '(rỗng)'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function SocketEvents({ events }: { events: Docs['socketEvents'] }) {
  return (
    <Card title="Realtime (Socket.IO)" subtitle="Kết nối tới cùng địa chỉ API, chỉ transport websocket; gửi token trong auth: { token }. Sự kiện client→server trả lời qua ack." padded={false}>
      {events.map((e, i) => (
        <View key={e.name} style={[ui.row, i === 0 && { borderTopWidth: 0 }, { alignItems: 'flex-start' }]}>
          <View style={{ width: 118 }}><Badge label={e.dir} tone={e.dir.startsWith('client') ? 'green' : 'blue'} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: mono, fontSize: 13, fontWeight: '600', color: C.text }}>{e.name}</Text>
            <Text style={ui.rowSub}>{e.summary}</Text>
            <Text style={{ fontFamily: mono, fontSize: 12, color: C.violet, marginTop: 2 }}>{e.payload}</Text>
          </View>
          {e.auth && <Badge label={AUTH[e.auth as Route['auth']]?.[0] || e.auth} tone={AUTH[e.auth as Route['auth']]?.[1] || 'gray'} />}
        </View>
      ))}
    </Card>
  );
}
