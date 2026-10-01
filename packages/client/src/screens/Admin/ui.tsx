// Admin page helpers. Every visual component comes from the hugo-music library (Card, Badge, ActionButton,
// Chips, Sheet, StatCard…); this file only keeps the admin colour constants, the table loader, a relative time
// formatter and the few layout styles the panels share. The admin area renders in the light appearance (AdminScreen).
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

export type { Tone } from 'hugo-music';

export const C = {
  bg: '#F4F5F7', surface: '#FFFFFF', sunken: '#F7F8FA', border: '#E4E7EC', text: '#101828', sub: '#475467', faint: '#98A2B3',
  accent: '#07875F', accentBg: '#E6F6EF', danger: '#D92D20', dangerBg: '#FEECEB', warn: '#B54708', warnBg: '#FEF4E6',
  info: '#175CD3', infoBg: '#EAF1FD', violet: '#6941C6', violetBg: '#F2EEFD',
};

// Loads data for a table: reloads when `deps` change (search can debounce), reports errors in place.
export function useLoader<T>(load: () => Promise<T>, deps: unknown[], debounceMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await load();
      if (my === seq.current) { setData(d); setError(null); }
    } catch (e: any) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    if (!debounceMs) { run(); return; }
    const t = setTimeout(run, debounceMs);
    return () => clearTimeout(t);
  }, [run, debounceMs]);
  return { data, error, loading, reload: run, setData };
}

export const timeAgo = (iso?: string | null) => {
  if (!iso) return 'chưa có';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  return d < 31 ? `${d} ngày trước` : new Date(iso).toLocaleDateString('vi-VN');
};

export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: C.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 6 },
});
