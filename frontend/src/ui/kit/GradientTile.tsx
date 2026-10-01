import { Text, StyleSheet, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius, space } from '../tokens';

// Thẻ màu (mix, thể loại, đài) chất liệu kính: nền màu + vệt bóng chéo phía trên + viền bắt
// sáng + icon trong một viên kính nhỏ. Chữ trắng đậm, luôn đọc được trên nền rực.
export default function GradientTile({ title, subtitle, colors, icon, width, height, onPress, big = false, label }: {
  title: string; subtitle?: string; colors: [string, string]; icon?: keyof typeof Ionicons.glyphMap;
  width: number | `${number}%`; height: number; onPress: () => void; big?: boolean; label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label || title}
    >
      <View style={[styles.card, { height }]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          locations={[0, 0.45, 0.46]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.top}>
          {icon ? (
            <View style={[styles.chip, big && styles.chipBig]}>
              <Ionicons name={icon} size={big ? 22 : 17} color="#fff" />
            </View>
          ) : <View />}
          {big && <Text style={styles.brand}>Hugo Music</Text>}
        </View>
        <View>
          <Text style={[styles.title, big && styles.titleBig]} numberOfLines={2}>{title}</Text>
          {subtitle && <Text style={styles.subtitle} numberOfLines={big ? 3 : 1}>{subtitle}</Text>}
        </View>
        <View style={[StyleSheet.absoluteFill, styles.rim, { pointerEvents: 'none' }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  card: { borderRadius: radius.lg, padding: space.md + 2, justifyContent: 'space-between', overflow: 'hidden' },
  rim: { borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  chipBig: { width: 44, height: 44, borderRadius: 22 },
  brand: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.2)', textShadowRadius: 8 },
  titleBig: { fontSize: 32, lineHeight: 36, letterSpacing: -0.8 },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, marginTop: 2 },
});
