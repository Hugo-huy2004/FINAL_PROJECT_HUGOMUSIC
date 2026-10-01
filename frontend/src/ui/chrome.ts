import { useCallback, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { create } from 'zustand';

// "Chrome" = các thanh nổi trên điện thoại (thanh tab, mini player). Như iOS 26+: cuộn
// xuống thì thanh tab co lại thành một nút tròn và mini player chen vào giữa, cuộn lên
// thì bung ra. Màn hình chỉ cần gắn useCollapseOnScroll() vào ScrollView của nó.
export const useChrome = create<{ collapsed: boolean }>(() => ({ collapsed: false }));

// 0 = bung, 1 = thu gọn — thanh tab và mini player cùng đọc một giá trị nên luôn khớp nhịp.
export const chromeProgress = new Animated.Value(0);

useChrome.subscribe((state, prev) => {
  if (state.collapsed === prev.collapsed) return;
  Animated.spring(chromeProgress, {
    toValue: state.collapsed ? 1 : 0,
    damping: 20,
    stiffness: 210,
    mass: 0.9,
    useNativeDriver: false, // nội suy bề rộng/vị trí, native driver không làm được
  }).start();
});

export const setChromeCollapsed = (collapsed: boolean) => {
  if (useChrome.getState().collapsed !== collapsed) useChrome.setState({ collapsed });
};

const TOP_ZONE = 40;  // gần đầu trang thì luôn bung
const MIN_DELTA = 8;  // bỏ qua rung tay nhỏ

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
