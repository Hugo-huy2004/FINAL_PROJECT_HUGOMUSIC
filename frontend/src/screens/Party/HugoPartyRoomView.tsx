import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, Song } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { UserAvatar } from '../../components/UserAvatar';
import CoverArt from '../../components/CoverArt';
import LiquidGlassCard from '../../components/LiquidGlass/LiquidGlassCard';
import WaterDropletBadge from '../../components/LiquidGlass/WaterDropletBadge';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';

interface HugoPartyRoomViewProps {
  onClose?: () => void;
  isEmbedded?: boolean;
}

export default function HugoPartyRoomView({ onClose, isEmbedded = false }: HugoPartyRoomViewProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  // Party Store State
  const partyRoom = useStore((state) => state.partyRoom);
  const isPartyHost = useStore((state) => state.isPartyHost);
  const currentSong = useStore((state) => state.currentSong);
  const isPlaying = useStore((state) => state.isPlaying);
  const position = useStore((state) => state.position);
  const duration = useStore((state) => state.duration);
  const songs = useStore((state) => state.songs);

  // Actions
  const hostPlayPause = useStore((state) => state.hostPlayPause);
  const hostSeek = useStore((state) => state.hostSeek);
  const hostNextSong = useStore((state) => state.hostNextSong);
  const hostPrevSong = useStore((state) => state.hostPrevSong);
  const hostSelectSong = useStore((state) => state.hostSelectSong);
  const addSongToPartyQueue = useStore((state) => state.addSongToPartyQueue);
  const removeSongFromPartyQueue = useStore((state) => state.removeSongFromPartyQueue);
  const leavePartyRoom = useStore((state) => state.leavePartyRoom);
  const deletePartyRoom = useStore((state) => state.deletePartyRoom);
  const updatePartyRoom = useStore((state) => state.updatePartyRoom);
  const setPartyRoomVisible = useStore((state) => state.setPartyRoomVisible);

  // Local UI State
  const [copied, setCopied] = useState(false);
  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit Room Settings State (Host)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editGenre, setEditGenre] = useState('Tổng hợp');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Strict deduplication to avoid ghost/duplicate avatars
  const participants = useMemo(() => {
    if (!partyRoom) return [];
    const raw = partyRoom.participants || [];
    const seen = new Set<string>();
    return raw.filter((p) => {
      if (p.role === 'host' || (partyRoom.host && p.userId === partyRoom.host)) {
        if (seen.has('host')) return false;
        seen.add('host');
        return true;
      }
      if (partyRoom.hostName && p.name === partyRoom.hostName) {
        return false;
      }
      const key = p.userId ? `u_${p.userId}` : `n_${p.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [partyRoom?.participants, partyRoom?.host, partyRoom?.hostName]);

  if (!partyRoom) {
    return null;
  }

  const roomCode = partyRoom.code;
  const queue = partyRoom.queue || [];
  const activeTrack = currentSong || partyRoom.currentSong;

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const handleCopyCode = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (e) {
        // fallback
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    Alert.alert(
      'Rời phòng',
      'Bạn có muốn rời khỏi phòng nghe chung này không? Phòng vẫn sẽ tiếp tục hoạt động.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rời phòng',
          style: 'destructive',
          onPress: () => {
            leavePartyRoom();
            onClose?.();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Xóa phòng',
      'Bạn là Host của phòng này. Khi xóa, phòng sẽ bị đóng và tất cả thành viên sẽ rời phòng. Bạn có chắc chắn muốn xóa?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa phòng',
          style: 'destructive',
          onPress: () => {
            deletePartyRoom();
            onClose?.();
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên phòng');
      return;
    }
    setIsSavingEdit(true);
    try {
      await updatePartyRoom(roomCode, {
        name: editName.trim(),
        description: editDesc.trim(),
        genre: editGenre,
        isPublic: editIsPublic,
      });
      setIsEditModalOpen(false);
    } catch (err: any) {
      Alert.alert('Lỗi cập nhật', err.message || 'Không thể lưu cài đặt');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredCatalogSongs = songs.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q);
  });

  const onlineCount = participants.filter((p) => p.isOnline).length;

  return (
    <View style={[styles.container, !isEmbedded && { paddingTop: insets.top }, { backgroundColor: colors.background }]}>
      {/* Centered responsive container */}
      <View style={styles.centerWrapper}>
        {/* Navigation Bar */}
        <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
          {/* Close or Back button */}
          {onClose ? (
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.surface }]}
              onPress={() => {
                setPartyRoomVisible(false);
                onClose();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name={isEmbedded ? 'arrow-back' : 'chevron-down'} size={18} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}

          {/* Center info */}
          <View style={styles.navCenter}>
            <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
              {partyRoom.name || 'Party Room'}
            </Text>
            <TouchableOpacity style={styles.pinPill} onPress={handleCopyCode} activeOpacity={0.7}>
              <Text style={[styles.pinText, { color: colors.textSecondary }]}>Mã: {roomCode}</Text>
              <Ionicons
                name={copied ? 'checkmark-outline' : 'copy-outline'}
                size={13}
                color={colors.textSecondary}
                style={{ marginLeft: 5 }}
              />
            </TouchableOpacity>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isPartyHost && (
              <TouchableOpacity
                style={styles.textActionBtn}
                onPress={() => {
                  setEditName(partyRoom.name || '');
                  setEditDesc(partyRoom.description || '');
                  setEditGenre(partyRoom.genre || 'Tổng hợp');
                  setEditIsPublic(partyRoom.isPublic !== false);
                  setIsEditModalOpen(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={15} color={colors.textSecondary} style={{ marginRight: 3 }} />
                <Text style={[styles.textActionLabel, { color: colors.textSecondary }]}>Sửa</Text>
              </TouchableOpacity>
            )}

            {isPartyHost ? (
              <TouchableOpacity style={styles.textActionBtn} onPress={handleDelete} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={15} color={colors.textSecondary} style={{ marginRight: 3 }} />
                <Text style={[styles.textActionLabel, { color: colors.textSecondary }]}>Xóa</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.textActionBtn} onPress={handleLeave} activeOpacity={0.7}>
                <Ionicons name="exit-outline" size={15} color={colors.textSecondary} style={{ marginRight: 3 }} />
                <Text style={[styles.textActionLabel, { color: colors.textSecondary }]}>Rời</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* Role Pill */}
          <View style={[styles.rolePill, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center' }]}>
            <WaterDropletBadge
              label={isPartyHost ? 'Host' : 'Live Sync'}
              color={isPartyHost ? '#F59E0B' : '#10B981'}
              size="sm"
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              {isPartyHost
                ? 'Bạn là Host • Toàn quyền chọn bài và điều khiển'
                : `Đang nghe đồng bộ cùng ${partyRoom.hostName || 'Host'}`}
            </Text>
          </View>

          {/* Main Player Card: Liquid Glass Concert Stage */}
          <LiquidGlassCard
            style={[styles.playerCard, { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }]}
            glowColor={isPlaying ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(7, 102, 83, 0.20)') : 'rgba(255, 255, 255, 0.08)'}
            borderRadius={28}
          >
            {activeTrack ? (
              <>
                {/* 1. Vinyl & Artwork Stage with Ambient Glow */}
                <View style={styles.vinylStageWrapper}>
                  {/* Ambient Colored Aura */}
                  <View
                    style={[
                      styles.ambientStageGlow,
                      Platform.OS === 'web' && ({
                        background: isDark
                          ? 'radial-gradient(circle, rgba(16, 185, 129, 0.45) 0%, rgba(56, 189, 248, 0.22) 40%, transparent 70%)'
                          : 'radial-gradient(circle, rgba(16, 185, 129, 0.28) 0%, rgba(6, 182, 212, 0.16) 45%, transparent 70%)',
                        filter: 'blur(36px)',
                        transform: isPlaying ? 'scale(1.22)' : 'scale(0.95)',
                        transition: 'all 1.6s ease-in-out',
                      } as any),
                    ]}
                  />

                  {/* Classic Vinyl Disc (Visible behind art & spins during playback) */}
                  <View
                    style={[
                      styles.vinylDisc,
                      Platform.OS === 'web' && ({
                        animationKeyframes: isPlaying ? 'vinylSpin' : 'none',
                        animationDuration: '8s',
                        animationTimingFunction: 'linear',
                        animationIterationCount: 'infinite',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 12px rgba(255, 255, 255, 0.2)',
                      } as any),
                    ]}
                  >
                    <View style={styles.vinylGrooveRing1} />
                    <View style={styles.vinylGrooveRing2} />
                    <View style={styles.vinylCenterLabel}>
                      <CoverArt uri={activeTrack.coverArt} size={36} radius={18} />
                    </View>
                  </View>

                  {/* Front Jacket CoverArt with WaterDroplet status badge */}
                  <View
                    style={[
                      styles.jacketArtWrap,
                      Platform.OS === 'web' && ({
                        boxShadow: isDark
                          ? '0 18px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.14)'
                          : '0 16px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)',
                      } as any),
                    ]}
                  >
                    <CoverArt uri={activeTrack.coverArt} size={170} radius={14} />
                    <View style={styles.stageStatusPill}>
                      <WaterDropletBadge
                        label={isPlaying ? 'Đang phát' : 'Tạm dừng'}
                        color={isPlaying ? '#10B981' : '#94A3B8'}
                        size="sm"
                      />
                    </View>
                  </View>
                </View>

                {/* 2. Metadata */}
                <Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
                  {activeTrack.title || 'Đang chọn bài...'}
                </Text>
                <Text style={[styles.artistName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {activeTrack.artist || 'Chưa rõ nghệ sĩ'}
                </Text>

                {/* 3. Live Audio Soundwave Visualizer */}
                <View style={styles.stageVisualizerRow}>
                  {Array.from({ length: 26 }).map((_, i) => {
                    const baseH = [12, 20, 28, 16, 32, 24, 18, 30, 22, 14, 26, 34, 22, 16, 28, 20, 32, 24, 16, 26, 18, 22, 14, 10, 18, 24][i % 26];
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stageWaveBar,
                          {
                            height: isPlaying ? baseH : 4,
                          },
                          Platform.OS === 'web' && ({
                            background: isDark
                              ? 'linear-gradient(180deg, #34D399 0%, #10B981 100%)'
                              : 'linear-gradient(180deg, #10B981 0%, #047857 100%)',
                            boxShadow: isPlaying && isDark ? '0 0 6px rgba(16, 185, 129, 0.55)' : 'none',
                            animationKeyframes: isPlaying ? 'hugoWaveOscillate' : 'none',
                            animationDuration: `${0.65 + (i % 6) * 0.12}s`,
                            animationTimingFunction: 'ease-in-out',
                            animationIterationCount: 'infinite',
                            animationDirection: 'alternate',
                            animationDelay: `${i * 0.035}s`,
                            transformOrigin: 'bottom center',
                          } as any),
                          Platform.OS !== 'web' && { backgroundColor: isDark ? '#10B981' : '#047857' },
                        ]}
                      />
                    );
                  })}
                </View>

                {/* 4. Scrubber Progress Bar */}
                <View style={styles.scrubberContainer}>
                  <TouchableOpacity
                    activeOpacity={isPartyHost ? 0.85 : 1}
                    style={[
                      styles.progressBarTrack,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
                        height: 6,
                        borderRadius: 3,
                      },
                    ]}
                    onPress={(e) => {
                      if (!isPartyHost || !duration) return;
                      if (Platform.OS === 'web') {
                        const target = e.currentTarget as any;
                        const rect = target.getBoundingClientRect();
                        const clickX = (e.nativeEvent as any).clientX - rect.left;
                        const pct = Math.max(0, Math.min(1, clickX / rect.width));
                        hostSeek(pct * duration);
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.progressBarFill,
                        Platform.OS === 'web'
                          ? ({
                              width: `${progressPercent}%`,
                              background: 'linear-gradient(90deg, #10B981 0%, #34D399 60%, #06B6D4 100%)',
                              boxShadow: '0 0 10px rgba(16, 185, 129, 0.65)',
                            } as any)
                          : { width: `${progressPercent}%`, backgroundColor: colors.text },
                      ]}
                    />
                  </TouchableOpacity>

                  <View style={styles.timeRow}>
                    <Text style={[styles.timeText, { color: colors.textTertiary }]}>{formatTime(position)}</Text>
                    {!isPartyHost && (
                      <Text style={[styles.syncStatusText, { color: colors.textSecondary }]}>
                        {isPlaying ? 'Đang phát đồng bộ' : 'Tạm dừng theo Host'}
                      </Text>
                    )}
                    <Text style={[styles.timeText, { color: colors.textTertiary }]}>{formatTime(duration)}</Text>
                  </View>
                </View>

                {/* 5. Controls (Host Only) or Guest Notice */}
                {isPartyHost ? (
                  <View style={styles.controlsRow}>
                    <TouchableOpacity
                      style={[
                        styles.transportBtn,
                        Platform.OS === 'web' && ({
                          borderRadius: 14,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                          transition: 'all 0.18s ease',
                          cursor: 'pointer',
                        } as any),
                      ]}
                      onPress={hostPrevSong}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="play-skip-back" size={22} color={colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.playPauseBtn,
                        Platform.OS === 'web'
                          ? ({
                              background: isDark
                                ? 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.12) 36%, rgba(16,185,129,0.92) 58%, #047857 100%)'
                                : 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.2) 36%, rgba(7,102,83,0.92) 58%, #03483b 100%)',
                              boxShadow: isPlaying
                                ? '0 0 32px rgba(16, 185, 129, 0.8), inset 0 2px 3px rgba(255, 255, 255, 0.85)'
                                : '0 6px 20px rgba(0, 0, 0, 0.25), inset 0 1.5px 2px rgba(255, 255, 255, 0.65)',
                              animationKeyframes: isPlaying ? 'hugoPlayOrbGlow' : 'none',
                              animationDuration: '2.2s',
                              animationTimingFunction: 'ease-in-out',
                              animationIterationCount: 'infinite',
                              cursor: 'pointer',
                              transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
                            } as any)
                          : { backgroundColor: colors.text },
                      ]}
                      onPress={hostPlayPause}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={isPlaying ? 'pause' : 'play'}
                        size={26}
                        color="#ffffff"
                        style={{
                          marginLeft: isPlaying ? 0 : 2,
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
                        }}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.transportBtn,
                        Platform.OS === 'web' && ({
                          borderRadius: 14,
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                          transition: 'all 0.18s ease',
                          cursor: 'pointer',
                        } as any),
                      ]}
                      onPress={hostNextSong}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="play-skip-forward" size={22} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.guestStatusRow}>
                    <Ionicons name="lock-closed-outline" size={13} color={colors.textTertiary} style={{ marginRight: 5 }} />
                    <Text style={[styles.guestStatusText, { color: colors.textTertiary }]}>
                      Host đang điều khiển phát nhạc
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyPlayerState}>
                <Ionicons name="musical-notes-outline" size={44} color={colors.textTertiary} />
                <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
                  {isPartyHost ? 'Chưa chọn bài hát' : 'Host chưa phát bài hát'}
                </Text>
                <Text style={[styles.emptyStateDesc, { color: colors.textSecondary }]}>
                  {isPartyHost
                    ? 'Thêm bài từ danh sách bên dưới để bắt đầu nghe chung cùng mọi người.'
                    : 'Nhạc sẽ tự động phát đồng bộ khi Host bắt đầu.'}
                </Text>
              </View>
            )}
          </LiquidGlassCard>

          {/* Connected Participants Section */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Người tham gia ({participants.length})
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>
                {onlineCount} trực tuyến
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.participantsRow}>
              {participants.map((p, idx) => {
                const isHost = p.role === 'host' || p.userId === partyRoom.host;
                return (
                  <View key={p._id || idx} style={styles.participantItem}>
                    <View style={styles.avatarWrap}>
                      <UserAvatar avatarUrl={p.avatar} username={p.name} nickname={p.name} size={44} />
                      <View style={[styles.onlineDot, { backgroundColor: '#10B981', borderColor: colors.surface }]} />
                      {isHost && (
                        <View style={[styles.hostBadge, { backgroundColor: '#F59E0B', borderColor: colors.surface }]}>
                          <Ionicons name="star" size={9} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.participantRole, { color: colors.textTertiary }]}>
                      {isHost ? 'Host' : 'Khách'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Queue Section */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Danh sách phát ({queue.length})
              </Text>

              {isPartyHost && (
                <LiquidGlassButton
                  onPress={() => setIsAddSongModalOpen(true)}
                  variant="pill"
                  size="sm"
                >
                  <Ionicons name="add" size={15} color={colors.text} style={{ marginRight: 4 }} />
                  <Text style={[styles.addBtnText, { color: colors.text }]}>Thêm bài</Text>
                </LiquidGlassButton>
              )}
            </View>

            {queue.length === 0 ? (
              <View style={[styles.emptyQueueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyQueueText, { color: colors.textSecondary }]}>
                  Hàng đợi trống.
                </Text>
                {isPartyHost && (
                  <LiquidGlassButton
                    variant="primary"
                    size="md"
                    onPress={() => setIsAddSongModalOpen(true)}
                    style={{ marginTop: 12 }}
                  >
                    <Text style={[styles.emptyAddBtnText, { color: colors.background }]}>Thêm bài hát</Text>
                  </LiquidGlassButton>
                )}
              </View>
            ) : (
              <View style={[styles.queueContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {queue.map((song, idx) => {
                  const isCurrent = activeTrack?._id === song._id;
                  return (
                    <TouchableOpacity
                      key={`${song._id}-${idx}`}
                      style={[
                        styles.queueRow,
                        idx < queue.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                        isCurrent && { backgroundColor: colors.surfaceHover },
                      ]}
                      onPress={() => {
                        if (isPartyHost) hostSelectSong(song);
                      }}
                      activeOpacity={isPartyHost ? 0.7 : 1}
                    >
                      <View style={styles.queueIndexCol}>
                        {isCurrent ? (
                          <View style={styles.miniEqualizerRow}>
                            <View style={[styles.miniEqBar, { height: 12 }]} />
                            <View style={[styles.miniEqBar, { height: 16 }]} />
                            <View style={[styles.miniEqBar, { height: 9 }]} />
                          </View>
                        ) : (
                          <Text style={[styles.queueIndexText, { color: colors.textTertiary }]}>{idx + 1}</Text>
                        )}
                      </View>

                      <View style={{ marginRight: 12 }}>
                        <CoverArt uri={song.coverArt} size={42} radius={8} />
                      </View>

                      <View style={styles.queueMeta}>
                        <Text
                          style={[styles.queueTitle, { color: colors.text, fontWeight: isCurrent ? '700' : '500' }]}
                          numberOfLines={1}
                        >
                          {song.title}
                        </Text>
                        <Text style={[styles.queueArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                          {song.artist}
                        </Text>
                      </View>

                      {isPartyHost && !isCurrent && (
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => removeSongFromPartyQueue(idx)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close" size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Add Song to Room Modal (Host Only) */}
      <Modal visible={isAddSongModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Thêm bài hát</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsAddSongModalOpen(false);
                  setSearchQuery('');
                }}
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.modalSearchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.modalSearchInput, { color: colors.text }]}
                placeholder="Tìm kiếm bài hát, ca sĩ..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView style={styles.modalSongList}>
              {filteredCatalogSongs.length === 0 ? (
                <Text style={[styles.noResultText, { color: colors.textTertiary }]}>
                  Không tìm thấy bài hát phù hợp
                </Text>
              ) : (
                filteredCatalogSongs.map((s) => (
                  <TouchableOpacity
                    key={s._id}
                    style={[styles.modalSongItem, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      addSongToPartyQueue(s);
                      if (!activeTrack) {
                        hostSelectSong(s);
                      }
                      setIsAddSongModalOpen(false);
                      setSearchQuery('');
                    }}
                    activeOpacity={0.7}
                  >
                    {s.coverArt ? (
                      <Image source={{ uri: s.coverArt }} style={styles.modalSongArt} />
                    ) : (
                      <View style={[styles.modalSongArt, { backgroundColor: colors.surfaceHover }]}>
                        <Ionicons name="musical-note-outline" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={styles.modalSongMeta}>
                      <Text style={[styles.modalSongTitle, { color: colors.text }]} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text style={[styles.modalSongArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                        {s.artist}
                      </Text>
                    </View>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Room Settings Modal (Host Only) */}
      <Modal visible={isEditModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Cài đặt phòng</Text>
              <TouchableOpacity onPress={() => setIsEditModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Tên phòng</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Nhập tên phòng"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Mô tả / Lời chào</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text, height: 64 }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Ghi chú về phòng nghe (không bắt buộc)"
                placeholderTextColor={colors.textTertiary}
                multiline
              />

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Thể loại nhạc</Text>
              <View style={styles.genreChipsRow}>
                {['Tổng hợp', 'V-Pop', 'US-UK', 'Lofi / Chill', 'Acoustic', 'EDM / Dance', 'Ballad'].map((g) => {
                  const isSelected = editGenre === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor: isSelected ? colors.text : colors.surfaceHover,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setEditGenre(g)}
                    >
                      <Text
                        style={[
                          styles.genreChipText,
                          { color: isSelected ? colors.background : colors.textSecondary },
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Chế độ phòng</Text>
              <View style={styles.privacyRow}>
                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    editIsPublic && [styles.privacyOptionActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setEditIsPublic(true)}
                >
                  <Ionicons name="earth-outline" size={16} color={editIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: colors.text }]}>Công khai</Text>
                    <Text style={[styles.privacyDesc, { color: colors.textTertiary }]}>Hiển thị khám phá</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.privacyOption,
                    !editIsPublic && [styles.privacyOptionActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setEditIsPublic(false)}
                >
                  <Ionicons name="lock-closed-outline" size={16} color={!editIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: colors.text }]}>Riêng tư</Text>
                    <Text style={[styles.privacyDesc, { color: colors.textTertiary }]}>Cần mã PIN 6 số</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setIsEditModalOpen(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.text }]}
                onPress={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={[styles.modalSubmitText, { color: colors.background }]}>Lưu thay đổi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navCenter: {
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  pinPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  textActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  textActionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  roleText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  playerCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  vinylStageWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 6,
    width: 240,
    height: 180,
  },
  ambientStageGlow: {
    position: 'absolute',
    width: 230,
    height: 180,
    borderRadius: 90,
    zIndex: 0,
    pointerEvents: 'none',
  },
  vinylDisc: {
    position: 'absolute',
    right: 8,
    top: 5,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#111317',
    borderWidth: 2,
    borderColor: '#262930',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  vinylGrooveRing1: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vinylGrooveRing2: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  vinylCenterLabel: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  jacketArtWrap: {
    position: 'relative',
    zIndex: 2,
    marginRight: 40,
  },
  stageStatusPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 5,
  },
  stageVisualizerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3.5,
    height: 38,
    marginBottom: 16,
    marginTop: 4,
  },
  stageWaveBar: {
    width: 3.5,
    borderRadius: 999,
  },
  miniEqualizerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  miniEqBar: {
    width: 2.5,
    backgroundColor: '#10B981',
    borderRadius: 1,
  },
  songTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    maxWidth: '92%',
    letterSpacing: -0.3,
  },
  artistName: {
    fontSize: 14.5,
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: '90%',
    fontWeight: '500',
  },
  scrubberContainer: {
    width: '100%',
    maxWidth: 440,
    marginBottom: 20,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  timeText: {
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  syncStatusText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  transportBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  guestStatusText: {
    fontSize: 12,
  },
  emptyPlayerState: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyStateDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
  },
  participantsRow: {
    paddingVertical: 4,
    gap: 14,
  },
  participantItem: {
    alignItems: 'center',
    width: 60,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    zIndex: 5,
  },
  hostBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 58,
  },
  participantRole: {
    fontSize: 10,
    marginTop: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyQueueCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyQueueText: {
    fontSize: 13,
    marginBottom: 10,
  },
  emptyAddBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  queueContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  queueIndexCol: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  queueIndexText: {
    fontSize: 12,
    fontWeight: '600',
  },
  queueArt: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueMeta: {
    flex: 1,
    marginRight: 10,
  },
  queueTitle: {
    fontSize: 13.5,
    marginBottom: 2,
  },
  queueArtist: {
    fontSize: 12,
  },
  removeBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  modalSongList: {
    maxHeight: 340,
  },
  modalSongItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalSongArt: {
    width: 38,
    height: 38,
    borderRadius: 6,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSongMeta: {
    flex: 1,
    marginRight: 10,
  },
  modalSongTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  modalSongArtist: {
    fontSize: 12,
  },
  noResultText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 13,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  formInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  genreChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  genreChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  privacyRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  privacyOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  privacyOptionActive: {
    borderWidth: 1.5,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  privacyDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
