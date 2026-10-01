import { StyleSheet } from 'react-native';
import { useHugoTheme } from '../theme';
import type { DatePickerProps } from './DatePicker';

// Web: the browser's own date input (calendar included), dressed in the theme's input colours.
export default function DatePicker({ value, onChange, max = new Date(), min = new Date(1900, 0, 1), style }: DatePickerProps) {
  const { colors, isDark } = useHugoTheme();
  const box = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  return (
    <input
      type="date"
      value={value}
      min={min.toISOString().slice(0, 10)}
      max={max.toISOString().slice(0, 10)}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: (box.height as number) ?? 50, borderRadius: (box.borderRadius as number) ?? 12, border: 'none', padding: '0 16px',
        fontSize: 17, width: '100%', boxSizing: 'border-box', marginBottom: (box.marginBottom as number) ?? 0,
        background: (box.backgroundColor as string) ?? colors.inputBg, color: colors.text, colorScheme: isDark ? 'dark' : 'light', fontFamily: 'inherit',
      }}
    />
  );
}
