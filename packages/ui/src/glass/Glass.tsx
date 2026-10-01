import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useHugoTheme } from '../theme';
import { ensureWebGlass } from './webGlass';

const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();
const DARK_TONE = { glass: 'rgba(255,255,255,0.14)', glassClear: 'rgba(255,255,255,0.06)', glassSolid: 'rgba(60,60,64,0.9)', cardBorder: 'rgba(255,255,255,0.2)' };

export type GlassProps = ViewProps & {
  /** Corner radius; the default 999 makes a capsule. */
  radius?: number;
  /** 'regular' for bars and controls, 'clear' (thinner) over rich media. */
  variant?: 'regular' | 'clear';
  /** Tints the glass (prominent buttons, selected states). */
  tint?: string;
  /** Reacts to touches (native interactive glass where available, press highlight elsewhere). */
  interactive?: boolean;
  /** Forces light or dark glass regardless of the app appearance (e.g. over dark artwork). */
  tone?: 'light' | 'dark';
};

/**
 * The frosted-glass material every control in the kit is built on: a translucent surface that blurs and saturates whatever scrolls behind it, with a sheen on the upper half and a bright rim along the edge.
 *
 * @usage Use glass for things that float above content — bars, toolbars, floating buttons, menus. Keep reading material (long text, lists, forms) on solid surfaces: glass over glass or text over busy glass loses legibility.
 * @remarks `variant="regular"` is the default material; `variant="clear"` is thinner for controls over rich media. `tint` colours the glass for prominent actions. On devices with a native glass material the kit uses it (interactive, reacting to touch); elsewhere it falls back to a system blur, CSS backdrop blur in browsers, or an opaque fill where no blur exists.
 * @a11y When the user asks for reduced transparency the glass becomes an opaque surface, so text on it stays readable.
 * @example <Glass style={{ padding: 16 }}><Text>Floating panel</Text></Glass>
 * @example <Glass variant="clear" tint="#0A84FF" radius={20} style={{ padding: 12 }}>
 *   <Text style={{ color: '#fff' }}>Tinted, see-through</Text>
 * </Glass>
 */
export default function Glass({ radius = 999, variant = 'regular', tint, interactive = false, tone, style, children, ...rest }: GlassProps) {
  const theme = useHugoTheme();
  const isDark = tone ? tone === 'dark' : theme.isDark;
  const colors = tone === 'dark' ? { ...theme.colors, ...DARK_TONE } : theme.colors;
  const shape = { borderRadius: radius, overflow: 'hidden' as const };
  const tintLayer = tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.86, pointerEvents: 'none' }]} /> : null;

  if (NATIVE_GLASS) {
    return (
      <GlassView glassEffectStyle={variant} tintColor={tint} isInteractive={interactive} colorScheme={isDark ? 'dark' : 'light'} style={[shape, style]} {...rest}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'ios') {
    const material = variant === 'clear' ? 'systemUltraThinMaterial' : 'systemChromeMaterial';
    return (
      <BlurView tint={`${material}${isDark ? 'Dark' : 'Light'}`} intensity={100} style={[shape, styles.hairline, { borderColor: colors.cardBorder }, style]} {...rest}>
        {tintLayer}
        {children}
      </BlurView>
    );
  }
  if (Platform.OS === 'web') ensureWebGlass();
  const web = Platform.OS === 'web';
  return (
    <View
      {...rest}
      {...(web ? ({ dataSet: { hugoglass: isDark ? 'dark' : 'light', ...(variant === 'clear' ? { hugoclear: '1' } : {}) } } as object) : {})}
      style={[
        shape,
        web
          ? { backgroundColor: variant === 'clear' ? colors.glassClear : colors.glass }
          : [styles.hairline, styles.elevated, { backgroundColor: colors.glassSolid, borderColor: colors.cardBorder }],
        style,
      ]}
    >
      {tintLayer}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: { borderWidth: StyleSheet.hairlineWidth },
  elevated: { elevation: 6 },
});
