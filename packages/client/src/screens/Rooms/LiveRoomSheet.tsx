import { View, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { GlassButton } from '../../ui/kit';
import StationView from './StationView';
import BlindRoomView from './BlindRoomView';

// The room you're in (24/7 radio or blind listening) opens into a sheet covering the screen — you can enter from anywhere.
// (Radio, Library › Room, Home). The ⌄ button minimizes to listen while surfing the app (tablet "do
// in the room" in AppLayout reopens); "Leave" inside the room really leaves.
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
