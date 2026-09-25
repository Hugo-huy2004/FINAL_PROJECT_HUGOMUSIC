import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStore, Song, Playlist } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import { showAlert, confirmAlert } from '../../utils/alert';
import { useAppTheme } from '../../theme/theme';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';

export default function PlaylistsView() {
  const user = useStore((state) => state.user);
  const setLoginModalVisible = useStore((state) => state.setLoginModalVisible);
  const likedSongs = useStore((state) => state.likedSongs);
  const likedSongIds = useStore((state) => state.likedSongIds);
  const toggleLike = useStore((state) => state.toggleLike);
  const playlists = useStore((state) => state.playlists);
  const fetchPlaylists = useStore((state) => state.fetchPlaylists);
  const fetchLikedSongs = useStore((state) => state.fetchLikedSongs);
  const createPlaylist = useStore((state) => state.createPlaylist);
  const deletePlaylist = useStore((state) => state.deletePlaylist);
  const removeSongFromPlaylist = useStore((state) => state.removeSongFromPlaylist);

  const playSong = useStore((state) => state.playSong);
  const playOrToggleSong = useStore((state) => state.playOrToggleSong);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const artists = useStore((state) => state.artists);
  const fetchArtists = useStore((state) => state.fetchArtists);

  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { width: windowWidth } = useWindowDimensions();

  const sidePadding = isMobile ? 16 : 36;
  const gap = isMobile ? 12 : 20;
  const cardWidth = isMobile ? Math.floor((windowWidth - sidePadding * 2 - gap) / 2) : 172;
  const imageSize = isMobile ? cardWidth - 16 : 160;

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    if (user) {
      fetchPlaylists();
      fetchLikedSongs();
    }
    fetchArtists();
  }, [user, fetchPlaylists, fetchLikedSongs, fetchArtists]);

  const artistPhotoByName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists) map.set(a.name, a.photo);
    return map;
  }, [artists]);

  // A playlist's real artist photo only makes sense when every song in it shares
  // one artist (a show/composer playlist) - a mixed-artist playlist (e.g. by
  // country) has no single "the artist" to show a photo for.
  const playlistCoverFor = (plSongs: Song[]): string | undefined => {
    if (plSongs.length === 0) return undefined;
    const firstArtist = plSongs[0].artist;
    const sameArtist = plSongs.every((s) => s.artist === firstArtist);
    if (sameArtist) {
      const photo = artistPhotoByName.get(firstArtist);
      if (photo) return photo;
    }
    return plSongs[0].coverArt;
  };

  const handlePlayAll = (songList: Song[]) => {
    if (songList.length > 0) playSong(songList[0], songList);
  };

  const handleShuffle = (songList: Song[]) => {
    if (songList.length > 0) {
      const shuffled = [...songList].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  };

  const handleCreatePlaylistSubmit = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim()).catch((e) => showAlert(e.message));
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
  };

  // State 1: Playlist Detail View (or Liked Songs)
  if (selectedPlaylistId) {
    const isLikedList = selectedPlaylistId === 'liked_songs';
    const plData = isLikedList
      ? { _id: 'liked_songs', name: 'Bài hát yêu thích', songs: likedSongs }
      : playlists.find((p) => p._id === selectedPlaylistId);
    const plSongs = plData?.songs || [];

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedPlaylistId(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={[styles.backBtnText, { color: colors.accent }]}>Tất cả playlist</Text>
          </TouchableOpacity>

          <View style={styles.detailHeaderWrap}>
            {isLikedList ? (
              <LinearGradient
                colors={['#FF2D55', '#AF52DE']}
                style={styles.playlistDetailGradientCover}
              >
                <Ionicons name="heart" size={64} color="#ffffff" />
              </LinearGradient>
            ) : (
              <CoverArt uri={playlistCoverFor(plSongs)} size={150} radius={14} />
            )}

            <View style={styles.detailInfoWrap}>
              <Text style={[styles.detailBadge, { color: colors.accent }]}>PLAYLIST</Text>
              <Text style={[styles.detailTitle, { color: colors.text }]}>{plData?.name}</Text>
              <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                {user?.nickname || user?.username || 'Hugo User'} • {plSongs.length} bài hát
              </Text>

              <View style={[styles.actionButtonGroup, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => handlePlayAll(plSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={16} color="#ffffff" />
                  <Text style={styles.primaryActionBtnText}>Phát playlist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
                  onPress={() => handleShuffle(plSongs)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="shuffle" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Xáo trộn</Text>
                </TouchableOpacity>

                {!isLikedList && (
                  <TouchableOpacity
                    style={[styles.secondaryActionBtn, { borderColor: '#FF3B30', backgroundColor: colors.cardBg }]}
                    onPress={async () => {
                      if (await confirmAlert(`Xóa playlist "${plData?.name}"?`)) {
                        await deletePlaylist(plData!._id);
                        setSelectedPlaylistId(null);
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 28 }]}>
            Danh sách bài hát ({plSongs.length})
          </Text>

          {plSongs.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
              <Ionicons name="musical-notes-outline" size={36} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Playlist này hiện chưa có bài hát nào.
              </Text>
            </View>
          ) : (
            <View style={styles.tableWrap}>
              {plSongs.map((song, idx) => (
                <SongTableRow
                  key={song._id}
                  index={idx + 1}
                  song={song}
                  colors={colors}
                  isCurrent={currentSong?._id === song._id}
                  isPlaying={isPlaying}
                  isLiked={likedSongIds.includes(song._id)}
                  onPlay={() => playOrToggleSong(song, plSongs)}
                  onToggleLike={() => toggleLike(song._id)}
                  onRemoveFromPlaylist={
                    !isLikedList
                      ? () => removeSongFromPlaylist(plData!._id, song._id)
                      : undefined
                  }
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // State 2: All Playlists Grid
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
        <View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>{t('allPlaylists')}</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Tất cả danh sách phát của bạn
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
          onPress={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
          activeOpacity={0.8}
        >
          <Ionicons name={isCreatingPlaylist ? 'close' : 'add'} size={18} color="#ffffff" />
          <Text style={styles.primaryActionBtnText}>
            {isCreatingPlaylist ? 'Hủy' : 'Tạo Playlist mới'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inline Create Playlist Form */}
      {isCreatingPlaylist && (
        <View style={[styles.createPlaylistCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <TextInput
            style={[
              styles.createPlaylistInput,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Nhập tên playlist mới..."
            placeholderTextColor={colors.textTertiary}
            value={newPlaylistName}
            onChangeText={setNewPlaylistName}
            onSubmitEditing={handleCreatePlaylistSubmit}
            autoFocus
          />
          <LiquidGlassButton
            variant="primary"
            size="md"
            title="Tạo"
            onPress={handleCreatePlaylistSubmit}
          />
        </View>
      )}

      <View style={styles.gridContainer}>
        {/* Featured Liked Songs Card */}
        <TouchableOpacity
          style={[
            styles.gridCard,
            styles.likedSongsSpecialCard,
            { width: cardWidth, padding: isMobile ? 8 : 10, borderColor: colors.cardBorder },
          ]}
          onPress={() => setSelectedPlaylistId('liked_songs')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#FF2D55', '#AF52DE']}
            style={[styles.likedSongsCardGradient, { height: imageSize }]}
          >
            <Ionicons name="heart" size={isMobile ? 44 : 54} color="#ffffff" />
          </LinearGradient>
          <Text style={[styles.cardTitleText, { color: colors.text, marginTop: 10 }]} numberOfLines={1}>
            Bài hát yêu thích
          </Text>
          <Text style={[styles.cardSubText, { color: colors.textSecondary }]} numberOfLines={1}>
            {likedSongs.length} bài hát
          </Text>
        </TouchableOpacity>

        {/* User Playlists */}
        {playlists.map((pl) => (
          <TouchableOpacity
            key={pl._id}
            style={[
              styles.gridCard,
              {
                width: cardWidth,
                padding: isMobile ? 8 : 10,
                backgroundColor: colors.cardBg,
                borderColor: colors.cardBorder,
              },
            ]}
            onPress={() => setSelectedPlaylistId(pl._id)}
            activeOpacity={0.8}
          >
            <View style={styles.gridImageWrap}>
              {pl.songs.length > 0 ? (
                <CoverArt uri={playlistCoverFor(pl.songs)} size={imageSize} radius={12} />
              ) : (
                <View style={[styles.placeholderCover, { width: imageSize, height: imageSize, backgroundColor: colors.cardBorder }]}>
                  <Ionicons name="musical-notes" size={40} color={colors.accent} />
                </View>
              )}
            </View>
            <Text style={[styles.cardTitleText, { color: colors.text }]} numberOfLines={1}>
              {pl.name}
            </Text>
            <Text style={[styles.cardSubText, { color: colors.textSecondary }]} numberOfLines={1}>
              {pl.songs.length} bài hát
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!user && (
        <View style={[styles.guestCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder, marginTop: 30 }]}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.accent} />
          <Text style={[styles.guestPromptText, { color: colors.textSecondary }]}>
            Đăng nhập để đồng bộ playlist trên mọi thiết bị.
          </Text>
          <LiquidGlassButton
            variant="primary"
            size="md"
            title={t('login')}
            onPress={() => setLoginModalVisible(true)}
            style={{ marginTop: 10 }}
          />
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  gridCard: {
    borderRadius: 12,
    borderWidth: 1,
  },
  gridImageWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
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
  playlistDetailGradientCover: {
    width: 150,
    height: 150,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCover: {
    width: 160,
    height: 160,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  tableWrap: {
    marginTop: 4,
  },
  likedSongsSpecialCard: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  likedSongsCardGradient: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlaylistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  createPlaylistInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 10,
  },
  guestCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
  },
  guestPromptText: {
    fontSize: 14,
    marginTop: 8,
  },
});
