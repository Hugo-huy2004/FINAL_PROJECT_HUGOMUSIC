import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useHugoTheme } from '../theme';

export type ChipOption = { key: string; label: string; count?: number };

/**
 * A scrolling row of filter chips, each with an optional count.
 *
 * @usage Narrowing a list by one property (status, license, role). For switching between views use SegmentedControl.
 * @remarks The row scrolls horizontally when the chips do not fit; counts use the locale's number formatting.
 * @a11y Chips are tabs with a selected state.
 * @example <Chips value={status} onChange={setStatus} options={[{ key: 'pending', label: 'Pending', count: 12 }, { key: 'published', label: 'Published' }]} />
 */
export default function Chips({ options, value, onChange }: {
  options: ChipOption[];
  /** Key of the selected chip. */
  value: string;
  onChange: (key: string) => void;
}) {
  const { colors } = useHugoTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.activeItemBg : colors.background }]}>
            <Text style={[styles.text, { color: on ? colors.accent : colors.textSecondary }]}>{o.label}</Text>
            {o.count !== undefined && <Text style={[styles.count, { color: on ? colors.accent : colors.textTertiary }]}>{o.count.toLocaleString()}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 13, fontWeight: '600' },
  count: { fontSize: 12, fontWeight: '700' },
});
