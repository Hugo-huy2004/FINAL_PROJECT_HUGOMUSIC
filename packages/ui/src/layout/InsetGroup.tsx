import React, { Children, cloneElement, isValidElement } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHugoTheme } from '../theme';
import { GUTTER, radius, space, type } from '../tokens';

/**
 * Inset grouped section in the style of a settings screen: an optional header, rows on a rounded card and an optional footer.
 *
 * @usage Settings and forms made of rows. Put ListRows inside; use the footer to explain what a setting does.
 * @remarks The separator of the last row is removed automatically. Margins default to the screen gutter; pass `style` to change them.
 * @a11y The header is announced as a header; rows keep their own roles.
 * @example <InsetGroup header="Playback" footer="Sound Check plays every song at the same volume.">
 *   <ListRow title="Sound Check" right={<Toggle value={on} onValueChange={setOn} accessibilityLabel="Sound Check" />} />
 *   <ListRow title="Crossfade" subtitle="6 seconds" chevron onPress={openCrossfade} />
 * </InsetGroup>
 */
export default function InsetGroup({ header, footer, style, children }: {
  /** Small uppercase heading above the card. */
  header?: string;
  /** Explanatory text under the card. */
  footer?: string;
  /** Overrides the outer margins (default: screen gutter left/right, 24 pt above). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { colors } = useHugoTheme();
  const rows = Children.toArray(children);
  return (
    <View style={[styles.group, style]}>
      {header ? <Text style={[type.footnote, styles.header, { color: colors.textSecondary }]} accessibilityRole="header">{header.toUpperCase()}</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {rows.map((r, i) => (i === rows.length - 1 && isValidElement(r) ? cloneElement(r as React.ReactElement<{ separator?: boolean }>, { separator: false }) : r))}
      </View>
      {footer ? <Text style={[type.footnote, styles.footer, { color: colors.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: GUTTER, marginTop: space.xxl },
  header: { marginLeft: space.lg, marginBottom: space.sm - 2 },
  card: { borderRadius: radius.lg, paddingHorizontal: space.md, overflow: 'hidden' },
  footer: { marginHorizontal: space.lg, marginTop: space.sm - 2 },
});
