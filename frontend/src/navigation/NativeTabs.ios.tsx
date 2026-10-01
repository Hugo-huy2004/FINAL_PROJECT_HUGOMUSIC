import { StyleSheet, View } from 'react-native';
import { Host, TabView, ZStack, RNHostView } from '@expo/ui/swift-ui';
import { tabViewStyle, ignoreSafeArea, tint as tintModifier } from '@expo/ui/swift-ui/modifiers';
import type { NativeTabsProps } from './NativeTabs';

// iPhone: thanh tab gốc SwiftUI (TabView của @expo/ui, docs.expo.dev/versions/latest/sdk/ui/swift-ui/tabview).
// Nội dung mỗi tab vẫn là màn RN (RNHostView), tràn ra mọi mép (ignoreSafeArea) để cuộn trượt dưới
// thanh kính; màn tự chừa đỉnh bằng paddingTop = useSafeAreaInsets().top (AppLayout).
// ponytail: @expo/ui chưa có tabBarMinimizeBehavior nên thanh không thu gọn khi cuộn — thêm khi
// @expo/ui hỗ trợ (hoặc viết modifier Swift riêng, cần dev build).
export const HAS_NATIVE_TABS = true;
export const NATIVE_TAB_BAR_HEIGHT = 49;

export default function NativeTabs({ tabs, selected, onSelect, render, tint, isDark }: NativeTabsProps) {
  return (
    <Host style={StyleSheet.absoluteFill} colorScheme={isDark ? 'dark' : 'light'}>
      <TabView
        selection={selected}
        onSelectionChange={(v) => onSelect(v as NativeTabsProps['selected'])}
        modifiers={[tabViewStyle({ type: 'automatic' }), tintModifier(tint)]}
      >
        {tabs.map((t) => (
          <TabView.Tab key={t.id} value={t.id} label={t.label} systemImage={t.systemImage as any}>
            <ZStack modifiers={[ignoreSafeArea({ regions: 'container', edges: 'all' })]}>
              <RNHostView>
                <View style={styles.page}>{render(t.id)}</View>
              </RNHostView>
            </ZStack>
          </TabView.Tab>
        ))}
      </TabView>
    </Host>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
