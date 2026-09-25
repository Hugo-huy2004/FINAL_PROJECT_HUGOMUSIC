import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';
import LiquidGlassCard from '../../components/LiquidGlass/LiquidGlassCard';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import WaterDropletBadge from '../../components/LiquidGlass/WaterDropletBadge';

export default function RecentlyAddedView() {
  const songs = useStore((state) => state.songs);
  const fetchSongs = useStore((state) => state.fetchSongs);
  const playSong = useStore((state) => state.playSong);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);

  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width: windowWidth } = useWindowDimensions();

  // View mode: Grid (2-column Apple Music square albums) or List (Compact song list)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Exact 2-column calculation on mobile with guaranteed fit (no wrapping to 1 card)
  const sidePadding = isMobile ? 16 : 36;
  const gap = isMobile ? 12 : 20;
  const cardWidth = isMobile ? Math.floor((windowWidth - sidePadding * 2 - gap) / 2) : 172;

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const recentSongs = useMemo(() => {
    return [...songs].reverse().slice(0, 30);
  }, [songs]);

  const handlePlayAll = () => {
    if (recentSongs.length > 0) {
      playSong(recentSongs[0], recentSongs);
    }
  };

  const handleShuffle = () => {
    if (recentSongs.length > 0) {
      const shuffled = [...recentSongs].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: Title & Action Controls */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <Text style={[styles.mainTitle, { color: colors.text }]}>{t('recentlyAdded')}</Text>
            <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
              {recentSongs.length} bài hát • Đã cập nhật gần đây
            </Text>
          </View>

          <View style={styles.controlsRow}>
            {/* Play All & Shuffle Buttons */}
            <View style={styles.actionButtonGroup}>
              <LiquidGlassButton
                variant="primary"
                size="sm"
                title="Phát tất cả"
                icon={<Ionicons name="play" size={15} color="#ffffff" />}
                onPress={handlePlayAll}
              />

              <LiquidGlassButton
                variant="pill"
                size="sm"
                title="Xáo trộn"
                icon={<Ionicons name="shuffle" size={15} color={colors.accent} />}
                onPress={handleShuffle}
              />
            </View>

            {/* View Mode Switcher: Grid vs List */}
            <View
              style={[
                styles.viewModeToggle,
                { backgroundColor: colors.cardBg, borderColor: colors.border },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.viewModeBtn,
                  viewMode === 'grid' && [styles.viewModeBtnActive, { backgroundColor: colors.surface }],
                ]}
                onPress={() => setViewMode('grid')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="grid"
                  size={15}
                  color={viewMode === 'grid' ? colors.accent : colors.textTertiary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.viewModeBtn,
                  viewMode === 'list' && [styles.viewModeBtnActive, { backgroundColor: colors.surface }],
                ]}
                onPress={() => setViewMode('list')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="list"
                  size={17}
                  color={viewMode === 'list' ? colors.accent : colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Content: Grid or List */}
        {viewMode === 'grid' ? (
          <View style={[styles.gridContainer, { gap }]}>
            {recentSongs.map((song) => {
              const isCurrent = currentSong?._id === song._id;
              const isPlayingCurrent = isCurrent && isPlaying;
              return (
                <LiquidGlassCard
                  key={song._id}
                  borderRadius={18}
                  glowColor={isPlayingCurrent ? 'rgba(16, 185, 129, 0.4)' : 'transparent'}
                  tint={isDark ? 'rgba(28, 28, 34, 0.72)' : 'rgba(255, 255, 255, 0.85)'}
                  style={[
                    styles.albumGlassCard,
                    {
                      width: cardWidth,
                      borderColor: isPlayingCurrent
                        ? '#10B981'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(0, 0, 0, 0.06)',
                    },
                  ]}
                  onPress={() => playOrToggleSong(song, recentSongs)}
                >
                  <View
                    style={[
                      styles.albumCoverWrapper,
                      {
                        width: cardWidth - 16,
                        height: cardWidth - 16,
                        backgroundColor: colors.cardBg,
                      },
                    ]}
                  >
                    {/* Spinning Mini Vinyl Behind Art during Playback */}
                    {isPlayingCurrent && Platform.OS === 'web' && (
                      <View
                        style={[
                          styles.miniSpinningVinyl,
                          {
                            animationKeyframes: 'vinylSpin',
                            animationDuration: '8s',
                            animationTimingFunction: 'linear',
                            animationIterationCount: 'infinite',
                          } as any,
                        ]}
                      >
                        <View style={styles.miniVinylGroove} />
                        <View style={styles.miniVinylCenter}>
                          <CoverArt uri={song.coverArt} size={18} radius={9} />
                        </View>
                      </View>
                    )}

                    <CoverArt uri={song.coverArt} size={cardWidth - 16} radius={12} />

                    {/* Active WaterDroplet Status Badge */}
                    {isPlayingCurrent && (
                      <View style={styles.playingBadgeWrapper}>
                        <WaterDropletBadge
                          label="Đang phát"
                          color="#10B981"
                          size="sm"
                          pulsing={true}
                        />
                      </View>
                    )}

                    {/* Active / Hover Play Overlay */}
                    <View style={[styles.playOverlay, isCurrent && styles.playOverlayActive]}>
                      <View
                        style={[
                          styles.playButtonCircle,
                          Platform.OS === 'web' && ({
                            background: isPlayingCurrent
                              ? 'radial-gradient(circle at 35% 30%, #34D399 0%, #10B981 60%, #059669 100%)'
                              : 'rgba(0, 0, 0, 0.65)',
                            boxShadow: isPlayingCurrent ? '0 0 16px rgba(16, 185, 129, 0.85)' : 'none',
                          } as any),
                        ]}
                      >
                        <Ionicons
                          name={isPlayingCurrent ? 'pause' : 'play'}
                          size={18}
                          color="#ffffff"
                          style={{ marginLeft: isPlayingCurrent ? 0 : 2 }}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardInfoPadding}>
                    <Text style={[styles.cardTitleText, { color: colors.text }]} numberOfLines={1}>
                      {song.title}
                    </Text>
                    <Text style={[styles.cardSubText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {song.artist}
                    </Text>
                    <Text style={[styles.cardCategoryText, { color: colors.accent }]} numberOfLines={1}>
                      {song.category || 'Âm nhạc'}
                    </Text>
                  </View>
                </LiquidGlassCard>
              );
            })}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {recentSongs.map((song, index) => (
              <SongTableRow
                key={song._id}
                index={index + 1}
                song={song}
                colors={colors}
                isCurrent={currentSong?._id === song._id}
                isPlaying={isPlaying}
                isLiked={likedSongIds.includes(song._id)}
                onPlay={() => playOrToggleSong(song, recentSongs)}
                onToggleLike={() => toggleLike(song._id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 110,
  },
  header: {
    marginBottom: 20,
    gap: 14,
  },
  headerTitleGroup: {
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 13.5,
    marginTop: 3,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
      } as any,
      default: {},
    }),
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewModeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeBtnActive: {
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
      } as any,
      default: {
        elevation: 2,
      },
    }),
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  albumCard: {
    marginBottom: 16,
  },
  albumGlassCard: {
    padding: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  miniSpinningVinyl: {
    position: 'absolute',
    right: -12,
    top: 4,
    width: '65%',
    height: '65%',
    borderRadius: 999,
    backgroundColor: '#0c0d0e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 1,
  },
  miniVinylGroove: {
    position: 'absolute',
    width: '78%',
    height: '78%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  miniVinylCenter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000000',
  },
  playingBadgeWrapper: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
  },
  cardInfoPadding: {
    width: '100%',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  albumCoverWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
  },
  playOverlayActive: {
    opacity: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  playButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(7, 102, 83, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      } as any,
      default: {},
    }),
  },
  cardTitleText: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 7,
  },
  cardSubText: {
    fontSize: 12,
    marginTop: 2,
  },
  cardCategoryText: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  listContainer: {
    width: '100%',
  },
});
