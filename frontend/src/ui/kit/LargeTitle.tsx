import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import { type, GUTTER, space } from '../tokens';

// Tiêu đề lớn đầu màn hình (iOS Large Title), phần phải tuỳ chọn (avatar, nút).
export default function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={[type.subhead, { color: colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: GUTTER, paddingTop: space.lg, paddingBottom: space.sm },
});
