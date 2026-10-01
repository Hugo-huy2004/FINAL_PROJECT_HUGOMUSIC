import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { GUTTER, space, type } from '../tokens';

/**
 * Section heading (Title 2) that becomes a button with a chevron when it leads to a “See all” page.
 *
 * @usage Above a shelf or a list section on a browsing screen.
 * @remarks Without `onSeeAll` it is a plain header; with it the whole heading is tappable, not just the chevron.
 * @a11y Header role without `onSeeAll`, button role with it.
 * @example <SectionHeader title="New releases" onSeeAll={openAll} />
 */
export function SectionHeader({ title, onSeeAll }: {
  title: string;
  /** Makes the heading a button with a chevron. */
  onSeeAll?: () => void;
}) {
  const { colors } = useHugoTheme();
  return (
    <Pressable style={styles.head} onPress={onSeeAll} disabled={!onSeeAll} accessibilityRole={onSeeAll ? 'button' : 'header'} hitSlop={8}>
      <Text style={[type.title2, { color: colors.text }]}>{title}</Text>
      {onSeeAll ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
    </Pressable>
  );
}

/**
 * Horizontally scrolling row of tiles under a SectionHeader, aligned to the content margins.
 *
 * @usage Browsing collections — recently played, new releases, artists. Put MediaTile or GradientTile inside.
 * @remarks The first tile lines up with the screen margin and the row scrolls past the edge, hinting that more is available.
 * @a11y Tiles stay individually focusable; the shelf title is the section's header.
 * @example <Shelf title="Recently played" onSeeAll={openAll}>
 *   {songs.map((s) => <MediaTile key={s.id} uri={s.cover} title={s.title} size={150} onPress={() => play(s)} />)}
 * </Shelf>
 */
export default function Shelf({ title, onSeeAll, children, gap = space.md }: {
  title?: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
  /** Space between tiles in points. */
  gap?: number;
}) {
  return (
    <View style={title ? styles.shelf : undefined}>
      {title ? <SectionHeader title={title} onSeeAll={onSeeAll} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap }]} decelerationRate="fast">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { marginTop: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: GUTTER, marginBottom: space.sm + 2, alignSelf: 'flex-start' },
  row: { paddingHorizontal: GUTTER },
});
