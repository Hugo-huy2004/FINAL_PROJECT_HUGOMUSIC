import { createContext } from 'react';
import { useWindowDimensions } from 'react-native';

// Below this, the fixed Sidebar (see components/Sidebar/Sidebar.tsx) stops leaving
// reasonable room for content — roughly the tablet/phone boundary, same breakpoint
// Spotify/Apple Music's own responsive web players use. Below it, AppLayout swaps
// the sidebar for BottomTabBar instead of squeezing it in.
const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const { width } = useWindowDimensions();
  return width < MOBILE_BREAKPOINT;
}

// Bề rộng vùng nội dung ĐO THẬT (AppLayout, onLayout). Thanh bên có 3 cỡ và bảng lời bài
// hát đóng/mở, nên suy từ bề rộng cửa sổ trừ hằng số luôn sai. null = chưa đo được.
export const ContentWidthContext = createContext<number | null>(null);
