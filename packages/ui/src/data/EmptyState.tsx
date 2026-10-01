import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';

/**
 * Placeholder for an empty list or a search without results: an icon, a title and a hint.
 *
 * @usage Whenever a list can be empty. Say what is missing and, in the hint, how to fill it.
 * @remarks Centred, with generous vertical padding so it reads as a state rather than an error.
 * @a11y Title and hint are read as text.
 * @example <EmptyState icon="search-outline" title="Nothing matches" hint="Try another filter" />
 */
export default function EmptyState({ icon = 'file-tray-outline', title, hint }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
}) {
  const { colors } = useHugoTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={28} color={colors.textTertiary} />
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.textTertiary }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 36, gap: 6 },
  title: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', maxWidth: 360 },
});
