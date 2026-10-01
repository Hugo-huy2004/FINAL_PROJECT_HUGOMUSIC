import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE_URL } from './api';

// Đăng nhập Google qua backend (controllers/authController.js googleStart/googleCallback) — một đường
// cho cả web lẫn ứng dụng: backend đổi mã với Google rồi trả phiên của Hugo về #token=… (hoặc #error=…).
//  - Ứng dụng: trình duyệt trong app (ASWebAuthenticationSession / Custom Tab), tự đóng khi quay về.
//  - Web: chuyển cả trang; lúc quay lại, takeGoogleRedirect() đọc phiên trên thanh địa chỉ.
const startUrl = (back: string) => `${API_BASE_URL}/api/auth/google/start?redirect=${encodeURIComponent(back)}`;

function readFragment(url: string): string | null {
  const params = new URLSearchParams(url.split('#')[1] || '');
  const error = params.get('error');
  if (error) throw new Error(error);
  return params.get('token');
}

// Trả token phiên, null nếu người dùng đóng giữa chừng (hoặc web: trang đang chuyển sang Google).
export async function signInWithGoogle(): Promise<string | null> {
  if (Platform.OS === 'web') {
    window.location.assign(startUrl(`${window.location.origin}/`));
    return null;
  }
  const back = Linking.createURL('auth');
  const result = await WebBrowser.openAuthSessionAsync(startUrl(back), back);
  return result.type === 'success' ? readFragment(result.url) : null;
}

// Web: vừa quay về từ Google → lấy token (hoặc lỗi) khỏi địa chỉ rồi xoá nó đi.
export function takeGoogleRedirect(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !/[#&](token|error)=/.test(window.location.hash)) return null;
  const url = window.location.href;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return readFragment(url);
}
