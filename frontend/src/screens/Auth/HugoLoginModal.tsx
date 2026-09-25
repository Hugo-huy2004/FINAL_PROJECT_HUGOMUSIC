import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { useStore } from '../../store/useStore';
import { Ionicons } from '@expo/vector-icons';
import { renderGoogleButton } from '../../utils/googleAuth';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';
import { useAppTheme } from '../../theme/theme';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

// Login-only now — registration moved to RegisterWizard.tsx (a proper step -> step
// flow: email, OTP verification, avatar/nickname, birthday/genres, address, review).
// This modal is for regular users only — admin accounts go through /admin's
// password + Telegram OTP flow instead (see store.login and AdminScreen.tsx).
export default function HugoLoginModal({ onClose, onOpenRegister }: { onClose: () => void; onOpenRegister: () => void }) {
  const login = useStore((state) => state.login);
  const loginWithGoogle = useStore((state) => state.loginWithGoogle);
  const isAuthLoading = useStore((state) => state.isAuthLoading);
  const authError = useStore((state) => state.authError);
  const { colors } = useAppTheme();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState(false);
  const googleBtnRef = useRef<View>(null);

  const canSubmit = identifier.trim() && password.trim().length >= 6;

  useEffect(() => {
    if (Platform.OS !== 'web' || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    renderGoogleButton(GOOGLE_CLIENT_ID, googleBtnRef.current as unknown as HTMLElement, (idToken) => {
      loginWithGoogle(idToken).then(onClose).catch(() => {});
    });
  }, [loginWithGoogle, onClose]);

  const handleSubmit = async () => {
    if (!canSubmit || isAuthLoading) return;
    setAdminNotice(false);
    try {
      await login(identifier.trim(), password);
      if (useStore.getState().pendingOtpToken) {
        setAdminNotice(true);
        return;
      }
      onClose();
    } catch {
      // authError is already set in the store and rendered below
    }
  };

  return (
    <View style={styles.modalContainer}>
      <BlurView
        intensity={10}
        tint="dark"
        style={styles.modalBackdrop}
      />
      <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
        <View style={styles.header}>
          <View style={{ width: 30 }} />
          <Ionicons name="musical-notes" size={40} color={colors.accent} />
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceHover }]} accessibilityLabel="Đóng">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Đăng nhập</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Nghe trọn mọi bài hát, lưu bài bạn thích và tạo danh sách phát. Dùng email, tên người dùng hoặc số điện thoại.
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Email / Username / Số điện thoại"
          placeholderTextColor={colors.textTertiary}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
          placeholderTextColor={colors.textTertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {authError && <Text style={styles.errorText}>{authError}</Text>}
        {adminNotice && (
          <Text style={styles.errorText}>
            Tài khoản admin cần xác thực OTP. Vui lòng đăng nhập tại trang quản trị.
          </Text>
        )}

        <View style={{ width: '100%', marginTop: 8 }}>
          <LiquidGlassButton
            variant="primary"
            size="lg"
            title={isAuthLoading ? undefined : 'Đăng nhập'}
            icon={isAuthLoading ? <ActivityIndicator color="#fff" /> : undefined}
            onPress={handleSubmit}
            disabled={!canSubmit || isAuthLoading}
            style={{ width: '100%' }}
          />
        </View>

        <TouchableOpacity onPress={onOpenRegister} style={{ marginTop: 16 }}>
          <Text style={[styles.switchModeText, { color: colors.accent }]}>Chưa có tài khoản? Đăng ký</Text>
        </TouchableOpacity>

        {Platform.OS === 'web' && !!GOOGLE_CLIENT_ID && (
          <>
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>hoặc</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
            {/* Google renders its own button into this node — see utils/googleAuth.ts */}
            <View ref={googleBtnRef} style={{ minHeight: 44 }} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)' } as any) : {}),
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 15,
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  errorText: {
    color: '#1CD8A9',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  switchModeText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 24,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#eee',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
  },
});
