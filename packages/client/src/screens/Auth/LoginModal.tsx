import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, KeyboardAvoidingView, ScrollView, Image } from 'react-native';
import { useStore } from '../../store/useStore';
import { api } from '../../api/api';
import { ActionButton, Spinner, TextField } from 'hugo-music';
import { GlassButton } from '../../ui/kit';
import { useAppTheme } from '../../ui/theme';

const LOGO = require('../../../assets/logo.png');

type LoginStep =
  | 'passwordless_email'
  | 'passwordless_otp'
  | 'password_id'
  | 'password_input'
  | 'forgot'
  | 'reset';

export default function LoginModal({ onClose, onOpenRegister }: { onClose: () => void; onOpenRegister: () => void }) {
  const login = useStore((s) => s.login);
  const startPasswordlessLogin = useStore((s) => s.startPasswordlessLogin);
  const loginPasswordless = useStore((s) => s.loginPasswordless);
  const loginWithGoogle = useStore((s) => s.loginWithGoogle);
  const isAuthLoading = useStore((s) => s.isAuthLoading);
  const authError = useStore((s) => s.authError);
  const resetPassword = useStore((s) => s.resetPassword);
  const { colors, isDark } = useAppTheme();

  const [step, setStep] = useState<LoginStep>('passwordless_email');

  // Passwordless OTP state
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resendOtpIn, setResendOtpIn] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Password-based login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resendResetIn, setResendResetIn] = useState(0);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const otpCodeOk = /^\d{6}$/.test(otpCode.trim());
  const idOk = identifier.trim().length >= 3;
  const pwOk = password.length >= 6;
  const resetEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim());
  const resetOk = /^\d{6}$/.test(resetCode.trim()) && newPassword.length >= 6;

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendOtpIn <= 0) return;
    const t = setTimeout(() => setResendOtpIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendOtpIn]);

  // Countdown timer for Reset code resend
  useEffect(() => {
    if (resendResetIn <= 0) return;
    const t = setTimeout(() => setResendResetIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendResetIn]);

  // 1. Passwordless Flow: Send OTP
  const handleSendOtp = async () => {
    if (!emailOk || sendingOtp) return;
    setSendingOtp(true);
    setOtpError(null);
    try {
      const res = await startPasswordlessLogin(email.trim());
      setOtpToken(res.tempToken);
      setResendOtpIn(60);
      setStep('passwordless_otp');
    } catch (e: any) {
      setOtpError(e.message);
    } finally {
      setSendingOtp(false);
    }
  };

  // 1. Passwordless Flow: Verify OTP & Sign In
  const handleVerifyOtp = async () => {
    if (!otpCodeOk || isAuthLoading) return;
    setOtpError(null);
    try {
      await loginPasswordless(otpToken, otpCode.trim());
      onClose();
    } catch (e: any) {
      setOtpError(e.message);
    }
  };

  // Auto-submit OTP when 6 digits are typed
  const handleOtpChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setOtpCode(cleaned);
    if (cleaned.length === 6 && otpToken && !isAuthLoading) {
      setOtpError(null);
      loginPasswordless(otpToken, cleaned)
        .then(() => onClose())
        .catch((e: any) => setOtpError(e.message));
    }
  };

  // 2. Password Flow
  const handlePasswordNext = () => idOk && setStep('password_input');
  const handlePasswordSubmit = async () => {
    if (!pwOk || isAuthLoading) return;
    setAdminNotice(false);
    try {
      await login(identifier.trim(), password);
      if (useStore.getState().pendingOtpToken) return setAdminNotice(true);
      onClose();
    } catch {
      // error is stored in store (authError)
    }
  };

  // 3. Google 1-Click Flow
  const handleGoogle = async () => {
    if (await loginWithGoogle().catch(() => false)) onClose();
  };

  // 4. Forgot Password Flow
  const openForgot = () => {
    setForgotError(null);
    if (!resetEmail && identifier.includes('@')) setResetEmail(identifier.trim());
    else if (!resetEmail && email.includes('@')) setResetEmail(email.trim());
    setStep('forgot');
  };

  const sendResetCode = async () => {
    if (!resetEmailOk || sendingReset) return;
    setSendingReset(true);
    setForgotError(null);
    try {
      const { tempToken } = await api.forgotPassword(resetEmail.trim());
      setResetToken(tempToken);
      setResendResetIn(60);
      setStep('reset');
    } catch (e: any) {
      setForgotError(e.message);
    } finally {
      setSendingReset(false);
    }
  };

  const submitReset = async () => {
    if (!resetOk || isAuthLoading) return;
    try {
      await resetPassword(resetToken, resetCode.trim(), newPassword);
      onClose();
    } catch {
      // error is stored in authError
    }
  };

  const field = { backgroundColor: colors.inputBg, color: colors.text };

  const currentError =
    step === 'passwordless_otp'
      ? otpError || authError
      : step === 'forgot'
      ? forgotError
      : adminNotice
      ? 'Tài khoản quản trị đăng nhập ở trang quản trị (mật khẩu + OTP).'
      : authError;

  const back =
    step === 'passwordless_otp'
      ? () => setStep('passwordless_email')
      : step === 'password_id'
      ? () => setStep('passwordless_email')
      : step === 'password_input'
      ? () => setStep('password_id')
      : step === 'forgot'
      ? () => setStep('password_input')
      : step === 'reset'
      ? () => setStep('forgot')
      : null;

  const title = {
    passwordless_email: 'Đăng nhập Hugo Music',
    passwordless_otp: 'Nhập mã xác thực',
    password_id: 'Đăng nhập mật khẩu',
    password_input: 'Nhập mật khẩu',
    forgot: 'Quên mật khẩu',
    reset: 'Đặt lại mật khẩu',
  }[step];

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' }]} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[styles.center, { pointerEvents: 'box-none' }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg }]}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.topBar}>
              {back ? (
                <GlassButton icon="chevron-back" iconSize={22} nudge={-2} size={38} label="Quay lại" onPress={back} />
              ) : (
                <View style={styles.spacer} />
              )}
              <GlassButton icon="close" iconSize={20} size={38} label="Đóng" onPress={onClose} />
            </View>

            <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

            {/* STEP 1: PASSWORDLESS EMAIL (DEFAULT) */}
            {step === 'passwordless_email' && (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Đăng nhập nhanh không cần mật khẩu. Nghe nhạc và tải offline tức thì.
                </Text>

                <ActionButton
                  variant="glass"
                  size="lg"
                  icon="logo-google"
                  title="Tiếp tục với Google"
                  onPress={handleGoogle}
                  style={[styles.full, { marginBottom: 6 }]}
                />

                <View style={styles.dividerRow}>
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textSecondary }]}>hoặc bằng mã OTP qua email</Text>
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                </View>

                <TextField
                  key="email-otp-input"
                  style={[styles.input, field]}
                  placeholder="Nhập địa chỉ email của bạn"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={handleSendOtp}
                />

                <ActionButton
                  variant="primary"
                  size="lg"
                  title={sendingOtp ? undefined : 'Nhận mã đăng nhập'}
                  icon={sendingOtp ? <Spinner color="#fff" /> : undefined}
                  onPress={handleSendOtp}
                  disabled={!emailOk || sendingOtp}
                  style={styles.full}
                />

                <Pressable onPress={() => setStep('password_id')} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.accent }]}>Đăng nhập bằng Mật khẩu</Text>
                </Pressable>
              </>
            )}

            {/* STEP 2: PASSWORDLESS OTP VERIFY */}
            {step === 'passwordless_otp' && (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Mã 6 số đã được gửi tới{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>{email.trim()}</Text>. Mã có hiệu lực trong 5 phút.
                </Text>

                <Pressable
                  onPress={() => setStep('passwordless_email')}
                  style={[styles.chip, { backgroundColor: colors.fill }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Đổi email ${email}`}
                >
                  <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
                    {email.trim()}
                  </Text>
                  <Text style={[styles.chipEdit, { color: colors.accent }]}>Đổi email</Text>
                </Pressable>

                <TextField
                  key="otp-code-input"
                  style={[styles.input, field, { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' }]}
                  placeholder="• • • • • •"
                  placeholderTextColor={colors.textTertiary}
                  value={otpCode}
                  onChangeText={handleOtpChange}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  autoFocus
                />

                <ActionButton
                  variant="primary"
                  size="lg"
                  title={isAuthLoading ? undefined : 'Đăng nhập'}
                  icon={isAuthLoading ? <Spinner color="#fff" /> : undefined}
                  onPress={handleVerifyOtp}
                  disabled={!otpCodeOk || isAuthLoading}
                  style={styles.full}
                />

                <Pressable
                  onPress={handleSendOtp}
                  disabled={resendOtpIn > 0 || sendingOtp}
                  style={styles.link}
                  accessibilityRole="button"
                >
                  <Text style={[styles.linkText, { color: resendOtpIn > 0 ? colors.textTertiary : colors.accent }]}>
                    {resendOtpIn > 0 ? `Gửi lại mã sau ${resendOtpIn}s` : 'Gửi lại mã OTP'}
                  </Text>
                </Pressable>
              </>
            )}

            {/* STEP 3: PASSWORD LOGIN - IDENTIFIER */}
            {step === 'password_id' && (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Nhập email, tên người dùng hoặc số điện thoại của bạn.
                </Text>

                <TextField
                  key="id-input"
                  style={[styles.input, field]}
                  placeholder="Email, tên người dùng hoặc SĐT"
                  placeholderTextColor={colors.textTertiary}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={handlePasswordNext}
                  autoFocus
                />

                <ActionButton
                  variant="primary"
                  size="lg"
                  title="Tiếp tục"
                  onPress={handlePasswordNext}
                  disabled={!idOk}
                  style={styles.full}
                />

                <Pressable onPress={() => setStep('passwordless_email')} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.accent }]}>← Đăng nhập bằng Email OTP (Không cần mật khẩu)</Text>
                </Pressable>
              </>
            )}

            {/* STEP 4: PASSWORD LOGIN - PASSWORD */}
            {step === 'password_input' && (
              <>
                <Pressable
                  onPress={() => setStep('password_id')}
                  style={[styles.chip, { backgroundColor: colors.fill }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Đổi tài khoản ${identifier}`}
                >
                  <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
                    {identifier.trim()}
                  </Text>
                  <Text style={[styles.chipEdit, { color: colors.accent }]}>Đổi</Text>
                </Pressable>

                <TextField
                  key="password-input"
                  style={[styles.input, field]}
                  placeholder="Mật khẩu"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordSubmit}
                  autoFocus
                />

                <ActionButton
                  variant="primary"
                  size="lg"
                  title={isAuthLoading ? undefined : 'Đăng nhập'}
                  icon={isAuthLoading ? <Spinner color="#fff" /> : undefined}
                  onPress={handlePasswordSubmit}
                  disabled={!pwOk || isAuthLoading}
                  style={styles.full}
                />

                <Pressable onPress={openForgot} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.accent }]}>Quên mật khẩu?</Text>
                </Pressable>
              </>
            )}

            {/* STEP 5: FORGOT PASSWORD */}
            {step === 'forgot' && (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Nhập email của tài khoản. Hugo Music sẽ gửi mã 6 số để đặt lại mật khẩu.
                </Text>
                <TextField
                  key="reset-email-input"
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
                  onSubmitEditing={sendResetCode}
                  autoFocus
                />
                <ActionButton
                  variant="primary"
                  size="lg"
                  title={sendingReset ? undefined : 'Gửi mã'}
                  icon={sendingReset ? <Spinner color="#fff" /> : undefined}
                  onPress={sendResetCode}
                  disabled={!resetEmailOk || sendingReset}
                  style={styles.full}
                />
              </>
            )}

            {/* STEP 6: RESET PASSWORD WITH CODE */}
            {step === 'reset' && (
              <>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Nếu {resetEmail.trim()} có tài khoản, mã 6 số đã được gửi tới đó. Mã hết hạn sau 5 phút.
                </Text>
                <TextField
                  key="reset-code-input"
                  style={[styles.input, field]}
                  placeholder="Mã 6 số"
                  placeholderTextColor={colors.textTertiary}
                  value={resetCode}
                  onChangeText={(v) => setResetCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoFocus
                />
                <TextField
                  key="reset-password-input"
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
                <ActionButton
                  variant="primary"
                  size="lg"
                  title={isAuthLoading ? undefined : 'Đặt lại mật khẩu'}
                  icon={isAuthLoading ? <Spinner color="#fff" /> : undefined}
                  onPress={submitReset}
                  disabled={!resetOk || isAuthLoading}
                  style={styles.full}
                />
                <Pressable
                  onPress={sendResetCode}
                  disabled={resendResetIn > 0 || sendingReset}
                  style={styles.link}
                  accessibilityRole="button"
                >
                  <Text style={[styles.linkText, { color: resendResetIn > 0 ? colors.textTertiary : colors.accent }]}>
                    {resendResetIn > 0 ? `Gửi lại mã sau ${resendResetIn} giây` : 'Gửi lại mã'}
                  </Text>
                </Pressable>
              </>
            )}

            {!!currentError && <Text style={styles.error}>{currentError}</Text>}

            <Pressable onPress={onOpenRegister} style={styles.link} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.accent }]}>Chưa có tài khoản? Tạo tài khoản mới</Text>
            </Pressable>
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
