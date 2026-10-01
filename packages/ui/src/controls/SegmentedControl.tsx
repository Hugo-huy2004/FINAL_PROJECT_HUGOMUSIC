import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';
import { springConfig } from '../glass/useDroplet';

export type Segment = { key: string; label: string };

/**
 * Switches between two to five related views. The selected segment is marked by a glass thumb that slides on a spring and stretches while it moves.
 *
 * @usage Mutually exclusive views of the same content (Songs / Albums / Artists). For navigation between unrelated sections use a tab bar or a sidebar instead.
 * @remarks Segments share the width equally. The first layout places the thumb without animation; later changes animate.
 * @a11y The control is a tab list and each segment a tab with its selected state, so screen readers announce “tab, 2 of 3, selected”.
 * @example <SegmentedControl value={tab} onChange={setTab} segments={[
 *   { key: 'songs', label: 'Songs' },
 *   { key: 'albums', label: 'Albums' },
 * ]} />
 */
export default function SegmentedControl({ segments, value, onChange, style }: {
  segments: Segment[];
  /** Key of the selected segment. */
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useHugoTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.key === value));
  const segW = width / segments.length;
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!segW) return;
    if (!placed.current) { x.setValue(index * segW); placed.current = true; return; }
    Animated.parallel([
      Animated.spring(x, { toValue: index * segW, damping: 18, stiffness: 220, ...springConfig }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.18, duration: 100, ...springConfig }),
        Animated.spring(stretch, { toValue: 1, damping: 8, stiffness: 240, ...springConfig }),
      ]),
    ]).start();
  }, [index, segW]);

  return (
    <View style={[styles.track, { backgroundColor: colors.fill }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 4)} accessibilityRole="tablist">
      {segW > 0 && (
        <Animated.View style={[styles.thumbSlot, { width: segW, transform: [{ translateX: x }, { scaleX: stretch }] }, { pointerEvents: 'none' }]}>
          <Glass interactive style={styles.thumb} />
        </Animated.View>
      )}
      {segments.map((s) => {
        const selected = s.key === value;
        return (
          <Pressable key={s.key} style={styles.segment} onPress={() => onChange(s.key)} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={s.label}>
            <Text style={[styles.label, { color: colors.text, fontWeight: selected ? '600' : '500' }]} numberOfLines={1}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 999, padding: 2, minHeight: 36, alignSelf: 'stretch' },
  thumbSlot: { position: 'absolute', top: 2, bottom: 2, left: 2 },
  thumb: { flex: 1 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, minHeight: 32 },
  label: { fontSize: 14, letterSpacing: -0.1 },
});
