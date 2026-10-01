import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { radius, space, type } from '../tokens';
import Glass from '../glass/Glass';
import SearchField from '../controls/SearchField';

export type SidebarItem = {
  key: string;
  label: string;
  /** Element before the label (an icon, an HTTP method badge…). */
  leading?: React.ReactNode;
  /** Short trailing text, e.g. a count. */
  trailing?: string;
  /** Extra text the filter matches besides the label. */
  keywords?: string;
};
export type SidebarSection = { title?: string; icon?: keyof typeof Ionicons.glyphMap; items: SidebarItem[] };

/**
 * Sidebar of a split view: a floating glass panel with a filter field, titled sections and a tinted selection.
 *
 * @usage Navigation with many destinations on wide screens — documentation, settings, a library. On phones show it as a slide-over panel opened from the navigation bar.
 * @remarks It scrolls on its own, so the content column keeps its scroll position. The filter matches labels and the optional `keywords` of each item; empty sections are hidden while filtering.
 * @a11y Sections are headers and items are buttons with a selected state.
 * @example <NavigationSidebar selected={page} onSelect={setPage} sections={[
 *   { items: [{ key: 'home', label: 'Home' }] },
 *   { title: 'Library', icon: 'albums-outline', items: [{ key: 'songs', label: 'Songs', trailing: '1,144' }] },
 * ]} />
 */
export default function NavigationSidebar({ sections, selected, onSelect, searchPlaceholder = 'Filter', header, emptyText = 'No matches', style }: {
  sections: SidebarSection[];
  /** Key of the selected item. */
  selected?: string;
  onSelect: (key: string) => void;
  searchPlaceholder?: string;
  /** Element above the filter field (a title, a logo). */
  header?: React.ReactNode;
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useHugoTheme();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((it) => `${it.label} ${it.keywords ?? ''}`.toLowerCase().includes(needle)) }))
      .filter((s) => s.items.length);
  }, [sections, q]);

  return (
    <Glass radius={22} style={[styles.panel, style]}>
      {header}
      <View style={styles.search}><SearchField value={q} onChangeText={setQ} placeholder={searchPlaceholder} /></View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {shown.map((s, si) => (
          <View key={s.title ?? si} style={si > 0 && styles.section}>
            {s.title ? (
              <View style={styles.sectionHead} accessibilityRole="header">
                {s.icon ? <Ionicons name={s.icon} size={13} color={colors.textSecondary} /> : null}
                <Text style={[type.footnote, styles.sectionTitle, { color: colors.textSecondary }]}>{s.title.toUpperCase()}</Text>
              </View>
            ) : null}
            {s.items.map((it) => {
              const on = it.key === selected;
              return (
                <Pressable key={it.key} onPress={() => onSelect(it.key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
                  style={({ pressed }) => [styles.item, on ? { backgroundColor: colors.activeItemBg } : pressed && { backgroundColor: colors.fill }]}>
                  {it.leading}
                  <Text style={[type.subhead, styles.label, { color: on ? colors.accent : colors.text, fontWeight: on ? '600' : '400' }]} numberOfLines={1}>{it.label}</Text>
                  {it.trailing ? <Text style={[type.footnote, { color: colors.textTertiary }]}>{it.trailing}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {!shown.length ? <Text style={[type.footnote, styles.empty, { color: colors.textSecondary }]}>{emptyText}</Text> : null}
      </ScrollView>
    </Glass>
  );
}

const styles = StyleSheet.create({
  panel: { overflow: 'hidden' },
  search: { padding: space.md, paddingBottom: space.sm },
  list: { paddingHorizontal: space.sm, paddingBottom: space.lg },
  section: { marginTop: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm + 2, paddingVertical: space.xs + 2 },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36, paddingHorizontal: space.sm + 2, borderRadius: radius.md },
  label: { flex: 1 },
  empty: { textAlign: 'center', marginTop: space.lg },
});
