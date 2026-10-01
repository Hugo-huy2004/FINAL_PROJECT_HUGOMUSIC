import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LICENSE_LABELS } from '../../../components/LicenseBadge';

// Chọn giấy phép — bắt buộc cho mọi bài vào kho (tầng bản quyền).
export default function LicensePicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.row}>
      {Object.entries(LICENSE_LABELS).map(([key, label]) => (
        <TouchableOpacity
          key={key}
          style={[styles.chip, value === key && styles.chipOn]}
          onPress={() => onChange(key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === key }}
        >
          <Text style={[styles.text, value === key && styles.textOn]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#ddd' },
  chipOn: { backgroundColor: '#07875F', borderColor: '#07875F' },
  text: { fontSize: 13, color: '#333' },
  textOn: { color: '#fff', fontWeight: '600' },
});
