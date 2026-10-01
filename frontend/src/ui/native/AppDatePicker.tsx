import { useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import AppTextField from './AppTextField';
import { parseDmy, maskDmy } from '../../utils/date';

// Chọn ngày (giá trị 'YYYY-MM-DD', '' = chưa chọn). iPhone: DatePicker SwiftUI (.ios); web: ô date của
// trình duyệt (.web); Android: gõ số DD/MM/YYYY, dấu / tự chèn, đủ 8 số mới nhận (ngày phải có thật).
export type AppDatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  max?: Date;
  style?: StyleProp<TextStyle>;
  placeholderTextColor?: string;
};

const toDisplay = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

export default function AppDatePicker({ value, onChange, max, style, placeholderTextColor }: AppDatePickerProps) {
  const [text, setText] = useState(toDisplay(value));
  const type = (t: string) => {
    const masked = maskDmy(t);
    setText(masked);
    onChange(parseDmy(masked, max) ?? '');
  };
  return <AppTextField value={text} onChangeText={type} placeholder="DD/MM/YYYY" placeholderTextColor={placeholderTextColor} keyboardType="number-pad" maxLength={10} style={style} />;
}

