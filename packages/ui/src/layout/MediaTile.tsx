import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { radius, space, type } from '../tokens';
import Glass from '../glass/Glass';
import Artwork from './Artwork';

/**
 * Artwork tile with title and subtitle for shelves of songs, albums and artists. The current item shows a small glass play badge.
 *
 * @usage Inside a Shelf or a grid. Use `round` for artists.
 * @remarks Artwork goes through Artwork (and therefore HugoProvider's `renderArtwork`) unless you pass `art`. `badge` adds a small corner label such as LYRICS.
 * @a11y Title and subtitle form the accessible name; `active` is exposed as selected.
 * @example <MediaTile uri={album.cover} title={album.title} subtitle={album.artist} size={150} onPress={open} />
 * @example <MediaTile uri={artist.photo} title={artist.name} size={120} round onPress={openArtist} />
 */
export default function MediaTile({ uri, art, title, subtitle, size, round = false, badge, active = false, playing = false, onPress, onLongPress }: {
  /** Artwork URL. */
  uri?: string;
  /** Custom artwork element instead of the URL. */
  art?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Edge length of the artwork in points. */
  size: number;
  /** Circular artwork for artists. */
  round?: boolean;
  /** Corner badge text, e.g. LYRICS. */
  badge?: string;
  /** Marks the tile as the current item (accent title + glass play badge). */
  active?: boolean;
  /** Shows pause instead of play on the active badge. */
  playing?: boolean;
  onPress: () => void;
  /** Long press (used by ContextMenu). */
  onLongPress?: (e: GestureResponderEvent) => void;
}) {
  const { colors } = useHugoTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [{ width: size }, round && styles.centered, pressed && styles.pressed]}
      accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} accessibilityState={{ selected: active }}>
      <View>
        {art ?? <Artwork uri={uri} title={title} size={size} radius={round ? size / 2 : radius.lg} />}
        {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
        {active ? (
          <Glass tint={colors.accent} interactive style={styles.now}>
            <Ionicons name={playing ? 'pause' : 'play'} size={15} color="#fff" style={!playing && { marginLeft: 2 }} />
          </Glass>
        ) : null}
      </View>
      <Text style={[styles.title, { color: active ? colors.accent : colors.text }, round && styles.center]} numberOfLines={1}>{title}</Text>
      {subtitle ? <Text style={[type.footnote, { color: colors.textSecondary }, round && styles.center]} numberOfLines={1}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  centered: { alignItems: 'center' },
  title: { ...type.subhead, fontWeight: '600', marginTop: space.sm },
  center: { textAlign: 'center' },
  badge: { position: 'absolute', top: space.sm, left: space.sm, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  now: { position: 'absolute', right: space.sm, bottom: space.sm, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
