import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import Sidebar from '../components/Sidebar/Sidebar';
import { useSidebarDock } from '../ui/sidebar';
import BottomTabBar, { TAB_BAR_HEIGHT } from '../components/BottomTabBar/BottomTabBar';
import { setChromeCollapsed } from '../ui/chrome';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomPlayer from '../components/Player/BottomPlayer';
import { useIsMobile, ContentWidthContext } from '../utils/responsive';
import HomeScreen from '../screens/Home/HomeScreen';
import SearchScreen from '../screens/Search';
import NewScreen from '../screens/New/NewScreen';
import LibraryScreen from '../screens/Library/LibraryScreen';
import LoginModal from '../screens/Auth/LoginModal';
import RegisterWizard from '../screens/Auth/RegisterWizard';
import CompleteProfileModal from '../screens/Auth/CompleteProfileModal';
import FullPlayer from '../screens/Player/FullPlayer';
import RadioScreen from '../screens/Rooms/RadioScreen';
import LiveRoomSheet from '../screens/Rooms/LiveRoomSheet';
import { SongActionsHost } from '../components/SongActions/SongActions';
import LyricsSidePanel from '../components/Player/LyricsSidePanel';
import AccountScreen from '../screens/Account/AccountScreen';
import { useStore } from '../store/useStore';
import { TabId, TAB_SCREENS, LibrarySection, resolveTab } from '../utils/tabRouting';
import { useAppTheme } from '../theme/theme';
import Glass from '../components/LiquidGlass/Glass';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Text, Platform as RNPlatform } from 'react-native';
import NativeTabs, { HAS_NATIVE_TABS } from './NativeTabs';
import { useTranslation } from '../i18n/i18n';

const SWIPE_TABS: TabId[] = ['home', 'new', 'radio', 'library'];

export default function AppLayout({ tab: rawTab }: { tab: string }) {
  const { tab, section: initialSection } = resolveTab(rawTab);
  const isLoginModalVisible = useStore(state => state.isLoginModalVisible);
  const setLoginModalVisible = useStore(state => state.setLoginModalVisible);
  const liveRoom = useStore(state => state.liveRoom);
  // Vào phòng (từ bất cứ đâu) là mở sheet phòng; thu nhỏ thì còn viên "đang trong phòng".
  const [roomOpen, setRoomOpen] = useState(false);
  useEffect(() => {
    setRoomOpen(!!liveRoom);
  }, [liveRoom?.id]);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const [librarySection, setLibrarySection] = useState<LibrarySection | null>(initialSection ?? null);
  const hasMiniPlayer = useStore(state => !!state.currentSong);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  // iPhone: thanh tab gốc SwiftUI (NativeTabs.ios); Android/web: BottomTabBar (RN).
  const nativeTabs = HAS_NATIVE_TABS && isMobile;
  const sidebarSpace = useSidebarDock().space;
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const [fullPlayerTab, setFullPlayerTab] = useState<'art' | 'lyrics'>('art');
  const [isLyricsSidePanelOpen, setIsLyricsSidePanelOpen] = useState(false);
  const [isRegisterVisible, setIsRegisterVisible] = useState(false);

  // Persistent Tab State (prevents unmounting AppLayout, BottomTabBar & BottomPlayer)
  const [currentTab, setCurrentTab] = useState<TabId>(tab);
  const [transitionDirection, setTransitionDirection] = useState<'right' | 'left'>('right');
  const [animToggle, setAnimToggle] = useState(false);
  // Keep-Alive Tab Cache: avoids re-mounting visited screens and losing scroll/state
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set([tab || 'home']));

  // Kho nhạc tải một lần ở đây cho mọi màn (Trang chủ, Tìm kiếm, Thư viện đều đọc từ store).
  const fetchSongs = useStore(state => state.fetchSongs);
  useEffect(() => {
    fetchSongs();
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(currentTab)) return prev;
      const next = new Set(prev);
      next.add(currentTab);
      return next;
    });
  }, [currentTab]);

  // Synchronize when outer route prop changes
  useEffect(() => {
    if (tab && tab !== currentTab) {
      const prevIdx = SWIPE_TABS.indexOf(currentTab);
      const nextIdx = SWIPE_TABS.indexOf(tab);
      setTransitionDirection(nextIdx >= prevIdx ? 'right' : 'left');
      setCurrentTab(tab);
      setAnimToggle((p) => !p);
    }
  }, [tab]);

  // Handle browser Back / Forward history without reloading
  useEffect(() => {
    if (RNPlatform.OS === 'web' && typeof window !== 'undefined') {
      const handlePopState = () => {
        const path = window.location.pathname.replace(/^\//, '').toLowerCase();
        const found = resolveTab(path || 'home').tab;
        if (found !== currentTab) {
          const prevIdx = SWIPE_TABS.indexOf(currentTab);
          const nextIdx = SWIPE_TABS.indexOf(found);
          setTransitionDirection(nextIdx >= prevIdx ? 'right' : 'left');
          setCurrentTab(found);
          setAnimToggle((p) => !p);
        }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [currentTab]);

  const openFullPlayer = (tabToOpen: 'art' | 'lyrics' = 'art') => {
    setFullPlayerTab(tabToOpen);
    setIsFullPlayerVisible(true);
  };

  // Nhận cả tên cũ ('songs', 'party', 'genres'...) — resolveTab quy về một trong bốn nơi.
  const navigateTab = (t: string) => {
    const { tab: target, section } = resolveTab(t || 'home');
    setChromeCollapsed(false); // sang màn mới thì thanh tab bung ra
    if (target === 'library') setLibrarySection(section ?? null);
    if (target === currentTab) return;

    const prevIdx = SWIPE_TABS.indexOf(currentTab);
    const nextIdx = SWIPE_TABS.indexOf(target);
    const dir = (nextIdx !== -1 && prevIdx !== -1)
      ? (nextIdx >= prevIdx ? 'right' : 'left')
      : 'right';

    setTransitionDirection(dir);
    setCurrentTab(target);
    setAnimToggle((p) => !p);

    // Update browser URL silently without unmounting
    if (RNPlatform.OS === 'web' && typeof window !== 'undefined') {
      const routeScreen = TAB_SCREENS[target] ?? 'Home';
      const slug = routeScreen === 'Home' ? '' : routeScreen.toLowerCase();
      window.history.pushState(null, '', slug ? `/${slug}` : '/');
    }
  };

  // Đăng xuất (nút ở Tài khoản, ở hộp Hoàn tất hồ sơ, hay phiên hết hạn) → về Trang chủ: màn đang mở
  // (Tài khoản, Thư viện cá nhân) không còn ý nghĩa với khách.
  const userId = useStore((s) => s.user?._id);
  const hadUser = React.useRef(!!userId);
  useEffect(() => {
    if (hadUser.current && !userId) navigateTab('home');
    hadUser.current = !!userId;
  }, [userId]);

  // Không vuốt ngang để đổi tab (như Apple Music): cử chỉ đó tranh với kệ cuộn ngang và vuốt-mép
  // để quay lại (ui/kit/SwipeBack), làm chuyển trang giật.

  // Tài khoản không phải một tab: trên iPhone mở dạng sheet (như Apple Music), thanh tab giữ tab trước đó.
  const lastMainTab = React.useRef<TabId>(tab === 'account' ? 'home' : tab);
  if (currentTab !== 'account') lastMainTab.current = currentTab;
  const nativeTabItems: { id: TabId; label: string; systemImage: string }[] = [
    { id: 'home', label: t('home'), systemImage: 'house.fill' },
    { id: 'new', label: 'Mới', systemImage: 'square.grid.2x2.fill' },
    { id: 'radio', label: t('radio'), systemImage: 'dot.radiowaves.left.and.right' },
    { id: 'library', label: t('library'), systemImage: 'square.stack.fill' },
    { id: 'search', label: t('search'), systemImage: 'magnifyingglass' },
  ];

  const renderTabContent = (tabId: TabId) => {
    switch (tabId) {
      case 'search':
        return <SearchScreen />;
      case 'new':
        return <NewScreen onNavigate={navigateTab} />;
      case 'radio':
        return <RadioScreen onNavigate={navigateTab} />;
      case 'library':
        return <LibraryScreen section={librarySection} onSection={setLibrarySection} onNavigate={navigateTab} />;
      case 'account':
        return <AccountScreen onNavigateLibrary={() => navigateTab('library')} />;
      case 'home':
      default:
        return <HomeScreen onNavigate={navigateTab} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, flexDirection: isMobile ? 'column' : 'row' }]}>
      {/* Desktop/wide-web: persistent left sidebar */}
      {!isMobile && (
        <Sidebar activeTab={currentTab} onTabChange={navigateTab} />
      )}

      {nativeTabs ? (
        <NativeTabs
          tabs={nativeTabItems}
          selected={currentTab === 'account' ? lastMainTab.current : currentTab}
          onSelect={navigateTab}
          tint={colors.accent}
          isDark={isDark}
          // Chưa mở tab nào thì chưa dựng màn đó (giống visitedTabs bên dưới).
          render={(id) => (
            <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
              {visitedTabs.has(id) ? renderTabContent(id) : null}
            </View>
          )}
        />
      ) : (
      /* Main Content Area with Keep-Alive Screen Cache & 120fps Transitions */
      <View
        // Trên máy thật: chừa tai thỏ/thanh trạng thái (web insets.top = 0 nên không đổi gì).
        style={[styles.mainContent, { paddingLeft: isMobile ? 0 : sidebarSpace, paddingTop: insets.top }]}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width - (isMobile ? 0 : sidebarSpace))}
      >
        <ContentWidthContext.Provider value={contentWidth}>
        {Array.from(visitedTabs).map((tabId) => {
          const isActive = tabId === currentTab;
          return (
            <View
              key={tabId}
              style={[
                styles.screenContainer,
                {
                  display: isActive ? 'flex' : 'none',
                },
                isActive && RNPlatform.OS === 'web' && ({
                  animationKeyframes: transitionDirection === 'right'
                    ? (animToggle ? 'hugoScreenRevealFromRightA' : 'hugoScreenRevealFromRightB')
                    : (animToggle ? 'hugoScreenRevealFromLeftA' : 'hugoScreenRevealFromLeftB'),
                  animationDuration: '0.28s',
                  animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  animationFillMode: 'both',
                  willChange: 'transform, opacity',
                  transformOrigin: '50% 25%',
                } as any),
                { pointerEvents: isActive ? 'auto' : 'none' },
              ]}
            >
              {renderTabContent(tabId)}
            </View>
          );
        })}
        </ContentWidthContext.Provider>
      </View>
      )}

      {nativeTabs && (
        <Modal visible={currentTab === 'account'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => navigateTab(lastMainTab.current)}>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {currentTab === 'account' && <AccountScreen onNavigateLibrary={() => navigateTab('library')} />}
          </View>
        </Modal>
      )}

      {/* Desktop Live Lyrics Side Panel (Apple Music Style) */}
      {!isMobile && isLyricsSidePanelOpen && (
        <LyricsSidePanel
          onClose={() => setIsLyricsSidePanelOpen(false)}
          onExpandFullScreen={() => {
            setIsLyricsSidePanelOpen(false);
            openFullPlayer('lyrics');
          }}
        />
      )}

      {/* iOS 26 scroll edge effect: content fades out beneath the floating bars so
          they stay legible over busy artwork. */}
      {isMobile && !nativeTabs && (
        <LinearGradient
          colors={isDark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
          style={[styles.scrollEdge, { height: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + (hasMiniPlayer ? 72 : 0) + 28 }, { pointerEvents: 'none' }]}
        />
      )}

      {isMobile && !nativeTabs && (
        <BottomTabBar activeTab={currentTab} onTabChange={navigateTab} />
      )}

      {/* Global Bottom Player */}
      <BottomPlayer
        isLyricsActive={isLyricsSidePanelOpen || (isFullPlayerVisible && fullPlayerTab === 'lyrics')}
        onOpenFullPlayer={() => openFullPlayer('art')}
        onOpenLyrics={() => {
          if (isMobile) {
            openFullPlayer('lyrics');
          } else {
            setIsLyricsSidePanelOpen((prev) => !prev);
          }
        }}
      />

      {/* Login Modal */}
      <Modal visible={isLoginModalVisible} animationType="slide" transparent>
        <LoginModal
          onClose={() => setLoginModalVisible(false)}
          onOpenRegister={() => {
            setLoginModalVisible(false);
            setIsRegisterVisible(true);
          }}
        />
      </Modal>

      {/* Registration wizard: step -> step, see screens/Auth/RegisterWizard.tsx */}
      <Modal visible={isRegisterVisible} animationType="slide" transparent>
        <RegisterWizard onClose={() => setIsRegisterVisible(false)} />
      </Modal>

      {/* Trình phát toàn màn hình (screens/Player/FullPlayer.tsx) trượt lên như sheet iOS */}
      <Modal visible={isFullPlayerVisible} animationType="slide" transparent onRequestClose={() => setIsFullPlayerVisible(false)}>
        <FullPlayer
          onClose={() => setIsFullPlayerVisible(false)}
          initialTab={fullPlayerTab}
        />
      </Modal>

      {/* Đang ở trong phòng nghe chung mà sang tab khác: nút quay lại phòng */}
      {liveRoom && !roomOpen && (
        <TouchableOpacity
          // Sits above the mini player on mobile (tab bar + mini player + gaps).
          style={[styles.floatingPartyPill, { bottom: isMobile ? 156 : 100 }]}
          onPress={() => setRoomOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Glass radius={22} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
          <View style={styles.floatingPartyDot} />
          <Text style={[styles.floatingPartyText, { color: colors.text }]}>
            {liveRoom.kind === 'station' ? 'Đài' : 'Nghe mù'} · {liveRoom.name}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}

      {/* Self-contained: no-ops unless the logged-in account is missing required
          fields (older accounts, or Google sign-ups) — see CompleteProfileModal.tsx */}
      <LiveRoomSheet visible={roomOpen} onMinimize={() => setRoomOpen(false)} />
      <SongActionsHost />

      <CompleteProfileModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden', // không phần tử nào được làm trang rộng/cao hơn màn hình
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },
  screenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  floatingPartyPill: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    zIndex: 1001,
  },
  floatingPartyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34C759',
    marginRight: 6,
    ...(RNPlatform.OS === 'web'
      ? ({
          animationKeyframes: 'pulseGlow',
          animationDuration: '2s',
          animationIterationCount: 'infinite',
        } as any)
      : {}),
  },
  floatingPartyText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.24,
  },
});
