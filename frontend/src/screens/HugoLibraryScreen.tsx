import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n/i18n';
import { useAppTheme } from '../theme/theme';

import RecentlyAddedView from './Library/RecentlyAddedView';
import SongsView from './Library/SongsView';
import PlaylistsView from './Library/PlaylistsView';
import AlbumsView from './Library/AlbumsView';
import ArtistsView from './Library/ArtistsView';
import GenresView from './Library/GenresView';

type LibraryTab = 'recently-added' | 'songs' | 'playlists' | 'albums' | 'artists' | 'genres' | 'countries';

export default function HugoLibraryScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<LibraryTab>('recently-added');

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: 'recently-added', label: t('recentlyAdded') || 'Thêm gần đây' },
    { id: 'songs', label: t('songs') || 'Bài hát' },
    { id: 'playlists', label: t('playlists') || 'Playlist' },
    { id: 'albums', label: t('albums') || 'Album' },
    { id: 'artists', label: t('artists') || 'Nghệ sĩ' },
    { id: 'genres', label: t('genres') || 'Thể loại' },
    { id: 'countries', label: t('countries') || 'Quốc gia' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'recently-added':
        return <RecentlyAddedView />;
      case 'songs':
        return <SongsView />;
      case 'playlists':
        return <PlaylistsView />;
      case 'albums':
        return <AlbumsView />;
      case 'artists':
        return <ArtistsView />;
      case 'genres':
        return <GenresView mode="genre" />;
      case 'countries':
        return <GenresView mode="country" />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Tab Bar (Liquid Glass Pill Design) */}
      <View
        style={[
          styles.tabBarWrapper,
          { paddingTop: Math.max(insets.top, 16) },
          Platform.OS === 'web' && ({
            backdropFilter: 'blur(30px) saturate(210%)',
            position: 'sticky',
            top: 0,
            zIndex: 50,
          } as any)
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
                style={[
                  styles.tabItem,
                  {
                    backgroundColor: isActive 
                      ? (isDark ? '#ffffff' : '#111827')
                      : 'transparent',
                    borderColor: isActive
                      ? 'transparent'
                      : (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'),
                  }
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isActive
                        ? (isDark ? '#000000' : '#ffffff')
                        : (isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)'),
                      fontWeight: isActive ? '600' : '500',
                    }
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <View style={styles.contentContainer}>
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarWrapper: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
  },
  tabScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 15,
  },
  contentContainer: {
    flex: 1,
  },
});
