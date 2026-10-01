import React from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import Glass from '../glass/Glass';
import { useDroplet } from '../glass/useDroplet';

type Icon = keyof typeof Ionicons.glyphMap;

/**
 * Any pressable content with the droplet press effect but no glass of its own.
 *
 * @usage Use it for custom controls that already have their own look (a large play button, an artwork card) but should still feel like the rest of the kit when pressed.
 * @remarks Pressing squashes the content (wider, shorter); releasing bounces it back on an under-damped spring, so it overshoots and wobbles like a drop landing on glass. `strength` scales the deformation.
 * @a11y Always pass `label`: the content is often just an icon. `selected` is exposed as the accessibility selected state.
 * @example <DropletPressable label="Play" onPress={play}>
 *   <Ionicons name="play-circle" size={64} color={accent} />
 * </DropletPressable>
 */
export function DropletPressable({ onPress, disabled, label, selected, style, strength = 1, children }: {
  onPress: () => void;
  disabled?: boolean;
  /** Accessibility label (required — the content may be only an icon). */
  label: string;
  /** Exposes a selected state to assistive technologies. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  /** How strongly the shape squashes when pressed. */
  strength?: number;
  children: React.ReactNode;
}) {
  const d = useDroplet(strength);
  return (
    <Pressable onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} disabled={disabled} style={style}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }}>
      <Animated.View style={d.style}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Round, icon-only glass button with the droplet press effect.
 *
 * @usage Floating controls over content: close, back, more, add. For a labelled action use ActionButton; for several icons in one pill use GlassCapsule with CapsuleButton.
 * @remarks `tint` turns it into a prominent coloured button, `variant="clear"` suits artwork backgrounds and `tone` forces light or dark glass. `nudge` shifts asymmetric glyphs such as chevrons so they look centred.
 * @a11y `label` is required and read by screen readers. Keep `size` at 44 points or more so it stays easy to hit.
 * @example <GlassButton icon="close" label="Close" onPress={onClose} />
 * @example <GlassButton icon="heart" label="Like" tint="#FF375F" size={52} onPress={like} />
 */
export function GlassButton({ icon, label, onPress, size = 44, iconSize = 21, color, tone, variant, tint, nudge = 0, style }: {
  /** Ionicons glyph name. */
  icon: Icon;
  /** Screen-reader label (required: the button has no visible text). */
  label: string;
  onPress: () => void;
  /** Diameter in points; keep ≥ 44 for touch targets. */
  size?: number;
  iconSize?: number;
  color?: string;
  tone?: 'light' | 'dark';
  /** 'clear' glass over artwork, 'regular' elsewhere. */
  variant?: 'regular' | 'clear';
  /** Tinted (prominent) glass, e.g. the accent colour for a primary action. */
  tint?: string;
  /** Optical offset for glyphs that look off-centre (e.g. chevrons). */
  nudge?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useHugoTheme();
  const d = useDroplet();
  const fg = color ?? (tint || tone === 'dark' ? '#fff' : colors.text);
  return (
    <Animated.View style={[{ width: size, height: size }, d.style, style]}>
      <Glass tone={tone} variant={variant} tint={tint} interactive style={StyleSheet.absoluteFill}>
        <Pressable style={styles.center} onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
          <Ionicons name={icon} size={iconSize} color={fg} style={nudge ? { marginLeft: nudge } : undefined} />
        </Pressable>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheen, d.sheen, { pointerEvents: 'none' }]} />
      </Glass>
    </Animated.View>
  );
}

/**
 * An icon button that lives inside a GlassCapsule; the icon itself squashes like a droplet with a soft light bubble behind it.
 *
 * @usage Two to four related actions that belong together — shuffle, repeat, share — floating over artwork.
 * @remarks It has no glass of its own; the surrounding GlassCapsule provides the material, so the group reads as one object.
 * @a11y `label` is required. Each button is a separate accessibility element.
 * @example <GlassCapsule>
 *   <CapsuleButton icon="shuffle" label="Shuffle" color="#fff" onPress={shuffle} />
 *   <CapsuleButton icon="repeat" label="Repeat" color="#fff" onPress={repeat} />
 * </GlassCapsule>
 */
export function CapsuleButton({ icon, label, onPress, color, iconSize = 20, width = 42 }: {
  /** Ionicons glyph name. */
  icon: Icon;
  /** Screen-reader label. */
  label: string;
  onPress: () => void;
  /** Tint of the icon. */
  color: string;
  iconSize?: number;
  width?: number;
}) {
  const d = useDroplet(1.4);
  return (
    <Pressable onPress={onPress} onPressIn={d.onPressIn} onPressOut={d.onPressOut} style={[styles.capBtn, { width }]} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Animated.View style={[styles.bubble, d.sheen, { pointerEvents: 'none' }]} />
      <Animated.View style={d.style}><Ionicons name={icon} size={iconSize} color={color} /></Animated.View>
    </Pressable>
  );
}

/**
 * A glass pill that holds several CapsuleButtons as one compact toolbar.
 *
 * @usage Secondary actions floating over media. Keep it short: more than four actions belong in a ContextMenu.
 * @remarks Height is 44 points with 3 points of inner padding, so CapsuleButtons sit inside with an even rim.
 * @a11y The capsule itself is not focusable; screen readers move through the buttons inside it.
 * @example <GlassCapsule variant="clear">
 *   <CapsuleButton icon="share-outline" label="Share" color="#fff" onPress={share} />
 * </GlassCapsule>
 */
export function GlassCapsule({ children, tone, variant, style }: {
  children: React.ReactNode;
  tone?: 'light' | 'dark';
  variant?: 'regular' | 'clear';
  style?: StyleProp<ViewStyle>;
}) {
  return <Glass tone={tone} variant={variant} interactive style={[styles.capsule, style]}>{children}</Glass>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheen: { backgroundColor: '#fff', borderRadius: 999 },
  capsule: { flexDirection: 'row', height: 44, paddingHorizontal: 3, alignItems: 'center' },
  capBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', top: 2, bottom: 2, left: 2, right: 2, borderRadius: 999, backgroundColor: '#fff' },
});
