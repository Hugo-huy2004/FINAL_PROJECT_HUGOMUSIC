import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, PartyRoomData } from '../../store/useStore';
import { useAppTheme } from '../../theme/theme';
import { useTranslation } from '../../i18n/i18n';
import { useIsMobile } from '../../utils/responsive';
import { UserAvatar } from '../../components/UserAvatar';
import HugoPartyRoomView from './HugoPartyRoomView';
import LiquidGlassCard from '../../components/LiquidGlass/LiquidGlassCard';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import WaterDropletBadge from '../../components/LiquidGlass/WaterDropletBadge';

interface HugoPartyScreenProps {
  onNavigate?: (tab: string) => void;
}

const GENRES = ['Tất cả', 'Tổng hợp', 'V-Pop', 'US-UK', 'Lofi / Chill', 'Acoustic', 'EDM / Dance', 'Ballad'];
const CREATE_GENRES = ['Tổng hợp', 'V-Pop', 'US-UK', 'Lofi / Chill', 'Acoustic', 'EDM / Dance', 'Ballad'];

type PartySubTab = 'explore' | 'create' | 'join' | 'my-rooms';

export default function HugoPartyScreen({ onNavigate }: HugoPartyScreenProps) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const user = useStore((state) => state.user);
  const setLoginModalVisible = useStore((state) => state.setLoginModalVisible);
  const partyRoom = useStore((state) => state.partyRoom);
  const publicPartyRooms = useStore((state) => state.publicPartyRooms);
  const myPartyRooms = useStore((state) => state.myPartyRooms);
  const isLoadingPartyRooms = useStore((state) => state.isLoadingPartyRooms);

  const fetchPublicPartyRooms = useStore((state) => state.fetchPublicPartyRooms);
  const fetchMyPartyRooms = useStore((state) => state.fetchMyPartyRooms);
  const createPartyRoom = useStore((state) => state.createPartyRoom);
  const updatePartyRoom = useStore((state) => state.updatePartyRoom);
  const joinPartyRoom = useStore((state) => state.joinPartyRoom);
  const deletePartyRoom = useStore((state) => state.deletePartyRoom);

  // Sub-tabs
  const [activeTab, setActiveTab] = useState<PartySubTab>('explore');
  const [selectedGenre, setSelectedGenre] = useState('Tất cả');

  // Create Form State
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGenre, setNewGenre] = useState('Tổng hợp');
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Join PIN State
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Edit Modal State (My Rooms CRUD)
  const [editingRoom, setEditingRoom] = useState<PartyRoomData | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editGenre, setEditGenre] = useState('Tổng hợp');
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Load public rooms and my rooms on mount
  useEffect(() => {
    fetchPublicPartyRooms();
    if (user) {
      fetchMyPartyRooms();
    }
  }, [fetchPublicPartyRooms, fetchMyPartyRooms, user]);

  // Filter public rooms by selected genre
  const filteredPublicRooms = useMemo(() => {
    if (!publicPartyRooms) return [];
    if (selectedGenre === 'Tất cả') return publicPartyRooms;
    return publicPartyRooms.filter((r) => r.genre === selectedGenre);
  }, [publicPartyRooms, selectedGenre]);

  // If already inside an active party room, render the room view directly in the layout!
  if (partyRoom) {
    return <HugoPartyRoomView isEmbedded={true} onClose={() => onNavigate?.('home')} />;
  }

  const handleCreate = async () => {
    if (!user) {
      setLoginModalVisible(true);
      return;
    }
    const trimmedName = newName.trim();
    setIsCreating(true);
    try {
      await createPartyRoom({
        name: trimmedName || undefined,
        description: newDesc.trim() || undefined,
        genre: newGenre,
        isPublic: newIsPublic,
        forceNew: true,
      });
      setNewName('');
      setNewDesc('');
    } catch (err: any) {
      Alert.alert('Lỗi tạo phòng', err.message || 'Không thể tạo phòng nghe chung');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (codeToJoin?: string) => {
    if (!user) {
      setLoginModalVisible(true);
      return;
    }
    const cleanCode = (codeToJoin || joinCode).trim();
    if (!cleanCode) return;

    setIsJoining(true);
    try {
      await joinPartyRoom(cleanCode);
      setJoinCode('');
    } catch (err: any) {
      Alert.alert('Lỗi vào phòng', err.message || 'Mã phòng không tồn tại hoặc đã đóng');
    } finally {
      setIsJoining(false);
    }
  };

  const openEditModal = (room: PartyRoomData) => {
    setEditingRoom(room);
    setEditName(room.name || '');
    setEditDesc(room.description || '');
    setEditGenre(room.genre || 'Tổng hợp');
    setEditIsPublic(room.isPublic !== false);
  };

  const handleSaveEdit = async () => {
    if (!editingRoom) return;
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên phòng');
      return;
    }
    setIsSavingEdit(true);
    try {
      await updatePartyRoom(editingRoom.code, {
        name: editName.trim(),
        description: editDesc.trim(),
        genre: editGenre,
        isPublic: editIsPublic,
      });
      setEditingRoom(null);
    } catch (err: any) {
      Alert.alert('Lỗi cập nhật', err.message || 'Không thể lưu thay đổi');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteMyRoom = (room: PartyRoomData) => {
    Alert.alert(
      'Xóa phòng',
      `Bạn có chắc chắn muốn xóa vĩnh viễn phòng "${room.name || room.code}" không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => deletePartyRoom(room.code, true),
        },
      ]
    );
  };

  const sidePadding = isMobile ? 16 : 36;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: sidePadding,
            paddingTop: isMobile ? 18 : 28,
            paddingBottom: isMobile ? 160 : 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pageTitle, { color: colors.text, fontSize: isMobile ? 28 : 34 }]}>
                {t('partySync') || 'Sync Party'}
              </Text>
              <Text style={[styles.pageSubTitle, { color: colors.textSecondary }]}>
                Đồng bộ âm nhạc theo thời gian thực. Host điều khiển, mọi người cùng thưởng thức.
              </Text>
            </View>

            {/* Refresh Button */}
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                fetchPublicPartyRooms();
                if (user) fetchMyPartyRooms();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Navigation Tabs (CRUD Segments with Liquid Glass) */}
        <LiquidGlassCard
          borderRadius={24}
          tint={isDark ? 'rgba(28, 28, 34, 0.72)' : 'rgba(255, 255, 255, 0.82)'}
          style={[styles.segmentedControl, { padding: 4 }]}
        >
          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'explore' && [styles.segmentItemActive, { backgroundColor: colors.surfaceHover }],
            ]}
            onPress={() => setActiveTab('explore')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="radio-outline"
              size={15}
              color={activeTab === 'explore' ? colors.text : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, { color: activeTab === 'explore' ? colors.text : colors.textSecondary }]}>
              Khám phá
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'create' && [styles.segmentItemActive, { backgroundColor: colors.surfaceHover }],
            ]}
            onPress={() => {
              if (!user) {
                setLoginModalVisible(true);
                return;
              }
              setActiveTab('create');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="add-circle-outline"
              size={15}
              color={activeTab === 'create' ? colors.text : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, { color: activeTab === 'create' ? colors.text : colors.textSecondary }]}>
              Tạo phòng
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentItem,
              activeTab === 'join' && [styles.segmentItemActive, { backgroundColor: colors.surfaceHover }],
            ]}
            onPress={() => setActiveTab('join')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="keypad-outline"
              size={15}
              color={activeTab === 'join' ? colors.text : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, { color: activeTab === 'join' ? colors.text : colors.textSecondary }]}>
              Mã PIN
            </Text>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              style={[
                styles.segmentItem,
                activeTab === 'my-rooms' && [styles.segmentItemActive, { backgroundColor: colors.surfaceHover }],
              ]}
              onPress={() => {
                fetchMyPartyRooms();
                setActiveTab('my-rooms');
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="folder-outline"
                size={15}
                color={activeTab === 'my-rooms' ? colors.text : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.segmentText, { color: activeTab === 'my-rooms' ? colors.text : colors.textSecondary }]}>
                Phòng của tôi ({myPartyRooms.length})
              </Text>
            </TouchableOpacity>
          )}
        </LiquidGlassCard>

        {/* TAB 1: KHÁM PHÁ (EXPLORE PUBLIC ROOMS) */}
        {activeTab === 'explore' && (
          <View style={styles.tabContent}>
            {/* Genre Filter Scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreFilterRow}>
              {GENRES.map((g) => {
                const isSelected = selectedGenre === g;
                return (
                  <LiquidGlassButton
                    key={g}
                    variant={isSelected ? 'primary' : 'pill'}
                    size="sm"
                    title={g}
                    onPress={() => setSelectedGenre(g)}
                    style={{ marginRight: 8 }}
                  />
                );
              })}
            </ScrollView>

            {isLoadingPartyRooms ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Đang tải danh sách phòng...</Text>
              </View>
            ) : filteredPublicRooms.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="radio-outline" size={40} color={colors.textTertiary} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Chưa có phòng công khai nào</Text>
                <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                  Hãy là người đầu tiên khởi tạo phòng Party Sync và mời mọi người cùng tham gia!
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.text, marginTop: 16 }]}
                  onPress={() => {
                    if (!user) setLoginModalVisible(true);
                    else setActiveTab('create');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={17} color={colors.background} style={{ marginRight: 6 }} />
                  <Text style={[styles.primaryBtnText, { color: colors.background }]}>Tạo phòng ngay</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.roomGrid}>
                {filteredPublicRooms.map((room) => (
                  <LiquidGlassCard
                    key={room._id || room.code}
                    borderRadius={18}
                    glowColor="#10B981"
                    tint={isDark ? 'rgba(28, 28, 34, 0.78)' : 'rgba(255, 255, 255, 0.88)'}
                    style={[styles.roomCard, { backgroundColor: 'transparent' }]}
                  >
                    {/* Top Row: Room title & Genre badge */}
                    <View style={styles.roomCardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.roomCardName, { color: colors.text }]} numberOfLines={1}>
                          {room.name || 'Phòng Nghe Chung'}
                        </Text>
                        <View style={styles.roomCodePill}>
                          <Text style={[styles.roomCodeText, { color: colors.textTertiary }]}>#{room.code}</Text>
                        </View>
                      </View>
                      <View style={[styles.genreBadge, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}>
                        <Text style={[styles.genreBadgeText, { color: colors.textSecondary }]}>
                          {room.genre || 'Tổng hợp'}
                        </Text>
                      </View>
                    </View>

                    {/* Host & Listeners with WaterDropletBadge */}
                    <View style={styles.roomHostRow}>
                      <UserAvatar
                        avatarUrl={room.hostAvatar}
                        username={room.hostName || 'Host'}
                        nickname={room.hostName || 'Host'}
                        size={26}
                      />
                      <Text style={[styles.roomHostName, { color: colors.textSecondary }]} numberOfLines={1}>
                        {room.hostName || 'Host'}
                      </Text>
                      <View style={{ marginLeft: 'auto' }}>
                        <WaterDropletBadge
                          label={`${room.onlineCount || 1} online`}
                          color="#10B981"
                          size="sm"
                          pulsing={true}
                        />
                      </View>
                    </View>

                    {/* Playing Track Preview */}
                    <View style={[styles.roomTrackBox, { backgroundColor: colors.surfaceHover }]}>
                      {room.currentSong?.coverArt ? (
                        <Image source={{ uri: room.currentSong.coverArt }} style={styles.roomTrackArt} />
                      ) : (
                        <View style={[styles.roomTrackArtPlaceholder, { backgroundColor: colors.surface }]}>
                          <Ionicons name="musical-note-outline" size={14} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={[styles.roomTrackTitle, { color: colors.text }]} numberOfLines={1}>
                          {room.currentSong ? room.currentSong.title : 'Đang chờ phát bài...'}
                        </Text>
                        <Text style={[styles.roomTrackArtist, { color: colors.textTertiary }]} numberOfLines={1}>
                          {room.currentSong?.artist || 'Danh sách phát của Host'}
                        </Text>
                      </View>
                    </View>

                    {/* Join Action Button */}
                    <View style={{ marginTop: 12 }}>
                      <LiquidGlassButton
                        variant="primary"
                        size="sm"
                        title="Vào nghe chung"
                        onPress={() => handleJoin(room.code)}
                        icon={<Ionicons name="enter-outline" size={16} color="#ffffff" />}
                      />
                    </View>
                  </LiquidGlassCard>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: TẠO PHÒNG MỚI (CREATE ROOM FORM) */}
        {activeTab === 'create' && (
          <View style={[styles.formContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.formHeader}>
              <View style={[styles.formIconBox, { backgroundColor: colors.surfaceHover }]}>
                <Ionicons name="sparkles-outline" size={22} color={colors.text} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[styles.formMainTitle, { color: colors.text }]}>Khởi tạo phòng Party Sync</Text>
                <Text style={[styles.formSubTitle, { color: colors.textSecondary }]}>
                  Bạn là Host toàn quyền chọn bài và điều khiển trình phát cho cả phòng
                </Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Tên phòng</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text }]}
                value={newName}
                onChangeText={setNewName}
                placeholder={`VD: Phòng của ${user?.nickname || user?.username || 'tôi'}`}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Thể loại nhạc chính</Text>
              <View style={styles.genreChipsWrap}>
                {CREATE_GENRES.map((g) => {
                  const isSelected = newGenre === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.createGenreChip,
                        {
                          backgroundColor: isSelected ? colors.text : colors.surfaceHover,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setNewGenre(g)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.createGenreChipText,
                          { color: isSelected ? colors.background : colors.textSecondary },
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Chế độ phòng</Text>
              <View style={styles.privacyOptionGroup}>
                <TouchableOpacity
                  style={[
                    styles.privacyBox,
                    newIsPublic && [styles.privacyBoxActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setNewIsPublic(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="earth-outline" size={18} color={newIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.privacyBoxTitle, { color: colors.text }]}>Công khai (Public)</Text>
                    <Text style={[styles.privacyBoxSub, { color: colors.textTertiary }]}>
                      Hiển thị trên tab Khám phá, mọi người có thể tìm và nghe cùng
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.privacyBox,
                    !newIsPublic && [styles.privacyBoxActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setNewIsPublic(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={!newIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.privacyBoxTitle, { color: colors.text }]}>Riêng tư (Private)</Text>
                    <Text style={[styles.privacyBoxSub, { color: colors.textTertiary }]}>
                      Chỉ những người được bạn chia sẻ mã PIN 6 số mới có thể vào
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mô tả / Lời chào (Không bắt buộc)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text, height: 60 },
                ]}
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Lời chào hoặc ghi chú về phòng..."
                placeholderTextColor={colors.textTertiary}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.text, marginTop: 12 }]}
              onPress={handleCreate}
              disabled={isCreating}
              activeOpacity={0.85}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.background} style={{ marginRight: 6 }} />
                  <Text style={[styles.primaryBtnText, { color: colors.background }]}>Khởi tạo phòng ngay</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 3: MÃ PIN (JOIN DIRECTLY) */}
        {activeTab === 'join' && (
          <View style={[styles.formContainer, { backgroundColor: colors.surface, borderColor: colors.border, maxWidth: 520, alignSelf: 'center', width: '100%' }]}>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={[styles.formIconBox, { backgroundColor: colors.surfaceHover, width: 52, height: 52, borderRadius: 26, marginBottom: 14 }]}>
                <Ionicons name="keypad-outline" size={26} color={colors.text} />
              </View>
              <Text style={[styles.formMainTitle, { color: colors.text, textAlign: 'center' }]}>Nhập mã PIN phòng</Text>
              <Text style={[styles.formSubTitle, { color: colors.textSecondary, textAlign: 'center', marginTop: 4, maxWidth: 360 }]}>
                Nhập mã 6 chữ số do Host chia sẻ để đồng bộ thiết bị và tham gia nghe chung tức thì.
              </Text>

              <TextInput
                style={[
                  styles.largePinInput,
                  {
                    backgroundColor: colors.surfaceHover,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="123456"
                placeholderTextColor={colors.textTertiary}
                value={joinCode}
                onChangeText={setJoinCode}
                keyboardType="number-pad"
                maxLength={6}
                autoCapitalize="characters"
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: joinCode.trim().length >= 4 ? colors.text : colors.surfaceHover,
                    width: '100%',
                    marginTop: 16,
                  },
                ]}
                onPress={() => handleJoin()}
                disabled={isJoining || joinCode.trim().length < 4}
                activeOpacity={0.85}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <>
                    <Text
                      style={[
                        styles.primaryBtnText,
                        { color: joinCode.trim().length >= 4 ? colors.background : colors.textTertiary },
                      ]}
                    >
                      Vào phòng
                    </Text>
                    <Ionicons
                      name="arrow-forward-outline"
                      size={16}
                      color={joinCode.trim().length >= 4 ? colors.background : colors.textTertiary}
                      style={{ marginLeft: 6 }}
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 4: PHÒNG CỦA TÔI (MY ROOMS CRUD) */}
        {activeTab === 'my-rooms' && user && (
          <View style={styles.tabContent}>
            {myPartyRooms.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="folder-open-outline" size={40} color={colors.textTertiary} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Bạn chưa tạo phòng nào</Text>
                <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                  Khởi tạo một phòng nghe nhạc để chia sẻ danh sách phát cùng bạn bè!
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.text, marginTop: 16 }]}
                  onPress={() => setActiveTab('create')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={17} color={colors.background} style={{ marginRight: 6 }} />
                  <Text style={[styles.primaryBtnText, { color: colors.background }]}>Tạo phòng mới</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.myRoomsList}>
                {myPartyRooms.map((room) => (
                  <View
                    key={room._id || room.code}
                    style={[styles.myRoomCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={styles.myRoomHeader}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.myRoomTitle, { color: colors.text }]} numberOfLines={1}>
                            {room.name || 'Phòng Nghe Chung'}
                          </Text>
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor: room.isActive ? 'rgba(52, 199, 89, 0.15)' : colors.surfaceHover,
                                borderColor: room.isActive ? 'rgba(52, 199, 89, 0.4)' : colors.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                { color: room.isActive ? '#34C759' : colors.textTertiary },
                              ]}
                            >
                              {room.isActive ? 'Đang mở' : 'Đã đóng'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.myRoomCode, { color: colors.textSecondary }]}>Mã phòng: {room.code}</Text>
                        {room.description ? (
                          <Text style={[styles.myRoomDesc, { color: colors.textTertiary }]} numberOfLines={2}>
                            {room.description}
                          </Text>
                        ) : null}
                      </View>

                      {/* Genre & Privacy tag */}
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[styles.genreBadge, { backgroundColor: colors.surfaceHover, borderColor: colors.border }]}>
                          <Text style={[styles.genreBadgeText, { color: colors.textSecondary }]}>
                            {room.genre || 'Tổng hợp'}
                          </Text>
                        </View>
                        <Text style={[styles.myRoomPrivacyText, { color: colors.textTertiary }]}>
                          {room.isPublic ? 'Công khai' : 'Riêng tư'}
                        </Text>
                      </View>
                    </View>

                    {/* Action Toolbar */}
                    <View style={[styles.myRoomActions, { borderTopColor: colors.border }]}>
                      {room.isActive ? (
                        <TouchableOpacity
                          style={[styles.myRoomActionBtn, { backgroundColor: colors.text }]}
                          onPress={() => handleJoin(room.code)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="enter-outline" size={15} color={colors.background} style={{ marginRight: 4 }} />
                          <Text style={[styles.myRoomActionText, { color: colors.background }]}>Vào phòng</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={[styles.myRoomActionBtnOutline, { borderColor: colors.border }]}
                        onPress={() => openEditModal(room)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={15} color={colors.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={[styles.myRoomActionText, { color: colors.textSecondary }]}>Chỉnh sửa</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.myRoomActionBtnOutline, { borderColor: colors.border }]}
                        onPress={() => handleDeleteMyRoom(room)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={[styles.myRoomActionText, { color: colors.textSecondary }]}>Xóa</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* EDIT MODAL FOR MY ROOMS */}
      <Modal visible={!!editingRoom} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Chỉnh sửa phòng #{editingRoom?.code}</Text>
              <TouchableOpacity onPress={() => setEditingRoom(null)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Tên phòng</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Nhập tên phòng"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Mô tả / Lời chào</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceHover, borderColor: colors.border, color: colors.text, height: 60 }]}
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Ghi chú về phòng nghe..."
                placeholderTextColor={colors.textTertiary}
                multiline
              />

              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Thể loại</Text>
              <View style={styles.genreChipsWrap}>
                {CREATE_GENRES.map((g) => {
                  const isSelected = editGenre === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles.createGenreChip,
                        {
                          backgroundColor: isSelected ? colors.text : colors.surfaceHover,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setEditGenre(g)}
                    >
                      <Text
                        style={[
                          styles.createGenreChipText,
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
              <View style={styles.privacyOptionGroup}>
                <TouchableOpacity
                  style={[
                    styles.privacyBox,
                    editIsPublic && [styles.privacyBoxActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setEditIsPublic(true)}
                >
                  <Ionicons name="earth-outline" size={16} color={editIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.privacyBoxTitle, { color: colors.text }]}>Công khai</Text>
                    <Text style={[styles.privacyBoxSub, { color: colors.textTertiary }]}>Hiển thị trên Khám phá</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.privacyBox,
                    !editIsPublic && [styles.privacyBoxActive, { borderColor: colors.text }],
                    { backgroundColor: colors.surfaceHover, borderColor: colors.border },
                  ]}
                  onPress={() => setEditIsPublic(false)}
                >
                  <Ionicons name="lock-closed-outline" size={16} color={!editIsPublic ? colors.text : colors.textSecondary} />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[styles.privacyBoxTitle, { color: colors.text }]}>Riêng tư</Text>
                    <Text style={[styles.privacyBoxSub, { color: colors.textTertiary }]}>Cần mã PIN 6 số</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditingRoom(null)}
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
  scrollContent: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  pageSubTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 24,
    overflow: 'hidden',
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  segmentItemActive: {
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabContent: {
    width: '100%',
  },
  genreFilterRow: {
    gap: 8,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    padding: 36,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  roomCard: {
    width: (Platform.OS === 'web' ? 'calc(50% - 8px)' : '100%') as any,
    minWidth: 300,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  roomCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  roomCardName: {
    fontSize: 15,
    fontWeight: '700',
  },
  roomCodePill: {
    marginTop: 2,
  },
  roomCodeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  genreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  genreBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  roomHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  roomHostName: {
    fontSize: 12.5,
    marginLeft: 8,
    flex: 1,
  },
  roomListenersWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomListenersText: {
    fontSize: 11.5,
  },
  roomTrackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
  },
  roomTrackArt: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  roomTrackArtPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomTrackTitle: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  roomTrackArtist: {
    fontSize: 11,
    marginTop: 1,
  },
  formContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  formIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formMainTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  formSubTitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13.5,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  genreChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  createGenreChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  createGenreChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  privacyOptionGroup: {
    gap: 10,
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  privacyBoxActive: {
    borderWidth: 1.5,
  },
  privacyBoxTitle: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  privacyBoxSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  largePinInput: {
    width: '100%',
    maxWidth: 240,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 6,
    marginVertical: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    height: 44,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  myRoomsList: {
    gap: 14,
  },
  myRoomCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  myRoomHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  myRoomTitle: {
    fontSize: 16,
    fontWeight: '700',
    maxWidth: 260,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  myRoomCode: {
    fontSize: 12,
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  myRoomDesc: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  myRoomPrivacyText: {
    fontSize: 11,
  },
  myRoomActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  myRoomActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  myRoomActionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  myRoomActionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
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
