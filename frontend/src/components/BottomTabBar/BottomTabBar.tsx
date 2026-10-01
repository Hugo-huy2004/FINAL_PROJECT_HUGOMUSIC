import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabId } from '../../utils/tabRouting';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import Glass from '../LiquidGlass/Glass';
import { GlassButton } from '../../ui/kit';
import { useChrome, chromeProgress, setChromeCollapsed } from '../../ui/chrome';

// Thanh tab kiểu iOS 26+: một viên kính cho các mục, một nút kính tròn riêng cho Tìm kiếm.
// Hiệu ứng "lỏng": vệt chọn trượt theo lò xo và giãn ngang khi đang di chuyển rồi co về
// như giọt nước; icon co lại khi nhấn và nảy ra khi thả; mục đang chọn dùng icon đặc.
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 10;
export const TAB_BAR_SIDE = 14;
const USE_NATIVE = Platform.OS !== 'web';

type Item = { id: TabId; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; label: string };

function TabButton({ item, selected, tint, onPress }: { item: Item; selected: boolean; tint: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number, bouncy = false) =>
    Animated.spring(scale, { toValue: to, damping: bouncy ? 9 : 18, stiffness: bouncy ? 260 : 400, useNativeDriver: USE_NATIVE }).start();
  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      onPressIn={() => press(0.82)}
      onPressOut={() => press(1, true)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={item.label}
    >
      <Animated.View style={{ alignItems: 'center', gap: 2, transform: [{ scale }] }}>
        <Ionicons name={selected ? item.iconActive : item.icon} size={24} color={tint} />
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>{item.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function BottomTabBar({ activeTab, onTabChange }: {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [rowWidth, setRowWidth] = useState(0);
  const collapsed = useChrome((s) => s.collapsed);

  const items: Item[] = [
    // Bốn mục như thanh tab Apple Music (Trang chủ · Mới · Radio · Thư viện) + nút Tìm kiếm
    // tròn; tài khoản mở từ avatar góc trên.
    { id: 'home', icon: 'home-outline', iconActive: 'home', label: t('home') },
    { id: 'new', icon: 'grid-outline', iconActive: 'grid', label: 'Mới' },
    { id: 'radio', icon: 'radio-outline', iconActive: 'radio', label: t('radio') },
    { id: 'library', icon: 'albums-outline', iconActive: 'albums', label: t('library') },
  ];
  const activeIndex = items.findIndex((it) => it.id === activeTab);
  const tabWidth = width / items.length;

  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!tabWidth || activeIndex < 0) return;
    const to = activeIndex * tabWidth;
    if (!placed.current) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: to, damping: 17, stiffness: 190, mass: 0.9, useNativeDriver: USE_NATIVE }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.32, duration: 110, useNativeDriver: USE_NATIVE }),
        Animated.spring(stretch, { toValue: 1, damping: 7, stiffness: 220, useNativeDriver: USE_NATIVE }),
      ]),
    ]).start();
  }, [activeIndex, tabWidth]);

  const isSearchActive = activeTab === 'search';
  // Thu gọn: viên kính co từ đủ bề rộng về một nút tròn chỉ còn icon mục đang chọn;
  // chỗ trống ở giữa nhường cho mini player (BottomPlayer đọc cùng chromeProgress).
  const fullWidth = Math.max(0, rowWidth - TAB_BAR_HEIGHT - TAB_BAR_GAP);
  const capsuleWidth = fullWidth
    ? chromeProgress.interpolate({ inputRange: [0, 1], outputRange: [fullWidth, TAB_BAR_HEIGHT] })
    : undefined;
  const current = items[Math.max(0, activeIndex)];

  return (
    <View
      style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) }, { pointerEvents: 'box-none' }]}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={capsuleWidth ? { width: capsuleWidth } : styles.fill}>
      {collapsed ? (
        <Glass style={styles.capsule} interactive>
          <Pressable
            style={styles.searchPress}
            onPress={() => setChromeCollapsed(false)}
            accessibilityRole="button"
            accessibilityLabel={`${current.label} — mở thanh tab`}
          >
            <Ionicons name={current.iconActive} size={24} color={colors.accent} />
          </Pressable>
        </Glass>
      ) : (
      <Glass style={styles.capsule} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tabWidth > 0 && activeIndex >= 0 && (
          <Animated.View
            style={[styles.lensSlot, { width: tabWidth, transform: [{ translateX: x }, { scaleX: stretch }] }, { pointerEvents: 'none' }]}
          >
            <View
              style={[
                styles.lens,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
                  borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.9)',
                },
              ]}
            />
          </Animated.View>
        )}
        {items.map((item, i) => {
          const selected = i === activeIndex;
          return (
            <TabButton
              key={item.id}
              item={item}
              selected={selected}
              tint={selected ? colors.accent : colors.text}
              onPress={() => onTabChange(item.id)}
            />
          );
        })}
      </Glass>
      )}
      </Animated.View>

      <GlassButton icon="search" iconSize={24} size={TAB_BAR_HEIGHT} label={t('search')} color={isSearchActive ? colors.accent : colors.text} onPress={() => onTabChange('search')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: TAB_BAR_SIDE,
    right: TAB_BAR_SIDE,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'center',
    maxWidth: 520,
  },
  fill: { flex: 1 },
  capsule: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lensSlot: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    padding: 5,
  },
  lens: {
    flex: 1,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
