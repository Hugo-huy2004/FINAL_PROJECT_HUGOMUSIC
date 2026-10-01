import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { radius, space, TOUCH, type } from '../tokens';
import Artwork from './Artwork';

/**
 * Standard list row: artwork or icon, title, subtitle and a trailing element, at least 56 points tall.
 *
 * @usage Lists of songs, settings, search results. Use `chevron` when the row opens another screen and `right` for an inline control such as a Toggle.
 * @remarks The trailing element sits outside the tappable area because it usually holds its own button. The separator is inset to the text, as in system lists; InsetGroup hides it on the last row.
 * @a11y Title and subtitle are read together; `active` is exposed as selected.
 * @example <ListRow icon="albums-outline" title="Albums" subtitle="18 albums" chevron onPress={open} />
 * @example <ListRow art={song.cover} title={song.title} subtitle={song.artist} active={isPlaying} onPress={play} />
 */
export default function ListRow({ art, round = false, icon, title, subtitle, right, active = false, onPress, onLongPress, separator = true, chevron = false }: {
  /** Artwork URL ('' shows the glass placeholder); takes precedence over icon. */
  art?: string;
  /** Circular artwork (artists). */
  round?: boolean;
  /** Ionicons glyph shown when there is no artwork. */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Highlights the row as selected or playing. */
  active?: boolean;
  onPress?: () => void;
  /** Long press (used by ContextMenu). */
  onLongPress?: (e: GestureResponderEvent) => void;
  /** Draws the hairline below the row, inset to the text like system lists. */
  separator?: boolean;
  /** Shows a disclosure chevron (the row opens another screen). */
  chevron?: boolean;
}) {
  const { colors, isDark } = useHugoTheme();
  const lead = art !== undefined ? 48 : icon ? 32 : 0;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ selected: active }}
      >
        {art !== undefined ? <Artwork uri={art} title={title} size={48} radius={round ? 24 : radius.sm} />
          : icon ? <View style={styles.iconBox}><Ionicons name={icon} size={22} color={colors.accent} /></View> : null}
        <View style={styles.text}>
          <Text style={[type.callout, { color: active ? colors.accent : colors.text, fontWeight: '500' }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {chevron ? <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} /> : null}
      </Pressable>
      {right ? <View style={styles.right}>{right}</View> : null}
      {separator ? <View style={[styles.sep, { left: lead ? space.xs + lead + space.md : 0, backgroundColor: colors.border }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH + 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.xs, paddingRight: space.xs, paddingVertical: space.sm, borderRadius: radius.md, alignSelf: 'stretch' },
  iconBox: { width: 32, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
  right: { paddingLeft: space.sm, paddingRight: space.xs, flexDirection: 'row', alignItems: 'center' },
  sep: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
