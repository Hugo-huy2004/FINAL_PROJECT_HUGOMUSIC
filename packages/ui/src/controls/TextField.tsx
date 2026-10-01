import { TextInput, type StyleProp, type TextStyle } from 'react-native';

export type AutofillKind = 'username' | 'password' | 'newPassword' | 'emailAddress' | 'oneTimeCode' | 'name' | 'telephoneNumber';
const AUTOCOMPLETE = {
  username: 'username', password: 'current-password', newPassword: 'new-password', emailAddress: 'email',
  oneTimeCode: 'one-time-code', name: 'name', telephoneNumber: 'tel',
} as const;

export type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: StyleProp<TextStyle>;
  /** Grows to several lines. */
  multiline?: boolean;
  /** Masks the input (passwords). */
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  maxLength?: number;
  autoFocus?: boolean;
  /** Called when the Return key is pressed. */
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  accessibilityLabel?: string;
  /** One autofill hint for every platform: saved passwords, new-password suggestions, one-time codes from mail and SMS. */
  textContentType?: AutofillKind;
};

/**
 * Single-line text input with one autofill hint that works on every platform.
 *
 * @usage Every form field. Set `textContentType` on sign-in, sign-up and one-time-code fields so the system password manager and code autofill can help.
 * @remarks `textContentType` is translated to each platform's autofill hint and to the HTML autocomplete attribute on the web. `onSubmitEditing` fires on the Return key.
 * @a11y Pass `accessibilityLabel` when the placeholder is the only label; placeholders disappear while typing.
 * @example <TextField value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" textContentType="emailAddress" />
 * @example <TextField value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
 */
export default function TextField({ onSubmitEditing, textContentType, ...rest }: TextFieldProps) {
  return (
    <TextInput
      {...rest}
      textContentType={textContentType}
      autoComplete={textContentType ? AUTOCOMPLETE[textContentType] : undefined}
      onSubmitEditing={onSubmitEditing ? () => onSubmitEditing() : undefined}
    />
  );
}
