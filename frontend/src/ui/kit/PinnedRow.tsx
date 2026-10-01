import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { type, radius, space } from '../tokens';

// Mục cá nhân hoá ghim ở đầu mỗi tab Thư viện (My Playlist, Nghe gần đây, Phòng của tôi...):
// tấm kính có ô màu + tiêu đề + dòng phụ. Luôn hiện, kể cả khi còn trống — dòng phụ nói
// người dùng cần làm gì để nó có nội dung.
export default function PinnedRow({ icon, colors, title, subtitle, onPress, right }: {
  icon: keyof typeof Ionicons.glyphMap; colors: [string, string]; title: string; subtitle: string;
  onPress?: () => void; right?: React.ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.42)', borderColor: theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)' },
        WEB_GLASS,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${subtitle}`}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
        <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <Ionicons name={icon} size={26} color="#fff" />
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.headline, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[type.footnote, { color: theme.colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text>
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} /> : null)}
    </Pressable>
  );
}

const WEB_GLASS = Platform.OS === 'web'
  ? ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px -14px rgba(0,0,0,0.5)' } as object)
  : {};

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  art: { width: 60, height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
