import type React from 'react';

// Menu ngữ cảnh (nhấn giữ). iPhone: ContextMenu SwiftUI (AppContextMenu.ios.tsx). Android/web chưa có
// menu nhấn giữ — mọi thao tác đã có ở nút "…" của từng dòng, nên ở đây chỉ trả nội dung như cũ.
export type MenuItem = {
  key: string;
  label: string;
  systemImage: string;          // SF Symbol
  onPress?: () => void;
  destructive?: boolean;
  children?: MenuItem[];        // có → menu con
};

export type AppContextMenuProps = { items: MenuItem[]; children: React.ReactElement };

export default function AppContextMenu({ children }: AppContextMenuProps) {
  return children;
}
