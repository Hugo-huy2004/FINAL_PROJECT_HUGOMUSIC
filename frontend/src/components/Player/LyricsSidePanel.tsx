import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import CoverArt from '../CoverArt';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { api } from '../../utils/api';

interface LyricLine {
  time: number; // in seconds
  text: string;
}

function parseSyncedLyrics(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseFloat(match[2]);
    const text = match[3].trim();
    if (text) lines.push({ time: minutes * 60 + seconds, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// Synthesize line-by-line timestamps for songs with plain lyrics so all songs have Karaoke
function synthesizeKaraokeLines(plainLyrics: string, songDuration: number): LyricLine[] {
  const rawLines = plainLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (rawLines.length === 0) return [];

  const totalLines = rawLines.length;
  const safeDuration = Math.max(songDuration || 180, totalLines * 4);
  const startOffset = Math.min(8, safeDuration * 0.05);
  const availableTime = Math.max(10, safeDuration - startOffset - 12);
  const timePerLine = availableTime / totalLines;

  return rawLines.map((text, idx) => ({
    time: Math.round((startOffset + idx * timePerLine) * 10) / 10,
    text,
  }));
}

interface LyricsSidePanelProps {
  onClose: () => void;
  onExpandFullScreen?: () => void;
}

export default function LyricsSidePanel({
  onClose,
  onExpandFullScreen,
}: LyricsSidePanelProps) {
  const currentSong = useStore((state) => state.currentSong);
  const position = useStore((state) => state.position);
  const seek = useStore((state) => state.seek);
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  const scrollRef = useRef<ScrollView>(null);
  const [lyricsState, setLyricsState] = useState<{
    loading: boolean;
    plainLyrics: string | null;
    syncedLines: LyricLine[] | null;
  }>({ loading: false, plainLyrics: null, syncedLines: null });

  // Fetch lyrics whenever current song changes
  useEffect(() => {
    if (!currentSong) {
      setLyricsState({ loading: false, plainLyrics: null, syncedLines: null });
      return;
    }

    setLyricsState({ loading: true, plainLyrics: null, syncedLines: null });
    api
      .getLyrics(currentSong._id)
      .then((res) => {
        let parsedLines: LyricLine[] | null = null;
        if (res.syncedLyrics && res.syncedLyrics.trim().length > 0) {
          parsedLines = parseSyncedLyrics(res.syncedLyrics);
        } else if (res.plainLyrics && res.plainLyrics.trim().length > 0) {
          parsedLines = synthesizeKaraokeLines(res.plainLyrics, currentSong.duration || 180);
        }
        setLyricsState({
          loading: false,
          plainLyrics: res.plainLyrics,
          syncedLines: parsedLines && parsedLines.length > 0 ? parsedLines : null,
        });
      })
      .catch(() => {
        setLyricsState({ loading: false, plainLyrics: null, syncedLines: null });
      });
  }, [currentSong?._id, currentSong?.duration]);

  // Calculate current active line index
  const activeLineIndex = (() => {
    const lines = lyricsState.syncedLines;
    if (!lines || lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= position) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  })();

  // Smooth auto-scroll to the active line
  useEffect(() => {
    if (activeLineIndex >= 0 && scrollRef.current) {
      scrollRef.current.scrollTo({
        y: Math.max(0, activeLineIndex * 52 - 120),
        animated: true,
      });
    }
  }, [activeLineIndex]);

  if (!currentSong) return null;

  return (
    <View
      style={[
        styles.panelContainer,
        {
          backgroundColor: isDark ? 'rgba(18, 19, 24, 0.88)' : 'rgba(255, 255, 255, 0.88)',
          borderLeftColor: colors.border,
        },
        Platform.OS === 'web' && ({
          backdropFilter: 'blur(36px) saturate(200%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%)',
          boxShadow: isDark
            ? '-8px 0 32px rgba(0, 0, 0, 0.45)'
            : '-6px 0 24px rgba(0, 0, 0, 0.08)',
        } as any),
      ]}
    >
      {/* 1. Header Toolbar */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleGroup}>
          <View style={[styles.lyricsIconPill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <MaterialIcons name="lyrics" size={15} color="#10B981" />
          </View>
          <Text style={[styles.headerTitleText, { color: colors.text }]}>{t('lyrics')}</Text>
          {lyricsState.syncedLines && lyricsState.syncedLines.length > 0 && (
            <View style={styles.karaokeLiveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>{t('karaokeSync')}</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          {onExpandFullScreen && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onExpandFullScreen}
              activeOpacity={0.7}
              accessibilityLabel={t('expandFullScreen')}
            >
              <Ionicons
                name="expand-outline"
                size={18}
                color={isDark ? 'rgba(255, 255, 255, 0.75)' : colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityLabel={t('closeLyrics')}
          >
            <Ionicons
              name="close"
              size={20}
              color={isDark ? 'rgba(255, 255, 255, 0.75)' : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Mini Now Playing Strip */}
      <View style={[styles.nowPlayingRow, { borderBottomColor: colors.border }]}>
        <CoverArt uri={currentSong.coverArt} title={currentSong.title} size={44} radius={8} />
        <View style={styles.nowPlayingInfo}>
          <Text style={[styles.nowPlayingTitle, { color: colors.text }]} numberOfLines={1}>
            {currentSong.title}
          </Text>
          <Text style={[styles.nowPlayingArtist, { color: colors.textSecondary }]} numberOfLines={1}>
            {currentSong.artist || 'Hugo Music'}
          </Text>
        </View>
      </View>

      {/* 3. Lyrics Scrollable Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.lyricsScrollView}
        contentContainerStyle={styles.lyricsScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading State */}
        {lyricsState.loading && (
          <View style={styles.centerStateBox}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              {t('loadingLyrics')}
            </Text>
          </View>
        )}

        {/* Instrumental Intro Pill */}
        {!lyricsState.loading &&
          lyricsState.syncedLines &&
          lyricsState.syncedLines.length > 0 &&
          activeLineIndex === -1 &&
          position < (lyricsState.syncedLines[0]?.time || 5) && (
            <View style={styles.sideInstrumentalPill}>
              <Ionicons name="musical-notes" size={14} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.sideInstrumentalText}>{t('instrumentalIntro')}</Text>
            </View>
          )}

        {/* Live Synchronized Karaoke Lines */}
        {!lyricsState.loading &&
          lyricsState.syncedLines &&
          lyricsState.syncedLines.length > 0 &&
          lyricsState.syncedLines.map((line, idx) => {
            const isActive = idx === activeLineIndex;
            const distance = activeLineIndex === -1 ? 1 : Math.abs(idx - activeLineIndex);

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.lyricLineItem,
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                ]}
                onPress={() => seek(line.time)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.lyricText,
                    isActive && styles.lyricTextActive,
                    !isActive && distance === 1 && styles.lyricTextNear,
                    !isActive && distance >= 2 && styles.lyricTextFar,
                  ]}
                >
                  {line.text}
                </Text>
              </TouchableOpacity>
            );
          })}

        {/* Plain Text Lyrics */}
        {!lyricsState.loading &&
          !lyricsState.syncedLines &&
          lyricsState.plainLyrics && (
            <View style={styles.plainLyricsBox}>
              {lyricsState.plainLyrics.split('\n').map((para, i) => (
                <Text
                  key={i}
                  style={[
                    styles.plainLyricLine,
                    {
                      color: isDark ? 'rgba(255, 255, 255, 0.88)' : colors.text,
                    },
                  ]}
                >
                  {para || ' '}
                </Text>
              ))}
            </View>
          )}

        {/* Empty State: No Lyrics Found */}
        {!lyricsState.loading &&
          !lyricsState.syncedLines &&
          !lyricsState.plainLyrics && (
            <View style={styles.centerStateBox}>
              <View
                style={[
                  styles.noLyricsCircle,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                  },
                ]}
              >
                <MaterialIcons
                  name="lyrics"
                  size={32}
                  color={isDark ? 'rgba(255, 255, 255, 0.4)' : colors.textTertiary}
                />
              </View>
              <Text style={[styles.noLyricsTitle, { color: colors.text }]}>
                {t('noLyricsTitle')}
              </Text>
              <Text style={[styles.noLyricsDesc, { color: colors.textSecondary }]}>
                {t('noLyricsDesc', { title: currentSong.title })}
              </Text>
            </View>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panelContainer: {
    width: 360,
    height: '100%',
    borderLeftWidth: 1,
    flexDirection: 'column',
    zIndex: 900,
    flexShrink: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lyricsIconPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  karaokeLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  nowPlayingInfo: {
    flex: 1,
  },
  nowPlayingTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  nowPlayingArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  lyricsScrollView: {
    flex: 1,
  },
  lyricsScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingBottom: 110, // Avoid bottom player bar overlap
  },
  sideInstrumentalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 14,
  },
  sideInstrumentalText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  lyricLineItem: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginVertical: 2,
    alignItems: 'flex-start',
  },
  lyricText: {
    letterSpacing: -0.2,
    ...Platform.select({
      web: {
        transition: 'all 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
        transformOrigin: 'left center',
        userSelect: 'none',
      } as any,
      default: {},
    }),
  },
  lyricTextActive: {
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 30,
    color: '#ffffff',
    opacity: 1,
    ...Platform.select({
      web: {
        filter: 'none',
        textShadow: '0 0 20px rgba(255, 255, 255, 0.48)',
        transform: 'scale(1.02)',
      } as any,
      default: {},
    }),
  },
  lyricTextNear: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 27,
    color: 'rgba(255, 255, 255, 0.74)',
    opacity: 0.46,
    ...Platform.select({
      web: {
        filter: 'blur(1.4px)',
      } as any,
      default: {},
    }),
  },
  lyricTextFar: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 25,
    color: 'rgba(255, 255, 255, 0.55)',
    opacity: 0.26,
    ...Platform.select({
      web: {
        filter: 'blur(2.2px)',
      } as any,
      default: {},
    }),
  },
  plainLyricsBox: {
    paddingVertical: 12,
  },
  plainLyricLine: {
    fontSize: 15,
    lineHeight: 26,
    fontWeight: '500',
    marginBottom: 6,
  },
  centerStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 16,
  },
  stateText: {
    fontSize: 13,
    marginTop: 10,
    fontWeight: '500',
  },
  noLyricsCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  noLyricsTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  noLyricsDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 240,
  },
});
