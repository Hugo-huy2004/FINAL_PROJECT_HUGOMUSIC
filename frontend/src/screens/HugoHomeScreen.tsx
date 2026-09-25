import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useStore, Song } from '../store/useStore';
import CoverArt from '../components/CoverArt';
import { UserAvatar } from '../components/UserAvatar';
import { useAppTheme, ThemeColors } from '../theme/theme';
import { useTranslation } from '../i18n/i18n';
import { useIsMobile, useGrid } from '../utils/responsive';


import LiquidGlassCard from '../components/LiquidGlass/LiquidGlassCard';

// ---------------------------------------------------------------------------
// 1. Apple Music Square Album Card with 120fps Liquid Glass Physics
// ---------------------------------------------------------------------------
function SquareAlbumCard({
  song,
  colors,
  cardWidth,
  isCurrent,
  isPlaying,
  onPress,
  hasLyrics,
}: {
  song: Song;
  colors: ThemeColors;
  cardWidth: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPress: () => void;
  hasLyrics?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.albumCard, { width: cardWidth }]}>
      <LiquidGlassCard
        borderRadius={14}
        onPress={onPress}
        glowColor={isCurrent ? colors.accent : undefined}
        tint={isCurrent ? 'rgba(16, 185, 129, 0.14)' : undefined}
        style={{
          width: cardWidth,
          height: cardWidth,
          borderColor: isCurrent ? colors.accent : colors.cardBorder,
        }}
      >
        <View style={[styles.albumCoverWrapper, { width: cardWidth, height: cardWidth }]}>
          <CoverArt uri={song.coverArt} size={cardWidth} radius={14} />

          {/* Hover / Active Play Button Overlay */}
          <View style={[styles.playHoverOverlay, isCurrent && styles.playHoverOverlayActive]}>
            <View style={[styles.playButtonCircle, { backgroundColor: colors.accent }]}>
              <Ionicons
                name={isCurrent && isPlaying ? 'pause' : 'play'}
                size={18}
                color="#ffffff"
                style={{ marginLeft: isCurrent && isPlaying ? 0 : 2 }}
              />
            </View>
          </View>

          {hasLyrics && (
            <View style={styles.lyricsBadge}>
              <MaterialIcons name="lyrics" size={11} color="#ffffff" style={{ marginRight: 3 }} />
              <Text style={styles.lyricsBadgeText}>{t('lyricsBadge')}</Text>
            </View>
          )}

        </View>
      </LiquidGlassCard>

      <Text style={[styles.albumTitle, { color: colors.text }]} numberOfLines={1}>
        {song.title}
      </Text>
      <Text style={[styles.albumArtist, { color: colors.textSecondary }]} numberOfLines={1}>
        {song.artist || 'Hugo Music'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Apple Music Circular Artist Card as Water Droplet Orb
// ---------------------------------------------------------------------------
function ArtistCircleCard({
  song,
  colors,
  onPress,
  realPhoto,
}: {
  song: Song;
  colors: ThemeColors;
  onPress: () => void;
  realPhoto?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.artistCard}>
      <LiquidGlassCard
        borderRadius={64}
        onPress={onPress}
        style={{ width: 128, height: 128, borderRadius: 64 }}
      >
        <View style={styles.artistAvatarWrapper}>
          <CoverArt uri={realPhoto || song.coverArt} size={128} radius={64} />
        </View>
      </LiquidGlassCard>
      <Text style={[styles.artistName, { color: colors.text }]} numberOfLines={1}>
        {song.artist}
      </Text>
      <Text style={[styles.artistRole, { color: colors.textSecondary }]}>{t('artistRole')}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main HugoHomeScreen Component
// ---------------------------------------------------------------------------
export default function HugoHomeScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const songs = useStore((state) => state.songs);
  const fetchSongs = useStore((state) => state.fetchSongs);
  const historySongs = useStore((state) => state.historySongs);
  const currentSong = useStore((state) => state.currentSong);
  const user = useStore((state) => state.user);
  const setLoginModalVisible = useStore((state) => state.setLoginModalVisible);
  const isPlaying = useStore((state) => state.isPlaying);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const playSong = useStore((state) => state.playSong);
  const artists = useStore((state) => state.artists);
  const fetchArtists = useStore((state) => state.fetchArtists);

  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    fetchSongs();
    fetchArtists();
  }, [fetchSongs, fetchArtists]);

  const artistPhotoByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) map.set(a.name, a.photo);
    return map;
  }, [artists]);

  // Số cột suy từ bề rộng cửa sổ thật (xem utils/responsive.ts) thay vì chốt
  // cứng 5 cột: màn rộng thì thêm cột chứ không phóng to thẻ.
  const { cardWidth: albumCardWidth, contentWidth, sidePadding, columns } = useGrid();
  // Số bài mỗi mục phải chia hết cho số cột, nếu không hàng cuối còn vài thẻ lẻ
  // loi giữa khoảng trống — màn 1920px có 8 cột mà chốt 10 bài thì dư đúng 2 thẻ.
  const rowCount = columns * 2;

  // Unique artists for editorial cards & artists section
  const uniqueArtists = useMemo(() => {
    const map = new Map<string, Song>();
    for (const s of songs) {
      // Podcast show names aren't musical artists - keep them out of this grid.
      if (s.artist && s.category !== 'Podcast' && !map.has(s.artist)) {
        map.set(s.artist, s);
      }
    }
    return Array.from(map.values());
  }, [songs]);

  const artist1 = uniqueArtists[0] || {
    artist: 'Kacey Musgraves',
    coverArt: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
  };

  const artist2 = uniqueArtists[1] || {
    artist: 'Kamasi Washington',
    coverArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  };

  // Top artists names for Card 1 "New Music Mix"
  const newMusicArtistsList = useMemo(() => {
    const names = uniqueArtists.slice(0, 7).map((a) => a.artist);
    if (names.length === 0) return 'Billie Eilish, Omar Apollo, ZAYN, The Weeknd, Olivia Rodrigo';
    return names.join(', ');
  }, [uniqueArtists]);

  // Podcast episodes are long-form spoken audio with their own section elsewhere —
  // never a stand-in for "songs" in these fallbacks (a 40min news episode showing up
  // under "New Releases" or "Classical Masterworks" is exactly the wrong-content bug).
  const nonPodcastSongs = useMemo(() => songs.filter((s) => s.category !== 'Podcast'), [songs]);

  // Recently Played: uses play history if available, otherwise latest songs
  const recentlyPlayed = useMemo(() => {
    if (historySongs && historySongs.length > 0) {
      return historySongs.slice(0, rowCount);
    }
    return nonPodcastSongs.slice(0, rowCount);
  }, [historySongs, nonPodcastSongs, rowCount]);

  // New Releases: subsequent batch of songs
  const newReleases = useMemo(() => {
    if (nonPodcastSongs.length > 10) {
      return nonPodcastSongs.slice(10, 20);
    }
    return nonPodcastSongs.slice(0, rowCount);
  }, [nonPodcastSongs, rowCount]);

  // Curated tracks with synchronized karaoke lyrics
  const karaokeSongs = useMemo(() => {
    return songs
      .filter(
        (s) =>
          s.artist === 'Josh Woodward' ||
          s.artist === 'Brad Sucks' ||
          s.category === 'Acoustic & Lofi' ||
          s.category === 'Nhạc trẻ'
      )
      .slice(0, rowCount);
  }, [songs]);

  const isSongWithLyrics = (s: Song) => {
    return (
      s.artist === 'Josh Woodward' ||
      s.artist === 'Brad Sucks' ||
      s.category === 'Acoustic & Lofi' ||
      s.category === 'Nhạc trẻ'
    );
  };

  // Classical & Instrumental curated picks
  const classicalPicks = useMemo(() => {
    const filtered = nonPodcastSongs.filter(
      (s) => s.category === 'Hòa tấu' || s.category?.includes('Cổ điển') || s.category === 'Classical'
    );
    return filtered.length > 0 ? filtered.slice(0, rowCount) : nonPodcastSongs.slice(0, rowCount);
  }, [nonPodcastSongs, rowCount]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingHorizontal: sidePadding, paddingBottom: 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* --------------------------------------------------------------------- */}
      {/* 1. Page Header: "Home" (Apple Music Style)                             */}
      {/* --------------------------------------------------------------------- */}
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>
          {t('home')}
        </Text>
        {/* Account button, as in Apple Music: the only sign-in entry on mobile, where
            there is no sidebar. */}
        {isMobile && (
          <TouchableOpacity
            onPress={() => (user ? onNavigate?.('account') : setLoginModalVisible(true))}
            accessibilityRole="button"
            accessibilityLabel={user ? t('account') : t('login')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {user ? (
              <UserAvatar avatarUrl={user.avatarUrl} username={user.username} nickname={user.nickname} size={34} />
            ) : (
              <Ionicons name="person-circle" size={36} color={colors.accent} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* --------------------------------------------------------------------- */}
      {/* 3. Section: Recently Played (Screenshot 1 & 2)                         */}
      {/* --------------------------------------------------------------------- */}
      {recentlyPlayed.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitleText, { color: colors.text }]}>
              {t('recentlyPlayed')}
            </Text>
          </View>

          <View style={styles.gridRow}>
            {recentlyPlayed.map((song) => {
              const isCurrent = currentSong?._id === song._id;
              return (
                <SquareAlbumCard
                  key={song._id}
                  song={song}
                  colors={colors}
                  cardWidth={albumCardWidth}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  hasLyrics={isSongWithLyrics(song)}
                  onPress={() => playOrToggleSong(song, recentlyPlayed)}
                />
              );
            })}
          </View>
        </View>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3.5. Section: Live Synced Karaoke Lyrics (Hát cùng Hugo Music)         */}
      {/* --------------------------------------------------------------------- */}
      {karaokeSongs.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionTitleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.karaokeHeaderIconPill}>
                <Ionicons name="mic" size={13} color="#10B981" />
              </View>
              <Text style={[styles.sectionTitleText, { color: colors.text }]}>
                {t('singAlongWithHugo')}
              </Text>
            </View>
          </View>

          <View style={styles.gridRow}>
            {karaokeSongs.map((song) => {
              const isCurrent = currentSong?._id === song._id;
              return (
                <SquareAlbumCard
                  key={`karaoke-${song._id}`}
                  song={song}
                  colors={colors}
                  cardWidth={albumCardWidth}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  hasLyrics={true}
                  onPress={() => playOrToggleSong(song, karaokeSongs)}
                />
              );
            })}
          </View>
        </View>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. Section: New Releases / Albums (Screenshot 2)                      */}
      {/* --------------------------------------------------------------------- */}
      {newReleases.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitleText, { color: colors.text }]}>
              {t('newReleases')}
            </Text>
            <TouchableOpacity onPress={() => onNavigate('new')} activeOpacity={0.7}>
              <Text style={[styles.seeAllText, { color: colors.accent }]}>
                {t('seeAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            {newReleases.map((song) => {
              const isCurrent = currentSong?._id === song._id;
              return (
                <SquareAlbumCard
                  key={`new-${song._id}`}
                  song={song}
                  colors={colors}
                  cardWidth={albumCardWidth}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  onPress={() => playOrToggleSong(song, newReleases)}
                />
              );
            })}
          </View>
        </View>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 5. Section: Favorite Artists (Nghệ sĩ yêu thích)                       */}
      {/* --------------------------------------------------------------------- */}
      {uniqueArtists.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitleText, { color: colors.text }]}>
              {t('favoriteArtists')}
            </Text>
            <TouchableOpacity onPress={() => onNavigate('artists')} activeOpacity={0.7}>
              <Text style={[styles.seeAllText, { color: colors.accent }]}>
                {t('seeAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artistScrollRow}>
            {uniqueArtists.slice(0, columns * 2).map((artistSong) => (
              <ArtistCircleCard
                key={`artist-${artistSong._id}`}
                song={artistSong}
                colors={colors}
                realPhoto={artistPhotoByName.get(artistSong.artist)}
                onPress={() => {
                  const filtered = songs.filter((s) => s.artist === artistSong.artist);
                  playOrToggleSong(filtered[0] || artistSong, filtered.length ? filtered : songs);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 6. Section: Classical & Masterworks Curated Picks                     */}
      {/* --------------------------------------------------------------------- */}
      {classicalPicks.length > 0 && (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitleText, { color: colors.text }]}>
              {t('classicalMasterworks')}
            </Text>
          </View>

          <View style={styles.gridRow}>
            {classicalPicks.map((song) => {
              const isCurrent = currentSong?._id === song._id;
              return (
                <SquareAlbumCard
                  key={`classic-${song._id}`}
                  song={song}
                  colors={colors}
                  cardWidth={albumCardWidth}
                  isCurrent={isCurrent}
                  isPlaying={isPlaying}
                  onPress={() => playOrToggleSong(song, classicalPicks)}
                />
              );
            })}
          </View>
        </View>
      )}

    </ScrollView>
  );
}


// ---------------------------------------------------------------------------
// Styles: Pure Apple Music macOS / Web Design System
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 26,
  },

  // Header
  headerRow: {
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },

  // General Section
  sectionContainer: {
    marginBottom: 38,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  albumCard: {
    marginBottom: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
      default: {},
    }),
  },
  albumCoverWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },
  albumTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
    letterSpacing: -0.15,
  },
  albumArtist: {
    fontSize: 12.5,
    fontWeight: '400',
  },

  // Play Hover Overlay
  playHoverOverlay: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    opacity: 0,
    ...Platform.select({
      web: {
        transition: 'opacity 0.2s ease',
      } as any,
      default: {},
    }),
  },
  playHoverOverlayActive: {
    opacity: 1,
  },
  playButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
      } as any,
      default: {
        elevation: 4,
      },
    }),
  },
  vipBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  vipText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700',
  },

  // Artist Circle Card
  artistScrollRow: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 4,
  },
  artistCard: {
    alignItems: 'center',
    width: 128,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
      default: {},
    }),
  },
  artistAvatarWrapper: {
    width: 128,
    height: 128,
    borderRadius: 64,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)',
      } as any,
      default: {
        elevation: 4,
      },
    }),
  },
  artistName: {
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  artistRole: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },

  // Lyrics Badge on Album Cover
  lyricsBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    zIndex: 4,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
      } as any,
      default: {},
    }),
  },
  lyricsBadgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  karaokeHeaderIconPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
