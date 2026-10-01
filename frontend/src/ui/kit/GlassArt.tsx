import React from 'react';
import { View, Image, StyleSheet, Platform, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/theme';

// Ảnh bìa mặc định cho bài không có ảnh (hoặc ảnh lỗi): một TẤM KÍNH + logo Hugo Music.
// Tấm kính trong mờ trên nền trơn sáng/tối; thêm vệt bóng chéo, viền bắt sáng và một "hạt kính"
// ôm logo. Không dùng backdrop-filter: hàng trăm ô cùng blur sẽ làm cuộn giật.
const LOGO = require('../../../assets/logo-cover.png');

export default function GlassArt({ width, height, radius, style, children }: {
  title?: string; width: number | `${number}%`; height: number; radius: number; style?: ViewStyle; children?: React.ReactNode;
}) {
  const { isDark } = useAppTheme();
  const side = Math.min(typeof width === 'number' ? width : height, height);
  const bead = side * 0.68;
  const logo = side * 0.5;
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.32)' }, WEB_PANE, style]}>
      {/* Chút sắc mint/xanh của thương hiệu trong lòng kính */}
      <LinearGradient colors={['rgba(94,234,212,0.16)', 'rgba(56,189,248,0.10)', 'rgba(99,102,241,0.14)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Vệt bóng chéo ở nửa trên — dấu hiệu nhận ra "kính" */}
      <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']} locations={[0, 0.42, 0.43]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={[styles.bead, { width: bead, height: bead, borderRadius: bead / 2 }, WEB_BEAD]}>
          <LinearGradient colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} end={{ x: 0.5, y: 0.55 }} style={StyleSheet.absoluteFill} />
          <Image source={LOGO} style={{ width: logo, height: logo }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
      </View>
      {children}
      <View style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius }, { pointerEvents: 'none' }]} />
    </View>
  );
}

// Web: viền sáng mép trên + bóng đổ nhẹ cho tấm kính nổi khỏi nền.
const WEB_PANE = Platform.OS === 'web'
  ? ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 30px -12px rgba(0,0,0,0.45)' } as object)
  : {};
const WEB_BEAD = Platform.OS === 'web'
  ? ({ boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -6px 14px rgba(255,255,255,0.08), 0 8px 22px rgba(0,0,0,0.25)' } as object)
  : { elevation: 3 };

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  bead: {
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
  },
  rim: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
});
