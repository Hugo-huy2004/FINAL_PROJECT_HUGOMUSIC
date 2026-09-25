import { useColorScheme } from 'react-native';

// The actual brand gradient for the "Hugo" wordmark.
// In light mode: Starts with a bold, rich dark forest green (#076653) at the 'H' for maximum contrast
// and readability against white/light backgrounds, transitioning into vibrant emerald (#16A34A) and fresh lime (#65A30D).
export const BRAND_GRADIENT_LIGHT = ['#076653', '#16A34A', '#65A30D'] as const;
export const BRAND_GRADIENT_LIGHT_LOCATIONS = [0, 0.5, 1.0] as const;

// In dark mode: Starts with a luminous lime (#84CC16) at 'H' so it pops cleanly against dark backgrounds,
// transitioning into emerald (#10B981) and radiant teal (#059669).
export const BRAND_GRADIENT_DARK = ['#84CC16', '#10B981', '#059669'] as const;
export const BRAND_GRADIENT_DARK_LOCATIONS = [0, 0.5, 1.0] as const;

// Default exported constants for backwards compatibility

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

export const darkColors: ThemeColors = {
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
  glass: 'rgba(40, 40, 44, 0.52)',
  glassSolid: 'rgba(30, 30, 32, 0.96)',
  fill: 'rgba(120, 120, 128, 0.32)',
};

export const lightColors: ThemeColors = {
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
  // 100% Auto from device system color scheme
  const systemScheme = useColorScheme();
  const isDark = systemScheme !== 'light';
  const colors = isDark ? darkColors : lightColors;

  return { isDark, colors };
}
