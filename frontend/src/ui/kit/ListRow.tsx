import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import CoverArt from '../../components/CoverArt';
import { type, TOUCH, space, radius } from '../tokens';

// Một dòng danh sách: ảnh nhỏ (hoặc icon) + tên + dòng phụ + phần phụ bên phải.
// Cao ≥ 56 pt, phần ảnh + chữ là vùng chạm. `right` nằm NGOÀI vùng chạm đó vì nó thường chứa
// nút riêng (…, công tắc) — nút lồng trong nút là HTML sai và bấm dễ nhầm.
export default function ListRow({ art, round = false, icon, title, subtitle, right, active = false, onPress, separator = true }: {
  art?: string; round?: boolean; icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string;
  right?: React.ReactNode; active?: boolean; onPress?: () => void; separator?: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const lead = art !== undefined ? 48 : icon ? 32 : 0;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ selected: active }}
      >
        {art !== undefined ? (
          <CoverArt uri={art} title={title} size={48} radius={round ? 24 : radius.sm} />
        ) : icon ? (
          <View style={styles.iconBox}><Ionicons name={icon} size={22} color={colors.accent} /></View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.callout, { color: active ? colors.accent : colors.text, fontWeight: '500' }]} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={[type.footnote, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </Pressable>
      {right ? <View style={styles.right}>{right}</View> : null}
      {separator && <View style={[styles.sep, { left: lead ? space.xs + lead + space.md : 0, backgroundColor: colors.border }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH + 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.xs, paddingVertical: space.sm, borderRadius: radius.md, alignSelf: 'stretch' },
  iconBox: { width: 32, alignItems: 'center' },
  right: { paddingLeft: space.sm, paddingRight: space.xs, flexDirection: 'row', alignItems: 'center' },
  sep: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
