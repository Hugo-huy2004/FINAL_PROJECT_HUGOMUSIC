import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, Modal, ScrollView, GestureResponderEvent, Animated,
} from 'react-native';
import { useStore } from '../../store/useStore';
import { audioEngine } from '../../audio/audioEngine';
import CoverArt from '../CoverArt';
import SeekBar from './SeekBar';
import { Glass, Icon } from 'hugo-music';
import { TAB_BAR_HEIGHT, TAB_BAR_GAP, TAB_BAR_SIDE } from '../BottomTabBar/BottomTabBar';
import { useChrome, chromeProgress } from '../../ui/chrome';
import { useAppTheme } from '../../ui/theme';
import { useIsMobile } from '../../lib/responsive';
import { useSidebarDock } from '../../ui/sidebar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime } from '../../lib/format';
import { useTranslation } from '../../i18n/i18n';

export interface BottomPlayerProps {
  /** Opens the full-screen player. */
  onOpenFullPlayer?: () => void;
  /** Opens the lyrics panel. */
  onOpenLyrics?: () => void;
  isLyricsActive?: boolean;
}

const VOLUME_TRACK_WIDTH = 64;

// Floating bar: full version on desktop, compact version on mobile.
/** Mini player docked above the tab bar: current song, play/pause and next; expands to the full player. */
export default function BottomPlayer({ onOpenFullPlayer, onOpenLyrics, isLyricsActive }: BottomPlayerProps) {
  const currentSong = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);
  const queue = useStore((s) => s.queue);
  // In the shared listening room, the server keeps the beat: no rewinding, no song switching.
  const inRoom = useStore((s) => !!s.liveRoom);
  // iPhone uses the original tab bar (not collapsed) → mini player is always in full form.
  const collapsed = useChrome((s) => s.collapsed);
  const { togglePlay, seek, seekBy, next, prev, playSong } = useStore.getState();

  const { colors } = useAppTheme();
  const isMobile = useIsMobile();
  const sidebarSpace = useSidebarDock().space;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Web shortcuts: Space/K play-stop, ←/J backward 10 s, →/L up to 10 s.
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

  // ---------- Mobile: located on the tab bar; When the tab bar collapses, it drops to the same row ----------
  if (isMobile) {
    const base = Math.max(insets.bottom, 12);
    const inset = TAB_BAR_SIDE + TAB_BAR_HEIGHT + TAB_BAR_GAP;
    const lerp = (from: number, to: number) => chromeProgress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
    return (
      <Animated.View
        style={[
          styles.mobileWrap,
          { bottom: lerp(base + TAB_BAR_HEIGHT + 8, base), left: lerp(12, inset), right: lerp(12, inset) },
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
              <Icon name={isPlaying ? 'pause' : 'play'} size={24} color={colors.text} />
            </IconButton>
            {!inRoom && !collapsed && (
              <IconButton label={t('nextTrack')} onPress={next}>
                <Icon name="play-skip-forward" size={20} color={colors.text} />
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

  // ---------- Desktop: full floating bar ----------
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
                  <Icon name="play-skip-back" size={17} color={iconColor} />
                </IconButton>
                <IconButton label={t('rewind10s')} onPress={() => seekBy(-10)}>
                  <Icon name="play-back-outline" size={20} color={iconColor} />
                </IconButton>
              </>
            )}
            <TouchableOpacity
              style={[styles.playButton, { backgroundColor: colors.accent }]}
              onPress={togglePlay}
              activeOpacity={0.8}
              accessibilityLabel={isPlaying ? t('pause') : t('play')}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" style={isPlaying ? undefined : { marginLeft: 2 }} />
            </TouchableOpacity>
            {!inRoom && (
              <>
                <IconButton label={t('forward10s')} onPress={() => seekBy(10)}>
                  <Icon name="play-forward-outline" size={20} color={iconColor} />
                </IconButton>
                <IconButton label={t('nextTrack')} onPress={next}>
                  <Icon name="play-skip-forward" size={17} color={iconColor} />
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
              <Icon name="chatbox-ellipses-outline" size={19} color={isLyricsActive ? colors.accent : iconColor} />
            </IconButton>
            <IconButton label={t('queue')} onPress={() => setIsQueueOpen(true)} active={isQueueOpen}>
              <Icon name="list" size={20} color={iconColor} />
            </IconButton>
            <IconButton label={t('volume')} onPress={toggleMute}>
              <Icon
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
                <Icon name="expand-outline" size={19} color={iconColor} />
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
      // @ts-ignore tooltip on the web
      title={label}
    >
      {children}
    </TouchableOpacity>
  );
}

// Drag progress bar to rewind. While dragging, the display only changes; Letting go is really fast.
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

  // Waiting list
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
