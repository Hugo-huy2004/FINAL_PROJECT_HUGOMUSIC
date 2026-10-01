import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTone } from '../tones';

/**
 * Inline error message on a soft red background; renders nothing when the message is empty.
 *
 * @usage Under a form or above a table when loading or saving failed. Say what went wrong and what to do next.
 * @remarks Pass the error message straight from a failed request; `null` or `''` hides it.
 * @a11y The message is announced as an alert when it appears.
 * @example <ErrorText message={error} />
 */
export default function ErrorText({ message }: { message: string | null | undefined }) {
  const [fg, bg] = useTone('red');
  if (!message) return null;
  return (
    <View style={[styles.box, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={16} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 12 },
  text: { fontSize: 13, flex: 1 },
});
