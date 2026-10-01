import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius, space } from '../tokens';
import Glass from '../glass/Glass';

/**
 * Colour card for content without artwork — generated mixes, genres, stations — with a diagonal sheen, a bright rim and its icon in a clear-glass bead.
 *
 * @usage When there is no real cover. Feed it `gradientFor(key)` so the same item always gets the same colours.
 * @remarks White bold text is used on every gradient, so pick saturated colour pairs. `big` switches to hero typography for featured tiles.
 * @a11y The title (or `label`) is the accessible name.
 * @example <GradientTile title="Chill Mix" subtitle="Made for you" colors={gradientFor('chill')} icon="shuffle" width={220} height={260} big onPress={open} />
 */
export default function GradientTile({ title, subtitle, colors, icon, width, height, onPress, big = false, label, brand }: {
  title: string;
  subtitle?: string;
  /** Two-stop gradient, e.g. gradientFor(key). */
  colors: [string, string];
  icon?: keyof typeof Ionicons.glyphMap;
  width: number | `${number}%`;
  height: number;
  onPress: () => void;
  /** Hero typography (32 pt title). */
  big?: boolean;
  /** Accessibility label when it differs from the title. */
  label?: string;
  /** Small wordmark in the top-right corner of big tiles. */
  brand?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label || title}>
      <View style={[styles.card, { height }]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 0.46]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.top}>
          {icon ? (
            <Glass variant="clear" tone="dark" style={[styles.chip, big && styles.chipBig]}>
              <Ionicons name={icon} size={big ? 22 : 17} color="#fff" />
            </Glass>
          ) : <View />}
          {big && brand ? <Text style={styles.brand}>{brand}</Text> : null}
        </View>
        <View>
          <Text style={[styles.title, big && styles.titleBig]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={big ? 3 : 1}>{subtitle}</Text> : null}
        </View>
        <View style={[StyleSheet.absoluteFill, styles.rim, { pointerEvents: 'none' }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  card: { borderRadius: radius.lg, padding: space.md + 2, justifyContent: 'space-between', overflow: 'hidden' },
  rim: { borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  chipBig: { width: 44, height: 44 },
  brand: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 8 },
  titleBig: { fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, marginTop: 2 },
});
