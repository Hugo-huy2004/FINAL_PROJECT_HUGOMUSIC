import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore, Song } from '../store/useStore';
import CoverArt from '../components/CoverArt';
import LicenseBadge from '../components/LicenseBadge';
import { useAppTheme } from '../theme/theme';
import LiquidGlassButton from '../components/LiquidGlass/LiquidGlassButton';
import LiquidGlassCard from '../components/LiquidGlass/LiquidGlassCard';
import { useTranslation, TranslationKey } from '../i18n/i18n';
import { useIsMobile, useIsWideDesktop } from '../utils/responsive';
import { UserAvatar } from '../components/UserAvatar';

const CATEGORIES = [
  'Tất cả',
  'Nhạc Phụng Vụ',
  'Hòa tấu',
  'Podcast',
  'Nhạc trẻ',
  'Quốc Ca',
  'Acoustic & Lofi',
];

const RICH_TILES: {
  id: string;
  categoryKey: TranslationKey;
  category: string;
  gradient: readonly [string, string];
  icon: any;
}[] = [
  {
    id: 'Nhạc Phụng Vụ',
    categoryKey: 'categoryLiturgical',
    category: 'Nhạc Phụng Vụ',
    gradient: ['#4a044e', '#2e0238'] as const,
    icon: 'book-outline',
  },
  {
    id: 'Hòa tấu',
    categoryKey: 'categoryInstrumental',
    category: 'Hòa tấu',
    gradient: ['#1e3a8a', '#0f172a'] as const,
    icon: 'musical-notes-outline',
  },
  {
    id: 'Podcast',
    categoryKey: 'categoryPodcast',
    category: 'Podcast',
    gradient: ['#3b1053', '#1b0526'] as const,
    icon: 'images-outline',
  },
  {
    id: 'Nhạc trẻ',
    categoryKey: 'categoryPop',
    category: 'Nhạc trẻ',
    gradient: ['#831843', '#500724'] as const,
    icon: 'flame-outline',
  },
  {
    id: 'Nhạc Quốc Tế',
    categoryKey: 'categoryInternational',
    category: 'Nhạc Quốc Tế',
    gradient: ['#0c4a6e', '#082f49'] as const,
    icon: 'globe-outline',
  },
  {
    id: 'Quốc Ca',
    categoryKey: 'categoryAnthems',
    category: 'Quốc Ca',
    gradient: ['#7f1d1d', '#450a0a'] as const,
    icon: 'flag-outline',
  },
  {
    id: 'Acoustic & Lofi',
    categoryKey: 'categoryAcoustic',
    category: 'Acoustic & Lofi',
    gradient: ['#064e3b', '#022c22'] as const,
    icon: 'cafe-outline',
  },
];

export default function HugoBrowseScreen({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const user = useStore((state) => state.user);
  const songs = useStore((state) => state.songs);
  const isLoadingSongs = useStore((state) => state.isLoadingSongs);
  const fetchSongs = useStore((state) => state.fetchSongs);
  const playSong = useStore((state) => state.playSong);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const currentSong = useStore((state) => state.currentSong);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);
  const selectedCategory = useStore((state) => state.selectedCategory);
  const setSelectedCategory = useStore((state) => state.setSelectedCategory);
  const isPlaying = useStore((state) => state.isPlaying);

  // Offline / Cache Store
  const offlineSongIds = useStore((state) => state.offlineSongIds);
  const offlineSongs = useStore((state) => state.offlineSongs);
  const isOfflineMode = useStore((state) => state.isOfflineMode);
  const toggleOfflineMode = useStore((state) => state.toggleOfflineMode);
  const downloadSongOffline = useStore((state) => state.downloadSongOffline);
  const removeSongOffline = useStore((state) => state.removeSongOffline);

  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // Màn rộng xếp 6 ô/hàng thay vì 3 — 7 danh mục vừa gọn hai hàng thay vì ba.
  const isWide = useIsWideDesktop();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const getCategoryLabel = (cat: string) => {
    if (cat === 'Tất cả') return t('categoryAll');
    if (cat === 'Nhạc Phụng Vụ') return t('categoryLiturgical');
    if (cat === 'Hòa tấu') return t('categoryInstrumental');
    if (cat === 'Podcast') return t('categoryPodcast');
    if (cat === 'Quốc Ca') return t('categoryAnthems');
    if (cat === 'Nhạc trẻ') return t('categoryPop');
    if (cat === 'Nhạc Quốc Tế') return t('categoryInternational');
    if (cat === 'Acoustic & Lofi') return t('categoryAcoustic');
    return cat;
  };

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const source = isOfflineMode ? offlineSongs : songs;
    const counts: Record<string, number> = { 'Tất cả': source.length };

    for (const song of source) {
      const cat = song.category || 'Acoustic & Lofi';
      if (cat === 'Nhạc Phụng Vụ' || cat === 'Thánh Ca' || cat.includes('Phụng Vụ') || cat === 'Tôn giáo') {
        counts['Nhạc Phụng Vụ'] = (counts['Nhạc Phụng Vụ'] || 0) + 1;
      } else if (cat === 'Hòa tấu') {
        counts['Hòa tấu'] = (counts['Hòa tấu'] || 0) + 1;
      } else if (cat === 'Podcast') {
        counts['Podcast'] = (counts['Podcast'] || 0) + 1;
      } else if (cat === 'Quốc Ca') {
        counts['Quốc Ca'] = (counts['Quốc Ca'] || 0) + 1;
      } else if (cat === 'Nhạc trẻ') {
        counts['Nhạc trẻ'] = (counts['Nhạc trẻ'] || 0) + 1;
      } else if (cat === 'Nhạc Quốc Tế') {
        counts['Nhạc Quốc Tế'] = (counts['Nhạc Quốc Tế'] || 0) + 1;
      } else {
        counts['Acoustic & Lofi'] = (counts['Acoustic & Lofi'] || 0) + 1;
      }
    }
    return counts;
  }, [songs, offlineSongs, isOfflineMode]);

  // Filter songs based on category and offline mode
  const categoryFilteredSongs = useMemo(() => {
    const source = isOfflineMode ? offlineSongs : songs;
    if (selectedCategory === 'Tất cả') return source;

    return source.filter((s) => {
      const cat = s.category || 'Acoustic & Lofi';
      if (selectedCategory === 'Nhạc Phụng Vụ') {
        return cat === 'Nhạc Phụng Vụ' || cat === 'Thánh Ca' || cat.includes('Phụng Vụ') || cat === 'Tôn giáo';
      }
      if (selectedCategory === 'Hòa tấu') {
        return cat === 'Hòa tấu';
      }
      if (selectedCategory === 'Podcast') {
        return cat === 'Podcast';
      }
      if (selectedCategory === 'Quốc Ca') {
        return cat === 'Quốc Ca';
      }
      if (selectedCategory === 'Nhạc trẻ') {
        return cat === 'Nhạc trẻ';
      }
      if (selectedCategory === 'Acoustic & Lofi') {
        return cat === 'Acoustic & Lofi' || cat === 'Nhạc Public';
      }
      return cat === selectedCategory;
    });
  }, [songs, offlineSongs, selectedCategory, isOfflineMode]);

  // Real countries present in the current category — only songs from the original
  // country-tagged catalogue import have this set, so the chip row only ever lists
  // countries that actually exist.
  const availableCountries = useMemo(() => {
    const set = new Set<string>();
    for (const s of categoryFilteredSongs) if (s.country) set.add(s.country);
    return Array.from(set).sort();
  }, [categoryFilteredSongs]);

  // Kho có 55 thể loại, đổ hết ra thì hàng chip tràn ngang màn hình và không
  // ai lọc nổi. Chỉ hiện những thể loại có đủ bài để lọc ra kết quả đáng xem,
  // xếp theo số bài giảm dần — thể loại chỉ 1-2 bài lọc xong cũng gần như rỗng.
  const availableGenres = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of categoryFilteredSongs) {
      if (s.genre) count.set(s.genre, (count.get(s.genre) || 0) + 1);
    }
    return Array.from(count.entries())
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name]) => name);
  }, [categoryFilteredSongs]);

  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [artistQuery, setArtistQuery] = useState('');

  useEffect(() => {
    // A country/genre chip from a different category wouldn't mean anything here.
    if (selectedCountry && !availableCountries.includes(selectedCountry)) setSelectedCountry(null);
  }, [availableCountries, selectedCountry]);

  useEffect(() => {
    if (selectedGenre && !availableGenres.includes(selectedGenre)) setSelectedGenre(null);
  }, [availableGenres, selectedGenre]);

  const displayedSongs = useMemo(() => {
    return categoryFilteredSongs.filter((s) => {
      if (selectedCountry && s.country !== selectedCountry) return false;
      if (selectedGenre && s.genre !== selectedGenre) return false;
      if (artistQuery.trim() && !s.artist?.toLowerCase().includes(artistQuery.trim().toLowerCase())) return false;
      return true;
    });
  }, [categoryFilteredSongs, selectedCountry, selectedGenre, artistQuery]);

  const handlePlay = (song: Song) => {
    playOrToggleSong(song, displayedSongs);
  };

  const handleDownloadToggle = async (song: Song) => {
    const isDownloaded = offlineSongIds.includes(song._id);
    setDownloadingId(song._id);
    try {
      if (isDownloaded) {
        await removeSongOffline(song._id);
      } else {
        await downloadSongOffline(song);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingHorizontal: isMobile ? 18 : 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with Title and User Avatar & Offline Icon Button */}
      <View style={styles.topHeaderRow}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>{t('browse')}</Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={[
              styles.headerIconBtn,
              {
                backgroundColor: isOfflineMode ? colors.activeItemBg : colors.cardBg,
                borderColor: isOfflineMode ? colors.accent : colors.cardBorder,
              },
            ]}
            onPress={toggleOfflineMode}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isOfflineMode ? 'cloud-offline' : 'cloud-done-outline'}
              size={18}
              color={isOfflineMode ? colors.accent : colors.icon}
            />
          </TouchableOpacity>

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
      </View>

      {/* Offline Mode Banner */}
      {isOfflineMode && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.iconActive} />
          <Text style={[styles.offlineBannerText, { color: colors.textSecondary }]}>
            {t('offlineBannerDesc', { count: offlineSongs.length })}
          </Text>
        </View>
      )}

      {/* Category Pills Filter Bar */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
          {CATEGORIES.filter((cat) => cat === 'Tất cả' || (categoryCounts[cat] || 0) > 0).map((cat) => {
            const isSelected = selectedCategory === cat;
            const count = categoryCounts[cat] || 0;
            return (
              <LiquidGlassButton
                key={cat}
                variant={isSelected ? 'primary' : 'pill'}
                size="sm"
                onPress={() => setSelectedCategory(cat)}
              >
                <View style={styles.pillInnerRow}>
                  <Text
                    style={[
                      styles.pillText,
                      { color: isSelected ? '#ffffff' : colors.text },
                      isSelected && { fontWeight: '700' },
                    ]}
                  >
                    {getCategoryLabel(cat)}
                  </Text>
                  <View
                    style={[
                      styles.pillBadge,
                      {
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : colors.activeItemBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillBadgeText,
                        { color: isSelected ? '#ffffff' : colors.textTertiary },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                </View>
              </LiquidGlassButton>
            );
          })}
        </ScrollView>
      </View>

      {/* 2-Column Apple Music Category Tiles with Liquid Glass & Water Droplet Physics */}
      <View style={styles.richTilesGrid}>
        {/* Chỉ hiện danh mục THỰC SỰ có bài. Sau các đợt dọn dữ liệu (bỏ nhạc
            phụng vụ, bỏ podcast, gỡ nhạc không tra được giấy phép) có 4/7 danh
            mục rỗng — hiện ô "0 bài" chỉ làm rối và trông như app hỏng. */}
        {RICH_TILES.filter((tile) => (categoryCounts[tile.category] || 0) > 0).map((tile) => {
          const isSelected = selectedCategory === tile.category;
          const count = categoryCounts[tile.category] || 0;
          return (
            <View
              key={tile.id}
              style={{
                width: isMobile ? '47%' : isWide ? '15%' : '31%',
                marginBottom: 12,
              }}
            >
              <LiquidGlassCard
                borderRadius={16}
                onPress={() => setSelectedCategory(tile.category)}
                glowColor={isSelected ? colors.accent : undefined}
                tint={isSelected ? 'rgba(16, 185, 129, 0.22)' : undefined}
                style={[
                  styles.richTile,
                  { width: '100%', marginBottom: 0 },
                  isSelected ? { borderColor: colors.accent, borderWidth: 2 } : null,
                ]}
              >
                <LinearGradient
                  colors={tile.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.richTileGradient}
                >
                  <View style={styles.richTileTopRow}>
                    <View style={styles.richTileIconWrap}>
                      <Ionicons name={tile.icon} size={16} color="#ffffff" />
                    </View>
                  </View>

                  <View style={styles.richTileBottom}>
                    <Text style={styles.richTileTitle} numberOfLines={1}>
                      {t(tile.categoryKey)}
                    </Text>
                    <Text style={styles.richTileCount}>
                      {count} {t('tracksCount')}
                    </Text>
                  </View>
                </LinearGradient>
              </LiquidGlassCard>
            </View>
          );
        })}
      </View>

      {/* Filter by country / artist — country chips only appear when the current
          category actually has real country-tagged songs (see availableCountries). */}
      {(availableCountries.length > 0 || categoryFilteredSongs.length > 0) && (
        <View style={styles.filterBar}>
          {availableCountries.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countryChipRow}>
              <TouchableOpacity
                style={[
                  styles.countryChip,
                  { borderColor: colors.cardBorder, backgroundColor: !selectedCountry ? colors.accent : colors.cardBg },
                ]}
                onPress={() => setSelectedCountry(null)}
              >
                <Text style={[styles.countryChipText, { color: !selectedCountry ? '#fff' : colors.text }]}>
                  Tất cả quốc gia
                </Text>
              </TouchableOpacity>
              {availableCountries.map((country) => (
                <TouchableOpacity
                  key={country}
                  style={[
                    styles.countryChip,
                    { borderColor: colors.cardBorder, backgroundColor: selectedCountry === country ? colors.accent : colors.cardBg },
                  ]}
                  onPress={() => setSelectedCountry(selectedCountry === country ? null : country)}
                >
                  <Text style={[styles.countryChipText, { color: selectedCountry === country ? '#fff' : colors.text }]}>
                    {country}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {availableGenres.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countryChipRow}>
              <TouchableOpacity
                style={[
                  styles.countryChip,
                  { borderColor: colors.cardBorder, backgroundColor: !selectedGenre ? colors.accent : colors.cardBg },
                ]}
                onPress={() => setSelectedGenre(null)}
              >
                <Text style={[styles.countryChipText, { color: !selectedGenre ? '#fff' : colors.text }]}>
                  Tất cả thể loại
                </Text>
              </TouchableOpacity>
              {availableGenres.map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={[
                    styles.countryChip,
                    { borderColor: colors.cardBorder, backgroundColor: selectedGenre === genre ? colors.accent : colors.cardBg },
                  ]}
                  onPress={() => setSelectedGenre(selectedGenre === genre ? null : genre)}
                >
                  <Text style={[styles.countryChipText, { color: selectedGenre === genre ? '#fff' : colors.text }]}>
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={[styles.artistFilterWrap, { borderColor: colors.cardBorder, backgroundColor: colors.cardBg }]}>
            <Ionicons name="mic-outline" size={15} color={colors.textSecondary} />
            <TextInput
              value={artistQuery}
              onChangeText={setArtistQuery}
              placeholder="Lọc theo nghệ sĩ..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.artistFilterInput, { color: colors.text }]}
            />
            {artistQuery.length > 0 && (
              <TouchableOpacity onPress={() => setArtistQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Song List Content */}
      {isLoadingSongs && !isOfflineMode ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.iconActive} size="large" />
      ) : displayedSongs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="musical-notes-outline" size={48} color={colors.icon} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {isOfflineMode
              ? 'Chưa có bài hát nào được tải ngoại tuyến trong mục này.'
              : 'Chưa có bài hát nào khớp với bộ lọc này.'}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
            {isOfflineMode
              ? 'Bấm vào biểu tượng tải xuống (mây) trên bài hát bất kỳ để nghe khi mất mạng.'
              : 'Bài hát mới từ R2 sẽ liên tục được cập nhật.'}
          </Text>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {displayedSongs.map((item) => {
            const isActive = currentSong?._id === item._id;
            const isLiked = likedSongIds.includes(item._id);
            const isDownloaded = offlineSongIds.includes(item._id);
            const isDownloading = downloadingId === item._id;

            return (
              <TouchableOpacity
                key={item._id}
                style={[
                  styles.songRow,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                  isActive && [styles.songRowActive, { backgroundColor: colors.activeItemBg }],
                ]}
                onPress={() => handlePlay(item)}
                activeOpacity={0.8}
              >
                <CoverArt uri={item.coverArt} size={54} radius={8} />

                <View style={styles.songInfo}>
                  <View style={styles.songTitleRow}>
                    {isActive && isPlaying && (
                      <View style={styles.miniEqualizer}>
                        <View style={[styles.miniEqBar, styles.miniEqBar1, { backgroundColor: colors.accent || '#10B981' }]} />
                        <View style={[styles.miniEqBar, styles.miniEqBar2, { backgroundColor: colors.accent || '#10B981' }]} />
                        <View style={[styles.miniEqBar, styles.miniEqBar3, { backgroundColor: colors.accent || '#10B981' }]} />
                      </View>
                    )}
                    <Text
                      style={[
                        styles.songTitle,
                        { color: isActive ? (colors.accent || '#10B981') : colors.text },
                        isActive && { fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.artist}
                  </Text>
                  <LicenseBadge song={item} color={colors.textTertiary} />
                  <View style={styles.metaRow}>
                    <View style={[styles.categoryBadge, { backgroundColor: colors.activeItemBg }]}>
                      <Text style={[styles.categoryBadgeText, { color: colors.textTertiary }]} numberOfLines={1}>
                        {item.category || 'Nhạc Public'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Actions: Download Offline & Like (100% Monochrome) */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDownloadToggle(item)}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={colors.iconActive} />
                    ) : (
                      <Ionicons
                        name={isDownloaded ? 'checkmark-circle' : 'cloud-download-outline'}
                        size={22}
                        color={isDownloaded ? colors.iconActive : colors.icon}
                      />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => toggleLike(item._id)}
                  >
                    <Ionicons
                      name={isLiked ? 'heart' : 'heart-outline'}
                      size={22}
                      color={isLiked ? colors.iconActive : colors.icon}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterBar: {
    marginBottom: 20,
    gap: 10,
  },
  countryChipRow: {
    flexDirection: 'row',
  },
  countryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  countryChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  artistFilterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: 320,
  },
  artistFilterInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  contentContainer: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 140,
  },
  topHeaderRow: {
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
  pageSubTitle: {
    fontSize: 13,
    marginTop: 4,
  },
  offlineToggleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  offlineBannerText: {
    fontSize: 12.5,
    flex: 1,
  },
  filterSection: {
    marginBottom: 22,
  },
  pillsContainer: {
    gap: 10,
    paddingVertical: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pillBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  // Apple Music 2-Column Category Grid (Screenshot 4)
  richTilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Dùng gap thay cho space-between: sau khi ẩn các danh mục rỗng, hàng chỉ
    // còn 3 ô mà space-between thì dàn chúng ra hai mép màn hình, cách nhau cả
    // khoảng trống lớn. gap giữ các ô nằm cạnh nhau dù còn bao nhiêu ô.
    gap: 12,
    marginBottom: 20,
  },
  richTile: {
    height: 84,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 2,
  },
  richTileGradient: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  richTileTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  richTileIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  richTileBottom: {
    justifyContent: 'flex-end',
  },
  richTileTitle: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  richTileCount: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  gridContainer: {
    gap: 10,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? ({
          transition: 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.22s ease, background-color 0.2s ease',
          cursor: 'pointer',
        } as any)
      : {}),
  },
  miniEqualizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    gap: 2,
    marginRight: 6,
  },
  miniEqBar: {
    width: 2.8,
    borderRadius: 1.5,
    minHeight: 3,
  },
  miniEqBar1: Platform.OS === 'web' ? ({
    animationKeyframes: 'eqBounce1',
    animationDuration: '0.75s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  } as any) : {},
  miniEqBar2: Platform.OS === 'web' ? ({
    animationKeyframes: 'eqBounce2',
    animationDuration: '0.88s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationDelay: '0.15s',
  } as any) : {},
  miniEqBar3: Platform.OS === 'web' ? ({
    animationKeyframes: 'eqBounce3',
    animationDuration: '0.68s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    animationDelay: '0.3s',
  } as any) : {},
  songRowActive: {
    borderRadius: 10,
  },
  songInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  songTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  songTitle: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  vipTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  vipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  songArtist: {
    fontSize: 12.5,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 6,
  },
  actionBtn: {
    padding: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 70,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
