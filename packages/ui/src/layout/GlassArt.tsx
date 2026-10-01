import React from 'react';
import { Image, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useHugoTheme } from '../theme';

const MARK = require('../../assets/hugo-mark.png');

/**
 * Generated glass artwork for items without a cover: a translucent pane with a diagonal sheen, a bright rim and a glass bead holding the Hugo Music mark.
 *
 * @usage Placeholder artwork. Artwork and MediaTile fall back to it on their own, so you rarely place it directly.
 * @remarks It is drawn without live blur so hundreds of them can scroll smoothly in long lists.
 * @a11y Decorative: it exposes no label of its own.
 * @example <GlassArt width={96} height={96} radius={14} />
 */
export default function GlassArt({ width, height, radius, style, children }: {
  width: number | `${number}%`;
  height: number;
  radius: number;
  style?: ViewStyle;
  /** Content placed on top of the glass. */
  children?: React.ReactNode;
}) {
  const { isDark } = useHugoTheme();
  const side = Math.min(typeof width === 'number' ? width : height, height);
  const bead = side * 0.68;
  const mark = side * 0.5;
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.32)' }, WEB_PANE, style]}>
      <LinearGradient colors={['rgba(94,234,212,0.16)', 'rgba(56,189,248,0.10)', 'rgba(99,102,241,0.14)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']} locations={[0, 0.42, 0.43]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={[styles.bead, { width: bead, height: bead, borderRadius: bead / 2 }, WEB_BEAD]}>
          <LinearGradient colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} end={{ x: 0.5, y: 0.55 }} style={StyleSheet.absoluteFill} />
          <Image source={MARK} style={{ width: mark, height: mark }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
      </View>
      {children}
      <View style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius, pointerEvents: 'none' }]} />
    </View>
  );
}

const WEB_PANE = Platform.OS === 'web' ? ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 30px -12px rgba(0,0,0,0.45)' } as object) : {};
const WEB_BEAD = Platform.OS === 'web'
  ? ({ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -6px 14px rgba(255,255,255,0.08), 0 8px 22px rgba(0,0,0,0.25)' } as object)
  : { elevation: 3 };

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  bead: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  rim: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
});
