import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useHugoTheme } from '../theme';
import { GUTTER, space, type } from '../tokens';

/**
 * Large title (34 points) at the top of a screen, with an optional subtitle and trailing element.
 *
 * @usage The first element of every top-level screen. Child screens use a BackButton and a smaller title instead.
 * @remarks Uses the content margin (`GUTTER`) so it lines up with shelves and lists below.
 * @a11y The title has the header role, so screen-reader users can jump to it.
 * @example <LargeTitle title="Home" subtitle="For you" right={<AccountButton />} />
 */
export default function LargeTitle({ title, subtitle, right }: {
  title: string;
  subtitle?: string;
  /** Element aligned to the trailing edge (e.g. an account button). */
  right?: React.ReactNode;
}) {
  const { colors } = useHugoTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[type.subhead, { color: colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingTop: space.lg, paddingBottom: space.sm },
  text: { flex: 1, minWidth: 0 },
});
