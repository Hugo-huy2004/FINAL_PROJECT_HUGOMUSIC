import React, { useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions } from 'react-native';

// Vuốt từ MÉP TRÁI để quay lại (như iOS): chỉ nhận cử chỉ bắt đầu trong dải 28 pt sát mép và đi
// sang phải rõ ràng — kệ cuộn ngang và nút bên trong không bị tranh cử chỉ. Trang trượt theo ngón
// tay; thả quá 1/3 bề rộng (hoặc vuốt nhanh) thì trượt hẳn ra và gọi onBack, không thì bật về.
const EDGE = 28;
const USE_NATIVE = Platform.OS !== 'web';

export default function SwipeBack({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const back = useRef(onBack);
  back.current = onBack;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => g.x0 < EDGE && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx > width / 3 || g.vx > 0.6) {
        Animated.timing(x, { toValue: width, duration: 180, useNativeDriver: USE_NATIVE }).start(() => {
          back.current();
          x.setValue(0);
        });
      } else {
        Animated.spring(x, { toValue: 0, damping: 20, stiffness: 260, useNativeDriver: USE_NATIVE }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: USE_NATIVE }).start(),
  })).current;
  return (
    <Animated.View style={[styles.fill, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
