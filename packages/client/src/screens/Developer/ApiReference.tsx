import { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { ActionButton, Icon, radius, SegmentedControl, space, type, useHugoTheme } from 'hugo-music';
import { API_BASE_URL, getAuthToken } from '../../api/api';
import { confirmAlert } from '../../lib/alert';
import Markdown, { CodeBlock, mono } from './Markdown';
import { snippetsFor } from 'hugo-api';
import { useApiDocs, groupKey, type ApiDocs, type ApiRoute } from './apiDocs';

// API reference. Everything on it comes from GET /api/docs (the server walks its live route tree), so it can never
// drift from the code. One page per sidebar item: 'overview' (the guide), a route group ('songs'…) or 'realtime'.
export const METHOD_COLOR: Record<string, string> = { GET: '#0A84FF', POST: '#30B158', PATCH: '#FF9500', PUT: '#FF9500', DELETE: '#FF3B30' };
const ACCESS: Record<ApiRoute['auth'], [string, string]> = {
  public: ['Public', '#8E8E93'], optional: ['Optional sign-in', '#0A84FF'], user: ['Signed-in user', '#AF52DE'], admin: ['Admin only', '#FF3B30'],
};

function Tag({ label, color }: { label: string; color: string }) {
  return <View style={[styles.tag, { backgroundColor: color + '22' }]}><Text style={[styles.tagText, { color }]}>{label}</Text></View>;
}

export default function ApiReference({ selected = 'overview' }: { selected?: string }) {
  const { colors } = useHugoTheme();
  const { data, error } = useApiDocs();
  if (error) return <Text style={[type.body, { color: '#FF3B30' }]}>Could not load /api/docs: {error}</Text>;
  if (!data) return <Text style={[type.body, { color: colors.textSecondary }]}>Loading the API reference…</Text>;
  const group = data.groups.find((g) => groupKey(g) === selected);
  const total = data.groups.reduce((n, g) => n + g.routes.length, 0);
  return (
    <View>
      {selected === 'overview' && <Overview docs={data} total={total} />}
      {group && <Group group={group} />}
      {selected === 'realtime' && <Realtime events={data.socketEvents} />}
      {!group && selected !== 'overview' && selected !== 'realtime' && <Text style={[type.body, { color: colors.textSecondary }]}>No API group “{selected}”.</Text>}
      <Text style={[type.footnote, styles.footer, { color: colors.textTertiary }]}>
        Generated {new Date(data.generatedAt).toLocaleString('en-GB')} from the live route tree · {total} endpoints · {data.socketEvents.length} realtime events
      </Text>
    </View>
  );
}

function Overview({ docs, total }: { docs: ApiDocs; total: number }) {
  const { colors } = useHugoTheme();
  return (
    <View>
      <Text style={[type.caption, { color: colors.accent, letterSpacing: 0.6 }]}>REST · {total} ENDPOINTS · {docs.groups.length} GROUPS</Text>
      <Text style={[styles.hero, { color: colors.text }]} accessibilityRole="header">API reference</Text>
      <Text style={[type.title3, { color: colors.textSecondary, fontWeight: '500', marginBottom: space.lg }]}>{API_BASE_URL}/api</Text>
      {docs.guide.map((s) => (
        <View key={s.id} style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.cardHead}>
            <Icon name={s.icon as any} size={20} color={colors.accent} />
            <Text style={[type.title3, { color: colors.text }]}>{s.title}</Text>
          </View>
          <Markdown source={s.body} />
        </View>
      ))}
    </View>
  );
}

function Group({ group }: { group: ApiDocs['groups'][number] }) {
  const { colors } = useHugoTheme();
  return (
    <View>
      <Text style={[type.caption, { color: colors.accent, letterSpacing: 0.6 }]}>{group.prefix.toUpperCase()} · {group.routes.length} ENDPOINTS{group.tier === 'realtime' ? ' · REALTIME TIER' : ''}</Text>
      <Text style={[styles.hero, { color: colors.text }]} accessibilityRole="header">{group.title}</Text>
      <Text style={[type.title3, { color: colors.textSecondary, fontWeight: '500', marginBottom: space.lg }]}>{group.description}</Text>
      {!!group.guide && <View style={[styles.card, { backgroundColor: colors.surface }]}><Markdown source={group.guide} /></View>}
      <Text style={[type.title2, styles.h2, { color: colors.text }]}>Endpoints</Text>
      {group.routes.map((r) => <Endpoint key={r.method + r.path} r={r} />)}
    </View>
  );
}

function Endpoint({ r }: { r: ApiRoute }) {
  const { colors } = useHugoTheme();
  const [open, setOpen] = useState(false);
  const [access, accessColor] = ACCESS[r.auth];
  return (
    <View style={[styles.endpoint, { backgroundColor: colors.surface }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.endpointHead} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${r.method} ${r.path}`}>
        <View style={[styles.method, { backgroundColor: METHOD_COLOR[r.method] ?? '#8E8E93' }]}><Text style={styles.methodText}>{r.method}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.path, { color: colors.text }]} numberOfLines={1}>{r.path}</Text>
          <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={open ? undefined : 1}>{r.summary || 'Undocumented — add doc() to the route'}</Text>
        </View>
        <View style={styles.tags}>
          <Tag label={access} color={accessColor} />
          {r.rateLimited && <Tag label="Rate limited" color="#FF9500" />}
          {r.upload && <Tag label="File upload" color="#0A84FF" />}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textTertiary} />
      </Pressable>
      {open && <Detail r={r} />}
    </View>
  );
}

function Fields({ title, fields }: { title: string; fields?: Record<string, string> }) {
  const { colors } = useHugoTheme();
  if (!fields || !Object.keys(fields).length) return null;
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.label, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>
      {Object.entries(fields).map(([k, v]) => (
        <View key={k} style={[styles.field, { borderColor: colors.border }]}>
          <Text style={[styles.mono, { color: colors.text, minWidth: 150 }]}>{k}</Text>
          <Text style={[type.footnote, { color: colors.textSecondary, flex: 1 }]}>{v || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

function Detail({ r }: { r: ApiRoute }) {
  const { colors } = useHugoTheme();
  const s = snippetsFor(r, API_BASE_URL);
  const [tab, setTab] = useState('app');
  return (
    <View style={styles.detail}>
      <Text style={[type.footnote, styles.label, { color: colors.textSecondary }]}>USE IT</Text>
      <SegmentedControl value={tab} onChange={setTab} style={{ maxWidth: 320, marginBottom: space.sm }} segments={[
        { key: 'app', label: r.method === 'GET' ? 'useApi' : 'call' }, ...(s.recipe ? [{ key: 'filter', label: 'Filter' }] : []), { key: 'curl', label: 'curl' },
      ]} />
      {tab === 'app' && <CodeBlock label="In the app" code={s.app} />}
      {tab === 'filter' && s.recipe && <CodeBlock label="Shape the list without another request" code={s.recipe} />}
      {tab === 'curl' && <CodeBlock label="From a terminal" code={s.curl} />}
      <Fields title="Path parameters" fields={Object.fromEntries(r.params.map((p) => [`:${p}`, 'required']))} />
      <Fields title="Query parameters" fields={r.query} />
      <Fields title={r.upload ? 'Body (multipart/form-data)' : 'Body (JSON)'} fields={r.body} />
      {!!r.returns && (
        <View style={styles.section}>
          <Text style={[type.footnote, styles.label, { color: colors.textSecondary }]}>RETURNS</Text>
          <Text style={[styles.mono, { color: '#AF52DE' }]}>{r.returns}</Text>
        </View>
      )}
      <Fields title="Errors" fields={(r as ApiRoute & { errors?: Record<string, string> }).errors} />
      <TryIt r={r} />
    </View>
  );
}

function TryIt({ r }: { r: ApiRoute }) {
  const { colors } = useHugoTheme();
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(r.query ? Object.keys(r.query).map((k) => `${k}=`).join('&') : '');
  const [body, setBody] = useState(r.body && !r.upload ? JSON.stringify(Object.fromEntries(Object.keys(r.body).map((k) => [k, ''])), null, 2) : '');
  const [result, setResult] = useState<{ status: number; ms: number; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const input = [styles.input, { backgroundColor: colors.inputBg, color: colors.text }];
  const url = () => {
    const path = r.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(params[k] || `:${k}`));
    const qs = query.split('&').filter((p) => p && !p.endsWith('=')).join('&');
    return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  };
  const send = async () => {
    if (r.method !== 'GET' && !(await confirmAlert(`Send ${r.method} ${r.path}? This can change real data.`))) return;
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
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      setResult({ status: res.status, ms: Date.now() - t0, text: pretty.length > 6000 ? `${pretty.slice(0, 6000)}\n… (truncated, ${pretty.length} characters in total)` : pretty });
    } catch (e: any) {
      setResult({ status: 0, ms: Date.now() - t0, text: e.message });
    } finally {
      setSending(false);
    }
  };
  return (
    <View style={styles.section}>
      <Text style={[type.footnote, styles.label, { color: colors.textSecondary }]}>TRY IT {getAuthToken() ? '(YOUR SESSION)' : '(AS A GUEST)'}</Text>
      {r.params.map((p) => (
        <TextInput key={p} value={params[p] || ''} onChangeText={(v) => setParams({ ...params, [p]: v })} placeholder={`:${p}`} placeholderTextColor={colors.textTertiary} style={input} autoCapitalize="none" />
      ))}
      {!!r.query && <TextInput value={query} onChangeText={setQuery} placeholder="key=value&key2=value2" placeholderTextColor={colors.textTertiary} style={[input, { fontFamily: mono }]} autoCapitalize="none" />}
      {!!body && <TextInput value={body} onChangeText={setBody} multiline style={[input, { fontFamily: mono, height: 110, paddingTop: 8, textAlignVertical: 'top' }]} autoCapitalize="none" />}
      {r.upload
        ? <Text style={[type.footnote, { color: colors.textSecondary }]}>File upload — use the curl tab (-F) or call() with a FormData.</Text>
        : <View style={{ alignSelf: 'flex-start' }}><ActionButton title={sending ? undefined : `Send ${r.method}`} icon={sending ? <Icon name="hourglass-outline" size={16} color="#fff" /> : undefined} onPress={send} /></View>}
      {result && (
        <View style={{ marginTop: space.sm, gap: 6 }}>
          <View style={styles.tags}>
            <Tag label={result.status ? `HTTP ${result.status}` : 'Network error'} color={result.status >= 200 && result.status < 300 ? '#30B158' : result.status === 304 ? '#0A84FF' : '#FF3B30'} />
            <Tag label={`${result.ms} ms`} color="#8E8E93" />
          </View>
          <CodeBlock label="Response" code={result.text || '(empty)'} />
        </View>
      )}
    </View>
  );
}

function Realtime({ events }: { events: ApiDocs['socketEvents'] }) {
  const { colors } = useHugoTheme();
  return (
    <View>
      <Text style={[type.caption, { color: colors.accent, letterSpacing: 0.6 }]}>WEBSOCKET · {events.length} EVENTS</Text>
      <Text style={[styles.hero, { color: colors.text }]} accessibilityRole="header">Realtime events</Text>
      <Text style={[type.title3, { color: colors.textSecondary, fontWeight: '500', marginBottom: space.lg }]}>Connect to the API host with the websocket transport and pass the token in auth: {'{ token }'}. Client → server events reply through an acknowledgement.</Text>
      {events.map((e) => (
        <View key={e.name} style={[styles.endpoint, styles.endpointHead, { backgroundColor: colors.surface }]}>
          <Tag label={e.dir} color={e.dir.startsWith('client') ? '#30B158' : '#0A84FF'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.path, { color: colors.text }]}>{e.name}</Text>
            <Text style={[type.footnote, { color: colors.textSecondary }]}>{e.summary}</Text>
            <Text style={[styles.mono, { color: '#AF52DE', marginTop: 2 }]}>{e.payload}</Text>
          </View>
          {e.auth && <Tag label={ACCESS[e.auth as ApiRoute['auth']]?.[0] ?? e.auth} color={ACCESS[e.auth as ApiRoute['auth']]?.[1] ?? '#8E8E93'} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, marginTop: 4 },
  h2: { marginTop: space.xxl, marginBottom: space.md },
  card: { borderRadius: radius.xl, padding: space.xl, marginBottom: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endpoint: { borderRadius: radius.lg, marginBottom: space.sm, overflow: 'hidden' },
  endpointHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  method: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, minWidth: 60, alignItems: 'center' },
  methodText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  path: { fontFamily: mono, fontSize: 14, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 280 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 12, fontWeight: '600' },
  detail: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 4 },
  section: { marginTop: space.md, gap: 6 },
  label: { fontWeight: '600', letterSpacing: 0.4, marginTop: space.sm },
  field: { flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  mono: { fontFamily: mono, fontSize: 13 },
  input: { borderRadius: 10, paddingHorizontal: 12, minHeight: 40, fontSize: 14 },
  footer: { textAlign: 'center', marginTop: space.xxl },
});
