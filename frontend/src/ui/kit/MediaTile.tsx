import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import CoverArt from '../../components/CoverArt';
import { type, radius, space } from '../tokens';

// Thẻ vuông (bài, album) hoặc tròn (nghệ sĩ): ảnh + tên + dòng phụ, nhãn nhỏ tuỳ chọn.
export default function MediaTile({ uri, art, title, subtitle, size, round = false, badge, active = false, playing = false, onPress }: {
  uri?: string; art?: React.ReactNode; title: string; subtitle?: string; size: number; round?: boolean; badge?: string;
  active?: boolean; playing?: boolean; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: size }, round && { alignItems: 'center' }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected: active }}
    >
      <View>
        {art ?? <CoverArt uri={uri} title={title} size={size} radius={round ? size / 2 : radius.lg} />}
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        {active && (
          <View style={[styles.now, { backgroundColor: colors.accent }]}>
            <Ionicons name={playing ? 'pause' : 'play'} size={15} color="#fff" style={!playing && { marginLeft: 2 }} />
          </View>
        )}
      </View>
      <Text style={[styles.title, { color: active ? colors.accent : colors.text }, round && styles.center]} numberOfLines={1}>{title}</Text>
      {subtitle && <Text style={[type.footnote, { color: colors.textSecondary }, round && styles.center]} numberOfLines={1}>{subtitle}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  title: { ...type.subhead, fontWeight: '600', marginTop: space.sm },
  center: { textAlign: 'center' },
  badge: { position: 'absolute', top: space.sm, left: space.sm, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  now: { position: 'absolute', right: space.sm, bottom: space.sm, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
