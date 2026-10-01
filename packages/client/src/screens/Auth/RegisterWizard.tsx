import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Image, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { useAppTheme, type ThemeColors } from '../../ui/theme';
import { usePreferenceGenres } from '../../lib/meta';
import { ActionButton, DatePicker, Icon, Spinner, TextField } from 'hugo-music';
import { GlassButton } from '../../ui/kit';

// Create an account step by step: (1) email + password → (2) 6-digit code sent via email → (3) photo + nickname →
// (4) date of birth + music taste → (5) place to live → (6) review. Each step is checked on the spot (errors appear right below the box,
// do not open the dialog box), the Return key continues, the system automatically fills in email / strong password / OTP code from Mail.
const TOTAL = 6;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER = 30; // seconds

export default function RegisterWizard({ onClose }: { onClose: () => void }) {
  const GENRES = usePreferenceGenres(); // GET /api/meta
  const { colors, isDark } = useAppTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const isAuthLoading = useStore((st) => st.isAuthLoading);
  const authError = useStore((st) => st.authError);
  const sendRegistrationOtp = useStore((st) => st.sendRegistrationOtp);
  const verifyRegistrationOtp = useStore((st) => st.verifyRegistrationOtp);
  const completeRegistration = useStore((st) => st.completeRegistration);
  const resetRegistration = useStore((st) => st.resetRegistration);

  const [step, setStep] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [avatarFile, setAvatarFile] = useState<any>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [country, setCountry] = useState('Việt Nam');
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const go = (n: number) => {
    setProblem(null);
    setStep(n);
  };
  const close = () => {
    resetRegistration();
    onClose();
  };

  // --- step by step ---
  const sendCode = async () => {
    try {
      await sendRegistrationOtp(email.trim());
      setResendIn(RESEND_AFTER);
      return true;
    } catch {
      return false; // authError appears below
    }
  };
  const step1 = async () => {
    if (!EMAIL.test(email.trim())) return setProblem('Email chưa đúng định dạng.');
    if (password.length < 6) return setProblem('Mật khẩu cần ít nhất 6 ký tự.');
    if (password !== confirm) return setProblem('Hai mật khẩu chưa khớp.');
    setProblem(null);
    if (await sendCode()) setStep(2);
  };
  const step2 = async (code = otp) => {
    if (code.trim().length !== 6 || isAuthLoading) return;
    try {
      await verifyRegistrationOtp(code.trim());
      go(3);
    } catch {
      // authError appears below
    }
  };
  const typeOtp = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    if (digits.length === 6) step2(digits); // All 6 numbers (type or fill in from Mail) are confirmation
  };
  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    setAvatarPreview(asset.uri);
    if (Platform.OS === 'web') {
      const blob = await (await fetch(asset.uri)).blob();
      setAvatarFile(new File([blob], asset.fileName || 'avatar.jpg', { type: asset.mimeType || 'image/jpeg' }));
    } else {
      setAvatarFile({ uri: asset.uri, name: asset.fileName || 'avatar.jpg', type: asset.mimeType || 'image/jpeg' });
    }
  };
  const toggleGenre = (g: string) => setGenres((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  const finish = async () => {
    const form = new FormData();
    form.append('password', password);
    form.append('nickname', nickname.trim());
    form.append('dateOfBirth', dateOfBirth);
    form.append('musicGenres', JSON.stringify(genres));
    form.append('country', country.trim());
    form.append('province', province.trim());
    form.append('ward', ward.trim());
    form.append('addressDetail', addressDetail.trim());
    if (avatarFile) form.append('avatar', avatarFile);
    try {
      await completeRegistration(form);
      onClose();
    } catch {
      // authError appears below
    }
  };

  const field = (extra?: object) => [s.input, extra];
  const error = problem || authError;
  const footer = (onNext: () => void, opts: { label?: string; disabled?: boolean; loading?: boolean; back?: number } = {}) => (
    <View style={s.footer}>
      {opts.back ? <ActionButton variant="glass" size="md" title="Quay lại" onPress={() => go(opts.back!)} /> : <View />}
      <ActionButton
        variant="primary"
        size="md"
        title={opts.loading ? undefined : opts.label ?? 'Tiếp tục'}
        icon={opts.loading ? <Spinner color={colors.accent} /> : undefined}
        onPress={onNext}
        disabled={opts.disabled || opts.loading}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }]} onPress={close} accessibilityLabel="Đóng" />
      <View style={[s.center, { pointerEvents: 'box-none' }]}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.stepText}>Bước {step}/{TOTAL}</Text>
            <GlassButton icon="close" iconSize={20} size={36} label="Đóng" onPress={close} />
          </View>
          <View style={s.track}>
            <View style={[s.trackFill, { width: `${(step / TOTAL) * 100}%` }]} />
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" bounces={false}>
            {step === 1 && (
              <>
                <Text style={s.title}>Tạo tài khoản</Text>
                <Text style={s.subtitle}>Nhập email và đặt mật khẩu để bắt đầu.</Text>
                <TextField style={field()} placeholder="Email" placeholderTextColor={colors.textTertiary} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" autoFocus />
                <TextField style={field()} placeholder="Mật khẩu (ít nhất 6 ký tự)" placeholderTextColor={colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" returnKeyType="next" />
                <TextField style={field()} placeholder="Nhập lại mật khẩu" placeholderTextColor={colors.textTertiary} value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" returnKeyType="go" onSubmitEditing={step1} />
                {!!error && <Text style={s.error}>{error}</Text>}
                {footer(step1, { label: 'Gửi mã xác minh', loading: isAuthLoading, disabled: !email || !password || !confirm })}
              </>
            )}

            {step === 2 && (
              <>
                <Text style={s.title}>Xác minh email</Text>
                <Text style={s.subtitle}>Nhập mã 6 số vừa gửi tới {email.trim()}.</Text>
                <TextField style={field(s.otp)} placeholder="••••••" placeholderTextColor={colors.textTertiary} value={otp} onChangeText={typeOtp} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} autoFocus />
                {!!error && <Text style={s.error}>{error}</Text>}
                <Pressable disabled={resendIn > 0 || isAuthLoading} onPress={sendCode} style={s.resend} accessibilityRole="button">
                  <Text style={[s.resendText, { color: resendIn > 0 ? colors.textTertiary : colors.accent }]}>
                    {resendIn > 0 ? `Gửi lại mã sau ${resendIn} giây` : 'Gửi lại mã'}
                  </Text>
                </Pressable>
                {footer(() => step2(), { label: 'Xác nhận', back: 1, loading: isAuthLoading, disabled: otp.length !== 6 })}
              </>
            )}

            {step === 3 && (
              <>
                <Text style={s.title}>Hồ sơ của bạn</Text>
                <Text style={s.subtitle}>Ảnh đại diện và biệt danh hiển thị với mọi người.</Text>
                <Pressable onPress={pickAvatar} style={s.avatarBox} accessibilityRole="button" accessibilityLabel={avatarPreview ? 'Đổi ảnh đại diện' : 'Chọn ảnh đại diện'}>
                  {avatarPreview ? (
                    <Image source={{ uri: avatarPreview }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarEmpty]}><Icon name="camera-outline" size={28} color={colors.textSecondary} /></View>
                  )}
                  <Text style={s.link}>{avatarPreview ? 'Đổi ảnh' : 'Chọn ảnh (không bắt buộc)'}</Text>
                </Pressable>
                <TextField style={field()} placeholder="Biệt danh (vd. Nam Nguyễn)" placeholderTextColor={colors.textTertiary} value={nickname} onChangeText={setNickname} textContentType="name" autoCapitalize="words" maxLength={40} returnKeyType="next" onSubmitEditing={() => nickname.trim() && go(4)} />
                {footer(() => go(4), { back: 2, disabled: !nickname.trim() })}
              </>
            )}

            {step === 4 && (
              <>
                <Text style={s.title}>Về bạn</Text>
                <Text style={s.subtitle}>Ngày sinh và gu nhạc giúp gợi ý đúng bài bạn thích.</Text>
                <DatePicker value={dateOfBirth} onChange={setDateOfBirth} style={field()} />
                <Text style={s.label}>Gu nhạc (chọn ít nhất một)</Text>
                <View style={s.chips}>
                  {GENRES.map((g) => {
                    const on = genres.includes(g);
                    return (
                      <Pressable key={g} onPress={() => toggleGenre(g)} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{g}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {footer(() => go(5), { back: 3, disabled: !dateOfBirth || genres.length === 0 })}
              </>
            )}

            {step === 5 && (
              <>
                <Text style={s.title}>Nơi bạn sống</Text>
                <Text style={s.subtitle}>Phường/xã và địa chỉ chi tiết có thể để trống.</Text>
                <TextField style={field()} placeholder="Quốc gia" placeholderTextColor={colors.textTertiary} value={country} onChangeText={setCountry} autoCapitalize="words" />
                <TextField style={field()} placeholder="Tỉnh / Thành phố" placeholderTextColor={colors.textTertiary} value={province} onChangeText={setProvince} autoCapitalize="words" />
                <TextField style={field()} placeholder="Phường / Xã" placeholderTextColor={colors.textTertiary} value={ward} onChangeText={setWard} autoCapitalize="words" />
                <TextField style={field()} placeholder="Địa chỉ chi tiết" placeholderTextColor={colors.textTertiary} value={addressDetail} onChangeText={setAddressDetail} returnKeyType="next" onSubmitEditing={() => country.trim() && province.trim() && go(6)} />
                {footer(() => go(6), { back: 4, disabled: !country.trim() || !province.trim() })}
              </>
            )}

            {step === 6 && (
              <>
                <Text style={s.title}>Xem lại</Text>
                <View style={s.review}>
                  {([
                    ['Email', email.trim()],
                    ['Biệt danh', nickname.trim()],
                    ['Ngày sinh', dateOfBirth.split('-').reverse().join('/')],
                    ['Gu nhạc', genres.join(', ')],
                    ['Nơi sống', [addressDetail, ward, province, country].map((x) => x.trim()).filter(Boolean).join(', ')],
                  ] as const).map(([label, value]) => (
                    <View key={label} style={s.reviewRow}>
                      <Text style={s.reviewLabel}>{label}</Text>
                      <Text style={s.reviewValue} numberOfLines={2}>{value || '—'}</Text>
                    </View>
                  ))}
                </View>
                {!!error && <Text style={s.error}>{error}</Text>}
                {footer(finish, { label: 'Hoàn tất', back: 5, loading: isAuthLoading })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '100%', backgroundColor: c.modalBg, borderRadius: 28, paddingTop: 18, paddingHorizontal: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepText: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase' },
  track: { height: 4, backgroundColor: c.fill, borderRadius: 2, marginTop: 12 },
  trackFill: { height: '100%', backgroundColor: c.accent, borderRadius: 2 },
  body: { paddingTop: 20, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: c.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: c.textSecondary, marginBottom: 20, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 10 },
  input: {
    height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 17, marginBottom: 12, backgroundColor: c.inputBg, color: c.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  otp: { textAlign: 'center', fontSize: 26, letterSpacing: 10, fontWeight: '700' },
  error: { color: '#FF453A', fontSize: 14, marginBottom: 8, marginTop: 4, textAlign: 'center' },
  resend: { alignSelf: 'center', paddingVertical: 8 },
  resendText: { fontSize: 15, fontWeight: '600' },
  avatarBox: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 10 },
  avatarEmpty: { backgroundColor: c.fill, justifyContent: 'center', alignItems: 'center' },
  link: { color: c.accent, fontWeight: '600', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.fill },
  chipOn: { backgroundColor: c.accent },
  chipText: { fontSize: 14, color: c.text, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  review: { backgroundColor: c.fill, borderRadius: 14, padding: 16, marginBottom: 12 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  reviewLabel: { fontSize: 14, color: c.textSecondary },
  reviewValue: { fontSize: 14, color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
});
