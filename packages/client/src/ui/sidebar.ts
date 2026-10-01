import { Platform, useWindowDimensions } from 'react-native';
import { create } from 'zustand';

// The desktop sidebar comes in two forms: "full" (icon + text) and "rail" (icon only).
// - The user presses the pin button → keeps the format they choose (remember the next time you open it).
// - Not selected → decide according to window width: wide is full, narrow is rail.
// - While on rails, drag the mouse in → pop out and overwrite the content (don't push the content), drag out and it will shrink.
export const SIDEBAR_INSET = 12;
export const SIDEBAR_FULL = 232;
export const SIDEBAR_RAIL = 68;
const AUTO_FULL_FROM = 1280;
const KEY = 'hugo:sidebar';

type Pref = 'full' | 'rail' | null;
const read = (): Pref => {
  if (Platform.OS !== 'web') return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'full' || v === 'rail' ? v : null;
  } catch {
    return null;
  }
};

const useSidebarPref = create<{ pref: Pref }>(() => ({ pref: read() }));

export const setSidebarPref = (pref: 'full' | 'rail') => {
  useSidebarPref.setState({ pref });
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {}
};

// The form is "anchoring" (taking up space in the layout) and content width must be left for it.
export function useSidebarDock() {
  const { width } = useWindowDimensions();
  const pref = useSidebarPref((s) => s.pref);
  const full = pref ? pref === 'full' : width >= AUTO_FULL_FROM;
  return { full, space: (full ? SIDEBAR_FULL : SIDEBAR_RAIL) + SIDEBAR_INSET * 2 };
}
