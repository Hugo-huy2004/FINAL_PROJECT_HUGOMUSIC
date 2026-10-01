import { API_BASE_URL } from '../api/api';

/**
 * Resolves any avatar URL to a browser-loadable and mobile-loadable URI.
 * - Raw R2 URLs (*.r2.cloudflarestorage.com) are rewritten to our backend proxy endpoint
 * - Relative URLs (/api/auth/avatar/...) are prefixed with API_BASE_URL
 * - External URLs (Google OAuth, Cloudinary, etc.) are kept intact
 */
export function getAvatarUri(avatarUrl?: string | null, username?: string | null): string | undefined {
  if (!avatarUrl && !username) return undefined;

  let url = avatarUrl;
  if (!url && username) {
    return `${API_BASE_URL}/api/auth/avatar/${encodeURIComponent(username)}`;
  }

  if (!url) return undefined;

  // Cloudflare R2 private bucket URLs cannot be accessed directly without SigV4
  if (url.includes('r2.cloudflarestorage.com')) {
    if (username) {
      return `${API_BASE_URL}/api/auth/avatar/${encodeURIComponent(username)}`;
    }
    const match = url.match(/avatars\/user_([^.]+)/);
    if (match && match[1]) {
      return `${API_BASE_URL}/api/auth/avatar/${encodeURIComponent(match[1])}`;
    }
  }

  // Relative endpoint
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
}
