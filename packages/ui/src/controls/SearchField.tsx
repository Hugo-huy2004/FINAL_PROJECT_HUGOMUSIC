import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHugoTheme } from '../theme';
import { radius, space, TOUCH } from '../tokens';
import Glass from '../glass/Glass';
import TextField from './TextField';

/**
 * Search field with a magnifier, a clear button once something is typed, and an optional floating glass style.
 *
 * @usage Filtering a list or the catalog. Use `glass` when the field floats over content (for example at the bottom of the screen); keep the plain style inside a page.
 * @remarks At least 44 points tall. The clear button resets the value through `onChangeText('')`, so the parent stays the single source of truth.
 * @a11y The placeholder doubles as the accessible name; `clearLabel` names the clear button.
 * @example <SearchField value={q} onChangeText={setQ} placeholder="Songs, artists, albums" />
 * @example <SearchField glass value={q} onChangeText={setQ} placeholder="Search" />
 */
export default function SearchField({ value, onChangeText, placeholder, autoFocus = false, glass = false, clearLabel = 'Clear', style }: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** Renders the field as a floating glass capsule. */
  glass?: boolean;
  /** Accessibility label of the clear button. */
  clearLabel?: string;
  /** Outer layout (e.g. flex: 1 inside a toolbar). */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useHugoTheme();
  const content = (
    <>
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <TextField value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text }]} autoFocus={autoFocus} autoCorrect={false} returnKeyType="search" accessibilityLabel={placeholder} />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={clearLabel} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </>
  );
  if (glass) return <Glass interactive style={[styles.box, styles.capsule, style]}>{content}</Glass>;
  return <View style={[styles.box, { backgroundColor: colors.inputBg }, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md + 2, paddingHorizontal: space.md, minHeight: TOUCH },
  capsule: { borderRadius: 999, minHeight: 48, paddingHorizontal: space.lg },
  // Web: the whole field is the visible frame, so drop the <input> focus ring.
  input: { flex: 1, fontSize: 17, paddingVertical: space.sm, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
});
