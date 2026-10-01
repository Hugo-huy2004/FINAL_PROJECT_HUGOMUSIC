import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Modal, ScrollView, GestureResponderEvent, Animated,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { audioEngine } from '../../utils/audioEngine';
import CoverArt from '../CoverArt';
import SeekBar from './SeekBar';
import Glass from '../LiquidGlass/Glass';
import { TAB_BAR_HEIGHT, TAB_BAR_GAP, TAB_BAR_SIDE } from '../BottomTabBar/BottomTabBar';
import { useChrome, chromeProgress } from '../../ui/chrome';
import { HAS_NATIVE_TABS, NATIVE_TAB_BAR_HEIGHT } from '../../navigation/NativeTabs';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile } from '../../utils/responsive';
import { useSidebarDock } from '../../ui/sidebar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime } from '../../utils/format';
import { useTranslation } from '../../i18n/i18n';

export interface BottomPlayerProps {
  onOpenFullPlayer?: () => void;
  onOpenLyrics?: () => void;
  isLyricsActive?: boolean;
}

const VOLUME_TRACK_WIDTH = 64;

// Thanh phát nổi: bản đầy đủ trên desktop, bản thu gọn trên mobile.
export default function BottomPlayer({ onOpenFullPlayer, onOpenLyrics, isLyricsActive }: BottomPlayerProps) {
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);
  const queue = useStore((s) => s.queue);
  // Trong phòng nghe chung server giữ nhịp: không tua, không chuyển bài.
  const inRoom = useStore((s) => !!s.liveRoom);
  // iPhone dùng thanh tab gốc (không thu gọn) → mini player luôn ở dạng đầy đủ.
  const collapsed = useChrome((s) => s.collapsed) && !HAS_NATIVE_TABS;
  const { togglePlay, seek, seekBy, next, prev, playSong } = useStore.getState();

  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const sidebarSpace = useSidebarDock().space;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Phím tắt trên web: Space/K phát-dừng, ←/J lùi 10 s, →/L tới 10 s.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['input', 'textarea'].includes(el?.tagName?.toLowerCase()) || el?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' || key === 'k') togglePlay();
      else if (e.code === 'ArrowLeft' || key === 'j') seekBy(-10);
      else if (e.code === 'ArrowRight' || key === 'l') seekBy(10);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy]);

  if (!currentSong) return null;

  const isLive = duration === Infinity;
  const progress = isLive ? 1 : duration > 0 ? Math.min(1, position / duration) : 0;

  const setVolumeLevel = (v: number) => {
    setVolume(v);
    setIsMuted(v === 0);
    audioEngine.setVolume(v);
  };
  const toggleMute = () => {
    audioEngine.setVolume(isMuted ? volume || 0.8 : 0);
    setIsMuted(!isMuted);
  };

  const songText = (titleSize: number) => (
    <View style={styles.songText}>
      <Text style={[styles.title, { color: colors.text, fontSize: titleSize }]} numberOfLines={1}>
        {currentSong.title}
      </Text>
      <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
        {currentSong.artist || 'Hugo Music'}
      </Text>
    </View>
  );

  // ---------- Mobile: nằm trên thanh tab; khi thanh tab thu gọn thì hạ xuống cùng hàng ----------
  if (isMobile) {
    const base = Math.max(insets.bottom, 12);
    const inset = TAB_BAR_SIDE + TAB_BAR_HEIGHT + TAB_BAR_GAP;
    const lerp = (from: number, to: number) => chromeProgress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
    return (
      <Animated.View
        style={[
          styles.mobileWrap,
          HAS_NATIVE_TABS
            ? { bottom: insets.bottom + NATIVE_TAB_BAR_HEIGHT + 8 } // ngay trên thanh tab gốc
            : { bottom: lerp(base + TAB_BAR_HEIGHT + 8, base), left: lerp(12, inset), right: lerp(12, inset) },
          { pointerEvents: 'box-none' },
        ]}
      >
        <View style={[styles.mobilePill, collapsed && styles.mobilePillInline]}>
          <Glass radius={collapsed ? TAB_BAR_HEIGHT / 2 : 24} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.songInfo, styles.mobileSongInfo]} onPress={onOpenFullPlayer} activeOpacity={0.8}>
              <CoverArt uri={currentSong.coverArt} title={currentSong.title} size={40} radius={8} />
              {songText(14)}
            </TouchableOpacity>
            <IconButton label={isPlaying ? t('pause') : t('play')} onPress={togglePlay}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} />
            </IconButton>
            {!inRoom && !collapsed && (
              <IconButton label={t('nextTrack')} onPress={next}>
                <Ionicons name="play-skip-forward" size={20} color={colors.text} />
              </IconButton>
            )}
          </View>
          <View style={[styles.mobileTrack, { backgroundColor: colors.fill }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>
      </Animated.View>
    );
  }

  // ---------- Desktop: thanh nổi đầy đủ ----------
  const iconColor = colors.text;
  return (
    <>
      <View style={[styles.desktopWrap, { left: sidebarSpace }, { pointerEvents: 'box-none' }]}>
        <View style={styles.capsule}>
          <Glass radius={32} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />

          <TouchableOpacity style={[styles.songInfo, styles.desktopSongInfo]} onPress={onOpenFullPlayer} activeOpacity={0.8}>
            <CoverArt uri={currentSong.coverArt} title={currentSong.title} size={40} radius={8} />
            {songText(14)}
          </TouchableOpacity>

          <View style={styles.transport}>
            {!inRoom && (
              <>
                <IconButton label={t('previousTrack')} onPress={prev}>
                  <Ionicons name="play-skip-back" size={17} color={iconColor} />
                </IconButton>
                <IconButton label={t('rewind10s')} onPress={() => seekBy(-10)}>
                  <MaterialIcons name="replay-10" size={20} color={iconColor} />
                </IconButton>
              </>
            )}
            <TouchableOpacity
              style={[styles.playButton, { backgroundColor: colors.accent }]}
              onPress={togglePlay}
              activeOpacity={0.8}
              accessibilityLabel={isPlaying ? t('pause') : t('play')}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" style={isPlaying ? undefined : { marginLeft: 2 }} />
            </TouchableOpacity>
            {!inRoom && (
              <>
                <IconButton label={t('forward10s')} onPress={() => seekBy(10)}>
                  <MaterialIcons name="forward-10" size={20} color={iconColor} />
                </IconButton>
                <IconButton label={t('nextTrack')} onPress={next}>
                  <Ionicons name="play-skip-forward" size={17} color={iconColor} />
                </IconButton>
              </>
            )}
          </View>

          <View style={styles.progressRow}>
            <Text style={[styles.time, { color: colors.textSecondary }]}>{isLive ? 'LIVE' : formatTime(position)}</Text>
            <SeekBar progress={progress} disabled={inRoom || isLive || !(duration > 0)} onSeek={(r) => seek(r * duration)} trackColor={colors.fill} fillColor={colors.accent} label="Tiến độ bài hát" />
            <Text style={[styles.time, { color: colors.textSecondary }]}>{isLive ? '' : formatTime(duration)}</Text>
          </View>

          <View style={styles.utilities}>
            <IconButton label={t('lyrics')} onPress={onOpenLyrics ?? onOpenFullPlayer} active={isLyricsActive}>
              <MaterialIcons name="lyrics" size={19} color={isLyricsActive ? colors.accent : iconColor} />
            </IconButton>
            <IconButton label={t('queue')} onPress={() => setIsQueueOpen(true)} active={isQueueOpen}>
              <Ionicons name="list" size={20} color={iconColor} />
            </IconButton>
            <IconButton label={t('volume')} onPress={toggleMute}>
              <Ionicons
                name={isMuted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                size={19}
                color={iconColor}
              />
            </IconButton>
            <TouchableOpacity
              style={styles.volumeHit}
              activeOpacity={0.8}
              onPress={(e: GestureResponderEvent) =>
                setVolumeLevel(Math.max(0, Math.min(1, e.nativeEvent.locationX / VOLUME_TRACK_WIDTH)))
              }
            >
              <View style={[styles.volumeTrack, { backgroundColor: colors.fill }, { pointerEvents: 'none' }]}>
                <View style={[styles.fill, { width: `${(isMuted ? 0 : volume) * 100}%`, backgroundColor: colors.accent }]} />
              </View>
            </TouchableOpacity>
            {onOpenFullPlayer && (
              <IconButton label="Mở trình phát toàn màn hình" onPress={onOpenFullPlayer}>
                <Ionicons name="expand-outline" size={19} color={iconColor} />
              </IconButton>
            )}
          </View>
        </View>
      </View>

      <Modal visible={isQueueOpen} transparent animationType="fade" onRequestClose={() => setIsQueueOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setIsQueueOpen(false)}>
          <View style={[styles.drawer, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.drawerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.drawerTitle, { color: colors.text }]}>{t('historyQueue')}</Text>
              <TouchableOpacity onPress={() => setIsQueueOpen(false)}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{t('close')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {queue.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textTertiary }]}>{t('emptyHistory')}</Text>
              ) : (
                queue.map((song, idx) => {
                  const isCurrent = song._id === currentSong._id;
                  return (
                    <TouchableOpacity
                      key={`${song._id}-${idx}`}
                      style={[styles.queueItem, isCurrent && { backgroundColor: colors.activeItemBg }]}
                      onPress={() => playSong(song, queue)}
                    >
                      <CoverArt uri={song.coverArt} title={song.title} size={44} radius={6} />
                      <View style={styles.songText}>
                        <Text style={[styles.title, { color: isCurrent ? colors.accent : colors.text }]} numberOfLines={1}>
                          {song.title}
                        </Text>
                        <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
                          {song.artist}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function IconButton({
  label, onPress, active, children,
}: { label: string; onPress?: () => void; active?: boolean; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity
      style={[styles.iconButton, active && { backgroundColor: colors.fill }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityLabel={label}
      // @ts-ignore tooltip trên web
      title={label}
    >
      {children}
    </TouchableOpacity>
  );
}

// Thanh tiến độ kéo để tua. Khi đang kéo chỉ đổi phần hiển thị; buông tay mới tua thật.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  songInfo: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  mobileSongInfo: { flex: 1 },
  songText: { flex: 1, minWidth: 0, marginLeft: 10 },
  title: { fontSize: 14, fontWeight: '600' },
  artist: { fontSize: 12, marginTop: 1 },
  fill: { height: '100%', borderRadius: 2 },
  iconButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Desktop
  desktopWrap: { position: 'absolute', bottom: 20, right: 12, alignItems: 'center', zIndex: 1000 },
  capsule: {
    width: '94%', maxWidth: 1040, height: 64, borderRadius: 32,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12,
  },
  desktopSongInfo: { width: 210, flexShrink: 0 },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  playButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  progressRow: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
  seekHit: { flex: 1, height: 24, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, top: 6 },
  utilities: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  volumeHit: { width: VOLUME_TRACK_WIDTH, height: 24, justifyContent: 'center', marginRight: 4 },
  volumeTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },

  // Mobile
  mobileWrap: { position: 'absolute', left: 12, right: 12, maxWidth: 500, alignSelf: 'center', zIndex: 999 },
  mobilePillInline: { height: TAB_BAR_HEIGHT, borderRadius: TAB_BAR_HEIGHT / 2, justifyContent: 'center', paddingHorizontal: 10 },
  mobilePill: { borderRadius: 24, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, overflow: 'hidden' },
  mobileTrack: { height: 2.5, borderRadius: 2, marginTop: 8, overflow: 'hidden' },

  // Danh sách chờ
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'flex-end' },
  drawer: { width: 380, height: '100%', paddingTop: 24, paddingHorizontal: 20 },
  drawerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 16, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: { fontSize: 20, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 60 },
  queueItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8 },
});
