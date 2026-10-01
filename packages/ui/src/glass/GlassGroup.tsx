import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassContainer, isLiquidGlassAvailable } from 'expo-glass-effect';

const NATIVE = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * Lays out several glass shapes together so that, where the platform supports it, neighbouring shapes melt into one another like drops of water joining.
 *
 * @usage Wrap a cluster of related floating controls — transport buttons, a toolbar — instead of placing separate glass buttons side by side.
 * @remarks `spacing` is both the gap between children and the distance under which shapes merge. Without native support it is a plain row (or column) with that gap, so layouts stay identical everywhere.
 * @a11y Grouping is visual only; every child keeps its own label and role.
 * @example <GlassGroup spacing={10}>
 *   <GlassButton icon="play-skip-back" label="Previous" onPress={prev} />
 *   <GlassButton icon="play" label="Play" tint={accent} onPress={play} />
 *   <GlassButton icon="play-skip-forward" label="Next" onPress={next} />
 * </GlassGroup>
 */
export default function GlassGroup({ spacing = 8, direction = 'row', style, children }: {
  /** Distance under which shapes merge (where supported) and the gap between children. */
  spacing?: number;
  direction?: 'row' | 'column';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const layout = { flexDirection: direction, gap: spacing, alignItems: 'center' as const };
  if (NATIVE) return <GlassContainer spacing={spacing} style={[layout, style]}>{children}</GlassContainer>;
  return <View style={[layout, style]}>{children}</View>;
}
