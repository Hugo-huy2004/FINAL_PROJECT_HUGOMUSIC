import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile } from '../../utils/responsive';
import { SongTableRow } from './SongTableRow';

export default function SongsView() {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [songSortMode, setSongSortMode] = useState<'default' | 'title' | 'artist'>('default');

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  let sortedList = [...songs];
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    sortedList = sortedList.filter(
      (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }
  if (songSortMode === 'title') {
    sortedList.sort((a, b) => a.title.localeCompare(b.title));
  } else if (songSortMode === 'artist') {
    sortedList.sort((a, b) => a.artist.localeCompare(b.artist));
  }

  const handlePlayAll = () => {
    if (sortedList.length > 0) playSong(sortedList[0], sortedList);
  };

  const handleShuffle = () => {
    if (sortedList.length > 0) {
      const shuffled = [...sortedList].sort(() => Math.random() - 0.5);
      playSong(shuffled[0], shuffled);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: isMobile ? 18 : 36 }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>{t('songs')}</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            {sortedList.length} bài hát
          </Text>
        </View>
        <View style={styles.actionButtonGroup}>
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: colors.accent }]}
            onPress={handlePlayAll}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={16} color="#ffffff" />
            <Text style={styles.primaryActionBtnText}>Phát tất cả</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryActionBtn, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
            onPress={handleShuffle}
            activeOpacity={0.8}
          >
            <Ionicons name="shuffle" size={16} color={colors.accent} />
            <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Xáo trộn</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter & Sort Bar */}
      <View style={styles.songFilterBar}>
        <View style={[styles.searchBox, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Lọc bài hát..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.sortPillGroup}>
          <TouchableOpacity
            style={[styles.sortPill, songSortMode === 'default' && { backgroundColor: colors.accent }]}
            onPress={() => setSongSortMode('default')}
          >
            <Text style={[styles.sortPillText, { color: songSortMode === 'default' ? '#fff' : colors.textSecondary }]}>
              Mặc định
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortPill, songSortMode === 'title' && { backgroundColor: colors.accent }]}
            onPress={() => setSongSortMode('title')}
          >
            <Text style={[styles.sortPillText, { color: songSortMode === 'title' ? '#fff' : colors.textSecondary }]}>
              Tên bài
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortPill, songSortMode === 'artist' && { backgroundColor: colors.accent }]}
            onPress={() => setSongSortMode('artist')}
          >
            <Text style={[styles.sortPillText, { color: songSortMode === 'artist' ? '#fff' : colors.textSecondary }]}>
              Nghệ sĩ
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Apple Music Table Header */}
      <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.tableHeadCell, { width: 44, textAlign: 'center' }]}>#</Text>
        <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>TIÊU ĐỀ</Text>
        <Text style={[styles.tableHeadCell, { flex: 1 }]}>NGHỆ SĨ</Text>
        {!isMobile && <Text style={[styles.tableHeadCell, { width: 120 }]}>THỂ LOẠI</Text>}
        <Text style={[styles.tableHeadCell, { width: 70, textAlign: 'right' }]}>THỜI LƯỢNG</Text>
        <Text style={[styles.tableHeadCell, { width: 50, textAlign: 'center' }]}>THÍCH</Text>
      </View>

        {/* Song Rows */}
        <View style={styles.tableWrap}>
          {sortedList.map((song, idx) => (
            <SongTableRow
              key={song._id}
              index={idx + 1}
              song={song}
              colors={colors}
              isCurrent={currentSong?._id === song._id}
              isPlaying={isPlaying}
              isLiked={likedSongIds.includes(song._id)}
              onPlay={() => playOrToggleSong(song, sortedList)}
              onToggleLike={() => toggleLike(song._id)}
            />
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
  songFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
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
  sortPillGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  sortPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableHeadCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  tableWrap: {
    marginTop: 4,
  },
});
