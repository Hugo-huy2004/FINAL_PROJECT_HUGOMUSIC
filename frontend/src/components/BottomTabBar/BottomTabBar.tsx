import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabId } from '../../utils/tabRouting';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import Glass from '../LiquidGlass/Glass';

// iOS 26 tab bar: one glass capsule for the sections, a separate round glass button
// for Search, and a lens that slides under the selected tab.
const LIBRARY_TABS: TabId[] = ['library', 'recently-added', 'artists', 'albums', 'songs', 'playlists', 'genres', 'countries'];
export const TAB_BAR_HEIGHT = 62;

export default function BottomTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  onLoginPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const tabs: { id: TabId; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'home', icon: 'home', label: t('home') },
    { id: 'new', icon: 'grid', label: t('browse') },
    { id: 'radio', icon: 'radio', label: t('radio') },
    { id: 'library', icon: 'library', label: t('library') },
  ];
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab || (tab.id === 'library' && LIBRARY_TABS.includes(activeTab)));
  const isSearchActive = activeTab === 'search';

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <Glass style={styles.capsule} accessibilityRole="tablist">
        {activeIndex >= 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.lensSlot,
              { left: `${activeIndex * 25}%` },
              Platform.OS === 'web' && ({ transition: 'left 0.35s cubic-bezier(0.32, 0.72, 0, 1)' } as object),
            ]}
          >
            <View style={[styles.lens, { backgroundColor: colors.fill }]} />
          </View>
        )}
        {tabs.map((tab, i) => {
          const selected = i === activeIndex;
          const tint = selected ? colors.accent : colors.text;
          return (
            <Pressable
              key={tab.id}
              style={styles.tab}
              onPress={() => onTabChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
            >
              <Ionicons name={tab.icon} size={23} color={tint} />
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Glass>

      <Glass style={styles.searchButton} interactive>
        <Pressable
          style={styles.searchPress}
          onPress={() => onTabChange('search')}
          accessibilityRole="button"
          accessibilityState={{ selected: isSearchActive }}
          accessibilityLabel={t('search')}
        >
          <Ionicons name="search" size={24} color={isSearchActive ? colors.accent : colors.text} />
        </Pressable>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 520,
    gap: 10,
  },
  capsule: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lensSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '25%',
    padding: 4,
  },
  lens: {
    flex: 1,
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  searchButton: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
  },
  searchPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
