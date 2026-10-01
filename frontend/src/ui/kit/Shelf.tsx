import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { type, GUTTER, space } from '../tokens';

// Tiêu đề một mục kiểu Apple Music: chữ lớn, có "›" và bấm được nếu có "xem tất cả".
export function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable style={styles.head} onPress={onSeeAll} disabled={!onSeeAll} accessibilityRole={onSeeAll ? 'button' : 'header'} hitSlop={8}>
      <Text style={[type.title2, { color: colors.text }]}>{title}</Text>
      {onSeeAll && <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
    </Pressable>
  );
}

// Kệ cuộn ngang: tiêu đề (tuỳ chọn) + hàng thẻ.
export default function Shelf({ title, onSeeAll, children, gap = space.md }: {
  title?: string; onSeeAll?: () => void; children: React.ReactNode; gap?: number;
}) {
  return (
    <View style={title ? styles.shelf : undefined}>
      {title ? <SectionHeader title={title} onSeeAll={onSeeAll} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap }]} decelerationRate="fast">
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { marginTop: space.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: GUTTER, marginBottom: space.sm + 2, alignSelf: 'flex-start' },
  row: { paddingHorizontal: GUTTER },
});
