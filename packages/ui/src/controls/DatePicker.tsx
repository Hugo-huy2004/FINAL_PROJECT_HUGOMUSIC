import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';

const ROW = 36;
const VISIBLE = 5;
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export type DatePickerProps = {
  /** ISO date (YYYY-MM-DD); '' = nothing picked yet. */
  value: string;
  onChange: (iso: string) => void;
  /** Latest selectable date (default: today). */
  max?: Date;
  /** Earliest selectable date (default: 1 Jan 1900). */
  min?: Date;
  /** Locale for month names (default 'en'). */
  locale?: string;
  style?: StyleProp<ViewStyle>;
};

function monthNames(locale: string) {
  try {
    const f = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, m) => f.format(new Date(2000, m, 1)));
  } catch {
    return Array.from({ length: 12 }, (_, m) => pad(m + 1));
  }
}

function Wheel({ items, index, onIndex, flex, label }: { items: string[]; index: number; onIndex: (i: number) => void; flex: number; label: string }) {
  const { colors } = useHugoTheme();
  const ref = useRef<ScrollView>(null);
  useEffect(() => { ref.current?.scrollTo({ y: index * ROW, animated: false }); }, [index, items.length]);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    if (i !== index) onIndex(i);
  };
  return (
    <View
      style={{ flex, height: ROW * VISIBLE }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onIndex(Math.max(0, Math.min(items.length - 1, index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
    >
      <ScrollView ref={ref} showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ROW * 2 }} onMomentumScrollEnd={settle} onScrollEndDrag={settle} scrollEventThrottle={16}>
        {items.map((it, i) => (
          <Text key={it} style={[styles.item, { color: i === index ? colors.text : colors.textSecondary, fontWeight: i === index ? '600' : '400' }]} numberOfLines={1}>{it}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Date picker with three wheels (day, month, year) and a glass selection lens; in browsers it becomes the native date input with its calendar.
 *
 * @usage Dates that are easier to scroll to than to type, such as a birth date. Bound it with `min` and `max`.
 * @remarks The value is an ISO string (YYYY-MM-DD); an empty string means nothing is picked yet. Days are clamped to the length of the month (31 January → 28 February) and the result is clamped between `min` and `max`. Month names follow `locale`.
 * @a11y Each wheel is an adjustable element: swipe up or down with a screen reader to change it, and the current value is announced.
 * @example <DatePicker value={dob} onChange={setDob} max={new Date()} />
 * @example <DatePicker value={date} onChange={setDate} locale="vi" min={new Date(2020, 0, 1)} />
 */
export default function DatePicker({ value, onChange, max = new Date(), min = new Date(1900, 0, 1), locale = 'en', style }: DatePickerProps) {
  const months = useMemo(() => monthNames(locale), [locale]);
  const [y, m, d] = value ? value.split('-').map(Number) : [Math.min(2000, max.getFullYear()), 1, 1];
  const years = useMemo(() => Array.from({ length: max.getFullYear() - min.getFullYear() + 1 }, (_, i) => String(min.getFullYear() + i)), [max, min]);
  const days = Array.from({ length: daysIn(y, m - 1) }, (_, i) => String(i + 1));
  const set = (ny: number, nm: number, nd: number) => {
    const date = new Date(ny, nm - 1, Math.min(nd, daysIn(ny, nm - 1)));
    const clamped = date > max ? max : date < min ? min : date;
    onChange(`${clamped.getFullYear()}-${pad(clamped.getMonth() + 1)}-${pad(clamped.getDate())}`);
  };
  return (
    <View style={[styles.box, style, styles.fixedHeight]}>
      <Glass radius={10} style={styles.lens} />
      <Wheel label="Day" items={days} index={d - 1} onIndex={(i) => set(y, m, i + 1)} flex={1} />
      <Wheel label="Month" items={months} index={m - 1} onIndex={(i) => set(y, i + 1, d)} flex={2} />
      <Wheel label="Year" items={years} index={years.indexOf(String(y))} onIndex={(i) => set(Number(years[i]), m, d)} flex={1.3} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  fixedHeight: { height: ROW * VISIBLE, minHeight: ROW * VISIBLE },
  lens: { position: 'absolute', left: 0, right: 0, top: ROW * 2, height: ROW, pointerEvents: 'none' },
  item: { height: ROW, lineHeight: ROW, textAlign: 'center', fontSize: 19 },
});
