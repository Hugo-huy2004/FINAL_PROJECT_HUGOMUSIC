import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';
import { useDroplet } from '../glass/useDroplet';
import Spinner from './Spinner';

export type ActionButtonProps = {
  onPress?: () => void;
  /** Leave empty for an icon-only button (then pass accessibilityLabel). */
  title?: string;
  /** 'primary' tinted glass in the accent colour · 'glass' plain glass · 'danger' red text · 'plain' no background. */
  variant?: 'primary' | 'glass' | 'danger' | 'plain';
  /** 'sm' 32 pt (toolbars, tables) · 'md' 44 pt · 'lg' 50 pt. */
  size?: 'sm' | 'md' | 'lg';
  /** An Ionicons glyph name, or any element (shown before the title). */
  icon?: keyof typeof Ionicons.glyphMap | React.ReactNode;
  /** Shows a spinner instead of the icon and blocks presses. */
  loading?: boolean;
  /** Overrides the accent tint of a primary button. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const SIZES = {
  sm: { height: 32, paddingHorizontal: 12, fontSize: 13, icon: 14 },
  md: { height: 44, paddingHorizontal: 20, fontSize: 15, icon: 17 },
  lg: { height: 50, paddingHorizontal: 26, fontSize: 17, icon: 19 },
};

/**
 * Capsule-shaped button in frosted glass with the droplet press effect.
 *
 * @usage The main action of a screen or sheet — Sign in, Continue, Save — with `variant="primary"` once per screen. Use `glass` for the secondary choice next to it (Cancel, Back), `danger` for destructive actions and `plain` for low-emphasis actions in toolbars and tables.
 * @remarks Primary buttons are glass tinted in the accent colour with white text. `size="sm"` (32 pt) suits dense tables, `md` is 44 pt and `lg` 50 pt. `icon` takes an icon name or any element; `loading` swaps it for a spinner and blocks presses. Without `title` it becomes an icon-only button.
 * @a11y The title is the accessible name; icon-only buttons need `accessibilityLabel`. Disabled and busy states are announced.
 * @example <ActionButton title="Continue" size="lg" onPress={next} disabled={!valid} />
 * @example <ActionButton variant="glass" title="Cancel" onPress={close} />
 * @example <ActionButton variant="danger" size="sm" icon="trash-outline" title="Delete" loading={deleting} onPress={remove} />
 * @example <ActionButton variant="plain" size="sm" icon="close" accessibilityLabel="Close" onPress={close} />
 */
export default function ActionButton({ onPress, title, variant = 'primary', size = 'md', icon, loading = false, tint, style, disabled = false, accessibilityLabel }: ActionButtonProps) {
  const { colors } = useHugoTheme();
  const d = useDroplet(0.6);
  const sz = SIZES[size];
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? '#FF3B30' : variant === 'plain' ? colors.textSecondary : colors.text;
  const iconEl = loading ? <Spinner size="small" color={fg} />
    : typeof icon === 'string' ? <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={sz.icon} color={fg} /> : icon;
  const content = (
    <View style={[styles.row, { minHeight: sz.height, paddingHorizontal: title ? sz.paddingHorizontal : (sz.height - sz.icon) / 2 }]}>
      {iconEl ? <View style={title ? styles.iconGap : undefined}>{iconEl}</View> : null}
      {title ? <Text style={[styles.title, { fontSize: sz.fontSize, color: fg }]} numberOfLines={1}>{title}</Text> : null}
    </View>
  );
  return (
    <Pressable onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} disabled={disabled || loading} style={style}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled, busy: loading }}>
      <Animated.View style={[d.style, { opacity: disabled ? 0.5 : 1 }]}>
        {variant === 'plain' ? content : (
          <Glass interactive tint={variant === 'primary' ? tint ?? colors.accent : undefined}>
            {content}
            <Animated.View style={[StyleSheet.absoluteFill, styles.sheen, d.sheen, { pointerEvents: 'none' }]} />
          </Glass>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconGap: { marginRight: 6 },
  title: { fontWeight: '600', letterSpacing: -0.2 },
  sheen: { backgroundColor: '#fff' },
});
