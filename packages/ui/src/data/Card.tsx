import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHugoTheme } from '../theme';
import { radius } from '../tokens';

/**
 * Content card with an optional title row (title, subtitle, trailing element).
 *
 * @usage Grouping related content on dashboards and edit pages. For settings-style rows prefer InsetGroup.
 * @remarks A solid surface with a hairline border — cards hold content, so they are not glass. `padded={false}` lets lists run edge to edge inside.
 * @a11y The title is plain text; give it a header role in your own layout when it starts a section.
 * @example <Card title="Listening" subtitle="Last 14 days"><BarChart data={days} /></Card>
 */
export default function Card({ title, subtitle, right, children, style, padded = true }: {
  title?: string;
  subtitle?: string;
  /** Element at the trailing edge of the title row. */
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Set false for edge-to-edge lists inside the card. */
  padded?: boolean;
}) {
  const { colors } = useHugoTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.cardBorder }, style]}>
      {(title || right) ? (
        <View style={styles.head}>
          <View style={styles.text}>
            {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
            {subtitle ? <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={padded ? styles.body : undefined}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  body: { padding: 18, paddingTop: 12 },
});
