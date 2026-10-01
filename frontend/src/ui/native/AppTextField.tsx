import { TextInput, type StyleProp, type TextStyle } from 'react-native';

// Ô nhập một dòng. Android/web: TextInput của RN. iPhone: TextField/SecureField SwiftUI
// (AppTextField.ios.tsx) — cùng props nên đổi qua lại chỉ là đổi tên thẻ.
export type AppTextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: StyleProp<TextStyle>;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  maxLength?: number;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  accessibilityLabel?: string;
  // Gợi ý tự điền của hệ thống (Mật khẩu iCloud/Google, mã OTP từ Mail/SMS...).
  textContentType?: AutofillKind;
};

export type AutofillKind = 'username' | 'password' | 'newPassword' | 'emailAddress' | 'oneTimeCode' | 'name' | 'telephoneNumber';
const AUTOCOMPLETE = {
  username: 'username', password: 'current-password', newPassword: 'new-password', emailAddress: 'email',
  oneTimeCode: 'one-time-code', name: 'name', telephoneNumber: 'tel',
} as const;

export default function AppTextField(props: AppTextFieldProps) {
  const { onSubmitEditing, textContentType, ...rest } = props;
  return (
    <TextInput
      {...rest}
      textContentType={textContentType}
      autoComplete={textContentType ? AUTOCOMPLETE[textContentType] : undefined}
      onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
    />
  );
}
