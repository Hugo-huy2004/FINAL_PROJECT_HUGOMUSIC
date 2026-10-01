import React, { useState } from 'react';
import { View } from 'react-native';
import { Host, ContextMenu, Button, RNHostView } from '@expo/ui/swift-ui';
import { useAppTheme } from '../../theme/theme';
import type { AppContextMenuProps, MenuItem } from './AppContextMenu';

// iPhone: nhấn giữ một dòng → ContextMenu SwiftUI (docs.expo.dev/versions/latest/sdk/ui/swift-ui/contextmenu),
// kèm xem trước chính dòng đó như Apple Music. Nội dung RN nằm trong RNHostView; chiều ngang lấy theo
// chỗ của Host (đo một lần), chiều cao theo nội dung.
function renderItem(it: MenuItem): React.ReactElement {
  if (it.children?.length) {
    return (
      <ContextMenu key={it.key}>
        <ContextMenu.Items>{it.children.map(renderItem)}</ContextMenu.Items>
        <ContextMenu.Trigger>
          <Button label={it.label} systemImage={it.systemImage as any} />
        </ContextMenu.Trigger>
      </ContextMenu>
    );
  }
  return <Button key={it.key} label={it.label} systemImage={it.systemImage as any} role={it.destructive ? 'destructive' : undefined} onPress={it.onPress} />;
}

export default function AppContextMenu({ items, children }: AppContextMenuProps) {
  const { isDark } = useAppTheme();
  const [width, setWidth] = useState<number>();
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
    <Host matchContents={{ vertical: true }} style={{ alignSelf: 'stretch' }} colorScheme={isDark ? 'dark' : 'light'}>
      <ContextMenu>
        <ContextMenu.Items>{items.map(renderItem)}</ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <View style={{ width }}>{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
    </View>
  );
}
