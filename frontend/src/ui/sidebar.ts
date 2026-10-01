import { Platform, useWindowDimensions } from 'react-native';
import { create } from 'zustand';

// Thanh bên desktop có hai dạng: "full" (icon + chữ) và "rail" (chỉ icon).
//  - Người dùng bấm nút ghim → giữ đúng dạng họ chọn (nhớ qua lần mở sau).
//  - Chưa chọn → tự quyết theo bề rộng cửa sổ: rộng thì full, hẹp thì rail.
//  - Đang rail mà rê chuột vào → bung ra ĐÈ lên nội dung (không đẩy nội dung), rê ra thì co.
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

// Dạng đang "neo" (chiếm chỗ trong bố cục) và bề rộng nội dung phải chừa ra cho nó.
export function useSidebarDock() {
  const { width } = useWindowDimensions();
  const pref = useSidebarPref((s) => s.pref);
  const full = pref ? pref === 'full' : width >= AUTO_FULL_FROM;
  return { full, space: (full ? SIDEBAR_FULL : SIDEBAR_RAIL) + SIDEBAR_INSET * 2 };
}
