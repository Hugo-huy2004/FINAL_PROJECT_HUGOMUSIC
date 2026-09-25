import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Modal, PanResponder } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Sidebar from '../components/Sidebar/Sidebar';
import BottomTabBar, { TAB_BAR_HEIGHT } from '../components/BottomTabBar/BottomTabBar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomPlayer from '../components/Player/BottomPlayer';
import { useIsMobile } from '../utils/responsive';
import HugoBrowseScreen from '../screens/HugoBrowseScreen';
import HugoHomeScreen from '../screens/HugoHomeScreen';
import HugoRadioScreen from '../screens/HugoRadioScreen';
import SearchScreen from '../screens/SearchScreen';
import RecentlyAddedView from '../screens/Library/RecentlyAddedView';
import ArtistsView from '../screens/Library/ArtistsView';
import GenresView from '../screens/Library/GenresView';
import AlbumsView from '../screens/Library/AlbumsView';
import SongsView from '../screens/Library/SongsView';
import PlaylistsView from '../screens/Library/PlaylistsView';
import HugoLibraryScreen from '../screens/HugoLibraryScreen';
import HugoLoginModal from '../screens/Auth/HugoLoginModal';
import RegisterWizard from '../screens/Auth/RegisterWizard';
import CompleteProfileModal from '../screens/Auth/CompleteProfileModal';
import HugoFullPlayer from '../screens/HugoFullPlayer';
import HugoPartyScreen from '../screens/Party/HugoPartyScreen';
import HugoLyricsSidePanel from '../components/Player/HugoLyricsSidePanel';
import MemberDashboard from '../screens/Dashboard/MemberDashboard';
import { useStore } from '../store/useStore';
import { TabId, TAB_SCREENS } from '../utils/tabRouting';
import { useAppTheme } from '../theme/theme';
import Glass from '../components/LiquidGlass/Glass';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity, Text, Platform as RNPlatform } from 'react-native';

const SWIPE_TABS: TabId[] = ['home', 'new', 'radio', 'library', 'search'];

export default function HugoLayout({ tab }: { tab: TabId }) {
  const navigation = useNavigation<any>();
  const isLoginModalVisible = useStore(state => state.isLoginModalVisible);
  const setLoginModalVisible = useStore(state => state.setLoginModalVisible);
  const partyRoom = useStore(state => state.partyRoom);
  const hasMiniPlayer = useStore(state => !!state.currentSong);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const isMobile = useIsMobile();
  const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
  const [fullPlayerTab, setFullPlayerTab] = useState<'art' | 'lyrics'>('art');
  const [isLyricsSidePanelOpen, setIsLyricsSidePanelOpen] = useState(false);
  const [isRegisterVisible, setIsRegisterVisible] = useState(false);

  // Persistent Tab State (prevents unmounting HugoLayout, BottomTabBar & BottomPlayer)
  const [currentTab, setCurrentTab] = useState<TabId>(tab);
  const [transitionDirection, setTransitionDirection] = useState<'right' | 'left'>('right');
  const [animToggle, setAnimToggle] = useState(false);
  // Keep-Alive Tab Cache: avoids re-mounting visited screens and losing scroll/state
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set([tab || 'home']));

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
        const found = (Object.keys(TAB_SCREENS) as TabId[]).find(
          (k) => TAB_SCREENS[k].toLowerCase() === path || (k === 'home' && path === '')
        );
        if (found && found !== currentTab) {
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

  const navigateTab = (t: string) => {
    const target = (t as TabId) || 'home';
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

  // Horizontal Swipe Gestures ("Vuốt qua vuốt lại") on Mobile
  const handleSwipeNext = () => {
    const idx = SWIPE_TABS.indexOf(currentTab);
    if (idx >= 0 && idx < SWIPE_TABS.length - 1) {
      navigateTab(SWIPE_TABS[idx + 1]);
    }
  };

  const handleSwipePrev = () => {
    const idx = SWIPE_TABS.indexOf(currentTab);
    if (idx > 0) {
      navigateTab(SWIPE_TABS[idx - 1]);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          isMobile &&
          Math.abs(gestureState.dx) > 18 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 38 || Math.abs(gestureState.vx) > 0.28) {
          if (gestureState.dx < 0) {
            handleSwipeNext();
          } else {
            handleSwipePrev();
          }
        }
      },
    })
  ).current;

  const renderTabContent = (tabId: TabId) => {
    switch (tabId) {
      case 'search':
        return <SearchScreen onNavigate={navigateTab} />;
      case 'new':
        return <HugoBrowseScreen onNavigate={navigateTab} />;
      case 'radio':
        return <HugoRadioScreen onNavigate={navigateTab} />;
      case 'library':
        return <HugoLibraryScreen />;
      case 'recently-added':
        return <RecentlyAddedView />;
      case 'genres':
        return <GenresView mode="genre" />;
      case 'countries':
        return <GenresView mode="country" />;
      case 'artists':
        return <ArtistsView />;
      case 'albums':
        return <AlbumsView />;
      case 'songs':
        return <SongsView />;
      case 'playlists':
        return <PlaylistsView />;
      case 'party':
        return <HugoPartyScreen onNavigate={navigateTab} />;
      case 'account':
        return (
          <MemberDashboard
            onNavigateLibrary={() => navigateTab('library')}
            onNavigateBack={() => navigateTab('home')}
          />
        );
      case 'home':
      default:
        return <HugoHomeScreen onNavigate={navigateTab} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, flexDirection: isMobile ? 'column' : 'row' }]}>
      {/* Desktop/wide-web: persistent left sidebar */}
      {!isMobile && (
        <Sidebar
          onLoginPress={() => setLoginModalVisible(true)}
          onProfilePress={() => navigateTab('account')}
          activeTab={currentTab}
          onTabChange={navigateTab}
        />
      )}

      {/* Main Content Area with Keep-Alive Screen Cache & 120fps Transitions */}
      <View
        style={[styles.mainContent, { backgroundColor: colors.background, paddingLeft: isMobile ? 0 : 88 }]}
        {...(isMobile ? panResponder.panHandlers : {})}
      >
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
              ]}
              pointerEvents={isActive ? 'auto' : 'none'}
            >
              {renderTabContent(tabId)}
            </View>
          );
        })}
      </View>

      {/* Desktop Live Lyrics Side Panel (Apple Music Style) */}
      {!isMobile && isLyricsSidePanelOpen && (
        <HugoLyricsSidePanel
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
        <LinearGradient
          pointerEvents="none"
          colors={isDark ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
          style={[styles.scrollEdge, { height: Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + (hasMiniPlayer ? 72 : 0) + 28 }]}
        />
      )}

      {isMobile && (
        <BottomTabBar
          activeTab={currentTab}
          onTabChange={navigateTab}
          onLoginPress={() => setLoginModalVisible(true)}
        />
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
        <HugoLoginModal
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

      {/* Full Screen Player Modal with custom 120fps Water Droplet Burst Animation */}
      <Modal visible={isFullPlayerVisible} animationType="none" transparent>
        <HugoFullPlayer
          onClose={() => setIsFullPlayerVisible(false)}
          initialTab={fullPlayerTab}
        />
      </Modal>

      {/* Floating Party Room Indicator Pill when room is active & user is on another tab */}
      {partyRoom && tab !== 'party' && (
        <TouchableOpacity
          // Sits above the mini player on mobile (tab bar + mini player + gaps).
          style={[styles.floatingPartyPill, { bottom: isMobile ? 156 : 100 }]}
          onPress={() => navigateTab('party')}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Glass pointerEvents="none" radius={22} style={StyleSheet.absoluteFill} />
          <View style={styles.floatingPartyDot} />
          <Text style={[styles.floatingPartyText, { color: colors.text }]}>
            Đang nghe cùng · {partyRoom.code}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}

      {/* Self-contained: no-ops unless the logged-in account is missing required
          fields (older accounts, or Google sign-ups) — see CompleteProfileModal.tsx */}
      <CompleteProfileModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
