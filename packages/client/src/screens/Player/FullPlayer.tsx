import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, Platform, useWindowDimensions, Modal, TouchableOpacity } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store/useStore';
import { useIsMobile } from '../../lib/responsive';
import { formatTime } from '../../lib/format';
import { audioEngine } from '../../audio/audioEngine';
import { isHexColor, shade } from '../../lib/color';
import { getAudioQualityInfo } from '../../audio/audioQuality';
import CoverArt from '../../components/CoverArt';
import SeekBar from '../../components/Player/SeekBar';
import { GlassCapsule, CapsuleButton, DropletPressable } from '../../ui/kit';
import { openSongActions } from '../../components/SongActions/SongActions';
import { useLyrics } from './useLyrics';
import LyricsView from './LyricsView';
import QueueView from './QueueView';
import { Gradient, Icon } from 'hugo-music';

// Full screen player under Apple Music iOS 26:
// - cover image fills half of the screen, fading into the background; The background is the main color of the cover image (song.coverColor,
// server calculate) darken — without color, graphite background;
// - name + artist on the left, glass [＋ | …] right (＋ = add to My Playlist, … = all actions);
// - progress bar, time, transition type label in the middle; ◀◀ ▶ ▶▶ large without border; volume;
// - bottom row: lyrics · playback device (only if the browser has a real selector) · queue.
// Opening statement/queue: cover image is reduced to a small line at the top, content takes up the middle. Desktop: two columns.
type Panel = 'none' | 'lyrics' | 'queue';
const USE_NATIVE = Platform.OS !== 'web';
const INK = '#FFFFFF';
const DIM = 'rgba(255,255,255,0.6)';
const TRACK = 'rgba(255,255,255,0.22)';
const FALLBACK_BG = '#2A2A2E';
const FADE_MASK_WEB = { maskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)' } as object;

// The cover image fades to the bottom (web: CSS mask; native: MaskedView).
function FadedArt({ uri, title, size }: { uri?: string; title: string; size: number }) {
  const art = <CoverArt uri={uri} title={title} size={size} radius={0} />;
  if (Platform.OS === 'web') return <View style={[{ width: size, height: size }, FADE_MASK_WEB]}>{art}</View>;
  return (
    <MaskedView style={{ width: size, height: size }} maskElement={<Gradient colors={['#000', '#000', 'transparent']} locations={[0, 0.62, 1]} style={{ flex: 1 }} />}>
      {art}
    </MaskedView>
  );
}

export default function FullPlayer({ onClose, initialTab = 'art' }: { onClose: () => void; initialTab?: 'art' | 'lyrics' }) {
  const isMobile = useIsMobile();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const song = useStore((s) => s.currentSong);
  const isPlaying = useStore((s) => s.isPlaying);
  const togglePlay = useStore((s) => s.togglePlay);
  const position = useStore((s) => s.position);
  const duration = useStore((s) => s.duration);
  const seek = useStore((s) => s.seek);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const liked = useStore((s) => (song ? s.likedSongIds.includes(song._id) : false));
  const toggleLike = useStore((s) => s.toggleLike);
  const liveRoom = useStore((s) => s.liveRoom);
  const playbackBitrate = useStore((s) => s.playbackBitrate);
  const playbackCodec = useStore((s) => s.playbackCodec);
  const playbackSegment = useStore((s) => s.playbackSegment);
  const isHlsStream = useStore((s) => s.isHlsStream);
  const [panel, setPanel] = useState<Panel>(initialTab === 'lyrics' ? 'lyrics' : isMobile ? 'none' : 'lyrics');
  const [volume, setVolume] = useState(0.85);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const lyrics = useLyrics(song?._id);

  const qualityInfo = useMemo(
    () =>
      getAudioQualityInfo({
        song,
        bitrate: playbackBitrate,
        codec: playbackCodec,
        segmentIndex: playbackSegment,
        isHls: isHlsStream,
      }),
    [song, playbackBitrate, playbackCodec, playbackSegment, isHlsStream]
  );

  // Cover art moves slightly back when paused, returns when played.
  const artScale = useRef(new Animated.Value(isPlaying ? 1 : 0.92)).current;
  useEffect(() => {
    Animated.spring(artScale, { toValue: isPlaying ? 1 : 0.92, damping: 16, stiffness: 170, useNativeDriver: USE_NATIVE }).start();
  }, [isPlaying]);

  // Swipe down to close.
  const drag = useRef(new Animated.Value(0)).current;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 0.9) onClose();
      else Animated.spring(drag, { toValue: 0, damping: 20, stiffness: 240, useNativeDriver: USE_NATIVE }).start();
    },
  })).current;

  if (!song) return null;

  const isRadio = song._id.startsWith('radio-');
  const isLive = duration === Infinity || liveRoom?.kind === 'station' || isRadio;
  const canSkip = !liveRoom && !isRadio;
  const bgTop = isHexColor(song.coverColor) ? shade(song.coverColor, -0.45) : FALLBACK_BG;
  const bgBottom = isHexColor(song.coverColor) ? shade(song.coverColor, -0.8) : '#111113';
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? (isMobile ? 'none' : 'lyrics') : p));
  const changeVolume = (v: number) => {
    setVolume(v);
    audioEngine.setVolume(v);
  };

  // ---------- shared blocks for the two layouts ----------
  const info = (
    <View style={styles.infoRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {liveRoom?.kind === 'station' && <Text style={styles.live}>● TRỰC TIẾP · {liveRoom.name}</Text>}
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
      </View>
      {!isRadio && (
        <GlassCapsule tone="dark" style={styles.capsule}>
          <CapsuleButton icon={liked ? 'checkmark' : 'add'} iconSize={24} width={46} color={INK} label={liked ? 'Bỏ khỏi My Playlist' : 'Thêm vào My Playlist'} onPress={() => toggleLike(song._id)} />
          <CapsuleButton icon="ellipsis-horizontal" iconSize={22} width={46} color={INK} label="Tuỳ chọn: thêm vào danh sách phát, tải về, chia sẻ" onPress={() => openSongActions(song)} />
        </GlassCapsule>
      )}
    </View>
  );

  const progress = isLive ? (
    <View style={styles.liveBar}><Text style={styles.liveText}>Phát trực tiếp</Text></View>
  ) : (
    <View style={styles.progress}>
      <SeekBar progress={duration > 0 ? position / duration : 0} onSeek={(r) => seek(r * duration)} trackColor={TRACK} fillColor={INK} label="Tiến độ bài hát" thickness={6} />
      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Pressable
          style={styles.qualityBadge}
          onPress={() => setShowQualityModal(true)}
          accessibilityRole="button"
          accessibilityLabel={`Chất lượng âm thanh: ${qualityInfo.badgeLabel}`}
        >
          <Icon name="hardware-chip-outline" size={12} color="rgba(255,255,255,0.75)" style={{ marginRight: 4 }} />
          <Text style={styles.badgeText}>{qualityInfo.badgeLabel}</Text>
        </Pressable>
        <Text style={styles.time}>-{formatTime(Math.max(0, duration - position))}</Text>
      </View>
    </View>
  );

  const transport = (
    <View style={styles.transport}>
      <DropletPressable onPress={prev} disabled={!canSkip} style={[styles.skip, !canSkip && styles.disabled]} label="Bài trước" strength={1.6}>
        <Icon name="play-back" size={42} color={INK} />
      </DropletPressable>
      <DropletPressable onPress={togglePlay} style={styles.play} label={isPlaying ? 'Tạm dừng' : 'Phát'} strength={1.6}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={58} color={INK} />
      </DropletPressable>
      <DropletPressable onPress={next} disabled={!canSkip} style={[styles.skip, !canSkip && styles.disabled]} label="Bài tiếp theo" strength={1.6}>
        <Icon name="play-forward" size={42} color={INK} />
      </DropletPressable>
    </View>
  );

  const volumeRow = (
    <View style={styles.volumeRow}>
      <Icon name="volume-low" size={16} color={DIM} />
      <View style={{ flex: 1 }}>
        <SeekBar progress={volume} onSeek={changeVolume} trackColor={TRACK} fillColor={DIM} label="Âm lượng" thickness={6} />
      </View>
      <Icon name="volume-high" size={16} color={DIM} />
    </View>
  );

  const toggle = (p: Panel, icon: keyof typeof Icon.glyphMap, label: string) => (
    <DropletPressable style={[styles.toggle, panel === p && styles.toggleOn]} onPress={() => togglePanel(p)} selected={panel === p} label={label} strength={1.4}>
      <Icon name={icon} size={22} color={panel === p ? '#000' : INK} />
    </DropletPressable>
  );
  const bottomRow = (
    <View style={styles.bottomRow}>
      {toggle('lyrics', 'chatbox-ellipses-outline', 'Lời bài hát')}
      {audioEngine.canPickOutput() ? (
        <Pressable style={styles.toggle} onPress={() => audioEngine.pickOutput()} accessibilityRole="button" accessibilityLabel="Chọn thiết bị phát">
          <Icon name="radio-outline" size={22} color={INK} />
        </Pressable>
      ) : <View style={styles.toggle} />}
      {toggle('queue', 'list', 'Hàng chờ')}
    </View>
  );

  const panelContent = panel === 'queue' ? <QueueView /> : <LyricsView lyrics={lyrics} position={position} onSeek={seek} />;
  const controls = (
    <View style={styles.controls}>
      {progress}
      {transport}
      {volumeRow}
      {bottomRow}
    </View>
  );

  return (
    <View style={styles.root}>
      <Gradient colors={[bgTop, bgBottom]} style={StyleSheet.absoluteFill} />

      {isMobile ? (
        <Animated.View style={[styles.fill, { transform: [{ translateY: drag }] }]}>
          {panel === 'none' ? (
            <>
              <View style={styles.heroArt}>
                <FadedArt uri={song.coverArt} title={song.title} size={width} />
              </View>
              <View {...pan.panHandlers} style={[styles.grabArea, { paddingTop: insets.top + 6 }]}>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng trình phát" hitSlop={12}>
                  <View style={styles.grabber} />
                </Pressable>
              </View>
              <View style={[styles.lower, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {info}
                {controls}
              </View>
            </>
          ) : (
            <View style={[styles.fill, { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View {...pan.panHandlers} style={styles.grabAreaStatic}>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng trình phát" hitSlop={12}>
                  <View style={styles.grabber} />
                </Pressable>
              </View>
              <View style={styles.compactHead}>
                <CoverArt uri={song.coverArt} title={song.title} size={56} radius={8} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.compactTitle} numberOfLines={1}>{song.title}</Text>
                  <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
                </View>
                {!isRadio && (
                  <GlassCapsule tone="dark" style={styles.capsule}>
                    <CapsuleButton icon="ellipsis-horizontal" iconSize={22} width={46} color={INK} label="Tuỳ chọn" onPress={() => openSongActions(song)} />
                  </GlassCapsule>
                )}
              </View>
              <View style={[styles.fill, styles.pad]}>{panelContent}</View>
              <View style={styles.pad}>{controls}</View>
            </View>
          )}
        </Animated.View>
      ) : (
        <View style={styles.desktop}>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng trình phát">
            <Icon name="chevron-down" size={26} color={INK} />
          </Pressable>
          <View style={styles.desktopLeft}>
            <Animated.View style={[styles.desktopArt, { transform: [{ scale: artScale }] }]}>
              <CoverArt uri={song.coverArt} title={song.title} size={Math.min(420, height * 0.45)} radius={14} />
            </Animated.View>
            <View style={{ width: Math.min(420, height * 0.45) + 40 }}>
              {info}
              {controls}
            </View>
          </View>
          <View style={styles.desktopRight}>{panelContent}</View>
        </View>
      )}

      <Modal visible={showQualityModal} transparent animationType="fade" onRequestClose={() => setShowQualityModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQualityModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.qualityIconBadge}>
                <Icon name="hardware-chip" size={26} color="#FFF" />
              </View>
              <Text style={styles.modalTitle}>{qualityInfo.tierName}</Text>
              <Text style={styles.modalSubtitle}>{qualityInfo.description}</Text>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Tốc độ bit (Bitrate)</Text>
                <Text style={styles.specValue}>{qualityInfo.bitrateKbps} kbps</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Định dạng âm thanh</Text>
                <Text style={styles.specValue}>{qualityInfo.codec} · {qualityInfo.sampleRate}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Độ phân giải</Text>
                <Text style={styles.specValue}>{qualityInfo.bitDepth}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Phân đoạn (HLS Segment)</Text>
                <Text style={styles.specValue}>{qualityInfo.segmentIndex !== undefined ? `#${qualityInfo.segmentIndex}` : 'Luồng chuẩn'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.modalButton} onPress={() => setShowQualityModal(false)}>
              <Text style={styles.modalButtonText}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: FALLBACK_BG },
  fill: { flex: 1 },
  pad: { paddingHorizontal: 24 },
  heroArt: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 0 },
  grabArea: { alignItems: 'center', paddingBottom: 10, zIndex: 2, position: 'relative' },
  grabAreaStatic: { alignItems: 'center', paddingBottom: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)', boxShadow: '0px 0px 8px rgba(0,0,0,0.4)'},
  lower: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  title: { color: INK, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  artist: { color: DIM, fontSize: 20, marginTop: 1 },
  live: { color: '#FF453A', fontSize: 12, fontWeight: '800', letterSpacing: 0.4, marginBottom: 4 },
  capsule: { flexDirection: 'row', height: 46, paddingHorizontal: 4, alignItems: 'center' },
  controls: { gap: 4 },
  progress: {},
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  time: { color: DIM, fontSize: 12, fontVariant: ['tabular-nums'], minWidth: 44 },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1E1E22',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0px 10px 48px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qualityIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
  },
  specGrid: {
    gap: 12,
    marginBottom: 20,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  specValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  liveBar: { height: 36, justifyContent: 'center' },
  liveText: { color: DIM, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginVertical: 18 },
  skip: { width: 72, height: 64, alignItems: 'center', justifyContent: 'center' },
  play: { width: 88, height: 80, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  toggle: { width: 48, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: 'rgba(255,255,255,0.85)' },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, marginBottom: 8 },
  compactTitle: { color: INK, fontSize: 17, fontWeight: '700' },
  desktop: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 64, gap: 64 },
  close: { position: 'absolute', top: 24, left: 24, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 2 },
  desktopLeft: { alignItems: 'center', gap: 28 },
  desktopArt: { borderRadius: 14, boxShadow: '0px 20px 80px rgba(0,0,0,0.45)' },
  desktopRight: { flex: 1, height: '80%' },
});
