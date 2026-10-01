import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import AppTextField from '../../ui/native/AppTextField';
import AppDatePicker from '../../ui/native/AppDatePicker';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import { useAppTheme, type ThemeColors } from '../../theme/theme';
import { useStore } from '../../store/useStore';
import { showAlert } from '../../utils/alert';
import { GENRES } from '../../utils/genres';

// Self-contained: decides its own visibility from the logged-in user, and only asks
// for whichever fields are actually missing — for accounts that predate the
// registration wizard, or came in via Google (which only ever supplies
// email/name/picture, never DOB/genres/address). Render it once, unconditionally,
// anywhere inside the logged-in app shell (see navigation/AppLayout.tsx) and it
// no-ops for any account that's already complete.
export default function CompleteProfileModal() {
  const user = useStore((state) => state.user);
  const completeProfile = useStore((state) => state.completeProfile);
  const logout = useStore((state) => state.logout);
  const { colors } = useAppTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);

  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [country, setCountry] = useState('Việt Nam');
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admins go through their own separate flow (see AdminScreen.tsx) — this modal is
  // for regular members only.
  if (!user || user.role === 'admin') return null;

  const missingNickname = !user.nickname;
  const missingDob = !user.dateOfBirth;
  const missingGenres = !user.musicGenres || user.musicGenres.length === 0;
  const missingAddress = !user.address?.country;
  const isIncomplete = missingNickname || missingDob || missingGenres || missingAddress;

  if (!isIncomplete) return null;

  const toggleGenre = (g: string) => setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const canSubmit =
    (!missingNickname || nickname.trim()) &&
    (!missingDob || dateOfBirth) &&
    (!missingGenres || genres.length > 0) &&
    (!missingAddress || (country.trim() && province.trim())); // phường/xã, địa chỉ chi tiết: không bắt buộc (giống RegisterWizard)

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await completeProfile({
        nickname: missingNickname ? nickname.trim() : undefined,
        dateOfBirth: missingDob ? dateOfBirth : undefined,
        musicGenres: missingGenres ? genres : undefined,
        country: missingAddress ? country.trim() : undefined,
        province: missingAddress ? province.trim() : undefined,
        ward: missingAddress ? ward.trim() : undefined,
        addressDetail: missingAddress ? addressDetail.trim() : undefined,
      });
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const input = st.input;
  const ph = colors.textTertiary;
  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.center}>
          <View style={st.card}>
            <Text style={st.title}>Hoàn tất hồ sơ</Text>
            <Text style={st.subtitle}>Còn vài thông tin để Hugo Music gợi ý nhạc hợp với bạn.</Text>

            <ScrollView style={st.scroll} keyboardShouldPersistTaps="handled">
              {missingNickname && (
                <>
                  <Text style={st.label}>Biệt danh hiển thị</Text>
                  <AppTextField style={input} value={nickname} onChangeText={setNickname} placeholder="Biệt danh" placeholderTextColor={ph} textContentType="name" autoCapitalize="words" maxLength={40} />
                </>
              )}

              {missingDob && (
                <>
                  <Text style={st.label}>Ngày sinh</Text>
                  <AppDatePicker value={dateOfBirth} onChange={setDateOfBirth} style={input} placeholderTextColor={ph} />
                </>
              )}

              {missingGenres && (
                <>
                  <Text style={st.label}>Gu nhạc</Text>
                  <View style={st.chips}>
                    {GENRES.map((g) => {
                      const on = genres.includes(g);
                      return (
                        <Pressable key={g} style={[st.chip, on && st.chipOn]} onPress={() => toggleGenre(g)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                          <Text style={[st.chipText, on && st.chipTextOn]}>{g}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {missingAddress && (
                <>
                  <Text style={st.label}>Nơi bạn sống</Text>
                  <AppTextField style={input} placeholder="Quốc gia" placeholderTextColor={ph} value={country} onChangeText={setCountry} autoCapitalize="words" />
                  <AppTextField style={input} placeholder="Tỉnh / Thành phố" placeholderTextColor={ph} value={province} onChangeText={setProvince} autoCapitalize="words" />
                  <AppTextField style={input} placeholder="Phường / Xã (không bắt buộc)" placeholderTextColor={ph} value={ward} onChangeText={setWard} autoCapitalize="words" />
                  <AppTextField style={input} placeholder="Địa chỉ chi tiết (không bắt buộc)" placeholderTextColor={ph} value={addressDetail} onChangeText={setAddressDetail} />
                </>
              )}
            </ScrollView>

            <LiquidGlassButton
              variant="primary"
              size="lg"
              title={submitting ? undefined : 'Hoàn tất'}
              icon={submitting ? <ActivityIndicator color={colors.accent} /> : undefined}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{ width: '100%' }}
            />
            <Pressable onPress={logout} style={st.logout} accessibilityRole="button">
              <Text style={st.logoutText}>Đăng xuất</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '100%', backgroundColor: c.modalBg, borderRadius: 28, padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: c.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: c.textSecondary, lineHeight: 21, marginBottom: 16 },
  scroll: { flexGrow: 0, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8, marginTop: 4 },
  input: {
    height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 17, marginBottom: 12, backgroundColor: c.inputBg, color: c.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.fill },
  chipOn: { backgroundColor: c.accent },
  chipText: { fontSize: 14, color: c.text, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  logout: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  logoutText: { color: c.textSecondary, fontSize: 15, fontWeight: '600' },
});
