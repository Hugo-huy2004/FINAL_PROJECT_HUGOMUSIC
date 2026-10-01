import { signInWithGoogle, takeGoogleRedirect } from '../utils/googleAuth';
import { serverNow, syncClock } from '../rooms/serverClock';
import { startAligned, alignTo, releaseRate, SYNC } from '../utils/audio/timelineSync';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioEngine } from '../utils/audioEngine';
import { api, setAuthToken, setOnSessionExpired, streamUrl, resolvePlayback } from '../utils/api';
import { prefetchNext } from '../utils/prefetch';
import { steering } from '../utils/cdnSteering';
import { getSocket, reauthSocket } from '../utils/socket';
import { offlineManager } from '../utils/offlineManager';
import { Platform } from 'react-native';
import { getStationCover } from '../utils/radioArtwork';
import { shuffled } from '../utils/shuffle';
import { planTransition, gainFor, startOf, TransitionInfo, TransitionMode, TrackInfo } from '../utils/audio/transitionPlan';
import type { PlaybackStatus, PlaybackTelemetry } from '../utils/audioEngine';

// Gom số liệu của bài vừa nghe rồi gửi về server. Chỉ gửi khi thực sự có phát,
// để những lần nạp hụt (đổi bài liên tục, lỗi mạng) không làm nhiễu mốc đo.
// CDN đang phát bài hiện tại (utils/cdnSteering.ts): lỗi giữa chừng quy cho CDN này, và mỗi lần đo
// hiệu năng (telemetry) ghi kèm CDN để so sánh các CDN bằng số liệu thật.
let playingCdn = 'origin';
let preparedCdn = 'origin';
let playingSince = 0; // lúc nạp bài hiện tại — phân biệt lỗi CDN với token hết hạn

function flushPlaybackTelemetry(song: Song | null, taken?: PlaybackTelemetry | null, cdn = playingCdn) {
  if (!song) return;
  const t = taken === undefined ? audioEngine.takeTelemetry() : taken;
  if (!t || (!t.startupMs && !t.playedMs)) return;
  api.recordPlayback({
    songId: song._id,
    startupMs: t.startupMs,
    rebufferCount: t.rebufferCount,
    rebufferMs: t.rebufferMs,
    playedMs: t.playedMs,
    completed: t.completed,
    platform: Platform.OS,
    cdn,
  });
}

// Phòng nghe chung đang ở (đài 24/7 hoặc phòng nghe mù, xem src/rooms/). Trong phòng,
// server giữ nhịp phát nên các nút tua/chuyển bài ở trình phát bị khoá.
export type LiveRoom = { kind: 'station' | 'blind'; id: string; name: string };
// src/rooms/ gắn hàm vào đây (store không import ngược src/rooms/ để tránh vòng phụ thuộc).
export const liveRoomHooks: { resume?: () => void } = {};

export interface UserAddress {
  country?: string;
  province?: string;
  ward?: string;
  detail?: string;
}

export interface User {
  _id: string;
  username: string;
  nickname?: string;
  email: string;
  emailVerified?: boolean;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  musicGenres?: string[];
  address?: UserAddress;
  role: string; // 'user' | 'admin' — only 'admin' can manage the song catalog
  googleLinked: boolean; // true = signed in via Google, no password to change
  token: string;
}

// A device's private, always-the-same-two-people room: `workspace:<userId>`. Any
// device signed into this account that turns Workspace sync on joins this exact room,
// so they all mirror the same song/position/play-state — no PIN to share, no "party"
// to invite strangers to. See utils/socket.ts + backend/index.js for the room protocol
// this reuses (same play_sync/sync_playback/room_state events as Sync Party).
const workspaceRoomId = (userId: string) => `workspace:${userId}`;

export interface Song {
  _id: string;
  title: string;
  artist: string;
  filePath?: string;
  coverArt?: string;
  duration?: number;
  category?: string;
  genre?: string;
  country?: string;
  likesCount?: number;
  // Giấy phép cụ thể — bắt buộc khi admin tải lên (backend/utils/songReview.js).
  // Hiển thị nhỏ dưới tên bài — CC và Public Domain đều yêu cầu nêu rõ giấy phép.
  licenseType?: string;
  licenseUrl?: string;
  hlsPath?: string;
  hlsTiers?: string[];
  // Dữ liệu chuyển bài liền mạch (backend/pipeline/analyzers/transition_analyze.py).
  transition?: TransitionInfo;
  // Bản phát hành THẬT chứa bài + màu chủ đạo ảnh bìa (backend/pipeline/jobs/ReleaseJob.js).
  album?: { sourceId: string; title: string; artist?: string; year?: number; trackCount?: number; trackNo?: number; description?: string };
  coverColor?: string;
  lyricsSource?: string; // 'id3' | 'lrclib' khi bài thật sự có lời
  uploadedBy?: string;
  // Quản lý kho (chỉ API admin trả về đủ các trường này).
  status?: 'pending' | 'published' | 'rejected';
  sourceUrl?: string;
  attribution?: string;
  reviewNote?: string;
  createdAt?: string;
}

export interface Playlist {
  _id: string;
  name: string;
  description?: string;
  songs: Song[];
}

// A real Wikipedia-sourced artist photo (see backend/models/Artist.js) — only exists
// for artists a confident match was found for; most netlabel/indie acts have none.
export interface Artist {
  _id: string;
  name: string;
  photo: string;
  bio?: string;
  sourceUrl?: string;
}

// A real, currently-live third-party broadcast (see backend/models/RadioStation.js) —
// not a Song: no duration, no seeking, sourced from radio-browser.info rather than
// this app's own catalog.
export interface RadioStation {
  _id: string;
  name: string;
  streamUrl: string;
  country?: string;
  countryCode?: string;
  genre?: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
}

// Bài đại diện cho một đài radio thật đang phát (playLiveRadio): không có token phát.
const isLiveRadio = (s: Song) => s._id.startsWith('radio-');

interface StoreState {
  // --- auth ---
  user: User | null;
  isLoginModalVisible: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  // Set when login() gets { requiresOtp: true } back (admin accounts) — the caller
  // should show an OTP entry step and call verifyOtp() with what the user types in.
  pendingOtpToken: string | null;
  setLoginModalVisible: (visible: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  // true = đã đăng nhập, false = người dùng đóng cửa sổ Google (web: trang đang chuyển sang Google).
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  deleteAccount: (confirm: { password?: string; confirm?: string }) => Promise<void>;
  removeAvatar: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (fields: { nickname?: string; phone?: string; musicGenres?: string[]; dateOfBirth?: string; address?: { country?: string; province?: string; ward?: string; detail?: string } }) => Promise<void>;
  completeProfile: (fields: {
    nickname?: string;
    dateOfBirth?: string;
    musicGenres?: string[];
    country?: string;
    province?: string;
    ward?: string;
    addressDetail?: string;
  }) => Promise<void>;
  updateAvatar: (file: File | Blob) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (tempToken: string, code: string, newPassword: string) => Promise<void>;

  // --- registration wizard (step -> step) ---
  registrationEmail: string | null;
  registrationOtpToken: string | null; // proves the OTP was sent for this email
  registrationVerifiedToken: string | null; // proves the OTP was actually confirmed
  sendRegistrationOtp: (email: string) => Promise<void>;
  verifyRegistrationOtp: (code: string) => Promise<void>;
  completeRegistration: (form: FormData) => Promise<void>;
  resetRegistration: () => void;

  // --- song library ---
  songs: Song[];
  isLoadingSongs: boolean;
  fetchSongs: () => Promise<void>;
  likedSongIds: string[];
  likedSongs: Song[];
  fetchLikedSongs: () => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;

  // --- playlists ---
  playlists: Playlist[];
  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<void>;
  updatePlaylist: (id: string, fields: { name?: string; description?: string }) => Promise<void>;
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  reorderPlaylistSongs: (playlistId: string, songIds: string[]) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;

  // --- playback ---
  queue: Song[];
  queueIndex: number;
  currentSong: Song | null;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  playbackBitrate: number | null;
  playbackCodec: string | null;
  playbackSegment: number | null;
  isHlsStream: boolean;
  // 'auto' = ABR tự đổi theo mạng | 'low'/'mid'/'high' = khoá một mức
  // | 'original' = file gốc, không qua HLS
  audioQuality: string;
  playSong: (song: Song, queue?: Song[], startAtSeconds?: number) => Promise<void>;
  playOrToggleSong: (song: Song, queue?: Song[]) => Promise<void>;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
  next: () => void;
  prev: () => void;
  // Trộn bài / lặp lại như Apple Music. originalQueue giữ thứ tự gốc để tắt trộn thì trả về.
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  originalQueue: Song[];
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  shufflePlay: (list: Song[]) => Promise<void>;
  onTrackFinished: () => void;
  // Chuyển bài liền mạch (utils/audio/transitionPlan.ts): kiểu chuyển, độ dài crossfade, cân âm lượng.
  transitionMode: TransitionMode;
  crossfadeSeconds: number;
  soundCheck: boolean;
  setTransitionMode: (mode: TransitionMode) => void;
  setCrossfadeSeconds: (s: number) => void;
  setSoundCheck: (on: boolean) => void;
  // Ghi nhận bài kế đã được máy phát chuyển sang (sau crossfade) — không nạp lại.
  commitAdvance: (song: Song) => void;

  // --- real live radio (see backend/models/RadioStation.js) ---
  radioStations: RadioStation[];
  fetchRadioStations: (country?: string) => Promise<void>;
  playLiveRadio: (station: RadioStation) => Promise<void>;

  // --- real artist photos (see backend/models/Artist.js) — only populated for
  // artists a confident Wikipedia match was found for; absent for most netlabel acts.
  artists: Artist[];
  fetchArtists: () => Promise<void>;

  liveRoom: LiveRoom | null;

  // --- workspace (personal multi-device sync, see workspaceRoomId above) ---
  workspaceEnabled: boolean;
  workspaceMemberCount: number;
  toggleWorkspaceSync: () => void;

  // --- theme ---
  themeMode: 'auto' | 'dark' | 'light';
  setThemeMode: (mode: 'auto' | 'dark' | 'light') => void;

  // --- offline & cache ---
  offlineSongIds: string[];
  offlineSongs: Song[];
  loadOfflineSongs: () => Promise<void>;
  downloadSongOffline: (song: Song) => Promise<void>;
  removeSongOffline: (songId: string) => Promise<void>;

  // --- play history ---
  historySongs: Song[];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // Có token phiên (từ Google) → hỏi server hồ sơ đầy đủ rồi vào phiên như đăng nhập thường.
      const sessionFromToken = async (token: string) => {
        setAuthToken(token);
        const me = await api.me();
        completeSession({ ...me, token });
      };
      // Web: vừa quay về từ Google → hoàn tất đăng nhập (hoặc báo lỗi trong hộp đăng nhập).
      setTimeout(() => {
        try {
          const token = takeGoogleRedirect();
          if (token) sessionFromToken(token).catch((e) => set({ authError: e.message, isLoginModalVisible: true }));
        } catch (e: any) {
          set({ authError: e.message, isLoginModalVisible: true });
        }
      });

      // Shared by every path that ends in a real session (password login, OTP
      // verification, Google, register) so token/user/playlists/likes stay in sync.
      const completeSession = (user: User) => {
        setAuthToken(user.token);
        reauthSocket();
        set({ user, isAuthLoading: false, isLoginModalVisible: false, pendingOtpToken: null });
        get().fetchPlaylists();
        get().fetchLikedSongs();
        // Khách vừa bị chặn vì hết lượt nghe: đăng nhập xong thì phát luôn bài đó.
        const { currentSong, queue } = get();
        if (currentSong && !isLiveRadio(currentSong) && !audioEngine.hasSound()) get().playSong(currentSong, queue);
      };

      return {
      // --- auth ---
      user: null,
      isLoginModalVisible: false,
      isAuthLoading: false,
      authError: null,
      pendingOtpToken: null,
      setLoginModalVisible: (visible) => set({ isLoginModalVisible: visible, authError: null }),
      login: async (email, password) => {
        set({ isAuthLoading: true, authError: null });
        try {
          const result = await api.login(email, password);
          if (result.requiresOtp) {
            set({ isAuthLoading: false, pendingOtpToken: result.tempToken });
            return;
          }
          completeSession(result);
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      verifyOtp: async (code) => {
        const tempToken = get().pendingOtpToken;
        if (!tempToken) throw new Error('No pending OTP session');
        set({ isAuthLoading: true, authError: null });
        try {
          const user = await api.verifyOtp(tempToken, code);
          completeSession(user);
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      loginWithGoogle: async () => {
        set({ isAuthLoading: true, authError: null });
        try {
          const token = await signInWithGoogle();
          if (!token) {
            set({ isAuthLoading: false });
            return false;
          }
          await sessionFromToken(token);
          return true;
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      registrationEmail: null,
      registrationOtpToken: null,
      registrationVerifiedToken: null,
      sendRegistrationOtp: async (email) => {
        set({ isAuthLoading: true, authError: null });
        try {
          const { tempToken } = await api.sendEmailOtp(email);
          set({ isAuthLoading: false, registrationEmail: email, registrationOtpToken: tempToken });
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      verifyRegistrationOtp: async (code) => {
        const tempToken = get().registrationOtpToken;
        if (!tempToken) throw new Error('No pending registration OTP');
        set({ isAuthLoading: true, authError: null });
        try {
          const { emailVerifiedToken } = await api.verifyEmailOtp(tempToken, code);
          set({ isAuthLoading: false, registrationVerifiedToken: emailVerifiedToken });
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      completeRegistration: async (form) => {
        const { registrationEmail, registrationVerifiedToken } = get();
        if (!registrationEmail || !registrationVerifiedToken) {
          throw new Error('Email chưa được xác minh');
        }
        form.append('email', registrationEmail);
        form.append('emailVerifiedToken', registrationVerifiedToken);
        set({ isAuthLoading: true, authError: null });
        try {
          const user = await api.register(form);
          completeSession(user);
          get().resetRegistration();
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },
      resetRegistration: () => set({ registrationEmail: null, registrationOtpToken: null, registrationVerifiedToken: null }),
      logout: () => {
        const { user, workspaceEnabled } = get();
        if (user && workspaceEnabled) getSocket().emit('leave_room', workspaceRoomId(user._id));
        setAuthToken(null);
        reauthSocket();
        set({
          user: null,
          playlists: [],
          likedSongIds: [],
          likedSongs: [],
          pendingOtpToken: null,
          // Reset so a different account on this same device starts opted out.
          workspaceEnabled: false,
          workspaceMemberCount: 0,
        });
      },
      deleteAccount: async (confirm) => {
        await api.deleteAccount(confirm);
        get().logout();
      },
      removeAvatar: async () => {
        const current = get().user;
        if (!current) return;
        const updated = await api.removeAvatar();
        set({ user: { ...current, ...updated } });
      },
      // Re-pulls the user record from the server (username/email/role) —
      // the persisted `user` only reflects what was true at login time, so anything
      // changed server-side since (e.g. an admin promotion) needs this to show up
      // without forcing a logout/login cycle.
      refreshUser: async () => {
        const current = get().user;
        if (!current) return;
        try {
          const fresh = await api.me();
          set({ user: { ...current, ...fresh } });
        } catch (e) {
          console.warn('refreshUser failed', e);
        }
      },
      updateProfile: async (fields) => {
        const current = get().user;
        if (!current) return;
        const updated = await api.updateProfile(fields);
        set({ user: { ...current, ...updated } });
      },
      completeProfile: async (fields) => {
        const current = get().user;
        if (!current) return;
        const updated = await api.completeProfile(fields);
        set({ user: { ...current, ...updated } });
      },
      updateAvatar: async (file) => {
        const current = get().user;
        if (!current) return;
        const form = new FormData();
        form.append('avatar', file);
        const updated = await api.updateAvatar(form);
        set({ user: { ...current, ...updated } });
      },
      changePassword: async (currentPassword, newPassword) => {
        // Server thu hồi mọi phiên cũ (kể cả phiên này) và trả token mới cho thiết bị đang đổi.
        const { token } = await api.changePassword(currentPassword, newPassword);
        const current = get().user;
        if (token && current) {
          setAuthToken(token);
          reauthSocket();
          set({ user: { ...current, token } });
        }
      },
      resetPassword: async (tempToken, code, newPassword) => {
        set({ isAuthLoading: true, authError: null });
        try {
          completeSession(await api.resetPassword(tempToken, code, newPassword));
        } catch (e: any) {
          set({ isAuthLoading: false, authError: e.message });
          throw e;
        }
      },

      // --- song library ---
      songs: [],
      isLoadingSongs: false,
      fetchSongs: async () => {
        set({ isLoadingSongs: true });
        try {
          const songs = await api.getSongs();
          // Lịch sử nghe lưu trong máy người dùng nên vừa giữ những bài đã bị gỡ
          // khỏi kho, vừa giữ BẢN SAO CŨ của bài còn tồn tại. Lọc theo ID thôi
          // là chưa đủ: các trường đã đổi phía server (giá, giấy phép, ảnh bìa)
          // vẫn hiện giá trị cũ — ví dụ nhãn VIP còn bám lại sau khi cả kho đã
          // chuyển sang miễn phí. Vì vậy thay hẳn bằng bản mới từ server.
          const liveById = new Map(songs.map((s: Song) => [s._id, s]));
          const history = (get().historySongs || [])
            .map((h) => liveById.get(h._id))
            .filter(Boolean) as Song[];
          set({ songs, historySongs: history, isLoadingSongs: false });
        } catch (e) {
          console.warn('fetchSongs failed', e);
          set({ isLoadingSongs: false });
        }
      },
      likedSongIds: [],
      likedSongs: [],
      fetchLikedSongs: async () => {
        if (!get().user) return;
        try {
          const likedSongs = await api.getLikedSongs();
          set({ likedSongs, likedSongIds: likedSongs.map((s: Song) => s._id) });
        } catch (e) {
          console.warn('fetchLikedSongs failed', e);
        }
      },
      toggleLike: async (songId) => {
        if (!get().user) {
          set({ isLoginModalVisible: true });
          return;
        }
        try {
          const { liked } = await api.toggleLike(songId);
          set((state) => ({
            likedSongIds: liked
              ? [...state.likedSongIds, songId]
              : state.likedSongIds.filter((id) => id !== songId),
            likedSongs: liked
              ? state.likedSongs
              : state.likedSongs.filter((s) => s._id !== songId),
          }));
          if (liked) get().fetchLikedSongs(); // pull the full song object for the new favorite
        } catch (e) {
          console.warn('toggleLike failed', e);
        }
      },

      // --- playlists ---
      playlists: [],
      fetchPlaylists: async () => {
        if (!get().user) return;
        try {
          const playlists = await api.getPlaylists();
          set({ playlists });
        } catch (e) {
          console.warn('fetchPlaylists failed', e);
        }
      },
      createPlaylist: async (name, description = '') => {
        const playlist = await api.createPlaylist(name, description);
        set((state) => ({ playlists: [playlist, ...state.playlists] }));
      },
      updatePlaylist: async (id, fields) => {
        const updated = await api.updatePlaylist(id, fields);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === id ? updated : p)) }));
      },
      addSongsToPlaylist: async (playlistId, songIds) => {
        const updated = await api.addSongsToPlaylist(playlistId, songIds);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === playlistId ? updated : p)) }));
      },
      // Sắp xếp: đổi trên máy NGAY (lạc quan) rồi mới gửi; server từ chối thì trả về thứ tự cũ.
      reorderPlaylistSongs: async (playlistId, songIds) => {
        const before = get().playlists;
        const pl = before.find((p) => p._id === playlistId);
        if (!pl) return;
        const byId = new Map(pl.songs.map((x) => [x._id, x]));
        set({ playlists: before.map((p) => (p._id === playlistId ? { ...p, songs: songIds.map((id) => byId.get(id)!).filter(Boolean) } : p)) });
        try {
          await api.reorderPlaylist(playlistId, songIds);
        } catch (e) {
          set({ playlists: before });
          throw e;
        }
      },
      deletePlaylist: async (id) => {
        await api.deletePlaylist(id);
        set((state) => ({ playlists: state.playlists.filter((p) => p._id !== id) }));
      },
      addSongToPlaylist: async (playlistId, songId) => get().addSongsToPlaylist(playlistId, [songId]),
      removeSongFromPlaylist: async (playlistId, songId) => {
        const updated = await api.removeSongFromPlaylist(playlistId, songId);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === playlistId ? updated : p)) }));
      },

      // --- playback ---
      queue: [],
      queueIndex: 0,
      currentSong: null,
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      playbackBitrate: null,
      playbackCodec: null,
      playbackSegment: null,
      isHlsStream: false,
      audioQuality: 'auto',
      playSong: async (song, queue = [song], startAtSeconds) => {
        // Đang bật trộn mà phát từ một danh sách MỚI (khác hàng chờ hiện tại) → trộn luôn
        // danh sách đó, bài được bấm lên đầu. next()/prev() truyền lại đúng hàng chờ cũ nên
        // không bị trộn lại.
        if (get().shuffle && queue !== get().queue && queue.length > 1) {
          const original = queue;
          queue = [song, ...shuffled(queue.filter((s) => s._id !== song._id))];
          set({ originalQueue: original });
        }
        // Chốt số liệu bài đang nghe TRƯỚC khi nạp bài mới — sang bài mới là
        // bộ đếm bị reset, không lấy lại được. Lượt bỏ bài giữa chừng cũng đi
        // qua đây, nên số liệu skip vẫn được ghi nhận đầy đủ.
        flushPlaybackTelemetry(get().currentSong);
        const index = queue.findIndex((s) => s._id === song._id);
        const existingHistory = get().historySongs || [];
        const updatedHistory = [song, ...existingHistory.filter((s) => s._id !== song._id)].slice(0, 30);
        set({
          queue,
          queueIndex: index === -1 ? 0 : index,
          currentSong: song,
          position: 0,
          duration: 0,
          isBuffering: true,
          historySongs: updatedHistory,
        });
        try {
          // Worker CDN first (served from the PoP nearest the listener), Node proxy
          // as fallback. Offline copies are keyed by song, not by the tokened URL.
          const cachedUrl = await offlineManager.getPlayableUrl(streamUrl(song._id));
          const { url, cdn } = cachedUrl ? { url: cachedUrl, cdn: 'offline' } : await resolvePlayback(song, get().audioQuality);
          playingCdn = cdn;
          playingSince = Date.now();
          // Phát từ đầu thì bỏ đoạn im lặng đầu bài; cân âm lượng theo độ to đã đo (Sound Check).
          const startAt = startAtSeconds && startAtSeconds > 0 ? startAtSeconds : startOf(song.transition);
          const loadStarted = Date.now();
          await audioEngine.load(url, true, { startAt, gain: get().soundCheck ? gainFor(song.transition) : 1 });
          // Đo thụ động cho bộ điều hướng CDN: nạp → phát được (play() chỉ xong khi đã có đủ dữ liệu).
          if (cdn !== 'offline' && audioEngine.hasSound()) steering.success(cdn, Date.now() - loadStarted);
          if (startAt > 0) set({ position: startAt });

          // Làm nóng bài kế tiếp SAU khi bài hiện tại đã nạp xong, để không
          // giành băng thông với thứ người nghe đang thực sự chờ.
          const nextSong = queue[(index === -1 ? 0 : index) + 1];
          if (nextSong) prefetchNext(nextSong, get().audioQuality);
        } catch (e: any) {
          if (e?.requiresLogin) {
            // Khách hết lượt nghe miễn phí: dừng bài cũ, mời đăng nhập.
            audioEngine.unload().catch(() => {});
            set({ isBuffering: false, isPlaying: false, isLoginModalVisible: true });
            return;
          }
          console.warn('playback failed', e);
          set({ isBuffering: false });
          return;
        }
        emitWorkspaceSync(true);
      },
      playOrToggleSong: async (song, queue = [song]) => {
        const { currentSong } = get();
        if (currentSong?._id === song._id) {
          get().togglePlay();
        } else {
          await get().playSong(song, queue);
        }
      },
      togglePlay: async () => {
        const { currentSong, isPlaying, queue, position, liveRoom } = get();
        if (!currentSong) return;
        if (liveRoom?.kind === 'station' && !isPlaying) {
          // Nghe tiếp đài là bắt kịp giờ đài đang phát, không phát tiếp chỗ đã dừng.
          liveRoomHooks.resume?.();
          return;
        }
        if (isPlaying) {
          set({ isPlaying: false });
          await audioEngine.pause();
        } else {
          set({ isPlaying: true });
          if (!audioEngine.hasSound()) {
            await get().playSong(currentSong, queue, position);
          } else {
            await audioEngine.play();
          }
        }
        emitWorkspaceSync();
      },
      seek: (seconds) => {
        if (get().liveRoom) return; // trong phòng, server giữ nhịp
        audioEngine.seek(seconds);
        set({ position: seconds });
        emitWorkspaceSync();
      },
      seekBy: (deltaSeconds) => {
        const { position, duration, currentSong, queue, liveRoom } = get();
        if (!currentSong) return;
        if (duration === Infinity) return; // Live stream seeking disabled
        const currentPos = typeof position === 'number' && !isNaN(position) ? position : 0;
        const maxDuration = duration > 0 ? duration : 3600;
        const target = Math.max(0, Math.min(maxDuration, currentPos + deltaSeconds));
        if (liveRoom) return;
        if (!audioEngine.hasSound()) {
          get().playSong(currentSong, queue, target);
        } else {
          get().seek(target);
        }
      },
      next: () => {
        const { liveRoom, queue, queueIndex } = get();
        if (liveRoom) return;
        const upcoming = queue[queueIndex + 1] ?? queue[0];
        // Bài kế đã nạp sẵn (sắp tới điểm chuyển) → chuyển tức thì, chồng rất ngắn thay vì nạp lại.
        if (upcoming && audioEngine.preloadedKey() === upcoming._id) {
          transitioner.jump(upcoming);
          return;
        }
        if (queueIndex + 1 < queue.length) {
          get().playSong(queue[queueIndex + 1], queue);
        } else if (queue.length > 0) {
          // Bấm "tiếp" ở bài cuối thì quay về đầu (hết bài tự nhiên thì xem onTrackFinished).
          get().playSong(queue[0], queue);
        }
      },
      shuffle: false,
      repeat: 'off',
      originalQueue: [],
      toggleShuffle: () => {
        const { shuffle, queue, currentSong, originalQueue } = get();
        if (!shuffle) {
          // Bài đang phát giữ nguyên ở đầu, phần còn lại trộn.
          const rest = shuffled(queue.filter((s) => s._id !== currentSong?._id));
          const next = currentSong ? [currentSong, ...rest] : rest;
          set({ shuffle: true, originalQueue: queue, queue: next, queueIndex: 0 });
        } else {
          const base = originalQueue.length ? originalQueue : queue;
          const idx = base.findIndex((s) => s._id === currentSong?._id);
          set({ shuffle: false, queue: base, queueIndex: Math.max(0, idx), originalQueue: [] });
        }
      },
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      shufflePlay: async (list) => {
        if (!list.length) return;
        const q = shuffled(list);
        set({ shuffle: true, originalQueue: list, queue: q });
        await get().playSong(q[0], q);
      },
      onTrackFinished: () => {
        const { liveRoom, repeat, queue, queueIndex, currentSong } = get();
        if (liveRoom || !currentSong) return; // trong phòng, server tự chuyển bài
        const upcoming = repeat === 'one' ? currentSong : queue[queueIndex + 1] ?? (repeat === 'all' ? queue[0] : undefined);
        autoAdvanceOf = upcoming?._id ?? null;
        if (repeat === 'one') {
          get().playSong(currentSong, queue);
        } else if (queueIndex + 1 < queue.length) {
          get().playSong(queue[queueIndex + 1], queue);
        } else if (repeat === 'all' && queue.length) {
          get().playSong(queue[0], queue);
        } else {
          audioEngine.pause().catch(() => {});
          set({ isPlaying: false }); // hết hàng chờ: dừng, như Apple Music
        }
      },
      transitionMode: 'automix',
      crossfadeSeconds: 6,
      soundCheck: true,
      setTransitionMode: (mode) => set({ transitionMode: mode }),
      setCrossfadeSeconds: (sec) => set({ crossfadeSeconds: sec }),
      setSoundCheck: (on) => {
        set({ soundCheck: on });
        const song = get().currentSong;
        audioEngine.setGain(on && song && !isLiveRadio(song) ? gainFor(song.transition) : 1);
      },
      commitAdvance: (song) => {
        const { queue, historySongs } = get();
        const index = queue.findIndex((s) => s._id === song._id);
        set({
          currentSong: song,
          queueIndex: index === -1 ? 0 : index,
          position: startOf(song.transition),
          duration: 0,
          historySongs: [song, ...(historySongs || []).filter((s) => s._id !== song._id)].slice(0, 30),
        });
        const after = queue[index + 1];
        if (after) prefetchNext(after, get().audioQuality);
        autoAdvanceOf = song._id; // chuyển bài liền mạch là tự động
        emitWorkspaceSync(true);
      },
      prev: () => {
        const { liveRoom, queue, queueIndex, position } = get();
        if (liveRoom) return;
        if (position > 3) {
          get().seek(0);
          return;
        }
        if (queueIndex - 1 >= 0) {
          get().playSong(queue[queueIndex - 1], queue);
        } else if (queue.length > 0) {
          get().playSong(queue[queue.length - 1], queue);
        } else {
          get().seek(0);
        }
      },

      radioStations: [],
      fetchRadioStations: async (country) => {
        try {
          const radioStations = await api.getRadioStations(country);
          set({ radioStations });
        } catch (e) {
          console.warn('fetchRadioStations failed', e);
        }
      },

      artists: [],
      fetchArtists: async () => {
        try {
          const artists = await api.getArtists();
          set({ artists });
        } catch (e) {
          console.warn('fetchArtists failed', e);
        }
      },
      // A genuine third-party broadcast — the stream URL itself IS the live audio, so
      // unlike playSong there's no playback token and nothing to offline-cache (you can't
      // download "the rest of a live stream").
      playLiveRadio: async (station) => {
        const syntheticSong: Song = {
          _id: `radio-${station._id}`,
          title: station.name,
          artist: station.country || station.genre || 'Radio',
          coverArt: getStationCover(station),
        };
        set({
          queue: [syntheticSong],
          queueIndex: 0,
          currentSong: syntheticSong,
          position: 0,
          duration: 0,
          isBuffering: true,
          playbackBitrate: station.bitrate || 128,
          playbackCodec: station.codec || 'MP3',
          playbackSegment: null,
          isHlsStream: false,
        });
        try {
          await audioEngine.load(station.streamUrl, true);
        } catch (e) {
          console.warn('live radio playback failed', e);
          set({ isBuffering: false });
        }
      },

      liveRoom: null,

      // --- workspace ---
      workspaceEnabled: false,
      workspaceMemberCount: 0,
      toggleWorkspaceSync: () => {
        const { workspaceEnabled, user } = get();
        if (!user) return;
        const roomId = workspaceRoomId(user._id);
        if (workspaceEnabled) {
          getSocket().emit('leave_room', roomId);
          set({ workspaceEnabled: false, workspaceMemberCount: 0 });
        } else {
          set({ workspaceEnabled: true });
          joinWorkspace();
        }
      },

      // --- offline & cache ---
      offlineSongIds: [],
      offlineSongs: [],
      loadOfflineSongs: async () => {
        const list = await offlineManager.getOfflineSongs();
        set({ offlineSongs: list, offlineSongIds: list.map((s) => s._id) });
      },
      downloadSongOffline: async (song: Song) => {
        // Tải về máy chỉ dành cho thành viên (khách chỉ được nghe vài bài).
        if (!get().user) {
          set({ isLoginModalVisible: true });
          return;
        }
        const { url } = await resolvePlayback(song, 'original');
        const success = await offlineManager.downloadSong(song, url, streamUrl(song._id));
        if (success) {
          await get().loadOfflineSongs();
        }
      },
      removeSongOffline: async (songId: string) => {
        await offlineManager.removeSong(songId, streamUrl(songId));
        await get().loadOfflineSongs();
      },

      // --- play history ---
      historySongs: [],

      // --- theme ---
      themeMode: 'auto',
      setThemeMode: (mode) => set({ themeMode: mode }),
      };
    },
    {
      name: 'musicapp-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // `workspaceEnabled`, `themeMode`, and `historySongs` persist locally
      partialize: (state) => ({
        user: state.user,
        workspaceEnabled: state.workspaceEnabled,
        themeMode: state.themeMode,
        historySongs: state.historySongs,
        shuffle: state.shuffle,
        repeat: state.repeat,
        transitionMode: state.transitionMode,
        crossfadeSeconds: state.crossfadeSeconds,
        soundCheck: state.soundCheck,
      }),
      onRehydrateStorage: () => (state) => {
        state?.loadOfflineSongs();
        if (state?.user) {
          setAuthToken(state.user.token);
          reauthSocket();
          state.refreshUser();
          state.fetchPlaylists();
          state.fetchLikedSongs();
          if (state.workspaceEnabled) joinWorkspace();
        }
      },
    }
  )
);

// HM-13: token phát chỉ sống vài phút và nằm trong URL, nên khi nó hết hạn (bài dài,
// tạm dừng lâu rồi phát tiếp, tua xa) lần tải kế tiếp nhận 401 và trình phát báo lỗi.
// Xin token mới bằng cách nạp lại bài tại đúng vị trí.
//
// Multi-CDN: lỗi giữa chừng quy cho CDN đang phát → bộ điều hướng "ngắt" CDN đó, nên lần nạp lại tự đi
// sang CDN kế tiếp rồi tới origin (utils/cdnSteering.ts). Trừ khi bài đã nạp quá thời hạn token (5 phút):
// khi đó lỗi nhiều khả năng là token hết hạn, không phải lỗi CDN. Tối đa 3 lần / 15 giây — đủ đi hết
// chuỗi CDN → CDN → origin, mà lỗi thật (bài bị xoá, mất mạng hẳn) không thành vòng lặp.
const recoveries: number[] = [];
audioEngine.onError(() => {
  const { currentSong, queue, position, playSong } = useStore.getState();
  // Radio: luồng của bên thứ ba, không có token.
  if (!currentSong || isLiveRadio(currentSong) || useStore.getState().liveRoom?.kind === 'blind') return;
  const { isPlaying, isBuffering } = useStore.getState();
  if (!isPlaying && !isBuffering) return; // người dùng đã dừng: không tự phát lại
  const now = Date.now();
  while (recoveries.length && now - recoveries[0] > 15000) recoveries.shift();
  if (recoveries.length >= 3) return;
  recoveries.push(now);
  if (now - playingSince < 300_000 && playingCdn !== 'offline') steering.failure(playingCdn);
  playSong(currentSong, queue, position);
});

// Feed native playback status straight into the store. Registered once at module load.
audioEngine.onStatus((status) => {
  useStore.setState({
    isPlaying: status.isPlaying,
    isBuffering: status.isBuffering,
    position: status.position,
    duration: status.duration,
    playbackBitrate: status.bitrate ?? useStore.getState().playbackBitrate,
    playbackCodec: status.codec ?? useStore.getState().playbackCodec,
    playbackSegment: status.segmentIndex ?? useStore.getState().playbackSegment,
    isHlsStream: status.isHls ?? useStore.getState().isHlsStream,
  });
  transitioner.onStatus(status);
  if (status.didFinish && !transitioner.handledEnd()) useStore.getState().onTrackFinished();
});

// Điều phối chuyển bài liền mạch. Theo dõi từng nhịp trạng thái của bài đang phát:
//   ~25 s trước điểm chuyển → xin token + nạp sẵn bài kế vào deck chờ;
//   tới điểm chuyển (utils/audio/transitionPlan.ts) → crossfade/nối liền, ghi nhận bài mới.
// Không nạp sẵn được (khách: nạp sẵn sẽ tính thêm một lượt nghe miễn phí) thì vẫn sang bài ngay
// khi hết nhạc thật, không chờ đoạn im lặng cuối. Trong phòng nghe chung / radio thật: không can thiệp.
const PRELOAD_LEAD_S = 25;
const JUMP_FADE_MS = 250;

const albumKeyOf = (s: Song) => `${s.artist}_${s.category || 'singles'}`;
const trackOf = (s: Song, duration?: number): TrackInfo => ({
  duration: duration && duration > 0 ? duration : s.duration,
  transition: s.transition,
  albumKey: albumKeyOf(s),
});

class Transitioner {
  private songId: string | null = null;
  private nextId: string | null = null;
  private preparing = false;
  private fired = false;

  private reset(songId: string | null) {
    this.songId = songId;
    this.nextId = null;
    this.preparing = false;
    this.fired = false;
  }

  // Bài sẽ phát sau bài hiện tại (theo hàng chờ + chế độ lặp); null = không có/không tự chuyển.
  private upcoming(): Song | null {
    const { queue, queueIndex, repeat } = useStore.getState();
    if (repeat === 'one') return null;
    if (queueIndex + 1 < queue.length) return queue[queueIndex + 1];
    return repeat === 'all' && queue.length > 1 ? queue[0] : null;
  }

  handledEnd() { return this.fired; }

  onStatus(st: PlaybackStatus) {
    const s = useStore.getState();
    const cur = s.currentSong;
    if (!cur || s.liveRoom || isLiveRadio(cur)) return;
    if (cur._id !== this.songId) this.reset(cur._id);
    if (this.fired || !st.isPlaying) return;

    const next = this.upcoming();
    const end = cur.transition?.trimEnd;
    if (!next) {
      // Hết hàng chờ / lặp một bài: vẫn bỏ đoạn im lặng cuối.
      if (end && st.position >= end) {
        this.fired = true;
        s.onTrackFinished();
      }
      return;
    }
    if (this.nextId && this.nextId !== next._id) {
      audioEngine.dropStandby(); // hàng chờ vừa đổi — bài đã nạp sẵn không còn là bài kế
      this.reset(cur._id);
    }

    const plan = planTransition(trackOf(cur, st.duration), trackOf(next), s.transitionMode, s.crossfadeSeconds);
    if (s.user && !this.preparing && st.position >= plan.at - PRELOAD_LEAD_S) this.prepare(next, plan.nextStart);
    if (st.position < plan.at) return;

    if (audioEngine.preloadedKey() === next._id) {
      this.fired = true;
      this.advance(next, plan.fadeMs);
    } else if (end && st.position >= end) {
      this.fired = true; // chưa nạp sẵn kịp: ít nhất không chờ đoạn im lặng cuối
      s.onTrackFinished();
    }
  }

  private async prepare(next: Song, startAt: number) {
    this.preparing = true;
    this.nextId = next._id;
    const s = useStore.getState();
    try {
      const cached = await offlineManager.getPlayableUrl(streamUrl(next._id));
      const { url, cdn } = cached ? { url: cached, cdn: 'offline' } : await resolvePlayback(next, s.audioQuality);
      preparedCdn = cdn;
      await audioEngine.preload(url, next._id, { startAt, gain: s.soundCheck ? gainFor(next.transition) : 1 });
    } catch {
      this.nextId = null; // hỏng thì thôi — hết bài sẽ nạp thường
    }
  }

  private async advance(next: Song, fadeMs: number) {
    const leaving = useStore.getState().currentSong;
    const telemetry = await audioEngine.crossfade(fadeMs);
    flushPlaybackTelemetry(leaving, telemetry);
    playingCdn = preparedCdn;
    playingSince = Date.now();
    this.reset(next._id);
    useStore.getState().commitAdvance(next);
  }

  // Bấm "tiếp" khi bài kế đã nạp sẵn.
  jump(next: Song) {
    this.fired = true;
    this.advance(next, JUMP_FADE_MS);
  }
}
const transitioner = new Transitioner();

// ---------------- Đồng bộ nhiều máy của cùng một tài khoản (workspace) ----------------
// Các máy bật "Đồng bộ các thiết bị" cùng bám MỘT dòng thời gian: { bài, vị trí `pos` tại giờ server `at`,
// đang phát? }. Bấm ở máy nào thì máy đó phát dòng thời gian mới; mọi máy tự tính vị trí đáng lẽ ở
// (pos + giờ server hiện tại − at), vào VƯỢT lên đúng thời gian mình cần để nạp (utils/audio/timelineSync.ts)
// rồi cứ vài giây đo lệch và chỉnh tốc độ nhẹ — nên ở đâu, mạng nào, cũng chạy chung một nhịp.
// Hàng chờ đi kèm nên mọi máy tự chuyển bài tại cùng một điểm; máy chạy theo không phát lại mốc khi
// tự chuyển bài (chỉ máy người dùng vừa bấm), tránh các máy tranh nhau.
type Timeline = { songId: string; pos: number; at: number; playing: boolean; device: string };
const DEVICE = Math.random().toString(36).slice(2, 10); // mỗi lần mở app là một "máy"
let timeline: Timeline | null = null;
let autoAdvanceOf: string | null = null; // bài vừa được TỰ chuyển tới (không do người dùng bấm)

const expectedOf = (t: Timeline) => () => t.pos + (t.playing ? (serverNow() - t.at) / 1000 : 0);
const workspaceActive = () => {
  const { workspaceEnabled, user, liveRoom } = useStore.getState();
  return !!user && workspaceEnabled && !liveRoom;
};

// `playing`: ý định (vừa bấm phát / vừa chuyển bài) — trạng thái máy phát lúc này có thể vẫn đang đệm.
async function emitWorkspaceSync(playing?: boolean) {
  const { user, currentSong, isPlaying, position, queue, queueIndex } = useStore.getState();
  if (!currentSong || !user || !workspaceActive() || isLiveRadio(currentSong)) return;
  const auto = autoAdvanceOf === currentSong._id;
  autoAdvanceOf = null;
  // Tự chuyển bài ở máy chạy theo: máy dẫn cũng vừa chuyển y hệt và sẽ phát mốc — không tranh.
  if (auto && timeline && timeline.device !== DEVICE) return;
  const pos = (await audioEngine.getPosition()) ?? position;
  timeline = { songId: currentSong._id, pos, at: serverNow(), playing: playing ?? isPlaying, device: DEVICE };
  getSocket().emit('play_sync', {
    roomId: workspaceRoomId(user._id),
    ...timeline,
    queue: queue.map((s) => s._id).slice(0, 200),
    queueIndex,
  });
}

// Máy khác vừa bấm: bám theo dòng thời gian của nó (không phát lại mốc — sẽ thành vòng lặp).
async function applyRemoteState(r: Timeline & { queue?: string[]; queueIndex?: number }) {
  if (!r?.songId || r.device === DEVICE || typeof r.at !== 'number' || !workspaceActive()) return;
  if (timeline && r.at < timeline.at) return; // mốc cũ tới muộn
  timeline = { songId: r.songId, pos: r.pos, at: r.at, playing: r.playing, device: r.device };
  const t = timeline;
  const expected = expectedOf(t);
  const state = useStore.getState();
  const byId = new Map(state.songs.map((s) => [s._id, s]));
  const song = byId.get(r.songId) ?? (state.currentSong?._id === r.songId ? state.currentSong : undefined);
  if (!song) return; // kho chưa tải xong — mốc kế tiếp sẽ bắt kịp
  if (t.playing && song.duration && expected() > song.duration) return; // mốc cũ: bài đó đã hết từ lâu
  const queue = (r.queue || []).map((id) => byId.get(id)).filter((x): x is Song => !!x);
  const index = queue.findIndex((x) => x._id === song._id);

  if (state.currentSong?._id !== song._id) {
    useStore.setState({
      currentSong: song, queue: index >= 0 ? queue : [song], queueIndex: Math.max(0, index),
      position: r.pos, duration: 0, isBuffering: true,
    });
    try {
      const { url } = await resolvePlayback(song, state.audioQuality);
      const gain = state.soundCheck ? gainFor(song.transition) : 1;
      if (timeline !== t) return; // trong lúc nạp đã có mốc mới hơn
      if (!t.playing) await audioEngine.load(url, false, { startAt: t.pos, gain });
      else await startAligned(expected, (pos) => audioEngine.load(url, true, { startAt: pos, gain }));
    } catch (e) {
      console.warn('workspace sync playback failed', e);
    }
    return;
  }
  if (index >= 0) useStore.setState({ queue, queueIndex: index });
  if (!t.playing) {
    await audioEngine.pause();
    await audioEngine.seek(t.pos);
    return;
  }
  const actual = await audioEngine.getPosition();
  // Đang phát gần đúng chỗ rồi thì để vòng chỉnh tốc độ khép nốt — không tua (tua là có khoảng lặng).
  if (actual !== null && state.isPlaying && Math.abs(actual - expected()) < 1.5) return;
  await startAligned(expected, async (pos) => {
    await audioEngine.seek(pos);
    await audioEngine.play();
  });
}

// Mỗi PERIOD_MS: máy chạy theo đo lệch so với dòng thời gian chung và chỉnh; máy vừa bấm chỉ đóng dấu lại khi lệch hẳn.
let checks = 0;
setInterval(() => {
  // Đồng hồ máy trôi dần (vài chục ppm): đo lại giờ server mỗi ~1 phút.
  if (++checks % Math.round(60000 / SYNC.PERIOD_MS) === 0 && workspaceActive()) syncClock().catch(() => {});
  const t = timeline;
  const s = useStore.getState();
  if (s.liveRoom) return; // phòng nghe chung tự giữ nhịp (src/rooms/)
  if (!t || !t.playing || !workspaceActive() || !s.isPlaying || s.isBuffering || s.currentSong?._id !== t.songId) {
    releaseRate().catch(() => {});
    return;
  }
  // Máy vừa bấm: tiếng của chính nó là chuẩn — tự tua/đổi tốc độ để đuổi theo mốc của mình chỉ gây
  // giật (đo trên Chrome: 1.05× suốt ~2.5 s sau mỗi lần phát/tua; mạng chậm thì tua vượt rồi tua lùi).
  // Bị đệm làm lệch hẳn thì đóng dấu lại mốc cho các máy khác bám theo.
  if (t.device === DEVICE) {
    releaseRate().catch(() => {});
    audioEngine.getPosition().then((p) => {
      if (p !== null && timeline === t && Math.abs(p - expectedOf(t)()) > SYNC.SEEK_ABOVE_S) emitWorkspaceSync();
    });
    return;
  }
  alignTo(expectedOf(t)).catch(() => {});
}, SYNC.PERIOD_MS);

// Vào phòng workspace: đồng bộ giờ với server trước, rồi server gửi mốc cuối để bắt kịp.
async function joinWorkspace() {
  const { user } = useStore.getState();
  if (!user) return;
  await syncClock().catch(() => {});
  getSocket().emit('join_room', workspaceRoomId(user._id));
}

// Phòng Socket.IO mất khi kết nối lại (rớt mạng, server khởi động lại, đăng nhập/xuất) —
// vào lại phòng workspace. Phòng nghe chung tự vào lại ở src/rooms/.
getSocket().on('connect', () => {
  if (useStore.getState().workspaceEnabled) joinWorkspace();
});
getSocket().on('room_state', applyRemoteState);
getSocket().on('sync_playback', applyRemoteState);

setOnSessionExpired(() => {
  if (useStore.getState().user) useStore.getState().logout();
});

getSocket().on('room_members', (data: { roomId: string; count: number }) => {
  const { user } = useStore.getState();
  if (user && data.roomId === workspaceRoomId(user._id)) {
    useStore.setState({ workspaceMemberCount: data.count });
  }
});

// Chỉ bản phát triển trên web: cho công cụ kiểm thử trình duyệt đọc store/máy phát (tua tới điểm
// chuyển bài, đo âm lượng hai deck). Bản build production bỏ hẳn khối này.
if (__DEV__ && Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as any).__hugo = { store: useStore, audioEngine };
}
