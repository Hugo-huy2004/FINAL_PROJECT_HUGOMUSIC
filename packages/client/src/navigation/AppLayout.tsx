import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import Sidebar from '../components/Sidebar/Sidebar';
import { useSidebarDock } from '../ui/sidebar';
import BottomTabBar, { TAB_BAR_HEIGHT } from '../components/BottomTabBar/BottomTabBar';
import { setChromeCollapsed } from '../ui/chrome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomPlayer from '../components/Player/BottomPlayer';
import { useIsMobile, ContentWidthContext } from '../lib/responsive';
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
import { TabId, TAB_SCREENS, LibrarySection, resolveTab } from '../lib/tabRouting';
import { useAppTheme } from '../ui/theme';
import { Glass, Gradient, Icon } from 'hugo-music';
import { TouchableOpacity, Text, Platform as RNPlatform } from 'react-native';
import { useTranslation } from '../i18n/i18n';

const SWIPE_TABS: TabId[] = ['home', 'new', 'radio', 'library'];

export default function AppLayout({ tab: rawTab }: { tab: string }) {
  const { tab, section: initialSection } = resolveTab(rawTab);
  const isLoginModalVisible = useStore(state => state.isLoginModalVisible);
  const setLoginModalVisible = useStore(state => state.setLoginModalVisible);
  const liveRoom = useStore(state => state.liveRoom);
  // Entering a room (from anywhere) means opening the room sheet; Zoomed out, the capsule is still "in the room".
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

  // The music store downloads once here for every screen (Home, Search, Library all read from the store).
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

  // Get old names too ('songs', 'party', 'genres'...) — resolveTab returns to one of four places.
  const navigateTab = (t: string) => {
    const { tab: target, section } = resolveTab(t || 'home');
    setChromeCollapsed(false); // When you move to a new screen, the tab bar opens
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

  // Log out (button in Account, in box Complete profile, or session expired) → go to Home: screen is open
  // (Account, Personal Library) no longer makes sense to guests.
  const userId = useStore((s) => s.user?._id);
  const hadUser = React.useRef(!!userId);
  useEffect(() => {
    if (hadUser.current && !userId) navigateTab('home');
    hadUser.current = !!userId;
  }, [userId]);

  // Don't swipe horizontally to change tabs (like Apple Music): that gesture competes with horizontal scrolling and edge-swiping
  // to go back (ui/kit/SwipeBack), causing jerky page transitions.


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

      {/* Main Content Area with Keep-Alive Screen Cache & 120fps Transitions */}
      <View
        // On real device: leave rabbit ears/status bar (web insets.top = 0 so nothing changes).
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
      {isMobile && (
        <Gradient
          colors={isDark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
          style={[styles.scrollEdge, { height: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + (hasMiniPlayer ? 72 : 0) + 28 }, { pointerEvents: 'none' }]}
        />
      )}

      {isMobile && (
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

      {/* The full screen player (screens/Player/FullPlayer.tsx) slides up like an iOS sheet */}
      <Modal visible={isFullPlayerVisible} animationType="slide" transparent onRequestClose={() => setIsFullPlayerVisible(false)}>
        <FullPlayer
          onClose={() => setIsFullPlayerVisible(false)}
          initialTab={fullPlayerTab}
        />
      </Modal>

      {/* While in the shared listening room, go to another tab: button to return to the room */}
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
          <Icon name="chevron-forward" size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
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
    overflow: 'hidden', // No element can make the page wider/tall than the screen
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
