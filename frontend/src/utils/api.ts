import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { createHttpClient, HttpResult } from './net';
import { steering, ORIGIN } from './cdnSteering';

// Tự động nhận diện IP của máy chủ backend khi chạy trên điện thoại thật (Expo Go)
// thay vì trỏ về localhost của điện thoại.
function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // Khi chạy trên điện thoại qua Expo Go, lấy IP máy Mac từ hostUri của Metro packager
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

// Store đăng ký hàm đăng xuất vào đây (api.ts không import store được — vòng import).
let onSessionExpired = () => {};
export const setOnSessionExpired = (fn: () => void) => { onSessionExpired = fn; };

const http = createHttpClient();

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let res: HttpResult;
  try {
    res = await http.send(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (e) {
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  const { data } = res;
  if (!res.ok) {
    // Phiên đã chết (hết hạn 30 ngày, đổi JWT_SECRET, tài khoản bị xoá — middleware/authMiddleware.js
    // gắn cờ): đăng xuất một lần ở đây thay vì để mọi màn cứ gọi lại bằng token hỏng. Không dựa vào
    // mọi 401 — sai mật khẩu hiện tại hay khách hết lượt nghe cũng là 401 nhưng phiên vẫn sống.
    if (data?.sessionExpired && authToken) onSessionExpired();
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
      return hlsForQuality(hls, quality, song.hlsTiers);
    }
  }
  return cdnUrlFor(song.filePath, tokens.fileToken);
}

// Đổi URL R2 thô thành URL Worker. URL R2 thô là endpoint S3 cần ký nên gọi
// trực tiếp luôn trả 400 — phải qua Worker (hoặc proxy Node) mới phát được.
function cdnUrlFor(filePath?: string, token?: string | null): string | null {
  if (!CDN_BASE_URL || !filePath) return null;
  const match = /r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/.exec(filePath);
  if (!match) return null;

  const key = match[1];
  const base = `${CDN_BASE_URL.replace(/\/$/, '')}/${key}`;
  // Mọi đường phát đều cần token (backend/utils/playbackToken.js); Worker tự
  // gắn tiếp token vào các URI con của playlist HLS.
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// URL HLS theo mức chất lượng: 'auto' = master (ABR tự đổi); chọn tay một mức thì trỏ thẳng biến thể —
// chỉ khi bài thực sự có tier đó (nguồn yếu thì không có tier cao).
const hlsForQuality = (master: string, quality: string, tiers?: string[]) =>
  quality !== 'auto' && tiers?.includes(quality) ? master.replace(/master\.m3u8/, `${quality}.m3u8`) : master;

type CdnSource = { cdn: string; file: string | null; hls: string | null };

// Đo chủ động các CDN không được chọn: 1 byte của CHÍNH bài này (cùng đường đi, cùng token), tối đa
// 1 lần / 5 phút mỗi CDN — giữ số đo của CDN đang xếp sau luôn mới (utils/cdnSteering.ts).
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

// Xin token phát rồi dựng URL — đường DUY NHẤT client lấy URL nhạc. Khách hết lượt nghe miễn phí thì
// hàm này ném lỗi có `requiresLogin` (xem request()). `cdn` cho biết nguồn đã chọn để store ghi nhận
// thành công/lỗi vào bộ điều hướng.
export async function resolvePlayback(song: PlayableSong, quality: string): Promise<{ url: string; cdn: string }> {
  const t = await api.getPlaybackToken(song._id);
  const sources: CdnSource[] = t.sources || [];
  if (!sources.length) {
    // Server cũ / chưa cấu hình CDN_URLS: như trước — Worker theo EXPO_PUBLIC_CDN_URL, không có thì proxy Node.
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

// Tham số truy vấn, bỏ giá trị rỗng.
const qs = (params: Record<string, string | number>) =>
  Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const api = {
  // Admins get { requiresOtp: true, tempToken } instead of a session — see verifyOtp below.
  // `identifier` can be an email, username, or phone number.
  login: (identifier: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
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
  // Xác nhận lại: tài khoản có mật khẩu gửi password; tài khoản chỉ Google gửi confirm = username.
  deleteAccount: (confirm: { password?: string; confirm?: string }) =>
    request('/api/auth/me', { method: 'DELETE', body: JSON.stringify(confirm) }),
  removeAvatar: () => request('/api/auth/avatar', { method: 'DELETE' }),
  // Quên mật khẩu: luôn trả { tempToken } (không lộ email nào có tài khoản); mã 6 số gửi qua email.
  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  // Đúng mã → đổi mật khẩu, đăng xuất mọi thiết bị khác, trả phiên mới cho thiết bị này.
  resetPassword: (tempToken: string, code: string, newPassword: string) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ tempToken, code, newPassword }) }),

  // --- registration wizard (step -> step, see screens/Auth/RegisterWizard.tsx) ---
  sendEmailOtp: (email: string) =>
    request('/api/auth/send-email-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmailOtp: (tempToken: string, code: string) =>
    request('/api/auth/verify-email-otp', { method: 'POST', body: JSON.stringify({ tempToken, code }) }),
  register: (form: FormData) => request('/api/auth/register', { method: 'POST', body: form }),

  getSongs: () => request('/api/songs'),
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
  updateSongCover: (songId: string, form: FormData) => request(`/api/songs/${songId}/cover`, { method: 'PATCH', body: form }),

  // Live radio: deterministic "what's playing right now" — see backend/controllers/radioController.js.
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
    request(`/api/songs/${songId}/playback`) as Promise<PlaybackTokens & { expiresIn: number; sources?: CdnSource[] }>,

  // Bắn-rồi-quên: đo đạc hỏng thì tuyệt đối không được làm gián đoạn việc nghe nhạc.
  // Bảng xếp hạng theo lượt nghe (≥ 30 s) trong N ngày gần nhất; days=0 = mọi lúc.
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
  // Một hoặc nhiều bài trong MỘT request (server bỏ bài trùng/không tồn tại).
  addSongsToPlaylist: (id: string, songIds: string[]) =>
    request(`/api/playlists/${id}/songs`, { method: 'POST', body: JSON.stringify({ songIds }) }),
  reorderPlaylist: (id: string, songIds: string[]) =>
    request(`/api/playlists/${id}/songs`, { method: 'PUT', body: JSON.stringify({ songIds }) }),
  removeSongFromPlaylist: (id: string, songId: string) =>
    request(`/api/playlists/${id}/songs/${songId}`, { method: 'DELETE' }),

  // --- Phòng nghe chung của Hugo (backend/rooms/): danh sách qua REST, còn nghe/bỏ phiếu đi qua
  // socket (src/rooms/). Tạo/sửa/xoá phòng chỉ admin (backend/rooms/admin.js). ---
  getStations: () => request('/api/rooms/stations'),
  getBlindRooms: () => request('/api/rooms/blind'),
  adminRooms: () => request('/api/rooms/admin'),
  createRoom: (fields: Record<string, unknown>) => request('/api/rooms/admin', { method: 'POST', body: JSON.stringify(fields) }),
  updateRoom: (id: string, fields: Record<string, unknown>) =>
    request(`/api/rooms/admin/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  deleteRoom: (id: string) => request(`/api/rooms/admin/${id}`, { method: 'DELETE' }),
  previewRoomRules: (rules: Record<string, unknown>) =>
    request('/api/rooms/admin/preview', { method: 'POST', body: JSON.stringify({ rules }) }),
  // Chọn bài cho kênh + điều khiển kênh đang phát (backend/rooms/admin.js).
  roomPinnedSongs: (id: string) => request(`/api/rooms/admin/${id}/songs`),
  roomSuggestions: (id: string, q = '') => request(`/api/rooms/admin/${id}/suggestions?q=${encodeURIComponent(q)}`),
  roomLive: (id: string) => request(`/api/rooms/admin/${id}/live`),
  roomEnqueue: (id: string, songId: string) =>
    request(`/api/rooms/admin/${id}/queue`, { method: 'POST', body: JSON.stringify({ songId }) }),
  roomDequeue: (id: string, entryId: string) => request(`/api/rooms/admin/${id}/queue/${encodeURIComponent(entryId)}`, { method: 'DELETE' }),
  roomSkip: (id: string) => request(`/api/rooms/admin/${id}/skip`, { method: 'POST' }),

  // --- trang quản trị (backend/controllers/adminController.js) ---
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

