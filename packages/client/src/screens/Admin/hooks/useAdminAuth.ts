import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../../../store/useStore';

export function useAdminAuth() {
  const user = useStore((state) => state.user);
  const login = useStore((state) => state.login);
  const verifyOtp = useStore((state) => state.verifyOtp);
  const storeLogout = useStore((state) => state.logout);
  const navigation = useNavigation<any>();
  // Log out from the admin page → go to the Home page (don't stay at the admin login screen).
  const logout = useCallback(() => {
    storeLogout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  }, [storeLogout, navigation]);
  const refreshUser = useStore((state) => state.refreshUser);
  const isAuthLoading = useStore((state) => state.isAuthLoading);
  const authError = useStore((state) => state.authError);
  const pendingOtpToken = useStore((state) => state.pendingOtpToken);

  const handleLogin = useCallback(async (email: string, pass: string) => {
    try {
      await login(email.trim(), pass);
    } catch (e) {
      // Error state is managed by useStore
    }
  }, [login]);

  const handleVerifyOtp = useCallback(async (otp: string) => {
    try {
      await verifyOtp(otp.trim());
    } catch (e) {
      // Error state is managed by useStore
    }
  }, [verifyOtp]);

  return {
    user,
    isAuthLoading,
    authError,
    pendingOtpToken,
    handleLogin,
    handleVerifyOtp,
    logout,
    refreshUser
  };
}
