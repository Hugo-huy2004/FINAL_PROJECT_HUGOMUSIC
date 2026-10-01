import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { radius, space, type } from '../tokens';
import Glass from '../glass/Glass';

/**
 * Pinned glass row for personal shortcuts at the top of a list (liked songs, downloads, the current station).
 *
 * @usage One to three shortcuts above a long list. Always show them, even when empty — the subtitle tells the user how to fill them.
 * @remarks The icon sits on a gradient square; a chevron appears automatically when the row is pressable unless you pass `right`.
 * @a11y Title and subtitle are read together.
 * @example <PinnedRow icon="heart" colors={['#FF375F', '#FF9F0A']} title="Liked songs" subtitle="42 songs" onPress={open} />
 */
export default function PinnedRow({ icon, colors, title, subtitle, onPress, right }: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Gradient of the icon square. */
  colors: [string, string];
  title: string;
  subtitle: string;
  onPress?: () => void;
  /** Trailing element (default: a chevron when pressable). */
  right?: React.ReactNode;
}) {
  const theme = useHugoTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => pressed && styles.pressed} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${title}, ${subtitle}`}>
      <Glass radius={radius.lg} variant="clear" interactive={!!onPress} style={styles.card}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
          <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
          <Ionicons name={icon} size={26} color="#fff" />
        </LinearGradient>
        <View style={styles.text}>
          <Text style={[type.headline, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[type.footnote, { color: theme.colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text>
        </View>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null)}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }] },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  art: { width: 60, height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { flex: 1, minWidth: 0 },
});
