import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { GlassButton } from '../controls/GlassButton';
import { GUTTER, space } from '../tokens';

/**
 * Round glass back button with a chevron, placed at the leading edge of a child screen.
 *
 * @usage The first control of every pushed screen. Pair it with an edge swipe so both gestures go back.
 * @remarks It is a GlassButton with the chevron optically nudged and the standard top/leading margins; override them with `style`.
 * @a11y `label` names the destination (“Library”) and is announced as the button's name.
 * @example <BackButton label="Library" onPress={navigation.goBack} />
 */
export default function BackButton({ onPress, label, tone, style }: {
  onPress: () => void;
  /** Name of the screen you return to. */
  label: string;
  /** Use 'dark' over dark artwork, 'light' over light artwork. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  return <GlassButton icon="chevron-back" iconSize={24} nudge={-2} label={label} onPress={onPress} tone={tone} style={[styles.btn, style]} />;
}

const styles = StyleSheet.create({ btn: { marginLeft: GUTTER, marginTop: space.sm } });
