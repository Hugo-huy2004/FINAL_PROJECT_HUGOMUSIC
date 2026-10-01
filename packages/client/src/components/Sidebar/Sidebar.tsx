import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../ui/theme';
import { useTranslation } from '../../i18n/i18n';
import { TabId } from '../../lib/tabRouting';
import { useSidebarDock, setSidebarPref, SIDEBAR_FULL, SIDEBAR_RAIL, SIDEBAR_INSET } from '../../ui/sidebar';
import { Glass, Icon } from 'hugo-music';
import { UserAvatar } from '../UserAvatar';

// Desktop sidebar — a floating glass panel: Search, Home, New, Radio, Library + account (ui/sidebar.ts format).
// - Rail format only has icons; When you drag the mouse in, the glass will stretch out over the content, and if you drag it out, it will shrink.
// - Button in the corner: open → collapsed; viewing temporarily → open pin. Choices are remembered.
// - The currently selected item is in a "glass drop" that slides on a spring: when moved the drop extends
// vertically and tighten horizontally, then bounce back to roundness — like a drop of water.
// The icon stays in place in both forms; Only the glass expands and the words gradually appear.
const PAD = 10;
const ROW = 44;
const GAP = 4;
const ICON_X = (SIDEBAR_RAIL - PAD * 2 - 22) / 2; // 22px icon in the middle of the rail
const USE_NATIVE = false; // width interpolation — native driver cannot do it
const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 220;

type Item = { id: TabId; icon: keyof typeof Icon.glyphMap; iconActive: keyof typeof Icon.glyphMap; label: string };

/** Left navigation sidebar for tablets and desktop web. */
export default function Sidebar({ activeTab, onTabChange }: {
  /** Id of the selected tab. */
  activeTab: TabId;
  /** Called with the id of the tapped tab. */
  onTabChange: (tab: TabId) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const user = useStore((s) => s.user);
  const setLoginModalVisible = useStore((s) => s.setLoginModalVisible);
  const { full } = useSidebarDock();
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = full || peek;

  const items: Item[] = [
    { id: 'home', icon: 'home-outline', iconActive: 'home', label: t('home') },
    { id: 'new', icon: 'grid-outline', iconActive: 'grid', label: 'Mới' },
    { id: 'radio', icon: 'radio-outline', iconActive: 'radio', label: t('radio') },
    { id: 'library', icon: 'albums-outline', iconActive: 'albums', label: t('library') },
  ];
  const activeIndex = items.findIndex((i) => i.id === activeTab);

  // --- expanding/shrinking glass panels ---
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(progress, { toValue: open ? 1 : 0, damping: 17, stiffness: 200, mass: 0.9, useNativeDriver: USE_NATIVE }).start();
  }, [open]);
  const panelWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [SIDEBAR_RAIL, SIDEBAR_FULL] });
  const labelStyle = {
    opacity: progress.interpolate({ inputRange: [0.45, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
  };

  // --- glass drop select item ---
  const y = useRef(new Animated.Value(Math.max(0, activeIndex) * (ROW + GAP))).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const lensOpacity = useRef(new Animated.Value(activeIndex >= 0 ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(lensOpacity, { toValue: activeIndex >= 0 ? 1 : 0, duration: 160, useNativeDriver: USE_NATIVE }).start();
    if (activeIndex < 0) return;
    Animated.parallel([
      Animated.spring(y, { toValue: activeIndex * (ROW + GAP), damping: 16, stiffness: 190, mass: 0.9, useNativeDriver: USE_NATIVE }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.35, duration: 110, useNativeDriver: USE_NATIVE }),
        Animated.spring(stretch, { toValue: 1, damping: 7, stiffness: 230, useNativeDriver: USE_NATIVE }),
      ]),
    ]).start();
  }, [activeIndex]);
  const squeeze = stretch.interpolate({ inputRange: [1, 1.35], outputRange: [1, 0.9] }); // holds the "volume" of drops

  // Hovering: opens after a short beat (gliding across will not turn on), closes a little later.
  const hover = (inside: boolean) => {
    if (full) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(inside), inside ? HOVER_OPEN_MS : HOVER_CLOSE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setPeek(false), [full]);

  const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const go = (tab: TabId) => {
    setPeek(false);
    onTabChange(tab);
  };

  const row = (key: string, icon: React.ReactNode, label: string, onPress: () => void, selected: boolean, extra?: React.ReactNode) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered }: any) => [styles.row, hovered && !selected && { backgroundColor: hoverBg }]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={styles.icon}>{icon}</View>
      <Animated.Text style={[styles.label, { color: colors.text }, selected && styles.labelActive, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
      {extra}
    </Pressable>
  );

  return (
    <Animated.View
      style={[styles.dock, { width: panelWidth }]}
      {...(Platform.OS === 'web' ? ({ onMouseEnter: () => hover(true), onMouseLeave: () => hover(false) } as object) : {})}
    >
      <Glass radius={26} style={styles.panel}>
        <View style={styles.brand}>
          <Image source={require('../../../assets/logo.png')} style={styles.logo} />
          <Animated.Text style={[styles.brandText, { color: colors.text }, labelStyle]} numberOfLines={1}>Hugo Music</Animated.Text>
          <Animated.View style={[{ opacity: labelStyle.opacity }, { pointerEvents: open ? 'auto' : 'none' }]}>
            <Pressable
              onPress={() => setSidebarPref(full ? 'rail' : 'full')}
              style={({ hovered }: any) => [styles.pin, hovered && { backgroundColor: hoverBg }]}
              accessibilityRole="button"
              accessibilityLabel={full ? 'Thu gọn thanh bên' : 'Ghim thanh bên luôn mở'}
            >
              <Icon name={full ? 'chevron-back' : 'pin-outline'} size={17} color={colors.textSecondary} />
            </Pressable>
          </Animated.View>
        </View>

        <View style={[styles.search, { backgroundColor: activeTab === 'search' ? (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)') : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)' }]}>
          {row('search', <Icon name="search" size={19} color={activeTab === 'search' ? colors.accent : colors.textSecondary} />, t('search'), () => go('search'), activeTab === 'search')}
        </View>

        <View style={styles.items}>
          <Animated.View
            style={[
              styles.lens,
              {
                opacity: lensOpacity,
                backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.75)',
                borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.06)',
                transform: [{ translateY: y }, { scaleY: stretch }, { scaleX: squeeze }],
              },
              LENS_WEB,
              { pointerEvents: 'none' },
            ]}
          />
          {items.map((item) => {
            const selected = activeTab === item.id;
            return row(
              item.id,
              <Icon name={selected ? item.iconActive : item.icon} size={22} color={selected ? colors.accent : colors.text} />,
              item.label,
              () => go(item.id),
              selected,
            );
          })}
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => (user ? go('account') : setLoginModalVisible(true))}
          style={({ hovered }: any) => [styles.profile, (activeTab === 'account' || hovered) && { backgroundColor: hoverBg }]}
          accessibilityRole="button"
          accessibilityLabel={user ? t('account') : t('login')}
        >
          {user ? (
            <UserAvatar avatarUrl={user.avatarUrl} username={user.username} nickname={user.nickname} size={34} />
          ) : (
            <Icon name="person-circle" size={34} color={colors.accent} />
          )}
          <Animated.View style={[{ flex: 1, minWidth: 0 }, labelStyle]}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {user ? user.nickname || user.username : t('login')}
            </Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
              {user ? t('account') : 'Lưu bài, tạo danh sách phát'}
            </Text>
          </Animated.View>
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

const LENS_WEB = Platform.OS === 'web'
  ? ({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 16px -6px rgba(0,0,0,0.35)' } as object)
  : {};

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: SIDEBAR_INSET, top: SIDEBAR_INSET, bottom: SIDEBAR_INSET, zIndex: 900 },
  panel: { flex: 1, padding: PAD, overflow: 'hidden' },
  brand: { flexDirection: 'row', alignItems: 'center', height: ROW, marginBottom: 8, paddingLeft: (SIDEBAR_RAIL - PAD * 2 - 30) / 2 },
  logo: { width: 30, height: 30, borderRadius: 8 },
  brandText: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginLeft: 10 },
  pin: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  search: { borderRadius: 12 },
  items: { marginTop: 12, gap: GAP },
  lens: { position: 'absolute', left: 0, right: 0, top: 0, height: ROW, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW, borderRadius: 14, paddingLeft: ICON_X, overflow: 'hidden' },
  icon: { width: 22, alignItems: 'center' },
  label: { fontSize: 15, marginLeft: 14, flexShrink: 0 },
  labelActive: { fontWeight: '700' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: (SIDEBAR_RAIL - PAD * 2 - 34) / 2, borderRadius: 16, overflow: 'hidden' },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 1 },
});
