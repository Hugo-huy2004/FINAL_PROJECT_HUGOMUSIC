import type React from 'react';
import type { TabId } from '../utils/tabRouting';

// Android + web: không có thanh tab gốc — AppLayout dùng BottomTabBar (RN, thu gọn khi cuộn).
// iPhone dùng NativeTabs.ios.tsx (SwiftUI TabView của @expo/ui); Metro tự chọn file theo nền tảng.
export type NativeTabsProps = {
  tabs: { id: TabId; label: string; systemImage: string }[];
  selected: TabId;
  onSelect: (id: TabId) => void;
  render: (id: TabId) => React.ReactNode;
  tint: string;
  isDark: boolean;
};

export const HAS_NATIVE_TABS = false;
// Chiều cao thanh tab gốc (không gồm vùng an toàn dưới) — mini player nằm ngay trên nó.
export const NATIVE_TAB_BAR_HEIGHT = 0;

export default function NativeTabs(_: NativeTabsProps): React.ReactElement | null {
  return null;
}
