import { StyleSheet, Text, View } from 'react-native';
import { useHugoTheme } from '../theme';

/**
 * Minimal bar chart: one bar per data point, labels at both ends of the axis.
 *
 * @usage Small trends on dashboards (plays per day, uploads per week). For precise values show a table next to it.
 * @remarks Bars scale to the largest value; zero values stay visible as a thin line. No chart dependency is needed.
 * @a11y Every bar has an accessibility label with its label and value.
 * @example <BarChart height={60} data={days.map((d) => ({ label: d.label, value: d.plays }))} />
 */
export default function BarChart({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const { colors } = useHugoTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View>
      <View style={[styles.bars, { height }]}>
        {data.map((d) => (
          <View key={d.label} style={styles.col} accessibilityLabel={`${d.label}: ${d.value}`}>
            <View style={[styles.bar, { height: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: d.value ? colors.accent : colors.border }]} />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.axisText, { color: colors.textTertiary }]}>{data[0]?.label}</Text>
        <Text style={[styles.axisText, { color: colors.textTertiary }]}>{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 4, minHeight: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { fontSize: 11 },
});
