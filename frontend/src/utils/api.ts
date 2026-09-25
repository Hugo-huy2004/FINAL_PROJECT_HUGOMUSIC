import { Platform } from 'react-native';

// Android emulator can't reach the host machine via "localhost" — it needs the
// special 10.0.2.2 alias. iOS simulator and web both work with plain localhost.
// Override for a real device / production by setting EXPO_PUBLIC_API_URL (frontend/.env).
const inferredHost = Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || inferredHost;

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const getAuthToken = () => authToken;

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (e) {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    // Giữ mã HTTP để nơi gọi phân biệt được, vd. 401 requiresLogin khi khách hết lượt nghe.
    throw Object.assign(new Error((data && data.message) || `Request failed (${res.status})`), {
      status: res.status, requiresLogin: !!data?.requiresLogin,
    });
  }
  return data;
}

// Node proxy fallback (no CDN configured). `token` is a short-lived playback token
// from resolvePlayback, never the session JWT — <audio> can't send headers, so it
// rides in the query string and must be worthless once it leaks.
export const streamUrl = (songId: string, token?: string | null) =>
  `${API_BASE_URL}/api/songs/stream/${songId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

// Cloudflare Worker phục vụ thẳng file từ R2 qua CDN toàn cầu (xem worker/src/index.js).
// Đặt EXPO_PUBLIC_CDN_URL để bật; bỏ trống thì tự quay về proxy Node như cũ.
export const CDN_BASE_URL = process.env.EXPO_PUBLIC_CDN_URL || '';

// Chọn URL phát theo mức chất lượng người dùng đặt.
//
// 'original' hoặc bài không có HLS (giấy phép ND cấm tạo bản phái sinh) -> file gốc.
// Còn lại dùng HLS: 'auto' lấy master playlist để ABR tự đổi theo mạng, chọn tay
// một mức thì trỏ thẳng vào biến thể đó.
type PlayableSong = { _id: string; filePath?: string; hlsPath?: string; hlsTiers?: string[] };
type PlaybackTokens = { fileToken: string | null; hlsToken: string | null };

export function playbackUrlFor(song: PlayableSong, quality: string, tokens: PlaybackTokens): string | null {
  if (quality !== 'original' && song.hlsPath && tokens.hlsToken) {
    const hls = cdnUrlFor(song.hlsPath, tokens.hlsToken);
    if (hls) {
      if (quality === 'auto') return hls;
      // Chỉ khoá vào tier bài này thực sự có — nguồn yếu thì không có tier cao.
      if (song.hlsTiers?.includes(quality)) {
        return hls.replace(/master\.m3u8/, `${quality}.m3u8`);
      }
      return hls;
    }
  }
  return cdnUrlFor(song.filePath, tokens.fileToken);
}

// Đổi URL R2 thô thành URL Worker. URL R2 thô là endpoint S3 cần ký nên gọi
// trực tiếp luôn trả 400 — phải qua Worker (hoặc proxy Node) mới phát được.
export function cdnUrlFor(filePath?: string, token?: string | null): string | null {
  if (!CDN_BASE_URL || !filePath) return null;
  const match = /r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/.exec(filePath);
  if (!match) return null;

  const key = match[1];
  const base = `${CDN_BASE_URL.replace(/\/$/, '')}/${key}`;
  // Mọi đường phát đều cần token (backend/utils/playbackToken.js); Worker tự
  // gắn tiếp token vào các URI con của playlist HLS.
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// Xin token phát rồi dựng URL — đường DUY NHẤT client lấy URL nhạc. Khách hết
// lượt nghe miễn phí thì hàm này ném lỗi có `requiresLogin` (xem request()).
export async function resolvePlayback(song: PlayableSong, quality: string) {
  const t = await api.getPlaybackToken(song._id);
  return { url: playbackUrlFor(song, quality, t) || streamUrl(song._id, t.fileToken) };
}

export const api = {
  // Admins get { requiresOtp: true, tempToken } instead of a session — see verifyOtp below.
  // `identifier` can be an email, username, or phone number.
  login: (identifier: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  verifyOtp: (tempToken: string, code: string) =>
    request('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  googleAuth: (idToken: string) =>
    request('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  me: () => request('/api/auth/me'),
  // Personalization only — username/email/dateOfBirth/address are locked after signup.
  updateProfile: (fields: { nickname?: string; phone?: string; musicGenres?: string[] }) =>
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
  deleteAccount: () => request('/api/auth/me', { method: 'DELETE' }),

  // --- registration wizard (step -> step, see screens/Auth/RegisterWizard.tsx) ---
  sendEmailOtp: (email: string) =>
    request('/api/auth/send-email-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmailOtp: (tempToken: string, code: string) =>
    request('/api/auth/verify-email-otp', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  register: (form: FormData) => request('/api/auth/register', { method: 'POST', body: form }),

  getSongs: (q?: string) => request(`/api/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getLikedSongs: () => request('/api/songs/liked/mine'),
  toggleLike: (songId: string) => request(`/api/songs/${songId}/like`, { method: 'POST' }),
  // --- quản lý kho (admin): bài mới vào hàng chờ, duyệt mới xuất bản ---
  getReviewQueue: (status: 'pending' | 'published' | 'rejected') =>
    request(`/api/songs/admin/queue?status=${status}`),
  uploadSong: (form: FormData) => request('/api/songs/upload', { method: 'POST', body: form }),
  updateSong: (songId: string, fields: Record<string, string>) =>
    request(`/api/songs/${songId}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  reviewSong: (songId: string, decision: 'publish' | 'reject', note?: string) =>
    request(`/api/songs/${songId}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  deleteSong: (songId: string) => request(`/api/songs/${songId}`, { method: 'DELETE' }),

  // Live radio: deterministic "what's playing right now" — see backend/controllers/radioController.js.
  getRadioNowPlaying: (stationId: string) => request(`/api/radio/${stationId}/now-playing`),
  // Real third-party stations sourced from radio-browser.info — see backend/models/RadioStation.js.
  getRadioStations: (country?: string) => request(`/api/radio/stations${country ? `?country=${country}` : ''}`),
  // Real Wikipedia-sourced photos for artists with a confident match — absent for
  // most netlabel/indie acts, which is expected: no fabricated photo stands in for a real one.
  getArtists: () => request('/api/artists'),
  // Lyrics are looked up at upload (backend/utils/lyricsLookup.js). hasLyrics:false is a
  // real "checked, none found" result (mostly obscure netlabel acts), not an error.
  getLyrics: (songId: string) => request(`/api/songs/${songId}/lyrics`),

  // Token phát cho đúng một bài, sống 5–10 phút. Khách chỉ được vài bài mỗi ngày,
  // sau đó 401 requiresLogin. Xem backend/utils/playbackToken.js.
  getPlaybackToken: (songId: string) =>
    request(`/api/songs/${songId}/playback`) as Promise<PlaybackTokens & { expiresIn: number }>,

  // Bắn-rồi-quên: đo đạc hỏng thì tuyệt đối không được làm gián đoạn việc nghe nhạc.
  recordPlayback: (payload: Record<string, unknown>) =>
    request('/api/metrics/playback', { method: 'POST', body: JSON.stringify(payload) }).catch(() => {}),

  getPlaylists: () => request('/api/playlists'),
  createPlaylist: (name: string) => request('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) }),
  renamePlaylist: (id: string, name: string) =>
    request(`/api/playlists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deletePlaylist: (id: string) => request(`/api/playlists/${id}`, { method: 'DELETE' }),
  addSongToPlaylist: (id: string, songId: string) =>
    request(`/api/playlists/${id}/songs`, { method: 'POST', body: JSON.stringify({ songId }) }),
  removeSongFromPlaylist: (id: string, songId: string) =>
    request(`/api/playlists/${id}/songs/${songId}`, { method: 'DELETE' }),

  // --- Party Room (Persistent & Host-Controlled CRUD) ---
  createPartyRoom: (data?: any, currentSong?: any, queue?: any[]) => {
    const payload = typeof data === 'string'
      ? { roomName: data, currentSong, queue }
      : { ...data, currentSong, queue };
    return request('/api/party/create', { method: 'POST', body: JSON.stringify(payload) });
  },
  getPublicPartyRooms: () => request('/api/party/rooms'),
  getMyPartyRooms: () => request('/api/party/my-rooms'),
  getMyActivePartyRoom: () => request('/api/party/my-room'),
  getPartyRoom: (code: string) => request(`/api/party/room/${encodeURIComponent(code)}`),
  updatePartyRoom: (code: string, data: { name?: string; description?: string; isPublic?: boolean; genre?: string }) =>
    request(`/api/party/room/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  joinPartyRoom: (code: string, socketId?: string, name?: string, avatar?: string, userId?: string) =>
    request(`/api/party/room/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify({ socketId, name, avatar, userId }),
    }),
  leavePartyRoom: (code: string, socketId?: string) =>
    request(`/api/party/room/${encodeURIComponent(code)}/leave`, {
      method: 'POST',
      body: JSON.stringify({ socketId }),
    }),
  deletePartyRoom: (code: string, permanent?: boolean) =>
    request(`/api/party/room/${encodeURIComponent(code)}${permanent ? '?permanent=true' : ''}`, { method: 'DELETE' }),
  syncPartyPlayback: (code: string, data: any) =>
    request(`/api/party/room/${encodeURIComponent(code)}/sync`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePartyQueue: (code: string, queue: any[]) =>
    request(`/api/party/room/${encodeURIComponent(code)}/queue`, {
      method: 'POST',
      body: JSON.stringify({ queue }),
    }),
};

