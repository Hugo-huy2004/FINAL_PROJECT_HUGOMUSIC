import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTone, type Tone } from '../tones';

/**
 * Short status label in a soft colour pill.
 *
 * @usage One- or two-word states next to an item: Published, Pending, Admin only. Use the same tone for the same meaning everywhere.
 * @remarks Six tones (green, red, amber, blue, violet, gray) with colours tuned for each appearance; an optional icon sits before the text.
 * @a11y The label is read as text; do not rely on the colour alone to carry meaning.
 * @example <Badge label="Published" tone="green" />
 * @example <Badge label="Missing license" tone="red" icon="shield-outline" />
 */
export default function Badge({ label, tone = 'gray', icon }: {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [fg, bg] = useTone(tone);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
});
