import { StyleSheet, View } from 'react-native';
import { Host, Button, Text } from '@expo/ui/swift-ui';
import {
  buttonStyle, buttonBorderShape, controlSize, tint as tintModifier, disabled as disabledModifier, frame, font,
  accessibilityLabel as a11yLabel,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme/theme';
import type { LiquidGlassButtonProps } from './LiquidGlassButton';

// iPhone: Button SwiftUI (docs.expo.dev/versions/latest/sdk/ui/swift-ui/button) — kính Liquid Glass thật
// của iOS 26: primary/circle/danger = glassProminent (tô màu), glass/pill = glass. Cùng props với bản RN.
// Đang tải (title rỗng + icon là vòng quay) thì hiện icon RN tại chỗ nút.
const SIZE = { md: 'regular', lg: 'large' } as const;

export default function LiquidGlassButton({
  onPress, title, variant = 'primary', size = 'md', icon, style, disabled = false, accessibilityLabel, systemImage, tint,
}: LiquidGlassButtonProps) {
  const { colors, isDark } = useAppTheme();
  const full = StyleSheet.flatten(style)?.width === '100%';
  if (!title) return <View style={[styles.busy, style]}>{icon}</View>;

  const prominent = variant === 'primary';
  const modifiers = [
    buttonStyle(prominent ? 'glassProminent' : 'glass'),
    buttonBorderShape('capsule'),
    controlSize(SIZE[size]),
    tintModifier(tint ?? (prominent ? colors.accent : colors.text)),
    disabledModifier(disabled),
    ...(accessibilityLabel ? [a11yLabel(accessibilityLabel)] : []),
  ];
  return (
    <Host matchContents={full ? { vertical: true } : true} style={full ? styles.full : undefined} colorScheme={isDark ? 'dark' : 'light'}>
      {full ? (
        // Nút rộng hết hàng: nhãn tự giãn để nền kính phủ cả chiều ngang.
        <Button onPress={onPress} modifiers={modifiers}>
          <Text modifiers={[frame({ maxWidth: Infinity }), font({ weight: 'semibold' })]}>{title}</Text>
        </Button>
      ) : (
        <Button onPress={onPress} label={title} systemImage={systemImage as any} modifiers={modifiers} />
      )}
    </Host>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  busy: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
