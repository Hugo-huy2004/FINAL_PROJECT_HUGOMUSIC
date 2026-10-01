import React, { useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions } from 'react-native';

// Swipe from the LEFT EDGE to go back (like iOS): only receive gestures starting within the 28 pt strip close to the edge and go
// to the right clearly — horizontal scroll shelf and internal buttons are not blocked. The page slides with your finger
// hand; If you release more than 1/3 of the width (or swipe quickly), slide it out completely and call onBack, otherwise it will turn back.
const EDGE = 28;
const USE_NATIVE = Platform.OS !== 'web';

/** Wraps a child screen so a swipe from the leading edge goes back. */
export default function SwipeBack({ onBack, children }: {
  /** Called when the swipe passes the threshold. */
  onBack: () => void;
  children: React.ReactNode;
}) {
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
