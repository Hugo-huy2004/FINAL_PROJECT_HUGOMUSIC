// Bộ giao diện của trang quản trị: một bảng màu, một cỡ bo góc, một kiểu nút/nhãn/thẻ cho mọi mục —
// để sáu mục quản lý đọc như một sản phẩm, không phải sáu màn chắp vá.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Modal, ScrollView, ViewStyle, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  sunken: '#F7F8FA',
  border: '#E4E7EC',
  text: '#101828',
  sub: '#475467',
  faint: '#98A2B3',
  accent: '#07875F',
  accentBg: '#E6F6EF',
  danger: '#D92D20',
  dangerBg: '#FEECEB',
  warn: '#B54708',
  warnBg: '#FEF4E6',
  info: '#175CD3',
  infoBg: '#EAF1FD',
  violet: '#6941C6',
  violetBg: '#F2EEFD',
};
export const R = { card: 14, control: 10, pill: 999 };

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray';
const TONES: Record<Tone, [string, string]> = {
  green: [C.accent, C.accentBg],
  red: [C.danger, C.dangerBg],
  amber: [C.warn, C.warnBg],
  blue: [C.info, C.infoBg],
  violet: [C.violet, C.violetBg],
  gray: [C.sub, '#EEF0F3'],
};
export const toneColor = (t: Tone) => TONES[t][0];

export function Badge({ label, tone = 'gray', icon }: { label: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Text style={[s.badgeText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Btn({ label, a11y, icon, onPress, variant = 'secondary', small, disabled, loading, style }: {
  label?: string; a11y?: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; variant?: BtnVariant;
  small?: boolean; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const v = {
    primary: { bg: C.accent, fg: '#fff', border: C.accent },
    secondary: { bg: C.surface, fg: C.text, border: C.border },
    danger: { bg: C.surface, fg: C.danger, border: '#F7C8C4' },
    ghost: { bg: 'transparent', fg: C.sub, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label || a11y}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon && <Ionicons name={icon} size={small ? 14 : 16} color={v.fg} />}
      {!!label && <Text style={[s.btnText, small && { fontSize: 13 }, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ title, subtitle, right, children, style, padded = true }: {
  title?: string; subtitle?: string; right?: ReactNode; children?: ReactNode; style?: ViewStyle; padded?: boolean;
}) {
  return (
    <View style={[s.card, style]}>
      {(title || right) && (
        <View style={s.cardHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!title && <Text style={s.cardTitle}>{title}</Text>}
            {!!subtitle && <Text style={s.cardSub}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      <View style={padded ? s.cardBody : undefined}>{children}</View>
    </View>
  );
}

export function Stat({ label, value, hint, tone = 'gray', icon, onPress }: {
  label: string; value: string | number; hint?: string; tone?: Tone; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void;
}) {
  const [fg, bg] = TONES[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.stat, pressed && { opacity: 0.8 }]}>
      <View style={[s.statIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={18} color={fg} /></View>
      <Text style={s.statValue}>{typeof value === 'number' ? value.toLocaleString('vi-VN') : value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {!!hint && <Text style={[s.statHint, { color: fg }]}>{hint}</Text>}
    </Pressable>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={16} color={C.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        style={s.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {!!value && (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Xoá tìm kiếm" hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={C.faint} />
        </Pressable>
      )}
    </View>
  );
}

export type ChipOption = { key: string; label: string; count?: number };
export function Chips({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (k: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.chip, on && s.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
            {o.count !== undefined && <Text style={[s.chipCount, on && { color: C.accent }]}>{o.count.toLocaleString('vi-VN')}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segItem, o.key === value && s.segOn]} accessibilityRole="tab">
          <Text style={[s.segText, o.key === value && { color: C.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', title, hint }: { icon?: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={28} color={C.faint} />
      <Text style={s.emptyTitle}>{title}</Text>
      {!!hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  );
}

export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <View style={s.pager}>
      <Btn small icon="chevron-back" a11y="Trang trước" onPress={() => onPage(page - 1)} disabled={page <= 1} />
      <Text style={s.pagerText}>Trang {page} / {pages} · {total.toLocaleString('vi-VN')} mục</Text>
      <Btn small icon="chevron-forward" a11y="Trang sau" onPress={() => onPage(page + 1)} disabled={page >= pages} />
    </View>
  );
}

// Biểu đồ cột tối giản (không thêm thư viện biểu đồ): số lượt theo ngày.
export function Bars({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={[s.bars, { height }]}>
        {data.map((d) => (
          <View key={d.label} style={s.barCol} accessibilityLabel={`${d.label}: ${d.value}`}>
            <View style={[s.bar, { height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: d.value ? C.accent : C.border }]} />
          </View>
        ))}
      </View>
      <View style={s.barAxis}>
        <Text style={s.axisText}>{data[0]?.label}</Text>
        <Text style={s.axisText}>{data.at(-1)?.label}</Text>
      </View>
    </View>
  );
}

export function Field({ label, value, onChange, placeholder, multiline, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        style={[s.input, multiline && { height: 96, textAlignVertical: 'top', paddingTop: 10 }]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

// Bảng bên phải (màn rộng) / trang trượt lên (điện thoại) cho chi tiết một mục.
export function Sheet({ visible, title, subtitle, onClose, children, footer }: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[s.backdrop, wide && { flexDirection: 'row', justifyContent: 'flex-end' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[s.sheet, wide ? s.sheetWide : [s.sheetPhone, { paddingBottom: insets.bottom }]]}>
          <View style={s.sheetHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={s.cardSub} numberOfLines={1}>{subtitle}</Text>}
            </View>
            <Btn small variant="ghost" icon="close" a11y="Đóng" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>{children}</ScrollView>
          {footer && <View style={s.sheetFoot}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

// Tải dữ liệu cho một bảng: tự tải lại khi `deps` đổi (tìm kiếm có trễ 300 ms), báo lỗi tại chỗ.
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

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.error}>
      <Ionicons name="alert-circle" size={16} color={C.danger} />
      <Text style={s.errorText}>{message}</Text>
    </View>
  );
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: R.control, borderWidth: 1 },
  btnSmall: { height: 32, paddingHorizontal: 10 },
  btnText: { fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  cardBody: { padding: 18, paddingTop: 12 },
  stat: { flexGrow: 1, flexBasis: '23%', minWidth: 140, backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1, borderColor: C.border, padding: 16 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statValue: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 13, color: C.sub, marginTop: 2 },
  statHint: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: R.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, flex: 1, minWidth: 200 },
  searchInput: { flex: 1, fontSize: 14, color: C.text, outlineStyle: 'none' } as any,
  chips: { gap: 8, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipOn: { borderColor: C.accent, backgroundColor: C.accentBg },
  chipText: { fontSize: 13, fontWeight: '600', color: C.sub },
  chipTextOn: { color: C.accent },
  chipCount: { fontSize: 12, fontWeight: '700', color: C.faint },
  segment: { flexDirection: 'row', backgroundColor: '#EAECF0', borderRadius: R.control, padding: 3, alignSelf: 'flex-start', marginBottom: 16 },
  segItem: { paddingHorizontal: 16, height: 32, justifyContent: 'center', borderRadius: 8 },
  segOn: { backgroundColor: C.surface, boxShadow: '0px 1px 3px rgba(16,24,40,0.12)' },
  segText: { fontSize: 13, fontWeight: '600', color: C.sub },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: C.sub },
  emptyHint: { fontSize: 13, color: C.faint, textAlign: 'center', maxWidth: 360 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  pagerText: { fontSize: 13, color: C.sub },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 4, minHeight: 2 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontSize: 11, color: C.faint },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 6 },
  input: { height: 40, borderRadius: R.control, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, fontSize: 14, color: C.text, backgroundColor: C.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, overflow: 'hidden' },
  sheetWide: { width: 560, maxWidth: '100%', height: '100%', borderLeftWidth: 1, borderColor: C.border },
  sheetPhone: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.border },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  sheetFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, borderTopWidth: 1, borderColor: C.border },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: R.control, backgroundColor: C.dangerBg, marginBottom: 12 },
  errorText: { color: C.danger, fontSize: 13, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: C.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
});
