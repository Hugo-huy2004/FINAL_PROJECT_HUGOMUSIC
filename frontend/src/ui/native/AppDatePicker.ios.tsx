import { StyleSheet, View, Text } from 'react-native';
import { Host, DatePicker } from '@expo/ui/swift-ui';
import { datePickerStyle, tint, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme/theme';
import type { AppDatePickerProps } from './AppDatePicker';

// iPhone: DatePicker SwiftUI kiểu compact (chạm → lịch bật lên), không cho chọn ngày tương lai.
const fromIso = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function AppDatePicker({ value, onChange, max = new Date(), style }: AppDatePickerProps) {
  const { colors, isDark } = useAppTheme();
  const { color, fontSize, ...box } = StyleSheet.flatten(style) || {};
  return (
    <View style={[styles.row, box]}>
      <Text style={[styles.label, { color: value ? colors.text : colors.textTertiary }]}>{value ? 'Ngày sinh' : 'Chọn ngày sinh'}</Text>
      <Host matchContents colorScheme={isDark ? 'dark' : 'light'}>
        <DatePicker
          selection={fromIso(value) ?? new Date(2000, 0, 1)}
          range={{ end: max }}
          displayedComponents={['date']}
          onDateChange={(d) => onChange(toIso(d))}
          modifiers={[datePickerStyle('compact'), labelsHidden(), tint(colors.accent)]}
        />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 17 },
});
