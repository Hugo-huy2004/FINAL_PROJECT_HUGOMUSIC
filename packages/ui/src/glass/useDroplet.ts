import { useRef } from 'react';
import { Animated, Platform } from 'react-native';

const USE_NATIVE = Platform.OS !== 'web';

/**
 * The "droplet" press physics shared by every glass control: pressing squashes the shape (wider, shorter),
 * releasing bounces back on an under-damped spring so it overshoots and wobbles like a drop on glass,
 * with a brief highlight. One value drives everything; interpolations are unclamped so the overshoot
 * reverses the deformation by itself.
 */
export function useDroplet(strength = 1) {
  const p = useRef(new Animated.Value(0)).current;
  const onPressIn = () => Animated.spring(p, { toValue: 1, damping: 14, stiffness: 520, mass: 0.6, useNativeDriver: USE_NATIVE }).start();
  const onPressOut = () => Animated.spring(p, { toValue: 0, damping: 5.5, stiffness: 300, mass: 0.7, useNativeDriver: USE_NATIVE }).start();
  const style = {
    transform: [
      { scaleX: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 0.08 * strength] }) },
      { scaleY: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - 0.14 * strength] }) },
    ],
  };
  const sheen = { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22], extrapolate: 'clamp' }) };
  return { style, sheen, onPressIn, onPressOut };
}

export const springConfig = { useNativeDriver: USE_NATIVE };
