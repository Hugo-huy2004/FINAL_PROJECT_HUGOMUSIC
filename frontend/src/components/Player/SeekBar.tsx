import { useMemo, useState } from 'react';
import { View, StyleSheet, PanResponder, Platform, GestureResponderEvent, LayoutChangeEvent } from 'react-native';

// Thanh kéo dùng chung (tiến độ bài, âm lượng): kéo hoặc chạm để chọn tỉ lệ 0–1.
// Khi kéo, thanh dày lên như trên iOS để dễ nhìn thấy mình đang ở đâu.
export default function SeekBar({ progress, disabled = false, onSeek, trackColor, fillColor, label, thickness = 4 }: {
  progress: number;
  disabled?: boolean;
  onSeek: (ratio: number) => void;
  trackColor: string;
  fillColor: string;
  label: string;
  thickness?: number;
}) {
  const [width, setWidth] = useState(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const responder = useMemo(() => {
    const ratioAt = (e: GestureResponderEvent) => Math.max(0, Math.min(1, e.nativeEvent.locationX / (width || 1)));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (e) => setDragRatio(ratioAt(e)),
      onPanResponderMove: (e) => setDragRatio(ratioAt(e)),
      onPanResponderRelease: (e) => {
        onSeek(ratioAt(e));
        setDragRatio(null);
      },
      onPanResponderTerminate: () => setDragRatio(null),
    });
  }, [width, disabled, onSeek]);

  const shown = Math.max(0, Math.min(1, dragRatio ?? progress));
  const h = dragRatio !== null ? thickness * 2 : thickness;
  return (
    <View
      style={[styles.hit, Platform.OS === 'web' && !disabled && ({ cursor: 'pointer' } as object)]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      {...responder.panHandlers}
    >
      {/* pointerEvents none: locationX luôn tính theo cả thanh, không theo phần đã tô */}
      <View style={[{ height: h, borderRadius: h / 2, overflow: 'hidden', backgroundColor: trackColor }, { pointerEvents: 'none' }]}>
        <View style={{ height: '100%', width: `${shown * 100}%`, backgroundColor: fillColor }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 24, justifyContent: 'center' },
});
