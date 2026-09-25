import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile, useIsWideDesktop } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';

export default function AlbumsView() {
  const songs = useStore((state) => state.songs);
  const fetchSongs = useStore((state) => state.fetchSongs);
  const playSong = useStore((state) => state.playSong);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);

  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width: windowWidth } = useWindowDimensions();

  // Thẻ to hơn trên màn rộng thay vì chốt 172px cho mọi kích thước desktop —
  // trên màn 2560px thẻ 172px trông bé tí và bỏ phí chiều ngang.
  const isWide = useIsWideDesktop();
  const sidePadding = isMobile ? 16 : 36;
  const gap = isMobile ? 12 : 20;
  const cardWidth = isMobile
    ? Math.floor((windowWidth - sidePadding * 2 - gap) / 2)
    : isWide ? 210 : 172;

  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  // Group songs into distinct Albums (by Category + Artist). A "single" (one
  // artist, one track - the common case for historical/one-off performers) isn't a
  // real album; it's just a song, and shows up fine via the Songs tab with its
  // artist name right there - it doesn't need its own single-track album card here.
  const albumsList = useMemo(() => {
    const map = new Map<string, { key: string; title: string; artist: string; coverArt?: string; songs: Song[] }>();
    songs.forEach((song) => {
      const albumTitle = song.category ? `${song.category} Collection` : `${song.artist} Singles`;
      const key = `${song.artist}_${song.category || 'singles'}`;
      const existing = map.get(key);
      if (existing) {
        existing.songs.push(song);
        if (!existing.coverArt && song.coverArt) existing.coverArt = song.coverArt;
      } else {
        map.set(key, {
          key,
          title: albumTitle,
          artist: song.artist,
          coverArt: song.coverArt,
          songs: [song],
        });
      }
    });
    return Array.from(map.values()).filter((album) => album.songs.length > 1);
  }, [songs]);

  const handlePlayAll = (songList: Song[]) => {
    if (songList.length > 0) playSong(songList[0], songList);
  };

  const handleShuffle = (songList: Song[]) => {
    if (songList.length > 0) {
      const shuffled = [...songList].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  };

  // State 1: Album Detail View
  if (selectedAlbumKey) {
    const albumData = albumsList.find((a) => a.key === selectedAlbumKey);
    const albumSongs = albumData?.songs || [];

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedAlbumKey(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={[styles.backBtnText, { color: colors.accent }]}>Tất cả album</Text>
          </TouchableOpacity>

          <View style={styles.detailHeaderWrap}>
            <CoverArt uri={albumData?.coverArt} size={150} radius={14} />
            <View style={styles.detailInfoWrap}>
              <Text style={[styles.detailBadge, { color: colors.accent }]}>ALBUM</Text>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{albumData?.title}</Text>
              <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                {albumData?.artist} • {albumSongs.length} bài hát
              </Text>
              <View style={[styles.actionButtonGroup, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => handlePlayAll(albumSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={16} color="#ffffff" />
                  <Text style={styles.primaryActionBtnText}>Phát album</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
                  onPress={() => handleShuffle(albumSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shuffle" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Xáo trộn</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 28 }]}>
            Danh sách bài hát trong Album
          </Text>
          <View style={styles.tableWrap}>
            {albumSongs.map((song, idx) => (
              <SongTableRow
                key={song._id}
                index={idx + 1}
                song={song}
                colors={colors}
                isCurrent={currentSong?._id === song._id}
                isPlaying={isPlaying}
                isLiked={likedSongIds.includes(song._id)}
                onPlay={() => playOrToggleSong(song, albumSongs)}
                onToggleLike={() => toggleLike(song._id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // State 2: All Albums Grid
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.mainTitle, { color: colors.text }]}>{t('albums')}</Text>
            <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
              {albumsList.length} album được tổng hợp
            </Text>
          </View>
        </View>

        <View style={[styles.gridContainer, { gap }]}>
          {albumsList.map((album) => (
            <TouchableOpacity
              key={album.key}
              style={[styles.albumCard, { width: cardWidth }]}
              onPress={() => setSelectedAlbumKey(album.key)}
              activeOpacity={0.82}
            >
              <View
                style={[
                  styles.albumCoverWrapper,
                  {
                    width: cardWidth,
                    height: cardWidth,
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <CoverArt uri={album.coverArt} size={cardWidth} radius={10} />
              </View>
              <Text style={[styles.cardTitleText, { color: colors.text }]} numberOfLines={1}>
                {album.title}
              </Text>
              <Text style={[styles.cardSubText, { color: colors.textSecondary }]} numberOfLines={1}>
                {album.artist}
              </Text>
              <Text style={[styles.cardCategoryText, { color: colors.accent }]} numberOfLines={1}>
                {album.songs.length} bài hát
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 28,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 16,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 14,
    marginTop: 4,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  albumCard: {
    marginBottom: 16,
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
  cardTitleText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  cardSubText: {
    fontSize: 13,
    marginTop: 2,
  },
  cardCategoryText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    flexWrap: 'wrap',
  },
  detailInfoWrap: {
    flex: 1,
    minWidth: 240,
  },
  detailBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  detailMeta: {
    fontSize: 14,
    marginTop: 6,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  secondaryActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  tableWrap: {
    marginTop: 4,
  },
});
