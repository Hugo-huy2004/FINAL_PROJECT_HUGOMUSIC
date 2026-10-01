import { useColorScheme } from 'react-native';
import { useStore } from '../store/useStore';

// Values follow Apple's semantic system colors (systemBackground, label, separator,
// fills) so screens read like a native Apple app in both appearances. `accent` is the
// brand green tuned for contrast: white text on it passes 4.5:1 in light and 3:1
// (bold/large) in dark, and as a tint on the background it clears 4.5:1 in both.
export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceHover: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBg: string;
  activeItemBg: string;
  icon: string;
  iconActive: string;
  accent: string;
  modalBg: string;
  // Liquid Glass (components/LiquidGlass/Glass.tsx). `glass` is the translucent fill
  // over a live backdrop blur; `glassSolid` stands in where no blur is available
  // (Android, browsers without backdrop-filter, Reduce Transparency).
  glass: string;
  glassSolid: string;
  // Selected-item lens inside glass bars (iOS 26 tab bar selection).
  fill: string;
}

const darkColors: ThemeColors = {
  isDark: true,
  background: '#000000',
  surface: '#1C1C1E',
  surfaceHover: 'rgba(118, 118, 128, 0.24)',
  cardBg: '#1C1C1E',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235, 235, 245, 0.6)',
  textTertiary: 'rgba(235, 235, 245, 0.3)',
  border: 'rgba(84, 84, 88, 0.6)',
  inputBg: 'rgba(118, 118, 128, 0.24)',
  activeItemBg: 'rgba(17, 163, 127, 0.2)',
  icon: '#98989D',
  iconActive: '#FFFFFF',
  accent: '#11A37F',
  modalBg: '#1C1C1E',
  // Đủ đặc để chữ trên thanh phát/tab đọc được khi đè lên ảnh bìa nhiều màu.
  glass: 'rgba(28, 28, 30, 0.56)',
  glassSolid: 'rgba(30, 30, 32, 0.96)',
  fill: 'rgba(120, 120, 128, 0.32)',
};

const lightColors: ThemeColors = {
  isDark: false,
  background: '#FFFFFF',
  surface: '#F2F2F7',
  surfaceHover: 'rgba(118, 118, 128, 0.12)',
  cardBg: '#F2F2F7',
  cardBorder: 'rgba(60, 60, 67, 0.12)',
  text: '#000000',
  textSecondary: 'rgba(60, 60, 67, 0.6)',
  textTertiary: 'rgba(60, 60, 67, 0.3)',
  border: 'rgba(60, 60, 67, 0.29)',
  inputBg: 'rgba(118, 118, 128, 0.12)',
  activeItemBg: 'rgba(7, 135, 95, 0.12)',
  icon: '#8A8A8E',
  iconActive: '#000000',
  accent: '#07875F',
  modalBg: '#FFFFFF',
  glass: 'rgba(255, 255, 255, 0.6)',
  glassSolid: 'rgba(249, 249, 249, 0.96)',
  fill: 'rgba(120, 120, 128, 0.16)',
};

export function useAppTheme(): { isDark: boolean; colors: ThemeColors } {
  // Theo hệ thống, trừ khi người dùng chọn Sáng/Tối trong mục "Thêm" (themeMode, lưu máy).
  const systemScheme = useColorScheme();
  const mode = useStore((s) => s.themeMode);
  const isDark = mode === 'auto' ? systemScheme !== 'light' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return { isDark, colors };
}
