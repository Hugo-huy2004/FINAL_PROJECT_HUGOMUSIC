import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Song } from '../../store/useStore';
import CoverArt from '../../components/CoverArt';
import LicenseBadge from '../../components/LicenseBadge';
import { useIsMobile } from '../../utils/responsive';

export function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return '3:45';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export interface SongTableRowProps {
  index: number;
  song: Song;
  colors: any;
  isCurrent: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onRemoveFromPlaylist?: () => void;
}

export const SongTableRow = React.memo(function SongTableRow({
  index,
  song,
  colors,
  isCurrent,
  isPlaying,
  isLiked,
  onPlay,
  onToggleLike,
  onRemoveFromPlaylist,
}: SongTableRowProps) {
  const isMobile = useIsMobile();

  return (
    <TouchableOpacity
      style={[
        styles.tableRow,
        { borderBottomColor: colors.border },
        isCurrent && { backgroundColor: colors.activeItemBg },
      ]}
      onPress={onPlay}
      activeOpacity={0.7}
    >
      <View style={styles.tableColIndex}>
        {isCurrent ? (
          isPlaying ? (
            <View style={styles.miniEqualizer}>
              <View style={[styles.miniEqBar, styles.miniEqBar1, { backgroundColor: colors.accent }]} />
              <View style={[styles.miniEqBar, styles.miniEqBar2, { backgroundColor: colors.accent }]} />
              <View style={[styles.miniEqBar, styles.miniEqBar3, { backgroundColor: colors.accent }]} />
            </View>
          ) : (
            <Ionicons
              name="play"
              size={15}
              color={colors.accent}
            />
          )
        ) : (
          <Text style={[styles.tableIndexText, { color: colors.textTertiary }]}>{index}</Text>
        )}
      </View>

      <View style={styles.tableColTitle}>
        <CoverArt uri={song.coverArt} size={38} radius={6} />
        <View style={styles.tableTitleTextWrap}>
          <Text
            style={[
              styles.tableSongTitle,
              { color: isCurrent ? colors.accent : colors.text },
              isCurrent && { fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
          {isMobile && (
            <Text style={[styles.tableSongArtistMobile, { color: colors.textSecondary }]} numberOfLines={1}>
              {song.artist}
            </Text>
          )}
          <LicenseBadge song={song} color={colors.textTertiary || colors.textSecondary} />
        </View>
      </View>

      {!isMobile && (
        <View style={styles.tableColArtist}>
          <Text style={[styles.tableArtistText, { color: colors.textSecondary }]} numberOfLines={1}>
            {song.artist}
          </Text>
        </View>
      )}

      {!isMobile && (
        <View style={styles.tableColCategory}>
          <Text style={[styles.categoryBadge, { color: colors.textSecondary }]} numberOfLines={1}>
            {song.category || 'V-Pop'}
          </Text>
        </View>
      )}

      <View style={styles.tableColDuration}>
        <Text style={[styles.durationText, { color: colors.textTertiary }]}>
          {formatDuration(song.duration)}
        </Text>
      </View>

      <View style={styles.tableColAction}>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleLike();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={18}
            color={isLiked ? '#FF2D55' : colors.icon}
          />
        </TouchableOpacity>

        {onRemoveFromPlaylist && (
          <TouchableOpacity
            style={{ marginLeft: 10 }}
            onPress={(e) => {
              e.stopPropagation?.();
              onRemoveFromPlaylist();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle-outline" size={18} color={colors.icon} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web'
      ? ({
          transition: 'all 0.18s cubic-bezier(0.25, 1, 0.5, 1)',
          cursor: 'pointer',
        } as any)
      : {}),
  },
  miniEqualizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    gap: 2,
    justifyContent: 'center',
    width: 24,
  },
  miniEqBar: {
    width: 2.6,
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
  tableColIndex: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableIndexText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tableColTitle: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableTitleTextWrap: {
    flex: 1,
  },
  tableSongTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tableSongArtistMobile: {
    fontSize: 12,
    marginTop: 2,
  },
  tableColArtist: {
    flex: 1,
  },
  tableArtistText: {
    fontSize: 13,
  },
  tableColCategory: {
    width: 120,
  },
  categoryBadge: {
    fontSize: 12,
  },
  tableColDuration: {
    width: 70,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  durationText: {
    fontSize: 13,
  },
  tableColAction: {
    width: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
