import { View, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { GlassButton } from '../../ui/kit';
import StationView from './StationView';
import BlindRoomView from './BlindRoomView';

// Phòng đang ở (đài 24/7 hoặc nghe mù) mở thành sheet phủ màn hình — vào từ đâu cũng vậy
// (Radio, Thư viện › Phòng, Trang chủ). Nút ⌄ thu nhỏ để vừa nghe vừa lướt app (viên "đang
// trong phòng" ở AppLayout mở lại); "Rời" bên trong phòng mới thật sự rời.
export default function LiveRoomSheet({ visible, onMinimize }: { visible: boolean; onMinimize: () => void }) {
  const liveRoom = useStore((s) => s.liveRoom);
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  if (!liveRoom) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onMinimize}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <GlassButton icon="chevron-down" iconSize={24} label="Thu nhỏ phòng" onPress={onMinimize} />
        </View>
        <View style={{ flex: 1 }}>{liveRoom.kind === 'station' ? <StationView /> : <BlindRoomView />}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 14, paddingBottom: 4 },
});
