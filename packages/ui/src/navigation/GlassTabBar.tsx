import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';
import { springConfig } from '../glass/useDroplet';

export type TabItem = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive?: keyof typeof Ionicons.glyphMap };

function Tab({ item, selected, tint, onPress }: { item: TabItem; selected: boolean; tint: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number, bouncy = false) => Animated.spring(scale, { toValue: to, damping: bouncy ? 9 : 18, stiffness: bouncy ? 260 : 400, ...springConfig }).start();
  return (
    <Pressable style={styles.tab} onPress={onPress} onPressIn={() => press(0.82)} onPressOut={() => press(1, true)}
      accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label}>
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        <Ionicons name={selected ? item.iconActive ?? item.icon : item.icon} size={24} color={tint} />
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>{item.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating tab bar made of one glass capsule. The selection lens slides to the tapped tab on a spring, stretches while it moves and settles like a droplet; the selected tab switches to its filled icon.
 *
 * @usage Top-level sections of an app on phones (three to five). On wide screens use NavigationSidebar.
 * @remarks Pass `iconActive` for a filled variant of each icon. When `value` matches no tab the lens is hidden — useful while a screen outside the tabs is open.
 * @a11y Announced as a tab list with each tab's selected state; tabs shrink when pressed and bounce back on release.
 * @example <GlassTabBar value={tab} onChange={setTab} items={[
 *   { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
 *   { key: 'library', label: 'Library', icon: 'albums-outline', iconActive: 'albums' },
 * ]} />
 */
export default function GlassTabBar({ items, value, onChange, height = 64, tint, style }: {
  items: TabItem[];
  /** Key of the selected tab (no lens when it matches none). */
  value: string;
  onChange: (key: string) => void;
  height?: number;
  /** Colour of the selected tab (default: accent). */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useHugoTheme();
  const [width, setWidth] = useState(0);
  const index = items.findIndex((it) => it.key === value);
  const tabW = width / items.length;
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!tabW || index < 0) return;
    if (!placed.current) { x.setValue(index * tabW); placed.current = true; return; }
    Animated.parallel([
      Animated.spring(x, { toValue: index * tabW, damping: 17, stiffness: 190, mass: 0.9, ...springConfig }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.32, duration: 110, ...springConfig }),
        Animated.spring(stretch, { toValue: 1, damping: 7, stiffness: 220, ...springConfig }),
      ]),
    ]).start();
  }, [index, tabW]);

  return (
    <Glass style={[styles.bar, { height }, style]} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {tabW > 0 && index >= 0 && (
        <Animated.View style={[styles.lensSlot, { width: tabW, transform: [{ translateX: x }, { scaleX: stretch }] }, { pointerEvents: 'none' }]}>
          <View style={[styles.lens, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)', borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.9)' }]} />
        </Animated.View>
      )}
      {items.map((it, i) => (
        <Tab key={it.key} item={it} selected={i === index} tint={i === index ? tint ?? colors.accent : colors.text} onPress={() => onChange(it.key)} />
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
  lensSlot: { position: 'absolute', left: 0, top: 0, bottom: 0, padding: 5 },
  lens: { flex: 1, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },
});
