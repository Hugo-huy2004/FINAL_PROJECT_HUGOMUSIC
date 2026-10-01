import { StyleSheet } from 'react-native';
import { GlassButton } from './Droplet';
import { GUTTER, space } from '../tokens';

// Nút lùi của trang con: viên kính tròn 44 pt với ‹, hiệu ứng giọt nước khi nhấn (ui/kit/Droplet).
// Vuốt từ mép trái cũng lùi được (ui/kit/SwipeBack).
export default function BackButton({ onPress, label, tone }: { onPress: () => void; label: string; tone?: 'light' | 'dark' }) {
  return <GlassButton icon="chevron-back" iconSize={24} nudge={-2} label={label} onPress={onPress} tone={tone} style={styles.btn} />;
}

const styles = StyleSheet.create({
  btn: { marginLeft: GUTTER, marginTop: space.sm },
});
