import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { ActionButton, Spinner, TextField } from 'hugo-music';
import { useAppTheme, type ThemeColors } from '../../ui/theme';
import { useStore } from '../../store/useStore';
import { showAlert } from '../../lib/alert';
import { usePreferenceGenres } from '../../lib/meta';

// Self-contained: decides its own visibility from the logged-in user, and only asks
// for whichever fields are actually missing — for accounts that predate the
// registration wizard, or came in via Google (which supplies email/name/picture).
// Personalizes experience: asks for display nickname and favourite music genres.
export default function CompleteProfileModal() {
  const GENRES = usePreferenceGenres(); // GET /api/meta
  const user = useStore((state) => state.user);
  const completeProfile = useStore((state) => state.completeProfile);
  const logout = useStore((state) => state.logout);
  const { colors } = useAppTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);

  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [genres, setGenres] = useState<string[]>(user?.musicGenres || []);
  const [submitting, setSubmitting] = useState(false);

  // Admins go through their own separate flow (see AdminScreen.tsx) — this modal is
  // for regular members only.
  if (!user || user.role === 'admin') return null;

  const missingNickname = !user.nickname;
  const missingGenres = !user.musicGenres || user.musicGenres.length === 0;
  const isIncomplete = missingNickname || missingGenres;

  if (!isIncomplete) return null;

  const toggleGenre = (g: string) => setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const canSubmit =
    (!missingNickname || nickname.trim()) &&
    (!missingGenres || genres.length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await completeProfile({
        nickname: missingNickname ? nickname.trim() : undefined,
        musicGenres: missingGenres ? genres : undefined,
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
            <Text style={st.title}>Chào mừng đến Hugo Music</Text>
            <Text style={st.subtitle}>Hãy chọn gu âm nhạc để Hugo cá nhân hoá trang chủ và gợi ý bài hát cho bạn.</Text>

            <ScrollView style={st.scroll} keyboardShouldPersistTaps="handled">
              {missingNickname && (
                <>
                  <Text style={st.label}>Biệt danh hiển thị</Text>
                  <TextField style={input} value={nickname} onChangeText={setNickname} placeholder="Nhập biệt danh của bạn" placeholderTextColor={ph} textContentType="name" autoCapitalize="words" maxLength={40} />
                </>
              )}

              {missingGenres && (
                <>
                  <Text style={st.label}>Thể loại yêu thích (chọn ít nhất 1)</Text>
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
            </ScrollView>

            <ActionButton
              variant="primary"
              size="lg"
              title={submitting ? undefined : 'Bắt đầu nghe nhạc'}
              icon={submitting ? <Spinner color="#fff" /> : undefined}
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
