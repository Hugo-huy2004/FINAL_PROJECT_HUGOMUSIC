import { useEffect, useRef } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import { Host, TextField, SecureField, useNativeState } from '@expo/ui/swift-ui';
import {
  textFieldStyle, keyboardType as kbType, textInputAutocapitalization, autocorrectionDisabled,
  submitLabel, onSubmit, font, foregroundStyle, textContentType as contentType,
} from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme/theme';
import type { AppTextFieldProps } from './AppTextField';

// iPhone: TextField / SecureField SwiftUI (docs.expo.dev/versions/latest/sdk/ui/swift-ui/textfield).
// Khung (nền, bo góc, lề) vẫn là View RN lấy từ `style`; màu chữ + cỡ chữ chuyển thành modifier.
// Chữ nằm ở phía native (useNativeState); giá trị đổi từ ngoài (vd. xoá ô sau khi gửi) đẩy ngược vào.
const KEYBOARD = { default: 'default', 'email-address': 'email-address', 'number-pad': 'numeric', 'phone-pad': 'phone-pad' } as const;

export default function AppTextField({
  value, onChangeText, placeholder, style, secureTextEntry, autoCapitalize = 'sentences', autoCorrect,
  keyboardType = 'default', maxLength, autoFocus, onSubmitEditing, returnKeyType, accessibilityLabel, textContentType,
}: AppTextFieldProps) {
  const { colors, isDark } = useAppTheme();
  const text = useNativeState(value);
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      text.value = value;
    }
  }, [value, text]);
  const change = (v: string) => {
    last.current = v;
    onChangeText(v);
  };

  const { color, fontSize, fontWeight, ...box } = StyleSheet.flatten(style) as TextStyle;
  const modifiers = [
    textFieldStyle('plain'),
    font({ size: fontSize ?? 16, weight: fontWeight === '600' || fontWeight === '700' || fontWeight === 'bold' ? 'semibold' : 'regular' }),
    foregroundStyle(typeof color === 'string' ? color : colors.text),
    kbType(KEYBOARD[keyboardType]),
    textInputAutocapitalization(autoCapitalize === 'none' ? 'never' : autoCapitalize),
    ...(autoCorrect === false || autoCapitalize === 'none' ? [autocorrectionDisabled()] : []),
    ...(returnKeyType ? [submitLabel(returnKeyType)] : []),
    ...(textContentType ? [contentType(textContentType)] : []),
    ...(onSubmitEditing ? [onSubmit(onSubmitEditing)] : []),
  ];
  const Field = secureTextEntry ? SecureField : TextField;
  return (
    <View style={[styles.box, box]} accessibilityLabel={accessibilityLabel ?? placeholder}>
      <Host matchContents={{ vertical: true }} style={styles.host} colorScheme={isDark ? 'dark' : 'light'}>
        <Field text={text} onTextChange={change} placeholder={placeholder} maxLength={maxLength} autoFocus={autoFocus} modifiers={modifiers} />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
  host: { alignSelf: 'stretch' },
});
