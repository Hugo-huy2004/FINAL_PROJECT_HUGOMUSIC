import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView, Image } from 'react-native';
import AppTextField from '../../ui/native/AppTextField';
import { useStore } from '../../store/useStore';
import { api } from '../../utils/api';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import { GlassButton } from '../../ui/kit';
import { useAppTheme } from '../../theme/theme';

const LOGO = require('../../../assets/logo.png');

// Đăng nhập kiểu Apple, từng bước: (1) email / tên người dùng / số điện thoại → (2) mật khẩu. Mỗi bước
// một ô, phím Return đi tiếp, hệ thống tự điền (Mật khẩu iCloud/Google). Google là nút kính tròn nhỏ
// phía dưới (utils/googleAuth.ts — chạy được cả web lẫn ứng dụng). Đăng ký ở RegisterWizard.tsx.
// Quên mật khẩu: email → mã 6 số (5 phút) → mật khẩu mới; xong là đăng nhập luôn, các thiết bị khác
// bị đăng xuất (backend/controllers/authController.js forgotPassword/resetPassword).
// Chỉ dành cho người dùng thường — admin đăng nhập ở /admin (mật khẩu + OTP Telegram).
export default function LoginModal({ onClose, onOpenRegister }: { onClose: () => void; onOpenRegister: () => void }) {
  const login = useStore((s) => s.login);
  const loginWithGoogle = useStore((s) => s.loginWithGoogle);
  const isAuthLoading = useStore((s) => s.isAuthLoading);
  const authError = useStore((s) => s.authError);
  const resetPassword = useStore((s) => s.resetPassword);
  const { colors, isDark } = useAppTheme();

  const [step, setStep] = useState<'id' | 'password' | 'forgot' | 'reset'>('id');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState(false);
  // Quên mật khẩu
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const idOk = identifier.trim().length >= 3;
  const pwOk = password.length >= 6;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim());
  const resetOk = /^\d{6}$/.test(code.trim()) && newPassword.length >= 6;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const openForgot = () => {
    setForgotError(null);
    if (!resetEmail && identifier.includes('@')) setResetEmail(identifier.trim());
    setStep('forgot');
  };
  const sendCode = async () => {
    if (!emailOk || sending) return;
    setSending(true);
    setForgotError(null);
    try {
      const { tempToken } = await api.forgotPassword(resetEmail.trim());
      setResetToken(tempToken);
      setResendIn(60);
      setStep('reset');
    } catch (e: any) {
      setForgotError(e.message);
    } finally {
      setSending(false);
    }
  };
  const submitReset = async () => {
    if (!resetOk || isAuthLoading) return;
    try {
      await resetPassword(resetToken, code.trim(), newPassword);
      onClose();
    } catch {
      // lỗi đã nằm trong store (authError)
    }
  };

  const next = () => idOk && setStep('password');
  const submit = async () => {
    if (!pwOk || isAuthLoading) return;
    setAdminNotice(false);
    try {
      await login(identifier.trim(), password);
      if (useStore.getState().pendingOtpToken) return setAdminNotice(true);
      onClose();
    } catch {
      // lỗi đã nằm trong store (authError) và hiện bên dưới
    }
  };
  const google = async () => {
    if (await loginWithGoogle().catch(() => false)) onClose();
  };

  const field = { backgroundColor: colors.inputBg, color: colors.text };
  const error = step === 'forgot' ? forgotError
    : adminNotice ? 'Tài khoản quản trị đăng nhập ở trang quản trị (mật khẩu + OTP).' : authError;
  const back = step === 'password' ? () => setStep('id') : step === 'forgot' ? () => setStep('password') : step === 'reset' ? () => setStep('forgot') : null;
  const title = { id: 'Đăng nhập Hugo Music', password: 'Nhập mật khẩu', forgot: 'Quên mật khẩu', reset: 'Đặt lại mật khẩu' }[step];

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }]} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[styles.center, { pointerEvents: 'box-none' }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg }]}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.topBar}>
              {back
                ? <GlassButton icon="chevron-back" iconSize={22} nudge={-2} size={38} label="Quay lại" onPress={back} />
                : <View style={styles.spacer} />}
              <GlassButton icon="close" iconSize={20} size={38} label="Đóng" onPress={onClose} />
            </View>

            <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

            {step === 'id' ? (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Dùng email, tên người dùng hoặc số điện thoại của bạn.</Text>
                <AppTextField
                  key="id"
                  style={[styles.input, field]}
                  placeholder="Email hoặc tên người dùng"
                  placeholderTextColor={colors.textTertiary}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={next}
                  autoFocus
                />
                <LiquidGlassButton variant="primary" size="lg" title="Tiếp tục" onPress={next} disabled={!idOk} style={styles.full} />
              </>
            ) : step === 'password' ? (
              <>
                <Pressable onPress={() => setStep('id')} style={[styles.chip, { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={`Đổi tài khoản ${identifier}`}>
                  <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{identifier.trim()}</Text>
                  <Text style={[styles.chipEdit, { color: colors.accent }]}>Đổi</Text>
                </Pressable>
                <AppTextField
                  key="password"
                  style={[styles.input, field]}
                  placeholder="Mật khẩu"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  autoFocus
                />
                <LiquidGlassButton
                  variant="primary"
                  size="lg"
                  title={isAuthLoading ? undefined : 'Đăng nhập'}
                  icon={isAuthLoading ? <ActivityIndicator color={colors.accent} /> : undefined}
                  onPress={submit}
                  disabled={!pwOk || isAuthLoading}
                  style={styles.full}
                />
                <Pressable onPress={openForgot} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.accent }]}>Quên mật khẩu?</Text>
                </Pressable>
              </>
            ) : step === 'forgot' ? (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Nhập email của tài khoản. Hugo Music sẽ gửi mã 6 số để đặt lại mật khẩu.</Text>
                <AppTextField
                  key="reset-email"
                  style={[styles.input, field]}
                  placeholder="Email"
                  placeholderTextColor={colors.textTertiary}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                  autoFocus
                />
                <LiquidGlassButton
                  variant="primary"
                  size="lg"
                  title={sending ? undefined : 'Gửi mã'}
                  icon={sending ? <ActivityIndicator color={colors.accent} /> : undefined}
                  onPress={sendCode}
                  disabled={!emailOk || sending}
                  style={styles.full}
                />
              </>
            ) : (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Nếu {resetEmail.trim()} có tài khoản, mã 6 số đã được gửi tới đó. Mã hết hạn sau 5 phút.
                </Text>
                <AppTextField
                  key="reset-code"
                  style={[styles.input, field]}
                  placeholder="Mã 6 số"
                  placeholderTextColor={colors.textTertiary}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoFocus
                />
                <AppTextField
                  key="reset-password"
                  style={[styles.input, field]}
                  placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
                  placeholderTextColor={colors.textTertiary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={submitReset}
                />
                <LiquidGlassButton
                  variant="primary"
                  size="lg"
                  title={isAuthLoading ? undefined : 'Đặt lại mật khẩu'}
                  icon={isAuthLoading ? <ActivityIndicator color={colors.accent} /> : undefined}
                  onPress={submitReset}
                  disabled={!resetOk || isAuthLoading}
                  style={styles.full}
                />
                <Pressable onPress={sendCode} disabled={resendIn > 0 || sending} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: resendIn > 0 ? colors.textTertiary : colors.accent }]}>
                    {resendIn > 0 ? `Gửi lại mã sau ${resendIn} giây` : 'Gửi lại mã'}
                  </Text>
                </Pressable>
              </>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable onPress={onOpenRegister} style={styles.link} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.accent }]}>Chưa có tài khoản? Tạo tài khoản</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>hoặc tiếp tục với</Text>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
            </View>
            <GlassButton icon="logo-google" iconSize={24} size={54} label="Đăng nhập bằng Google" onPress={google} />
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 400, maxHeight: '100%', borderRadius: 28, overflow: 'hidden' },
  body: { padding: 24, paddingTop: 16, alignItems: 'center' },
  topBar: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  spacer: { width: 38 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  input: {
    width: '100%', height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 17, marginBottom: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  full: { width: '100%' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16, marginTop: 4 },
  chipText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  chipEdit: { fontSize: 15, fontWeight: '600' },
  error: { color: '#FF453A', fontSize: 14, textAlign: 'center', marginTop: 12 },
  link: { marginTop: 18, paddingVertical: 4 },
  linkText: { fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 22, marginBottom: 14 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
});
