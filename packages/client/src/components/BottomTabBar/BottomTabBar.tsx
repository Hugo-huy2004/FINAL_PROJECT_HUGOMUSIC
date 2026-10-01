import { useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, GlassButton, GlassTabBar, Icon, type TabItem } from 'hugo-music';
import { TabId } from '../../lib/tabRouting';
import { useAppTheme } from '../../ui/theme';
import { useTranslation } from '../../i18n/i18n';
import { useChrome, chromeProgress, setChromeCollapsed } from '../../ui/chrome';

// iOS 26 tab bar: the hugo-music GlassTabBar for the four sections plus a separate round glass Search button.
// While scrolling down the capsule shrinks to one button with the current section's icon, making room for the
// mini player (BottomPlayer reads the same chromeProgress).
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 10;
export const TAB_BAR_SIDE = 14;

/** Bottom tab bar for phones (Home, New, Radio, Library, Search). */
export default function BottomTabBar({ activeTab, onTabChange }: {
  /** Id of the selected tab. */
  activeTab: TabId;
  /** Called with the id of the tapped tab. */
  onTabChange: (tabId: TabId) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [rowWidth, setRowWidth] = useState(0);
  const collapsed = useChrome((s) => s.collapsed);

  const items: TabItem[] = [
    { key: 'home', icon: 'home-outline', iconActive: 'home', label: t('home') },
    { key: 'new', icon: 'grid-outline', iconActive: 'grid', label: 'Mới' },
    { key: 'radio', icon: 'radio-outline', iconActive: 'radio', label: t('radio') },
    { key: 'library', icon: 'albums-outline', iconActive: 'albums', label: t('library') },
  ];
  const current = items.find((it) => it.key === activeTab) ?? items[0];
  const fullWidth = Math.max(0, rowWidth - TAB_BAR_HEIGHT - TAB_BAR_GAP);
  const capsuleWidth = fullWidth ? chromeProgress.interpolate({ inputRange: [0, 1], outputRange: [fullWidth, TAB_BAR_HEIGHT] }) : undefined;

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12), pointerEvents: 'box-none' }]} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={capsuleWidth ? { width: capsuleWidth } : styles.fill}>
        {collapsed ? (
          <Glass interactive style={styles.collapsed}>
            <Pressable style={styles.center} onPress={() => setChromeCollapsed(false)} accessibilityRole="button" accessibilityLabel={`${current.label} — mở thanh tab`}>
              <Icon name={current.iconActive ?? current.icon} size={24} color={colors.accent} />
            </Pressable>
          </Glass>
        ) : (
          <GlassTabBar items={items} value={activeTab} onChange={(k) => onTabChange(k as TabId)} height={TAB_BAR_HEIGHT} />
        )}
      </Animated.View>
      <GlassButton icon="search" iconSize={24} size={TAB_BAR_HEIGHT} label={t('search')} color={activeTab === 'search' ? colors.accent : colors.text} onPress={() => onTabChange('search')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute', left: TAB_BAR_SIDE, right: TAB_BAR_SIDE, zIndex: 1000, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', alignSelf: 'center', maxWidth: 520,
  },
  fill: { flex: 1 },
  collapsed: { height: TAB_BAR_HEIGHT },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
