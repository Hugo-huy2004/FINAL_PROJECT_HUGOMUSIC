import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { configure, request } from 'hugo-api';
import { createSteering, ORIGIN } from 'hugo-stream';

// One ranking of CDNs for the whole app: fed by every play (useStore) and every probe below.
export const steering = createSteering();

// Automatically identify the IP of the backend server when running on a real phone (Expo Go)
// instead of pointing to the phone's localhost.
function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // When running on phone via Expo Go, get Mac IP from Metro packager's hostUri
  if (Platform.OS !== 'web') {
    const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:5001`;
      }
    }
  }

  if (envUrl) return envUrl;
  return Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
}

export const API_BASE_URL = getBaseUrl();

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const getAuthToken = () => authToken;

// Store registers logout function here (api.ts cannot import store — import loop).
let onSessionExpired = () => {};
export const setOnSessionExpired = (fn: () => void) => { onSessionExpired = fn; };

// Every call goes through hugo-api (packages/api): timeout, retry with backoff, ETag/304, request coalescing,
// uniform errors ({ status, requiresLogin }) and one session-expired hook.
configure({ baseUrl: API_BASE_URL, getToken: () => authToken, onSessionExpired: () => onSessionExpired(), dev: __DEV__ });
export { request };

// Node proxy fallback (no CDN configured). `token` is a short-lived playback token
// from resolvePlayback, never the session JWT — <audio> can't send headers, so it
// rides in the query string and must be worthless once it leaks.
export const streamUrl = (songId: string, token?: string | null) =>
  `${API_BASE_URL}/api/songs/stream/${songId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

// Cloudflare Worker serves audio files directly from R2 via the global CDN (see apps/edge/src/index.js).
// Set EXPO_PUBLIC_CDN_URL to enable; if left blank, falls back to the Node proxy.
export const CDN_BASE_URL = process.env.EXPO_PUBLIC_CDN_URL || '';

// Choose playback URL based on user quality setting:
// - 'original' or songs without HLS -> original audio file.
// - HLS 'auto' -> master playlist (adaptive bitrate).
// - Specific quality tier -> direct tier playlist if available.
type PlayableSong = { _id: string; filePath?: string; hlsPath?: string; hlsTiers?: string[] };
type PlaybackTokens = { fileToken: string | null; hlsToken: string | null };

export function playbackUrlFor(song: PlayableSong, quality: string, tokens: PlaybackTokens): string | null {
  if (quality !== 'original' && song.hlsPath && tokens.hlsToken) {
    const hls = cdnUrlFor(song.hlsPath, tokens.hlsToken);
    if (hls) {
      return hlsForQuality(hls, quality, song.hlsTiers);
    }
  }
  return cdnUrlFor(song.filePath, tokens.fileToken);
}

// Convert raw R2 storage path into a CDN Worker URL.
function cdnUrlFor(filePath?: string, token?: string | null): string | null {
  if (!CDN_BASE_URL || !filePath) return null;
  const match = /r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/.exec(filePath);
  if (!match) return null;

  const key = match[1];
  const base = `${CDN_BASE_URL.replace(/\/$/, '')}/${key}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// Map HLS master playlist URL to specific tier if available; fallback to master playlist.
const hlsForQuality = (master: string, quality: string, tiers?: string[]) =>
  quality !== 'auto' && tiers?.includes(quality) ? master.replace(/master\.m3u8/, `${quality}.m3u8`) : master;

type CdnSource = { cdn: string; file: string | null; hls: string | null };

// Probe alternate CDN health using a lightweight 1-byte Range request (max once every 5 min).
function probeAlternates(sources: CdnSource[], chosen: string) {
  for (const s of sources) {
    const url = s.file || s.hls;
    if (s.cdn === chosen || !url || !steering.claimProbe(s.cdn)) continue;
    const t0 = Date.now();
    fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? steering.success(s.cdn, Date.now() - t0) : steering.failure(s.cdn)))
      .catch(() => steering.failure(s.cdn));
  }
}

// Request playback token and construct streaming URL.
// When unauthenticated users exceed daily quota, throws an error with `requiresLogin: true`.
export async function resolvePlayback(song: PlayableSong, quality: string): Promise<{ url: string; cdn: string }> {
  const t = await api.getPlaybackToken(song._id);
  const sources: CdnSource[] = t.sources || [];
  if (!sources.length) {
    // Fallback when multi-CDN is not configured: Worker via EXPO_PUBLIC_CDN_URL, or Node proxy.
    const url = playbackUrlFor(song, quality, t);
    return { url: url || streamUrl(song._id, t.fileToken), cdn: url ? 'cloudflare' : ORIGIN };
  }
  const wantHls = quality !== 'original';
  const byName = new Map(sources.map((s) => [s.cdn, s]));
  for (const name of steering.rank(sources.map((s) => s.cdn))) {
    if (name === ORIGIN) return { url: streamUrl(song._id, t.fileToken), cdn: ORIGIN };
    const s = byName.get(name)!;
    const url = (wantHls && s.hls && hlsForQuality(s.hls, quality, song.hlsTiers)) || s.file;
    if (url) {
      probeAlternates(sources, name);
      return { url, cdn: name };
    }
  }
  return { url: streamUrl(song._id, t.fileToken), cdn: ORIGIN };
}

// Query parameters, remove empty values.
const qs = (params: Record<string, string | number>) =>
  Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const api = {
  // Admins get { requiresOtp: true, tempToken } instead of a session — see verifyOtp below.
  // `identifier` can be an email, username, or phone number.
  login: (identifier: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  startPasswordlessLogin: (email: string) =>
    request<{ tempToken: string; email: string }>('/api/auth/passwordless/start', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyPasswordlessLogin: (tempToken: string, code: string) =>
    request<any>('/api/auth/passwordless/verify', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  verifyOtp: (tempToken: string, code: string) =>
    request('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  me: () => request('/api/auth/me'),
  // Personalization only — username/email/dateOfBirth/address are locked after signup.
  updateProfile: (fields: { nickname?: string; phone?: string; musicGenres?: string[]; dateOfBirth?: string; address?: { country?: string; province?: string; ward?: string; detail?: string } }) =>
    request('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(fields) }),
  updateAvatar: (form: FormData) => request('/api/auth/avatar', { method: 'PATCH', body: form }),
  // Fills in whatever's still missing on an older/Google account — see
  // screens/Auth/CompleteProfileModal.tsx. Fields already set server-side are no-ops.
  completeProfile: (fields: {
    nickname?: string;
    dateOfBirth?: string;
    musicGenres?: string[];
    country?: string;
    province?: string;
    ward?: string;
    addressDetail?: string;
  }) => request('/api/auth/complete-profile', { method: 'PATCH', body: JSON.stringify(fields) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) }),
  // Confirm again: account with password sends password; Only Google account sends confirm = username.
  deleteAccount: (confirm: { password?: string; confirm?: string }) =>
    request('/api/auth/me', { method: 'DELETE', body: JSON.stringify(confirm) }),
  removeAvatar: () => request('/api/auth/avatar', { method: 'DELETE' }),
  // Forgot password: always returns { tempToken } (no email leakage); 6-digit code sent via email.
  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  // Valid code -> update password, revoke all other device sessions, return new session token.
  resetPassword: (tempToken: string, code: string, newPassword: string) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ tempToken, code, newPassword }) }),

  // --- Registration wizard steps (see screens/Auth/RegisterWizard.tsx) ---
  sendEmailOtp: (email: string) =>
    request('/api/auth/send-email-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmailOtp: (tempToken: string, code: string) =>
    request('/api/auth/verify-email-otp', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  register: (form: FormData) => request('/api/auth/register', { method: 'POST', body: form }),

  getMeta: () => request('/api/meta'),
  getSongs: () => request('/api/songs'),
  getLikedSongs: () => request('/api/songs/liked/mine'),
  toggleLike: (songId: string) => request(`/api/songs/${songId}/like`, { method: 'POST' }),
  // --- Catalog review (admin): new uploads go to queue, published upon approval ---
  getReviewQueue: (status: 'pending' | 'published' | 'rejected') =>
    request(`/api/songs/admin/queue?status=${status}`),
  uploadSong: (form: FormData) => request('/api/songs/upload', { method: 'POST', body: form }),
  updateSong: (songId: string, fields: Record<string, string>) =>
    request(`/api/songs/${songId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  reviewSong: (songId: string, decision: 'publish' | 'reject', note?: string) =>
    request(`/api/songs/${songId}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  deleteSong: (songId: string) => request(`/api/songs/${songId}`, { method: 'DELETE' }),
  updateSongCover: (songId: string, form: FormData) => request(`/api/songs/${songId}/cover`, { method: 'PATCH', body: form }),

  // Live radio: deterministic "what's playing right now" — see apps/server/src/modules/radio/controller.js.
  // Real third-party stations sourced from radio-browser.info — see apps/server/src/modules/radio/RadioStation.js.
  getRadioStations: (country?: string) => request(`/api/radio/stations${country ? `?country=${country}` : ''}`),
  // Real Wikipedia-sourced photos for artists with a confident match — absent for
  // most netlabel/indie acts, which is expected: no fabricated photo stands in for a real one.
  getArtists: () => request('/api/artists'),
  // Lyrics are looked up at upload (apps/server/src/modules/songs/lyricsLookup.js). hasLyrics:false is a
  // real "checked, none found" result (mostly obscure netlabel acts), not an error.
  getLyrics: (songId: string) => request(`/api/songs/${songId}/lyrics`),

  // Playback token valid for 5–10 min. Unauthenticated guests have a daily listen limit (401 requiresLogin).
  getPlaybackToken: (songId: string) =>
    request(`/api/songs/${songId}/playback`) as Promise<PlaybackTokens & { expiresIn: number; sources?: CdnSource[] }>,

  // Fire-and-forget: playback metric recording never interrupts listening if it fails.
  // Ranking by listen count (>= 30s) in the last N days; days=0 means all-time.
  getTopSongs: (days = 7, limit = 50, group?: string) =>
    request(`/api/metrics/top?days=${days}&limit=${limit}${group ? `&group=${encodeURIComponent(group)}` : ''}`),
  recordPlayback: (payload: Record<string, unknown>) =>
    request('/api/metrics/playback', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {}),

  getPlaylists: () => request('/api/playlists'),
  createPlaylist: (name: string, description = '') =>
    request('/api/playlists', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updatePlaylist: (id: string, fields: { name?: string; description?: string }) =>
    request(`/api/playlists/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deletePlaylist: (id: string) => request(`/api/playlists/${id}`, { method: 'DELETE' }),
  // Add one or more songs to playlist in a single request (duplicates/invalid IDs ignored).
  addSongsToPlaylist: (id: string, songIds: string[]) =>
    request(`/api/playlists/${id}/songs`, { method: 'POST', body: JSON.stringify({ songIds }) }),
  reorderPlaylist: (id: string, songIds: string[]) =>
    request(`/api/playlists/${id}/songs`, { method: 'PUT', body: JSON.stringify({ songIds }) }),
  removeSongFromPlaylist: (id: string, songId: string) =>
    request(`/api/playlists/${id}/songs/${songId}`, { method: 'DELETE' }),

  // --- Listening rooms: room metadata via REST; live streaming and voting via WebSocket ---
  getStations: () => request('/api/rooms/stations'),
  getBlindRooms: () => request('/api/rooms/blind'),
  adminRooms: () => request('/api/rooms/admin'),
  createRoom: (fields: Record<string, unknown>) => request('/api/rooms/admin', { method: 'POST', body: JSON.stringify(fields) }),
  updateRoom: (id: string, fields: Record<string, unknown>) =>
    request(`/api/rooms/admin/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteRoom: (id: string) => request(`/api/rooms/admin/${id}`, { method: 'DELETE' }),
  previewRoomRules: (rules: Record<string, unknown>) =>
    request('/api/rooms/admin/preview', { method: 'POST', body: JSON.stringify({ rules }) }),
  // Channel management and live playback control (admin).
  roomPinnedSongs: (id: string) => request(`/api/rooms/admin/${id}/songs`),
  roomSuggestions: (id: string, q = '') => request(`/api/rooms/admin/${id}/suggestions?q=${encodeURIComponent(q)}`),
  roomLive: (id: string) => request(`/api/rooms/admin/${id}/live`),
  roomEnqueue: (id: string, songId: string) =>
    request(`/api/rooms/admin/${id}/queue`, { method: 'POST', body: JSON.stringify({ songId }) }),
  roomDequeue: (id: string, entryId: string) => request(`/api/rooms/admin/${id}/queue/${encodeURIComponent(entryId)}`, { method: 'DELETE' }),
  roomSkip: (id: string) => request(`/api/rooms/admin/${id}/skip`, { method: 'POST' }),

  // --- Admin portal endpoints (see apps/server/src/modules/admin/controller.js) ---
  admin: {
    overview: () => request('/api/admin/overview'),
    songs: (params: Record<string, string | number>) => request(`/api/admin/songs?${qs(params)}`),
    bulkSongs: (ids: string[], action: 'publish' | 'reject', note?: string) =>
      request('/api/admin/songs/bulk', { method: 'POST', body: JSON.stringify({ ids, action, note }) }),
    artists: (params: Record<string, string | number>) => request(`/api/admin/artists?${qs(params)}`),
    updateArtist: (fields: { name: string; newName?: string; photo?: string; bio?: string }) =>
      request('/api/admin/artists', { method: 'PATCH', body: JSON.stringify(fields) }),
    albums: (params: Record<string, string | number>) => request(`/api/admin/albums?${qs(params)}`),
    album: (key: string) => request(`/api/admin/albums/${encodeURIComponent(key)}`),
    updateAlbum: (key: string, fields: { title?: string; artist?: string; year?: number }) =>
      request(`/api/admin/albums/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    pipeline: (params: Record<string, string | number>) => request(`/api/admin/pipeline?${qs(params)}`),
    retryPipeline: (songId: string) => request(`/api/admin/pipeline/${songId}/retry`, { method: 'POST' }),
    users: (params: Record<string, string | number>) => request(`/api/admin/users?${qs(params)}`),
    user: (id: string) => request(`/api/admin/users/${id}`),
    setUserDisabled: (id: string, disabled: boolean) =>
      request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ disabled }) }),
    revokeSessions: (id: string) => request(`/api/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
    deleteUser: (id: string) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  },
};

