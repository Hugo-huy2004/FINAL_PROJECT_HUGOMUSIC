import React, { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import Glass from '../../components/LiquidGlass/Glass';

// Hiệu ứng "giọt nước" cho nút (Liquid Glass): nhấn → nút bẹt ngang, lún dọc; thả → nảy về bằng lò
// xo ít giảm chấn nên vượt quá rồi dao động nhẹ (dẹt ↔ dài) như giọt nước chạm mặt kính; kèm lớp
// sáng loé khi nhấn. Một giá trị `p` điều khiển tất cả — interpolate không kẹp nên phần vượt lò xo
// tự đảo chiều biến dạng.
const USE_NATIVE = Platform.OS !== 'web';

export function useDroplet(strength = 1) {
  const p = useRef(new Animated.Value(0)).current;
  const onPressIn = () => Animated.spring(p, { toValue: 1, damping: 14, stiffness: 520, mass: 0.6, useNativeDriver: USE_NATIVE }).start();
  const onPressOut = () => Animated.spring(p, { toValue: 0, damping: 5.5, stiffness: 300, mass: 0.7, useNativeDriver: USE_NATIVE }).start();
  const style = {
    transform: [
      { scaleX: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 0.08 * strength] }) },
      { scaleY: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - 0.14 * strength] }) },
    ],
  };
  const sheen = { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22], extrapolate: 'clamp' }) };
  return { style, sheen, onPressIn, onPressOut };
}

// Nút bất kỳ (không nền kính) có hiệu ứng giọt nước — nút ▶ ◀◀ ▶▶ của trình phát, nút Phát...
export function DropletPressable({ onPress, disabled, label, selected, style, strength = 1, children }: {
  onPress: () => void; disabled?: boolean; label: string; selected?: boolean; style?: StyleProp<ViewStyle>;
  strength?: number; children: React.ReactNode;
}) {
  const d = useDroplet(strength);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={d.onPressIn}
      onPressOut={d.onPressOut}
      disabled={disabled}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
    >
      <Animated.View style={d.style}>{children}</Animated.View>
    </Pressable>
  );
}

// Nút kính tròn có hiệu ứng giọt nước (quay lại, thu nhỏ, trộn bài...).
export function GlassButton({ icon, label, onPress, size = 44, iconSize = 21, color, tone, nudge = 0, style }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; size?: number; iconSize?: number;
  color?: string; tone?: 'light' | 'dark'; nudge?: number; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const d = useDroplet();
  return (
    <Animated.View style={[{ width: size, height: size }, d.style, style]}>
      <Glass tone={tone} interactive style={StyleSheet.absoluteFill}>
        <Pressable style={styles.center} onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
          <Ionicons name={icon} size={iconSize} color={color ?? (tone === 'dark' ? '#fff' : colors.text)} style={nudge ? { marginLeft: nudge } : undefined} />
        </Pressable>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheen, d.sheen, { pointerEvents: 'none' }]} />
      </Glass>
    </Animated.View>
  );
}

// Một nút trong viên kính nhiều nút: chính icon co giãn kiểu giọt nước, kèm bong bóng sáng phía sau.
export function CapsuleButton({ icon, label, onPress, color, iconSize = 20, width = 42 }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color: string; iconSize?: number; width?: number;
}) {
  const d = useDroplet(1.4);
  return (
    <Pressable onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} style={[styles.capBtn, { width }]} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Animated.View style={[styles.bubble, d.sheen, { pointerEvents: 'none' }]} />
      <Animated.View style={d.style}>
        <Ionicons name={icon} size={iconSize} color={color} />
      </Animated.View>
    </Pressable>
  );
}

// Viên kính chứa nhiều CapsuleButton (mỗi nút tự có hiệu ứng giọt nước).
export function GlassCapsule({ children, tone, style }: { children: React.ReactNode; tone?: 'light' | 'dark'; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass tone={tone} interactive style={[styles.capsule, style]}>
      {children}
    </Glass>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheen: { backgroundColor: '#fff', borderRadius: 999 },
  capsule: { flexDirection: 'row', height: 44, paddingHorizontal: 3, alignItems: 'center' },
  capBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', top: 2, bottom: 2, left: 2, right: 2, borderRadius: 999, backgroundColor: '#fff' },
});

