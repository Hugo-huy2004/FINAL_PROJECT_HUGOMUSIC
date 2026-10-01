import { useCallback, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { create } from 'zustand';

// "Chrome" = floating bars on phone (tab bar, mini player). As iOS 26+: scroll
// down, the tab bar shrinks into a round button and the mini player inserts itself in the middle, scrolling up
// then pop out. The screen simply attaches useCollapseOnScroll() to its ScrollView.
export const useChrome = create<{ collapsed: boolean }>(() => ({ collapsed: false }));

// 0 = expand, 1 = collapse — the tab bar and mini player read the same value so they always match.
export const chromeProgress = new Animated.Value(0);

useChrome.subscribe((state, prev) => {
  if (state.collapsed === prev.collapsed) return;
  Animated.spring(chromeProgress, {
    toValue: state.collapsed ? 1 : 0,
    damping: 20,
    stiffness: 210,
    mass: 0.9,
    useNativeDriver: false, // width/position interpolation, native driver cannot do it
  }).start();
});

export const setChromeCollapsed = (collapsed: boolean) => {
  if (useChrome.getState().collapsed !== collapsed) useChrome.setState({ collapsed });
};

const TOP_ZONE = 40;  // near the top of the page, it always opens
const MIN_DELTA = 8;  // Ignore minor hand shake

export function useCollapseOnScroll() {
  const lastY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < TOP_ZONE) setChromeCollapsed(false);
    else if (dy > MIN_DELTA) setChromeCollapsed(true);
    else if (dy < -MIN_DELTA) setChromeCollapsed(false);
  }, []);
  return { onScroll, scrollEventThrottle: 16 };
}
