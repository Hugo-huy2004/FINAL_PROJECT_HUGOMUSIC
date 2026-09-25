import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Switch, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { showAlert, confirmAlert } from '../../utils/alert';
import { GENRES } from '../../utils/genres';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import LiquidGlassCard from '../../components/LiquidGlass/LiquidGlassCard';
import { useTranslation } from '../../i18n/i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher';
import { useAppTheme } from '../../theme/theme';
import { useIsMobile } from '../../utils/responsive';
import { UserAvatar } from '../../components/UserAvatar';

// A normal content screen now (routed at /account, see navigation/HugoLayout.tsx and
// utils/tabRouting.ts) — not a full-screen modal. That was the main complaint: a modal
// hid the rest of the app and reset on every reload. This is just another tab.
export default function MemberDashboard({
  onNavigateLibrary,
  onNavigateStore,
  onNavigateBack,
}: {
  onNavigateLibrary: () => void;
  onNavigateStore?: () => void;
  onNavigateBack?: () => void;
}) {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const likedSongs = useStore((state) => state.likedSongs);
  const playlists = useStore((state) => state.playlists);
  const fetchLikedSongs = useStore((state) => state.fetchLikedSongs);
  const fetchPlaylists = useStore((state) => state.fetchPlaylists);
  const updateProfile = useStore((state) => state.updateProfile);
  const updateAvatar = useStore((state) => state.updateAvatar);
  const changePassword = useStore((state) => state.changePassword);
  const deleteAccount = useStore((state) => state.deleteAccount);
  const workspaceEnabled = useStore((state) => state.workspaceEnabled);
  const workspaceMemberCount = useStore((state) => state.workspaceMemberCount);
  const toggleWorkspaceSync = useStore((state) => state.toggleWorkspaceSync);
  const { t, language } = useTranslation();

  const { colors, isDark } = useAppTheme();
  const isMobile = useIsMobile();

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [genres, setGenres] = useState<string[]>(user?.musicGenres ?? []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const webFileInputRef = useRef<any>(null);

  useEffect(() => {
    fetchLikedSongs();
    fetchPlaylists();
  }, [fetchLikedSongs, fetchPlaylists]);

  if (!user) return null;

  const sameGenres =
    genres.length === (user.musicGenres ?? []).length && genres.every((g) => (user.musicGenres ?? []).includes(g));
  const profileUnchanged = nickname.trim() === (user.nickname ?? '') && phone.trim() === (user.phone ?? '') && sameGenres;
  const initial = (user.nickname || user.username).charAt(0).toUpperCase();

  const toggleGenre = (g: string) => setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const handleSaveProfile = async () => {
    if (profileUnchanged) return;
    setSavingProfile(true);
    try {
      await updateProfile({ nickname: nickname.trim(), phone: phone.trim(), musicGenres: genres });
      showAlert('Đã lưu thay đổi.');
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickAvatarUniversal = async () => {
    if (uploadingAvatar) return;

    if (Platform.OS === 'web' && webFileInputRef.current) {
      webFileInputRef.current.click();
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Cần cấp quyền truy cập ảnh để đổi ảnh đại diện.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setUploadingAvatar(true);
        if (Platform.OS === 'web') {
          const res = await fetch(asset.uri);
          const blob = await res.blob();
          const file = new File([blob], asset.fileName || 'avatar.jpg', {
            type: asset.mimeType || 'image/jpeg',
          });
          await updateAvatar(file);
        } else {
          const fileObj = {
            uri: asset.uri,
            name: asset.fileName || 'avatar.jpg',
            type: asset.mimeType || 'image/jpeg',
          };
          await updateAvatar(fileObj as any);
        }
        showAlert('Cập nhật ảnh đại diện thành công!');
      }
    } catch (err: any) {
      showAlert(err.message || 'Không thể tải ảnh lên');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleWebFileChange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      await updateAvatar(file);
      showAlert('Cập nhật ảnh đại diện thành công!');
    } catch (err: any) {
      showAlert(err.message || 'Không thể tải ảnh lên');
    } finally {
      setUploadingAvatar(false);
      if (webFileInputRef.current) {
        webFileInputRef.current.value = '';
      }
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || newPassword.length < 6) return;
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      showAlert('Đã đổi mật khẩu.');
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!(await confirmAlert(t('deleteAccountConfirm')))) return;
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
    } catch (e: any) {
      showAlert(e.message);
      setIsDeletingAccount(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { padding: isMobile ? 18 : 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Back button for mobile */}
      {onNavigateBack && (
        <TouchableOpacity
          style={styles.backBtnRow}
          onPress={onNavigateBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={[styles.backBtnText, { color: colors.accent }]}>{t('back')}</Text>
        </TouchableOpacity>
      )}

      {/* Profile Header Liquid Glass Card */}
      <LiquidGlassCard
        style={[styles.profileGlassCard, { borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)' }]}
        borderRadius={24}
        glowColor={isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(16, 185, 129, 0.12)'}
      >
        <View style={styles.profileHeader}>
          <TouchableOpacity
            onPress={handlePickAvatarUniversal}
            activeOpacity={0.8}
            style={styles.avatarTouchable}
          >
            <View
              style={[
                styles.avatarHalo,
                Platform.OS === 'web' && ({
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.45)',
                  borderRadius: '50%',
                } as any),
              ]}
            >
              <UserAvatar
                avatarUrl={user.avatarUrl}
                username={user.username}
                nickname={user.nickname}
                size={isMobile ? 64 : 74}
                badge={
                  <View style={[styles.avatarEditBadge, { backgroundColor: '#10B981' }]}>
                    {uploadingAvatar ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={13} color="#fff" />
                    )}
                  </View>
                }
              />
            </View>
            {Platform.OS === 'web' && (
              <input
                ref={webFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleWebFileChange}
                style={{ display: 'none' }}
              />
            )}
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 18 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.username, { color: colors.text }]}>{user.nickname || user.username}</Text>
            </View>
            <Text style={styles.handle}>@{user.username}</Text>
            <View style={styles.emailRow}>
              <Text style={[styles.email, { color: colors.textSecondary }]}>{user.email}</Text>
              {user.emailVerified && <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginLeft: 4 }} />}
            </View>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Ionicons name="log-out-outline" size={16} color="#c0392b" />
            <Text style={styles.logoutText}>{t('logout')}</Text>
          </TouchableOpacity>
        </View>
      </LiquidGlassCard>

      {/* Quick stats -> jump into the real Library tab */}
      <TouchableOpacity onPress={onNavigateLibrary} activeOpacity={0.82} style={{ marginBottom: 18 }}>
        <LiquidGlassCard
          style={[styles.statsGlassCard, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
          borderRadius={20}
          glowColor={isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.08)'}
        >
          <View style={styles.statsInnerRow}>
            <View style={styles.statPill}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{likedSongs.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('favorites')}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]} />
            <View style={styles.statPill}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{playlists.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('playlists')}</Text>
            </View>
            <View style={styles.statLink}>
              <Text style={[styles.statLinkText, { color: '#10B981' }]}>{t('openLibrary')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#10B981" />
            </View>
          </View>
        </LiquidGlassCard>
      </TouchableOpacity>

      {/* Language Setting */}
      <LiquidGlassCard
        style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
        borderRadius={20}
        glowColor="rgba(24, 165, 167, 0.15)"
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="globe-outline" size={20} color="#18A5A7" />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('language')}</Text>
          </View>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('languageDesc')}
        </Text>
        <View style={{ marginTop: 14 }}>
          <LanguageSwitcher variant="expanded" />
        </View>
      </LiquidGlassCard>

      {/* Workspace */}
      <LiquidGlassCard
        style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
        borderRadius={20}
        glowColor="rgba(16, 185, 129, 0.15)"
      >
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="radio-outline" size={20} color="#10B981" />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Workspace</Text>
          </View>
          <Switch
            value={workspaceEnabled}
            onValueChange={toggleWorkspaceSync}
            trackColor={{ false: '#ccc', true: '#10B981' }}
            thumbColor="#fff"
          />
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('workspaceHint')}
        </Text>
        {workspaceEnabled && (
          <View style={styles.memberRow}>
            <Ionicons name="phone-portrait-outline" size={14} color="#10B981" />
            <Text style={[styles.memberText, { color: colors.textSecondary }]}>
              {t('devicesSyncing', { count: workspaceMemberCount })}
            </Text>
          </View>
        )}
      </LiquidGlassCard>

      {/* Profile edit — personalization only */}
      <LiquidGlassCard
        style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
        borderRadius={20}
      >
        <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 0 }]}>{t('profileTitle')}</Text>
        <Text style={styles.label}>{t('nickname')}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
          value={nickname}
          onChangeText={setNickname}
          placeholder={t('nickname')}
          placeholderTextColor="#999"
        />
        <Text style={styles.label}>{t('username')}</Text>
        <Text style={[styles.readonlyValue, { color: colors.textSecondary }]}>@{user.username}</Text>
        <Text style={styles.label}>{t('phoneNumber')}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('phonePlaceholder')}
          placeholderTextColor="#999"
          keyboardType="phone-pad"
        />
        <Text style={styles.label}>{t('musicTaste')}</Text>
        <View style={styles.chipRow}>
          {GENRES.map((g) => (
            <TouchableOpacity key={g} style={[styles.chip, genres.includes(g) && styles.chipActive]} onPress={() => toggleGenre(g)}>
              <Text style={[styles.chipText, genres.includes(g) && styles.chipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <LiquidGlassButton
          variant="primary"
          size="md"
          title={savingProfile ? undefined : t('saveProfile')}
          icon={savingProfile ? <ActivityIndicator color="#fff" /> : undefined}
          onPress={handleSaveProfile}
          disabled={savingProfile || profileUnchanged}
          style={{ marginTop: 12 }}
        />
      </LiquidGlassCard>

      {/* Read-only — set once at signup, can't be changed here */}
      {(user.dateOfBirth || user.address?.country) && (
        <LiquidGlassCard
          style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
          borderRadius={20}
        >
          <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 0 }]}>{t('additionalInfo')}</Text>
          {user.dateOfBirth && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('dateOfBirth')}</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{new Date(user.dateOfBirth).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}</Text>
            </View>
          )}
          {user.address?.country && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('location')}</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {[user.address.detail, user.address.ward, user.address.province, user.address.country]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            </View>
          )}
        </LiquidGlassCard>
      )}

      {/* Password */}
      {user.googleLinked ? (
        <LiquidGlassCard
          style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
          borderRadius={20}
        >
          <View style={styles.googleRow}>
            <Ionicons name="logo-google" size={16} color="#666" />
            <Text style={[styles.hint, { flex: 1, marginLeft: 8, color: colors.textSecondary }]}>
              {t('googleLinkedHint')}
            </Text>
          </View>
        </LiquidGlassCard>
      ) : (
        <LiquidGlassCard
          style={[styles.card, { borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}
          borderRadius={20}
        >
          <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 0 }]}>{t('changePassword')}</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
            placeholder={t('currentPassword')}
            placeholderTextColor="#999"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
            placeholder={t('newPassword')}
            placeholderTextColor="#999"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <LiquidGlassButton
            variant="primary"
            size="md"
            title={savingPassword ? undefined : t('changePassword')}
            icon={savingPassword ? <ActivityIndicator color="#fff" /> : undefined}
            onPress={handleChangePassword}
            disabled={savingPassword || !currentPassword || newPassword.length < 6}
            style={{ marginTop: 12 }}
          />
        </LiquidGlassCard>
      )}

      {/* Danger Zone */}
      <LiquidGlassCard
        style={[styles.card, styles.dangerCard]}
        borderRadius={20}
        glowColor="rgba(192, 57, 43, 0.15)"
      >
        <Text style={[styles.cardTitle, styles.dangerTitle]}>{t('dangerZone')}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('deleteAccountHint')}</Text>
        <LiquidGlassButton
          variant="glass"
          size="md"
          title={isDeletingAccount ? undefined : t('deleteAccount')}
          textStyle={{ color: '#c0392b' }}
          icon={isDeletingAccount ? <ActivityIndicator color="#c0392b" /> : undefined}
          onPress={handleDeleteAccount}
          disabled={isDeletingAccount}
          style={{ marginTop: 12 }}
        />
      </LiquidGlassCard>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 32, maxWidth: 640, width: '100%', paddingBottom: 160 },
  backBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingVertical: 4,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  profileGlassCard: {
    padding: 22,
    marginBottom: 18,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarHalo: {
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  username: { fontSize: 22, fontWeight: '800', marginRight: 10, letterSpacing: -0.3 },
  handle: { fontSize: 13, color: '#888', marginTop: 1 },
  emailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontSize: 13, color: '#888' },
  infoValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  email: { fontSize: 13.5, marginTop: 2 },
  planBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgePremium: { backgroundColor: 'rgba(245, 158, 11, 0.16)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.45)' },
  planBadgeEducation: { backgroundColor: 'rgba(16, 185, 129, 0.16)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.45)' },
  planBadgeFree: { backgroundColor: 'rgba(148, 163, 184, 0.16)', borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.35)' },
  planBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#777' },
  planBadgeTextPremium: { color: '#f59e0b' },
  planBadgeTextEducation: { color: '#10b981' },
  storeGlassBanner: {
    padding: 14,
  },
  storeBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeBannerTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  storeBannerSubtitle: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
  },
  logoutText: { color: '#c0392b', fontWeight: '600', fontSize: 13, marginLeft: 6 },
  statsGlassCard: {
    padding: 16,
  },
  statsInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statPill: { marginRight: 8 },
  statDivider: {
    width: 1,
    height: 28,
    marginHorizontal: 20,
  },
  statNumber: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  statLink: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  statLinkText: { fontWeight: '600', fontSize: 13, marginRight: 2 },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginLeft: 8 },
  dangerCard: { borderWidth: 1, borderColor: 'rgba(192, 57, 43, 0.35)' },
  dangerTitle: { color: '#c0392b', marginLeft: 0 },
  label: { fontSize: 12, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 18 },
  inlineRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 10,
  },
  readonlyValue: { fontSize: 14, marginBottom: 10, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  chipText: { fontSize: 13, color: '#888', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  smallButton: {
    backgroundColor: '#10B981',
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  smallButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#10B981',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabledButton: { opacity: 0.5 },
  googleRow: { flexDirection: 'row', alignItems: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  memberText: { marginLeft: 6, fontSize: 12 },
});
