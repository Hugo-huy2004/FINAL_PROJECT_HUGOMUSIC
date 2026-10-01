import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { useTone, type Tone } from '../tones';

/**
 * Metric card: a tinted icon, a large number, a label and an optional hint.
 *
 * @usage Dashboard numbers that lead somewhere — tapping a card can open the filtered list behind the number.
 * @remarks Numbers use locale formatting. Cards grow to fill a wrapping row (about four per row on wide screens).
 * @a11y Pressable cards are buttons named by their label and value.
 * @example <StatCard icon="time-outline" tone="amber" label="Awaiting review" value={12} onPress={openQueue} />
 */
export default function StatCard({ label, value, hint, tone = 'gray', icon, onPress }: {
  label: string;
  value: string | number;
  /** Small coloured line under the label, e.g. a trend. */
  hint?: string;
  tone?: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const { colors } = useHugoTheme();
  const [fg, bg] = useTone(tone);
  const shown = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${shown}`}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.background, borderColor: colors.cardBorder }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.icon, { backgroundColor: bg }]}><Ionicons name={icon} size={18} color={fg} /></View>
      <Text style={[styles.value, { color: colors.text }]}>{shown}</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: fg }]}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: '23%', minWidth: 140, borderRadius: 14, borderWidth: 1, padding: 16 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  label: { fontSize: 13, marginTop: 2 },
  hint: { fontSize: 12, fontWeight: '600', marginTop: 6 },
});
