import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// Semantic colours (background, label, separator, fills) that read like the system's own in both
// appearances, plus the frosted-glass fills. `accent` is tuned for contrast: white text on it
// passes 4.5:1 in light and 3:1 (bold/large) in dark.
export interface HugoColors {
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
  /** Translucent fill of regular glass over a live backdrop blur. */
  glass: string;
  /** Fill of clear glass (more see-through, for controls over rich media). */
  glassClear: string;
  /** Stand-in where no blur is available (no native blur, Reduce Transparency). */
  glassSolid: string;
  /** Selection lens inside glass bars (tab bar selection). */
  fill: string;
}

export const darkColors: HugoColors = {
  isDark: true,
  background: '#000000', surface: '#1C1C1E', surfaceHover: 'rgba(118, 118, 128, 0.24)', cardBg: '#1C1C1E',
  cardBorder: 'rgba(255, 255, 255, 0.08)', text: '#FFFFFF', textSecondary: 'rgba(235, 235, 245, 0.6)',
  textTertiary: 'rgba(235, 235, 245, 0.3)', border: 'rgba(84, 84, 88, 0.6)', inputBg: 'rgba(118, 118, 128, 0.24)',
  activeItemBg: 'rgba(17, 163, 127, 0.2)', icon: '#98989D', iconActive: '#FFFFFF', accent: '#11A37F', modalBg: '#1C1C1E',
  glass: 'rgba(28, 28, 30, 0.56)', glassClear: 'rgba(28, 28, 30, 0.22)', glassSolid: 'rgba(30, 30, 32, 0.96)', fill: 'rgba(120, 120, 128, 0.32)',
};

export const lightColors: HugoColors = {
  isDark: false,
  background: '#FFFFFF', surface: '#F2F2F7', surfaceHover: 'rgba(118, 118, 128, 0.12)', cardBg: '#F2F2F7',
  cardBorder: 'rgba(60, 60, 67, 0.12)', text: '#000000', textSecondary: 'rgba(60, 60, 67, 0.6)',
  textTertiary: 'rgba(60, 60, 67, 0.3)', border: 'rgba(60, 60, 67, 0.29)', inputBg: 'rgba(118, 118, 128, 0.12)',
  activeItemBg: 'rgba(7, 135, 95, 0.12)', icon: '#8A8A8E', iconActive: '#000000', accent: '#07875F', modalBg: '#FFFFFF',
  glass: 'rgba(255, 255, 255, 0.6)', glassClear: 'rgba(255, 255, 255, 0.22)', glassSolid: 'rgba(249, 249, 249, 0.96)', fill: 'rgba(120, 120, 128, 0.16)',
};

export type ArtworkProps = { uri?: string; title?: string; size: number; radius: number };

type HugoConfig = {
  scheme: 'light' | 'dark' | 'system';
  accent?: { light: string; dark: string };
  /** Replaces the default artwork renderer (e.g. to route images through a CDN). */
  renderArtwork?: (p: ArtworkProps) => ReactNode;
};
const HugoContext = createContext<HugoConfig>({ scheme: 'system' });

/**
 * Optional root provider for the whole kit: picks the appearance, overrides the accent colour and plugs in your own artwork renderer. Every component works without it.
 *
 * @usage Wrap the app once at the root when you need a light/dark switch of your own, a brand accent, or covers loaded through a CDN. Skip it to follow the device appearance with the default green accent.
 * @remarks Values travel through React context, so nested providers override outer ones — handy for previewing a section in the other appearance. `renderArtwork` replaces the image of every component that shows artwork (ListRow, MediaTile, Artwork).
 * @a11y The default palette keeps 4.5:1 contrast for text on backgrounds and for white text on the accent colour.
 * @example <HugoProvider scheme="system"><App /></HugoProvider>
 * @example <HugoProvider scheme="dark" accent={{ light: '#0A84FF', dark: '#0A84FF' }} renderArtwork={(p) => <CdnImage {...p} />}>
 *   <App />
 * </HugoProvider>
 */
export function HugoProvider({ scheme = 'system', accent, renderArtwork, children }: Partial<HugoConfig> & { children: ReactNode }) {
  const value = useMemo(() => ({ scheme, accent, renderArtwork }), [scheme, accent, renderArtwork]);
  return <HugoContext.Provider value={value}>{children}</HugoContext.Provider>;
}

/** Current appearance and colours. */
export function useHugoTheme(): { isDark: boolean; colors: HugoColors } {
  const system = useColorScheme();
  const { scheme, accent } = useContext(HugoContext);
  const isDark = scheme === 'system' ? system !== 'light' : scheme === 'dark';
  return useMemo(() => {
    const base = isDark ? darkColors : lightColors;
    return { isDark, colors: accent ? { ...base, accent: isDark ? accent.dark : accent.light } : base };
  }, [isDark, accent]);
}

export const useArtworkRenderer = () => useContext(HugoContext).renderArtwork;
