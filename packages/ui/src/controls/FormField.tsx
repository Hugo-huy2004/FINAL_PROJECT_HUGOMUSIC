import { StyleSheet, Text, View } from 'react-native';
import { useHugoTheme } from '../theme';
import { radius } from '../tokens';
import TextField from './TextField';

/**
 * Text field with a label above it, for forms.
 *
 * @usage Edit screens and dialogs with several fields. For a single search box use SearchField.
 * @remarks `multiline` grows the field to four lines; `keyboardType="number-pad"` for years and counts.
 * @a11y The label is also the field's accessible name.
 * @example <FormField label="Album title" value={title} onChange={setTitle} />
 */
export default function FormField({ label, value, onChange, placeholder, multiline, keyboardType }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address';
}) {
  const { colors } = useHugoTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextField value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textTertiary} accessibilityLabel={label}
        keyboardType={keyboardType} multiline={multiline} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }, multiline && styles.multi]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { height: 40, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  multi: { height: 96, textAlignVertical: 'top', paddingTop: 10 },
});
