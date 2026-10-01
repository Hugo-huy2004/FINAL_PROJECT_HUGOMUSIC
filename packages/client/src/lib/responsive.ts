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

// ACTUAL MEASURED content area width (AppLayout, onLayout). Sidebar in 3 sizes and lyrics sheet
// sing open/close, so calculating from the window width minus the constant is always wrong. null = not measured.
export const ContentWidthContext = createContext<number | null>(null);
