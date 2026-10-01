import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE_URL } from './api';

// Google Login via backend (controllers/authController.js googleStart/googleCallback) — one way
// for both web and app: backend exchanges tokens with Google and returns Hugo's session to #token=… (or #error=…).
// - Application: in-app browser (ASWebAuthenticationSession / Custom Tab), closes automatically when returning.
// - Web: transfer entire page; When returning, takeGoogleRedirect() reads the session in the address bar.
const startUrl = (back: string) => `${API_BASE_URL}/api/auth/google/start?redirect=${encodeURIComponent(back)}`;

function readFragment(url: string): string | null {
  const params = new URLSearchParams(url.split('#')[1] || '');
  const error = params.get('error');
  if (error) throw new Error(error);
  return params.get('token');
}

// Returns session token, null if user closes midstream (or web: page is switching to Google).
export async function signInWithGoogle(): Promise<string | null> {
  if (Platform.OS === 'web') {
    window.location.assign(startUrl(`${window.location.origin}/`));
    return null;
  }
  const back = Linking.createURL('auth');
  const result = await WebBrowser.openAuthSessionAsync(startUrl(back), back);
  return result.type === 'success' ? readFragment(result.url) : null;
}

// Web: just returned from Google → take the token (or error) from the address and delete it.
export function takeGoogleRedirect(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !/[#&](token|error)=/.test(window.location.hash)) return null;
  const url = window.location.href;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return readFragment(url);
}
