import { StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/theme';
import type { AppDatePickerProps } from './AppDatePicker';

// Web: ô chọn ngày của trình duyệt (có lịch sẵn), khoác đúng khung/màu của ô nhập trong app.
export default function AppDatePicker({ value, onChange, max = new Date(), style }: AppDatePickerProps) {
  const { colors, isDark } = useAppTheme();
  const box = StyleSheet.flatten(style) || {};
  return (
    <input
      type="date"
      value={value}
      max={max.toISOString().slice(0, 10)}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: (box.height as number) ?? 50, borderRadius: (box.borderRadius as number) ?? 12, border: 'none',
        padding: '0 16px', fontSize: 17, width: '100%', boxSizing: 'border-box', marginBottom: (box.marginBottom as number) ?? 16,
        background: (box.backgroundColor as string) ?? colors.inputBg, color: colors.text, colorScheme: isDark ? 'dark' : 'light',
        fontFamily: 'inherit',
      }}
    />
  );
}
