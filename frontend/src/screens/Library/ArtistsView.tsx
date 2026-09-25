import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import { resolveImageUri } from '../../components/CoverArt';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile, useIsWideDesktop } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';

export default function ArtistsView() {
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
  // Thẻ nghệ sĩ giãn theo màn hình thay vì chốt 156px.
  const isWide = useIsWideDesktop();
  const artistCardWidth = isMobile ? 148 : isWide ? 190 : 156;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const artists = useStore((state) => state.artists);
  const fetchArtists = useStore((state) => state.fetchArtists);

  useEffect(() => {
    fetchSongs();
    fetchArtists();
  }, [fetchSongs, fetchArtists]);

  const artistPhotoByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) map.set(a.name, a.photo);
    return map;
  }, [artists]);

  // Group songs into distinct Artists. Real Wikipedia photo when we have one;
  // otherwise a song cover -
  // never a fabricated photo standing in for a real person/act we don't have one for.
  const artistsList = useMemo(() => {
    const map = new Map<string, { name: string; songs: Song[]; coverArt?: string }>();
    songs.forEach((song) => {
      const artist = (song.artist || 'Nghệ sĩ').trim();
      const existing = map.get(artist);
      if (existing) {
        existing.songs.push(song);
        if (!existing.coverArt && song.coverArt) existing.coverArt = song.coverArt;
      } else {
        map.set(artist, {
          name: artist,
          songs: [song],
          coverArt: artistPhotoByName.get(artist) || song.coverArt,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs, artistPhotoByName]);

  const handlePlayAll = (songList: Song[]) => {
    if (songList.length > 0) playSong(songList[0], songList);
  };

  const handleShuffle = (songList: Song[]) => {
    if (songList.length > 0) {
      const shuffled = [...songList].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  };

  // State 1: Artist Detail View
  if (selectedArtist) {
    const artistData = artistsList.find((a) => a.name === selectedArtist);
    const artistSongs = artistData?.songs || [];

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: isMobile ? 18 : 36 }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedArtist(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={[styles.backBtnText, { color: colors.accent }]}>Tất cả nghệ sĩ</Text>
          </TouchableOpacity>

          <View style={styles.detailHeaderWrap}>
            <Image
              source={
                artistData?.coverArt
                  ? { uri: resolveImageUri(artistData.coverArt) }
                  : require('../../../assets/icon.png')
              }
              style={styles.artistBigAvatar}
            />
            <View style={styles.detailInfoWrap}>
              <Text style={[styles.detailBadge, { color: colors.accent }]}>NGHỆ SĨ</Text>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{selectedArtist}</Text>
              <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                {artistSongs.length} bài hát trong thư viện
              </Text>
              <View style={[styles.actionButtonGroup, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => handlePlayAll(artistSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={16} color="#ffffff" />
                  <Text style={styles.primaryActionBtnText}>Phát tất cả</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
                  onPress={() => handleShuffle(artistSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shuffle" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Xáo trộn</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 28 }]}>
            Tất cả bài hát của {selectedArtist}
          </Text>
          <View style={styles.tableWrap}>
            {artistSongs.map((song, idx) => (
              <SongTableRow
                key={song._id}
                index={idx + 1}
                song={song}
                colors={colors}
                isCurrent={currentSong?._id === song._id}
                isPlaying={isPlaying}
                isLiked={likedSongIds.includes(song._id)}
                onPlay={() => playOrToggleSong(song, artistSongs)}
                onToggleLike={() => toggleLike(song._id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // State 2: All Artists Grid
  const filteredArtists = artistsList.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: isMobile ? 18 : 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
        <View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>{t('artists')}</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            {artistsList.length} nghệ sĩ trong thư viện
          </Text>
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Tìm nghệ sĩ..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.icon} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.artistGridContainer}>
        {filteredArtists.map((artist) => (
          <TouchableOpacity
            key={artist.name}
            style={[styles.artistCard, { width: artistCardWidth, backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            onPress={() => setSelectedArtist(artist.name)}
            activeOpacity={0.8}
          >
            <Image
              source={
                artist.coverArt
                  ? { uri: resolveImageUri(artist.coverArt) }
                  : require('../../../assets/icon.png')
              }
              style={styles.artistRoundAvatar}
            />
            <Text style={[styles.artistNameText, { color: colors.text }]} numberOfLines={1}>
              {artist.name}
            </Text>
            <Text style={[styles.artistCountText, { color: colors.textSecondary }]}>
              {artist.songs.length} bài hát
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    minWidth: 220,
  },
  searchInput: {
    fontSize: 14,
    flex: 1,
  },
  artistGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  artistCard: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  artistRoundAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 12,
  },
  artistNameText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  artistCountText: {
    fontSize: 12,
    marginTop: 4,
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
  artistBigAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
