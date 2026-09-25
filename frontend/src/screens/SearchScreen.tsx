import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore, Song } from '../store/useStore';
import CoverArt from '../components/CoverArt';
import { useAppTheme } from '../theme/theme';
import { useTranslation } from '../i18n/i18n';
import { useIsMobile } from '../utils/responsive';
import { UserAvatar } from '../components/UserAvatar';
import LiquidGlassCard from '../components/LiquidGlass/LiquidGlassCard';
import LiquidGlassButton from '../components/LiquidGlass/LiquidGlassButton';

const readQueryParam = () =>
  Platform.OS === 'web' ? new URLSearchParams(window.location.search).get('q') ?? '' : '';

const writeQueryParam = (q: string) => {
  if (Platform.OS !== 'web') return;
  const url = new URL(window.location.href);
  if (q.trim()) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
};

const TRENDING_TAGS = [
  'Acoustic',
  'Josh Woodward',
  'Brad Sucks',
  'V-Pop',
  'Thánh Ca',
  'Kellee Maize',
  'Lofi Chill',
  'Nhạc Quốc Tế',
  'Ballad',
];

const SEARCH_CATEGORIES = [
  {
    id: 'Acoustic & Lofi',
    titleVi: 'Acoustic & Lofi',
    titleEn: 'Acoustic & Lofi',
    subtitleVi: 'Mộc mạc & Thư giãn',
    subtitleEn: 'Chill & Unplugged',
    colors: ['#065f46', '#064e3b'] as const,
    icon: 'cafe-outline' as const,
  },
  {
    id: 'Nhạc trẻ',
    titleVi: 'V-Pop & Nhạc trẻ',
    titleEn: 'Pop & Modern',
    subtitleVi: 'Giai điệu thịnh hành',
    subtitleEn: 'Trending Hits',
    colors: ['#9d174d', '#831843'] as const,
    icon: 'flame-outline' as const,
  },
  {
    id: 'Nhạc Quốc Tế',
    titleVi: 'Nhạc Quốc Tế',
    titleEn: 'International',
    subtitleVi: 'Indie & Pop thế giới',
    subtitleEn: 'Global Indie & Pop',
    colors: ['#0369a1', '#0c4a6e'] as const,
    icon: 'globe-outline' as const,
  },
  {
    id: 'Nhạc Phụng Vụ',
    titleVi: 'Nhạc Phụng Vụ',
    titleEn: 'Liturgical & Choral',
    subtitleVi: 'Thánh Ca & Ca đoàn',
    subtitleEn: 'Sacred Hymns',
    colors: ['#701a75', '#4a044e'] as const,
    icon: 'book-outline' as const,
  },
  {
    id: 'Hòa tấu',
    titleVi: 'Hòa tấu & Cổ điển',
    titleEn: 'Instrumental & Classic',
    subtitleVi: 'Giai điệu không lời',
    subtitleEn: 'Timeless Melodies',
    colors: ['#1e40af', '#1e3a8a'] as const,
    icon: 'musical-notes-outline' as const,
  },
  {
    id: 'Podcast',
    titleVi: 'Podcast & Radio',
    titleEn: 'Podcasts & Radio',
    subtitleVi: 'Tri thức & Chia sẻ',
    subtitleEn: 'Talk & Audiobooks',
    colors: ['#581c87', '#3b1053'] as const,
    icon: 'mic-outline' as const,
  },
];

export default function SearchScreen({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [query, setQuery] = useState(readQueryParam);
  const searchResults = useStore((state) => state.searchResults);
  const isSearching = useStore((state) => state.isSearching);
  const search = useStore((state) => state.search);
  const playSong = useStore((state) => state.playSong);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const user = useStore((state) => state.user);
  const songs = useStore((state) => state.songs);
  const fetchSongs = useStore((state) => state.fetchSongs);

  const { colors, isDark } = useAppTheme();
  const { language } = useTranslation();
  const isVi = language === 'vi';

  const isMobile = useIsMobile();
  const { width: windowWidth } = useWindowDimensions();

  const padH = isMobile ? 16 : 32;
  const catGap = isMobile ? 10 : 14;
  const catCardWidth = isMobile ? Math.floor((windowWidth - padH * 2 - catGap) / 2) : undefined;

  useEffect(() => {
    if (query.trim()) {
      search(query);
    }
    if (!songs || songs.length === 0) {
      fetchSongs();
    }
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    writeQueryParam(text);
    search(text);
  };

  const handleClear = () => {
    setQuery('');
    writeQueryParam('');
    search('');
  };

  const handleSelectTag = (tag: string) => {
    handleChange(tag);
  };

  // Filter 5 suggested songs for quick play
  const suggestedSongs = (songs || []).filter((s) => s.category !== 'Podcast').slice(0, 5);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { paddingHorizontal: padH, paddingTop: isMobile ? 16 : 28 }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text, fontSize: isMobile ? 26 : 32 }]}>
            {isVi ? 'Tìm kiếm' : 'Search'}
          </Text>
          {onNavigate && (
            <TouchableOpacity
              style={[styles.headerAvatarBtn, { borderColor: colors.border }]}
              onPress={() => onNavigate('account')}
              activeOpacity={0.7}
            >
              {user ? (
                <UserAvatar
                  avatarUrl={user.avatarUrl}
                  username={user.username}
                  nickname={user.nickname}
                  size={32}
                />
              ) : (
                <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.activeItemBg }]}>
                  <Ionicons name="person" size={16} color={colors.accent} />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Search Input Bar with Floating Liquid Glass */}
        <LiquidGlassCard
          borderRadius={24}
          tint={isDark ? 'rgba(28, 28, 34, 0.78)' : 'rgba(255, 255, 255, 0.85)'}
          glowColor={colors.accent}
          style={[styles.searchBar, { padding: 0 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', height: '100%', paddingHorizontal: 16 }}>
            <Ionicons name="search" size={18} color={colors.icon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={isVi ? 'Bài hát, nghệ sĩ, thể loại...' : 'Songs, artists, genres...'}
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={handleChange}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color={colors.icon} style={{ marginRight: 6 }} />
              </TouchableOpacity>
            )}
            {isSearching && <ActivityIndicator size="small" color={colors.iconActive} />}
          </View>
        </LiquidGlassCard>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {/* STATE 1: Empty Query - Show Rich Discovery Hub */}
          {!query.trim() ? (
            <View style={styles.discoveryHub}>
              {/* 1. Trending Search Chips with Liquid Spring Physics */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {isVi ? 'Tìm kiếm thịnh hành' : 'Trending Searches'}
                </Text>
                <View style={styles.tagChipsWrap}>
                  {TRENDING_TAGS.map((tag) => (
                    <LiquidGlassButton
                      key={tag}
                      variant="pill"
                      size="sm"
                      onPress={() => handleSelectTag(tag)}
                      icon={<Ionicons name="trending-up-outline" size={13} color={colors.accent} />}
                      title={tag}
                      style={{ marginRight: 8, marginBottom: 8 }}
                    />
                  ))}
                </View>
              </View>

              {/* 2. Browse by Category with Liquid Glass Cards */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {isVi ? 'Khám phá theo Thể loại' : 'Browse Categories'}
                </Text>
                <View style={[styles.categoryGrid, { gap: catGap, justifyContent: isMobile ? 'space-between' : 'flex-start' }]}>
                  {SEARCH_CATEGORIES.map((cat) => (
                    <View
                      key={cat.id}
                      style={[
                        styles.categoryCardWrapper,
                        isMobile
                          ? { width: catCardWidth, minWidth: catCardWidth, maxWidth: catCardWidth, height: 86 }
                          : { width: windowWidth > 1100 ? '31.8%' : '48.5%', minWidth: 180, height: 96 },
                      ]}
                    >
                      <LiquidGlassCard
                        borderRadius={16}
                        onPress={() => handleSelectTag(cat.id)}
                        style={{ width: '100%', height: '100%' }}
                      >
                        <LinearGradient
                          colors={cat.colors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.categoryCardGradient}
                        >
                          <View style={styles.categoryCardHeader}>
                            <Text style={[styles.categoryCardTitle, isMobile && { fontSize: 14.5 }]} numberOfLines={1}>
                              {isVi ? cat.titleVi : cat.titleEn}
                            </Text>
                            <Text style={[styles.categoryCardSubtitle, isMobile && { fontSize: 11 }]} numberOfLines={1}>
                              {isVi ? cat.subtitleVi : cat.subtitleEn}
                            </Text>
                          </View>
                          <View style={styles.categoryCardIconBox}>
                            <Ionicons name={cat.icon} size={isMobile ? 22 : 28} color="rgba(255, 255, 255, 0.85)" />
                          </View>
                        </LinearGradient>
                      </LiquidGlassCard>
                    </View>
                  ))}
                </View>
              </View>

              {/* 3. Top Picks / Quick Play */}
              {suggestedSongs.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {isVi ? 'Gợi ý nghe nhanh' : 'Suggested for You'}
                  </Text>
                  <View style={[styles.suggestedBox, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                    {suggestedSongs.map((item: Song, idx: number) => {
                      const isActive = currentSong?._id === item._id;
                      return (
                        <TouchableOpacity
                          key={item._id}
                          style={[
                            styles.suggestedRow,
                            idx < suggestedSongs.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                            isActive && { backgroundColor: colors.activeItemBg },
                          ]}
                          onPress={() => playOrToggleSong(item, suggestedSongs)}
                          activeOpacity={0.7}
                        >
                          <CoverArt uri={item.coverArt} size={42} radius={6} />
                          <View style={styles.suggestedInfo}>
                            <Text style={[styles.resultTitle, { color: colors.text }, isActive && { fontWeight: '700' }]} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={[styles.resultArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                              {item.artist} • {item.category}
                            </Text>
                          </View>
                          <Ionicons
                            name={isActive && isPlaying ? 'pause-circle' : isActive ? 'play-circle' : 'play-circle-outline'}
                            size={24}
                            color={isActive ? colors.accent : colors.icon}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : !isSearching && searchResults.length === 0 ? (
            /* STATE 2: No Results Found */
            <View style={styles.emptyStateBox}>
              <Ionicons name="search-outline" size={48} color={colors.textTertiary} style={{ marginBottom: 12 }} />
              <Text style={[styles.noResultTitle, { color: colors.text }]}>
                {isVi ? 'Không tìm thấy kết quả' : 'No Results Found'}
              </Text>
              <Text style={[styles.hint, { color: colors.textTertiary }]}>
                {isVi ? `Không có bài hát nào khớp với "${query}". Thử tìm với từ khóa khác.` : `No songs matched "${query}". Try another search.`}
              </Text>
            </View>
          ) : (
            /* STATE 3: Search Results List */
            <View style={styles.resultsContainer}>
              <Text style={[styles.resultsCountText, { color: colors.textSecondary }]}>
                {isVi ? `${searchResults.length} kết quả tìm kiếm` : `${searchResults.length} results found`}
              </Text>
              {searchResults.map((item: Song) => {
                const isActive = currentSong?._id === item._id;
                return (
                  <TouchableOpacity
                    key={item._id}
                    style={[
                      styles.resultRow,
                      { borderBottomColor: colors.border },
                      isActive && [styles.resultRowActive, { backgroundColor: colors.activeItemBg }],
                    ]}
                    onPress={() => playOrToggleSong(item, searchResults)}
                    activeOpacity={0.8}
                  >
                    <CoverArt uri={item.coverArt} size={48} radius={6} />
                    <View style={styles.resultInfo}>
                      <Text
                        style={[styles.resultTitle, { color: colors.text }, isActive && { fontWeight: '700', color: colors.accent }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text style={[styles.resultArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.artist} {item.category ? `• ${item.category}` : ''}
                      </Text>
                    </View>
                    <Ionicons
                      name={isActive && isPlaying ? 'pause' : isActive ? 'play' : 'play-outline'}
                      size={22}
                      color={isActive ? colors.accent : colors.icon}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  headerAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1,
  },
  headerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 24,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    height: '100%',
    outlineStyle: 'none' as any,
  },

  // Discovery Hub Styles
  discoveryHub: {
    marginTop: 4,
  },
  sectionBlock: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  tagChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 13.5,
    fontWeight: '500',
  },

  // Category Grid Cards
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryCardWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  categoryCardGradient: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
    position: 'relative',
  },
  categoryCardHeader: {
    zIndex: 2,
  },
  categoryCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  categoryCardSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  categoryCardIconBox: {
    position: 'absolute',
    right: 12,
    bottom: 8,
    opacity: 0.9,
  },

  // Suggested Tracks Box
  suggestedBox: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  suggestedInfo: {
    flex: 1,
    marginLeft: 12,
  },

  // Search Results
  resultsContainer: {
    marginTop: 4,
  },
  resultsCountText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  resultRowActive: {
    borderRadius: 8,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 14,
  },
  resultTitle: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  resultArtist: {
    fontSize: 12.5,
    marginTop: 2,
  },

  // Empty state
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noResultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 360,
  },
});
