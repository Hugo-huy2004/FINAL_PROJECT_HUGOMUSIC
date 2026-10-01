import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { ActionButton, DatePicker, Icon, Spinner, TextField, Toggle } from 'hugo-music';
import ChromeScrollView from '../../ui/ChromeScrollView';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { showAlert, confirmAlert } from '../../lib/alert';
import { usePreferenceGenres } from '../../lib/meta';
import { useTranslation } from '../../i18n/i18n';
import { useAppTheme, ThemeColors } from '../../ui/theme';
import { useIsMobile } from '../../lib/responsive';
import { UserAvatar } from '../../components/UserAvatar';
import { LargeTitle } from '../../ui/kit';
import { type, space, radius, GUTTER } from '../../ui/tokens';

// The Accounts page is in the iOS Settings style: profile top center, then GROUPS list
// corner — each line: color icon cell · label · value · ›. If you click on an editable line, the input box opens right below the line
// (no page jumping). Dangerous tasks (logging out, deleting accounts) are located separately at the end, in red letters.
type Editing = 'nickname' | 'phone' | 'genres' | 'password' | 'dob' | 'address' | 'delete' | null;

export default function AccountScreen({ onNavigateLibrary }: { onNavigateLibrary: () => void }) {
  const GENRES = usePreferenceGenres(); // GET /api/meta
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const likedSongs = useStore((s) => s.likedSongs);
  const playlists = useStore((s) => s.playlists);
  const fetchLikedSongs = useStore((s) => s.fetchLikedSongs);
  const fetchPlaylists = useStore((s) => s.fetchPlaylists);
  const updateProfile = useStore((s) => s.updateProfile);
  const updateAvatar = useStore((s) => s.updateAvatar);
  const changePassword = useStore((s) => s.changePassword);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const removeAvatar = useStore((s) => s.removeAvatar);
  const workspaceEnabled = useStore((s) => s.workspaceEnabled);
  const workspaceMemberCount = useStore((s) => s.workspaceMemberCount);
  const toggleWorkspaceSync = useStore((s) => s.toggleWorkspaceSync);
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const transitionMode = useStore((s) => s.transitionMode);
  const setTransitionMode = useStore((s) => s.setTransitionMode);
  const crossfadeSeconds = useStore((s) => s.crossfadeSeconds);
  const setCrossfadeSeconds = useStore((s) => s.setCrossfadeSeconds);
  const soundCheck = useStore((s) => s.soundCheck);
  const setSoundCheck = useStore((s) => s.setSoundCheck);
  const djAutoplay = useStore((s) => s.djAutoplay);
  const setDjAutoplay = useStore((s) => s.setDjAutoplay);
  const equalizerPreset = useStore((s) => s.equalizerPreset);
  const setEqualizerPreset = useStore((s) => s.setEqualizerPreset);
  const navigation = useNavigation<any>();
  const { t, language, setLanguage } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const isMobile = useIsMobile();

  const [editing, setEditing] = useState<Editing>(null);
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [genres, setGenres] = useState<string[]>(user?.musicGenres ?? []);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [dob, setDob] = useState(user?.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '');
  const [addr, setAddr] = useState({ country: user?.address?.country ?? '', province: user?.address?.province ?? '', ward: user?.address?.ward ?? '', detail: user?.address?.detail ?? '' });
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const webFileInputRef = useRef<any>(null);

  useEffect(() => {
    fetchLikedSongs();
    fetchPlaylists();
  }, [fetchLikedSongs, fetchPlaylists]);

  if (!user) return null;
  const styles = makeStyles(colors, isDark);

  // Open/close an edit box; When closed, the value will be returned as saved (discarding unfinished changes).
  const toggle = (which: Editing) => {
    setNickname(user.nickname ?? '');
    setPhone(user.phone ?? '');
    setGenres(user.musicGenres ?? []);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNew('');
    setDob(user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '');
    setAddr({ country: user.address?.country ?? '', province: user.address?.province ?? '', ward: user.address?.ward ?? '', detail: user.address?.detail ?? '' });
    setDeleteConfirm('');
    setEditing((cur) => (cur === which ? null : which));
  };

  // Each edit box only sends its correct field — the server checks each field (phone number, date of birth from 13 years old...).
  const saveFields = async (fields: Parameters<typeof updateProfile>[0]) => {
    setSaving(true);
    try {
      await updateProfile(fields);
      setEditing(null);
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ nickname: nickname.trim(), phone: phone.trim(), musicGenres: genres });
      setEditing(null);
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const passwordReady = !!currentPassword && newPassword.length >= 6 && newPassword === confirmNew;
  const savePassword = async () => {
    if (!passwordReady) return;
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setEditing(null);
      showAlert('Đã đổi mật khẩu.');
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async () => {
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
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingAvatar(true);
      await updateAvatar({ uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' } as any);
    } catch (err: any) {
      showAlert(err.message || 'Không thể tải ảnh lên');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onWebFile = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      await updateAvatar(file);
    } catch (err: any) {
      showAlert(err.message || 'Không thể tải ảnh lên');
    } finally {
      setUploadingAvatar(false);
      if (webFileInputRef.current) webFileInputRef.current.value = '';
    }
  };

  // Delete account: reconfirm with password (Google only account: type username) — the server chooses what to check.
  const removeAccount = async () => {
    if (!deleteConfirm || !(await confirmAlert(t('deleteAccountConfirm')))) return;
    setIsDeletingAccount(true);
    try {
      await deleteAccount({ password: deleteConfirm, confirm: deleteConfirm });
    } catch (e: any) {
      showAlert(e.message);
      setIsDeletingAccount(false);
    }
  };

  // ---------- page building block ----------
  const Row = ({ icon, tint, label, value, onPress, right, last = false, open = false }: {
    icon: keyof typeof Icon.glyphMap; tint: string; label: string; value?: string;
    onPress?: () => void; right?: React.ReactNode; last?: boolean; open?: boolean;
  }) => (
    // Rows that cannot be clicked will not receive focus (the web does not draw a green border around the entire row when the right button is pressed).
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      focusable={!!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={right ? undefined : value ? `${label}: ${value}` : label}
    >
      <View style={[styles.iconTile, { backgroundColor: tint }]}>
        <Icon name={icon} size={17} color="#fff" />
      </View>
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {value !== undefined && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
        {right}
        {onPress && !right && <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={17} color={colors.textTertiary} />}
      </View>
    </Pressable>
  );

  const Group = ({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) => (
    <View style={styles.group}>
      {title && <Text style={styles.groupTitle}>{title}</Text>}
      <View style={styles.groupBox}>{children}</View>
      {footer && <Text style={styles.groupFooter}>{footer}</Text>}
    </View>
  );

  const editor = (children: React.ReactNode, onSave: () => void, disabled: boolean) => (
    <View style={styles.editor}>
      {children}
      <View style={styles.editorActions}>
        <ActionButton variant="glass" size="md" title="Huỷ" onPress={() => toggle(null)} />
        <ActionButton
          variant="primary"
          size="md"
          title={saving ? undefined : 'Lưu'}
          icon={saving ? <Spinner color={colors.accent} /> : undefined}
          onPress={onSave}
          disabled={disabled || saving}
        />
      </View>
    </View>
  );

  const address = user.address
    ? [user.address.detail, user.address.ward, user.address.province, user.address.country].filter(Boolean).join(', ')
    : '';

  return (
    <ChromeScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.page, !isMobile && styles.pageDesktop]}>
        <LargeTitle title={t('account')} />

        {/* Profile */}
        <View style={styles.profile}>
          <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Đổi ảnh đại diện">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              nickname={user.nickname}
              size={92}
              badge={
                <View style={[styles.camera, { backgroundColor: colors.accent }]}>
                  {uploadingAvatar ? <Spinner size="small" color="#fff" /> : <Icon name="camera" size={14} color="#fff" />}
                </View>
              }
            />
            {Platform.OS === 'web' && (
              <input ref={webFileInputRef} type="file" accept="image/*" onChange={onWebFile} style={{ display: 'none' }} />
            )}
          </Pressable>
          {!!user.avatarUrl && (
            <Pressable
              onPress={async () => {
                if (!(await confirmAlert('Remove avatar?'))) return;
                await removeAvatar().catch((e: any) => showAlert(e.message));
              }}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.removeAvatar}>Remove image</Text>
            </Pressable>
          )}
          <Text style={styles.name} numberOfLines={1}>{user.nickname || user.username}</Text>
          <View style={styles.emailRow}>
            <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
            {user.emailVerified && <Icon name="checkmark-circle" size={15} color="#30D158" />}
          </View>
        </View>

        <Group>
          <Row icon="heart" tint="#FF375F" label="Your Library" value={`${likedSongs.length} likes · ${playlists.length} list`} onPress={onNavigateLibrary} last />
        </Group>

        <Group title="PERSONAL INFORMATION">
          <Row icon="person" tint="#0A84FF" label={t('nickname')} value={user.nickname || 'Not set'} onPress={() => toggle('nickname')} open={editing === 'nickname'} />
          {editing === 'nickname' && editor(
            <TextField value={nickname} onChangeText={setNickname} placeholder={t('nickname')} placeholderTextColor={colors.textTertiary} style={styles.input} autoFocus maxLength={40} onSubmitEditing={saveProfile} />,
            saveProfile, !nickname.trim() || nickname.trim() === (user.nickname ?? ''),
          )}
          <Row icon="call" tint="#30D158" label={t('phoneNumber')} value={user.phone || 'Not available'} onPress={() => toggle('phone')} open={editing === 'phone'} />
          {editing === 'phone' && editor(
            <TextField value={phone} onChangeText={setPhone} placeholder={t('phonePlaceholder')} placeholderTextColor={colors.textTertiary} style={styles.input} keyboardType="phone-pad" autoFocus onSubmitEditing={saveProfile} />,
            saveProfile, phone.trim() === (user.phone ?? ''),
          )}
          <Row icon="musical-notes" tint="#BF5AF2" label={t('musicTaste')} value={(user.musicGenres ?? []).length ? `${(user.musicGenres ?? []).length} genre` : 'Not selected'} onPress={() => toggle('genres')} open={editing === 'genres'} />
          {editing === 'genres' && editor(
            <View style={styles.chips}>
              {GENRES.map((g) => {
                const on = genres.includes(g);
                return (
                  <Pressable key={g} onPress={() => setGenres((p) => (on ? p.filter((x) => x !== g) : [...p, g]))} style={[styles.chip, on && { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[styles.chipText, on && { color: '#fff' }]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>,
            saveProfile, false,
          )}
          <Row icon="at" tint="#8E8E93" label={t('username')} value={`@${user.username}`} />
          <Row
            icon="calendar" tint="#FF9F0A" label={t('dateOfBirth')}
            value={user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString(language === 'en' ? 'en-VN' : 'en-US') : 'Not available yet'}
            onPress={() => toggle('dob')} open={editing === 'dob'}
          />
          {editing === 'dob' && editor(
            <DatePicker value={dob} onChange={setDob} max={new Date()} style={styles.input} />,
            () => saveFields({ dateOfBirth: dob }), !dob,
          )}
          <Row icon="location" tint="#FF453A" label={t('location')} value={address || 'Not available'} onPress={() => toggle('address')} open={editing === 'address'} last={editing !== 'address'} />
          {editing === 'address' && editor(
            <>
              {([['country', 'Country'], ['province', 'Province / city'], ['ward', 'Ward / commune'], ['detail', 'House number, street']] as const).map(([k, label], i) => (
                <TextField key={k} value={addr[k]} onChangeText={(v) => setAddr({ ...addr, [k]: v })} placeholder={label} placeholderTextColor={colors.textTertiary} style={[styles.input, i > 0 && { marginTop: space.sm }]} />
              ))}
            </>,
            () => saveFields({ address: addr }), false,
          )}
        </Group>

        <Group title="INTERFACE & LANGUAGE">
          <Row
            icon="contrast"
            tint="#636366"
            label="Interface"
            right={
              <View style={styles.segment}>
                {(['auto', 'light', 'dark'] as const).map((m) => (
                  <Pressable key={m} onPress={() => setThemeMode(m)} style={[styles.seg, themeMode === m && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: themeMode === m }}>
                    <Text style={[styles.segText, themeMode === m && { color: colors.text }]}>{m === 'auto' ? 'Auto' : m === 'light' ? 'Morning' : 'Evening'}</Text>
                  </Pressable>
                ))}
              </View>
            }
          />
          <Row
            icon="language"
            tint="#0A84FF"
            label={t('language')}
            right={
              <View style={styles.segment}>
                {(['vi', 'en'] as const).map((code) => (
                  <Pressable key={code} onPress={() => setLanguage(code)} style={[styles.seg, language === code && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: language === code }}>
                    <Text style={[styles.segText, language === code && { color: colors.text }]}>{code === 'vi' ? 'Vietnamese' : 'English'}</Text>
                  </Pressable>
                ))}
              </View>
            }
            last
          />
        </Group>

        <Group
          title="MUSIC PLAY"
          footer={
            transitionMode === 'automix' ? 'Switch songs like a DJ: come in at the end of the song, match the beat.'
            : transitionMode === 'crossfade' ? `The two cards overlap ${crossfadeSeconds} seconds.`
            : 'Continue immediately, no silence.'
          }
        >
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <View style={[styles.iconTile, { backgroundColor: '#FF375F' }]}><Icon name="shuffle" size={17} color="#fff" /></View>
              <Text style={[styles.rowLabel, { marginLeft: space.md }]}>Switch Post</Text>
            </View>
            <View style={[styles.segment, styles.segmentFull]}>
              {([['gapless', 'Seamless'], ['crossfade', 'Crossfade'], ['automix', 'AutoMix']] as const).map(([m, label]) => (
                <Pressable key={m} onPress={() => setTransitionMode(m)} style={[styles.seg, styles.segFlex, transitionMode === m && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: transitionMode === m }}>
                  <Text style={[styles.segText, transitionMode === m && { color: colors.text }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {transitionMode === 'crossfade' && (
              <View style={[styles.segment, styles.segmentFull, { marginTop: space.sm }]}>
                {[4, 6, 8, 12].map((sec) => (
                  <Pressable key={sec} onPress={() => setCrossfadeSeconds(sec)} style={[styles.seg, styles.segFlex, crossfadeSeconds === sec && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: crossfadeSeconds === sec }}>
                    <Text style={[styles.segText, crossfadeSeconds === sec && { color: colors.text }]}>{sec} seconds</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <Row
            icon="volume-high"
            tint="#5E5CE6"
            label="Volume balance"
            right={<Toggle value={soundCheck} onValueChange={setSoundCheck} accessibilityLabel="Volume equalization" />}
          />
          <Row
            icon="infinite"
            tint="#FF9500"
            label="DJ Autoplay (Automatic BPM Matching)"
            right={<Toggle value={djAutoplay} onValueChange={setDjAutoplay} accessibilityLabel="DJ Autoplay" />}
          />
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <View style={[styles.iconTile, { backgroundColor: '#30B0C7' }]}><Icon name="options" size={17} color="#fff" /></View>
              <Text style={[styles.rowLabel, { marginLeft: space.md }]}>Equalizer</Text>
            </View>
            <View style={[styles.segment, styles.segmentFull, { flexWrap: 'wrap', gap: 6 }]}>
              {([
                ['flat', 'Standard'],
                ['bass_boost', 'Bass Boost'],
                ['vocal_boost', 'Vocal boost'],
                ['electronic', 'Dance/EDM'],
                ['acoustic', 'Acoustic'],
                ['lofi', 'Lofi'],
              ] as const).map(([eq, label]) => (
                <Pressable
                  key={eq}
                  onPress={() => setEqualizerPreset(eq)}
                  style={[styles.seg, { paddingHorizontal: 12, paddingVertical: 6 }, equalizerPreset === eq && styles.segOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: equalizerPreset === eq }}
                >
                  <Text style={[styles.segText, equalizerPreset === eq && { color: colors.text }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Group>

        <Group title="DEVICE" footer={workspaceEnabled ? `${t('workspaceHint')} ${t('devicesSyncing', { count: workspaceMemberCount })}` : t('workspaceHint')}>
          <Row
            icon="phone-portrait"
            tint="#34C759"
            label="Sync devices"
            right={<Toggle value={workspaceEnabled} onValueChange={toggleWorkspaceSync} accessibilityLabel="Sync devices" />}
            last
          />
        </Group>

        {user.role === 'admin' && (
          <Group title="ADMIN">
            <Row icon="shield-checkmark" tint="#FF9F0A" label="Manage music store" onPress={() => navigation.navigate('Admin')} last />
          </Group>
        )}

        <Group title="SECURITY" footer={user.googleLinked ? t('googleLinkedHint') : undefined}>
          {user.googleLinked ? (
            <Row icon="logo-google" tint="#4285F4" label="Sign in with Google" value="Linked" last />
          ) : (
            <>
              <Row icon="key" tint="#8E8E93" label={t('changePassword')} onPress={() => toggle('password')} open={editing === 'password'} last={editing !== 'password'} />
              {editing === 'password' && editor(
                <>
                  <TextField value={currentPassword} onChangeText={setCurrentPassword} placeholder={t('currentPassword')} placeholderTextColor={colors.textTertiary} style={styles.input} secureTextEntry autoFocus />
                  <TextField value={newPassword} onChangeText={setNewPassword} placeholder={`${t('newPassword')} (≥ 6 characters)`} placeholderTextColor={colors.textTertiary} style={[styles.input, { marginTop: space.sm }]} secureTextEntry />
                  <TextField value={confirmNew} onChangeText={setConfirmNew} placeholder="Re-enter new password" placeholderTextColor={colors.textTertiary} style={[styles.input, { marginTop: space.sm }]} secureTextEntry onSubmitEditing={savePassword} />
                  {!!confirmNew && confirmNew !== newPassword && <Text style={styles.fieldError}>The two new passwords do not match</Text>}
                  <Text style={styles.fieldHint}>Changing the password will log out all other devices.</Text>
                </>,
                savePassword, !passwordReady,
              )}
            </>
          )}
        </Group>

        <Group>
          <Pressable onPress={logout} style={({ pressed }) => [styles.danger, pressed && styles.rowPressed]} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('logout')}</Text>
          </Pressable>
        </Group>

        <Group footer={t('deleteAccountHint')}>
          <Pressable onPress={() => toggle('delete')} disabled={isDeletingAccount} style={({ pressed }) => [styles.danger, pressed && styles.rowPressed]} accessibilityRole="button">
            {isDeletingAccount ? <Spinner color="#FF453A" /> : <Text style={styles.dangerText}>{t('deleteAccount')}</Text>}
          </Pressable>
          {editing === 'delete' && (
            <View style={styles.editor}>
              <Text style={styles.fieldHint}>
                {user.googleLinked ? `Type the password, or username "${user.username}" if the account only logs in with Google.` : 'Enter the password to confirm. Playlists and liked songs will be permanently deleted.'}
              </Text>
              <TextField value={deleteConfirm} onChangeText={setDeleteConfirm} placeholder={user.googleLinked ? 'Password or username' : t('currentPassword')} placeholderTextColor={colors.textTertiary} style={[styles.input, { marginTop: space.sm }]} secureTextEntry={!user.googleLinked} autoFocus />
              <View style={styles.editorActions}>
                <ActionButton variant="glass" size="md" title="Cancel" onPress={() => toggle(null)} />
                <ActionButton variant="primary" size="md" title="Permanent deletion" onPress={removeAccount} disabled={!deleteConfirm || isDeletingAccount} />
              </View>
            </View>
          )}
        </Group>
      </View>
    </ChromeScrollView>
  );
}

const makeStyles = (c: ThemeColors, isDark: boolean) => StyleSheet.create({
  page: { width: '100%' },
  removeAvatar: { color: c.accent, fontSize: 14, fontWeight: '600', marginTop: space.sm, textAlign: 'center' },
  fieldError: { color: '#FF453A', fontSize: 13, marginTop: space.xs },
  fieldHint: { color: c.textSecondary, fontSize: 13, marginTop: space.xs, lineHeight: 18 },
  pageDesktop: { maxWidth: 680, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: GUTTER - 6, marginTop: space.xs },
  profile: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: space.sm, marginBottom: space.lg },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.background },
  name: { ...type.title2, color: c.text, marginTop: space.md },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  email: { ...type.subhead, color: c.textSecondary },
  group: { paddingHorizontal: GUTTER, marginTop: space.xl },
  groupTitle: { ...type.footnote, color: c.textSecondary, letterSpacing: 0.4, marginLeft: space.lg, marginBottom: space.xs + 2 },
  groupBox: {
    borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
  },
  groupFooter: { ...type.footnote, color: c.textSecondary, marginHorizontal: space.lg, marginTop: space.xs + 2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, minHeight: 48 },
  rowPressed: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
  iconTile: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginLeft: space.md, paddingRight: space.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rowLabel: { ...type.body, color: c.text, flexShrink: 0 },
  rowValue: { ...type.body, color: c.textSecondary, flex: 1, textAlign: 'right' },
  editor: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: { ...type.body, color: c.text, backgroundColor: c.inputBg, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.fill },
  chipText: { ...type.subhead, color: c.text },
  segment: { flexDirection: 'row', marginLeft: 'auto', backgroundColor: c.fill, borderRadius: 9, padding: 2 },
  seg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  block: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  blockHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  segmentFull: { marginLeft: 0 },
  segFlex: { flex: 1, alignItems: 'center', paddingVertical: 7 },
  segOn: { backgroundColor: isDark ? '#636366' : '#FFFFFF' },
  segText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  danger: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dangerText: { ...type.body, color: '#FF453A', fontWeight: '600' },
});
