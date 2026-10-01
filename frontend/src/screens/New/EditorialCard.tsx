import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/theme';
import { isHexColor, shade } from '../../utils/color';
import { resolveImageUri, isRealCover } from '../../components/CoverArt';
import { type, space } from '../../ui/tokens';

// Thẻ biên tập lớn đầu trang Mới (kiểu Apple Music): nhãn nhỏ viết hoa · tiêu đề · dòng phụ ở TRÊN
// thẻ; trong thẻ là nền màu chủ đạo của ảnh bìa, ảnh bìa vuông bên phải, chú thích 2 dòng ở đáy.
// `art` cho phép thay phần ảnh (vd. ảnh bìa bảng xếp hạng).
export default function EditorialCard({ eyebrow, title, subtitle, caption, cover, color, art, width, onPress }: {
  eyebrow: string; title: string; subtitle?: string; caption?: string; cover?: string; color?: string;
  art?: (height: number) => React.ReactNode; width: number; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const height = Math.round(width * 0.62);
  const base = isHexColor(color) ? color : '#3A3A3C';
  const image = isRealCover(cover) ? resolveImageUri(cover) : undefined;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}>
      <Text style={[styles.eyebrow, { color: colors.textSecondary }]} numberOfLines={1}>{eyebrow}</Text>
      <Text style={[type.body, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[type.body, { color: colors.textSecondary, minHeight: 22 }]} numberOfLines={1}>{subtitle ?? ' '}</Text>
      <View style={[styles.card, { height, marginTop: space.sm }]}>
        <LinearGradient colors={[shade(base, 0.12), shade(base, -0.35)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.art, { width: height, height }]}>
          {art ? art(height) : image ? <Image source={{ uri: image }} style={{ width: height, height }} resizeMode="cover" /> : null}
        </View>
        {caption ? (
          <>
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={[styles.shade, { pointerEvents: 'none' }]} />
            {/* Ảnh riêng (không phải ảnh bìa) có chữ trên đó → chú thích chỉ nằm ở phần trống bên trái. */}
            <Text style={[styles.caption, art ? { right: height + space.md } : null]} numberOfLines={art ? 4 : 2}>{caption}</Text>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  card: { borderRadius: 12, overflow: 'hidden' },
  art: { position: 'absolute', right: 0, top: 0 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  caption: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, color: '#fff', fontSize: 13, lineHeight: 18 },
});
