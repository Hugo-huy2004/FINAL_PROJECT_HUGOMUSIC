import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReviewStatus } from '../hooks/useSongManager';

const TABS: { key: ReviewStatus; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'pending', label: 'Chờ duyệt', icon: 'time-outline', color: '#FF9500' },
  { key: 'published', label: 'Đã xuất bản', icon: 'checkmark-circle-outline', color: '#07875F' },
  { key: 'rejected', label: 'Từ chối', icon: 'close-circle-outline', color: '#FF3B30' },
];

// Ba trạng thái của kho, đồng thời là ba tab lọc danh sách.
export default function DashboardStats({
  status,
  counts,
  onSelect,
}: {
  status: ReviewStatus;
  counts: Partial<Record<ReviewStatus, number>>;
  onSelect: (s: ReviewStatus) => void;
}) {
  return (
    <View style={styles.container}>
      {TABS.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.statCard, status === t.key && { borderColor: t.color }]}
          onPress={() => onSelect(t.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: status === t.key }}
        >
          <Ionicons name={t.icon} size={24} color={t.color} />
          <View style={styles.textContainer}>
            <Text style={styles.statLabel}>{t.label}</Text>
            <Text style={styles.statValue}>{counts[t.key] ?? 0}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  statCard: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 20,
  },
  textContainer: { marginLeft: 16 },
  statLabel: { fontSize: 13, color: '#666' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#000' },
});
