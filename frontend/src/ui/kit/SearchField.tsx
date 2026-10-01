import { View, StyleSheet, Pressable, Platform } from 'react-native';
import AppTextField from '../native/AppTextField';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/theme';
import { radius, space, TOUCH } from '../tokens';

// Ô tìm kiếm kiểu iOS: icon kính lúp, nút xoá khi đã gõ, cao ≥ 44 pt.
export default function SearchField({ value, onChangeText, placeholder, autoFocus = false }: {
  value: string; onChangeText: (s: string) => void; placeholder: string; autoFocus?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.inputBg }]}>
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <AppTextField
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text }]}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Xoá" hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md + 2, paddingHorizontal: space.md, minHeight: TOUCH },
  // Web: bỏ viền focus mặc định của <input> — cả ô tìm kiếm đã là khung nhìn thấy rõ.
  input: { flex: 1, fontSize: 17, paddingVertical: space.sm, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
});
