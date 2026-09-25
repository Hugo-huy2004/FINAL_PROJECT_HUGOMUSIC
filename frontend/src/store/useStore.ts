import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioEngine } from '../utils/audioEngine';
import { api, setAuthToken, streamUrl, resolvePlayback } from '../utils/api';
import { prefetchNext } from '../utils/prefetch';
import { getSocket, reauthSocket } from '../utils/socket';
import { offlineManager } from '../utils/offlineManager';
import { Alert, Platform } from 'react-native';
import { getStationCover } from '../utils/radioArtwork';

// Gom số liệu của bài vừa nghe rồi gửi về server. Chỉ gửi khi thực sự có phát,
// để những lần nạp hụt (đổi bài liên tục, lỗi mạng) không làm nhiễu mốc đo.
function flushPlaybackTelemetry(song: Song | null) {
  if (!song) return;
  const t = audioEngine.takeTelemetry();
  if (!t || (!t.startupMs && !t.playedMs)) return;
  api.recordPlayback({
    songId: song._id,
    startupMs: t.startupMs,
    rebufferCount: t.rebufferCount,
    rebufferMs: t.rebufferMs,
    playedMs: t.playedMs,
    completed: t.completed,
    platform: Platform.OS,
  });
}

export interface PartyParticipant {
  _id?: string;
  userId?: string;
  socketId?: string;
  name: string;
  avatar?: string;
  role: 'host' | 'guest';
  isOnline: boolean;
  joinedAt?: string;
}

export interface PartyRoomData {
  _id?: string;
  code: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  genre?: string;
  maxParticipants?: number;
  host: string;
  hostName: string;
  hostAvatar?: string;
  currentSong?: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  position: number;
  participants: PartyParticipant[];
  isActive: boolean;
  lastSyncTime?: string;
  onlineCount?: number;
  queueLength?: number;
  participantCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

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
  // Giấy phép cụ thể — bắt buộc khi admin tải lên (backend/utils/songReview.js).
  // Hiển thị nhỏ dưới tên bài — CC và Public Domain đều yêu cầu nêu rõ giấy phép.
  licenseType?: string;
  licenseUrl?: string;
  hlsPath?: string;
  hlsTiers?: string[];
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
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (fields: { nickname?: string; phone?: string; musicGenres?: string[] }) => Promise<void>;
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
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchResults: Song[];
  isSearching: boolean;
  search: (query: string) => Promise<void>;
  likedSongIds: string[];
  likedSongs: Song[];
  fetchLikedSongs: () => Promise<void>;
  toggleLike: (songId: string) => Promise<void>;

  // --- playlists ---
  playlists: Playlist[];
  fetchPlaylists: () => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
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

  // --- live radio (see backend/controllers/radioController.js) ---
  // Set while `currentSong` is a station tune-in rather than a normal on-demand play,
  // so the track-finish handler knows to re-tune into the live station instead of
  // advancing the (single-song) queue. Cleared by any direct playSong call.
  activeRadioStationId: string | null;
  tuneInRadio: (stationId: string) => Promise<void>;

  // --- real live radio (see backend/models/RadioStation.js) ---
  radioStations: RadioStation[];
  fetchRadioStations: (country?: string) => Promise<void>;
  playLiveRadio: (station: RadioStation) => Promise<void>;

  // --- real artist photos (see backend/models/Artist.js) — only populated for
  // artists a confident Wikipedia match was found for; absent for most netlabel acts.
  artists: Artist[];
  fetchArtists: () => Promise<void>;

  // --- persistent party room (host-controlled sync) ---
  partyRoomId: string | null;
  partyRoom: PartyRoomData | null;
  publicPartyRooms: PartyRoomData[];
  myPartyRooms: PartyRoomData[];
  isLoadingPartyRooms: boolean;
  isPartyHost: boolean;
  isPartyRoomVisible: boolean;
  setPartyRoomVisible: (visible: boolean) => void;
  fetchPublicPartyRooms: () => Promise<void>;
  fetchMyPartyRooms: () => Promise<void>;
  createPartyRoom: (options?: { name?: string; description?: string; isPublic?: boolean; genre?: string; forceNew?: boolean } | string) => Promise<string | null>;
  updatePartyRoom: (code: string, data: { name?: string; description?: string; isPublic?: boolean; genre?: string }) => Promise<boolean>;
  joinPartyRoom: (code: string) => Promise<boolean>;
  leavePartyRoom: () => Promise<void>;
  deletePartyRoom: (code?: string, permanent?: boolean) => Promise<void>;
  checkActivePartyRoom: () => Promise<void>;
  hostPlayPause: () => void;
  hostSeek: (position: number) => void;
  hostNextSong: () => void;
  hostPrevSong: () => void;
  hostSelectSong: (song: Song, forcedQueue?: Song[], targetIndex?: number) => Promise<void>;
  addSongToPartyQueue: (song: Song) => void;
  removeSongFromPartyQueue: (index: number) => void;

  createParty: () => void;
  joinParty: (roomId: string) => void;
  leaveParty: () => void;

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
  isOfflineMode: boolean;
  toggleOfflineMode: () => void;
  loadOfflineSongs: () => Promise<void>;
  downloadSongOffline: (song: Song) => Promise<void>;
  removeSongOffline: (songId: string) => Promise<void>;

  // --- play history ---
  historySongs: Song[];
  clearHistory: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      // Shared by every path that ends in a real session (password login, OTP
      // verification, Google, register) so token/user/playlists/likes stay in sync.
      const completeSession = (user: User) => {
        setAuthToken(user.token);
        reauthSocket();
        set({ user, isAuthLoading: false, isLoginModalVisible: false, pendingOtpToken: null });
        get().fetchPlaylists();
        get().fetchLikedSongs();
        get().checkActivePartyRoom();
        // Khách vừa bị chặn vì hết lượt nghe: đăng nhập xong thì phát luôn bài đó.
        const { currentSong, queue } = get();
        if (currentSong && !get().activeRadioStationId && !audioEngine.hasSound()) get().playSong(currentSong, queue);
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
      loginWithGoogle: async (idToken) => {
        set({ isAuthLoading: true, authError: null });
        try {
          const user = await api.googleAuth(idToken);
          completeSession(user);
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
      deleteAccount: async () => {
        await api.deleteAccount();
        get().logout();
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
        await api.changePassword(currentPassword, newPassword);
      },

      // --- song library ---
      songs: [],
      isLoadingSongs: false,
      selectedCategory: 'Tất cả',
      setSelectedCategory: (cat: string) => set({ selectedCategory: cat }),
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
      searchResults: [],
      isSearching: false,
      search: async (query) => {
        const trimmed = query.trim();
        if (!trimmed) {
          set({ searchResults: [] });
          return;
        }
        set({ isSearching: true });
        try {
          const apiResults = await api.getSongs(trimmed);
          if (Array.isArray(apiResults) && apiResults.length > 0) {
            set({ searchResults: apiResults, isSearching: false });
            return;
          }

          // Fallback: local filter on loaded songs in store
          const lower = trimmed.toLowerCase();
          const localFiltered = (get().songs || []).filter(
            (s) =>
              s.title?.toLowerCase().includes(lower) ||
              s.artist?.toLowerCase().includes(lower) ||
              s.category?.toLowerCase().includes(lower)
          );
          set({ searchResults: localFiltered, isSearching: false });
        } catch (e) {
          console.warn('search API failed, falling back to local filter', e);
          const lower = trimmed.toLowerCase();
          const localFiltered = (get().songs || []).filter(
            (s) =>
              s.title?.toLowerCase().includes(lower) ||
              s.artist?.toLowerCase().includes(lower) ||
              s.category?.toLowerCase().includes(lower)
          );
          set({ searchResults: localFiltered, isSearching: false });
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
      createPlaylist: async (name) => {
        const playlist = await api.createPlaylist(name);
        set((state) => ({ playlists: [playlist, ...state.playlists] }));
      },
      renamePlaylist: async (id, name) => {
        const updated = await api.renamePlaylist(id, name);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === id ? updated : p)) }));
      },
      deletePlaylist: async (id) => {
        await api.deletePlaylist(id);
        set((state) => ({ playlists: state.playlists.filter((p) => p._id !== id) }));
      },
      addSongToPlaylist: async (playlistId, songId) => {
        const updated = await api.addSongToPlaylist(playlistId, songId);
        set((state) => ({ playlists: state.playlists.map((p) => (p._id === playlistId ? updated : p)) }));
      },
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
      audioQuality: 'auto',
      playSong: async (song, queue = [song], startAtSeconds) => {
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
          activeRadioStationId: null, // any direct play exits "live radio" mode
          historySongs: updatedHistory,
        });
        try {
          // Worker CDN first (served from the PoP nearest the listener), Node proxy
          // as fallback. Offline copies are keyed by song, not by the tokened URL.
          const cachedUrl = await offlineManager.getPlayableUrl(streamUrl(song._id));
          const { url } = cachedUrl ? { url: cachedUrl } : await resolvePlayback(song, get().audioQuality);
          await audioEngine.load(url, true);
          if (startAtSeconds && startAtSeconds > 0) {
            await audioEngine.seek(startAtSeconds);
            set({ position: startAtSeconds });
          }

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
        }
        emitPartySync();
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
        const { currentSong, isPlaying, queue, position, partyRoom, isPartyHost, hostPlayPause } = get();
        if (!currentSong) return;
        if (partyRoom) {
          if (isPartyHost) {
            hostPlayPause();
            return;
          } else {
            // Guest cannot pause or toggle party room playback
            return;
          }
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
        emitPartySync();
      },
      seek: (seconds) => {
        const { partyRoom, isPartyHost, hostSeek } = get();
        if (partyRoom) {
          if (isPartyHost) {
            hostSeek(seconds);
            return;
          } else {
            // Guest cannot seek party room playback
            return;
          }
        }
        audioEngine.seek(seconds);
        set({ position: seconds });
        emitPartySync();
      },
      seekBy: (deltaSeconds) => {
        const { position, duration, currentSong, queue, partyRoom, isPartyHost, hostSeek } = get();
        if (!currentSong) return;
        if (duration === Infinity) return; // Live stream seeking disabled
        const currentPos = typeof position === 'number' && !isNaN(position) ? position : 0;
        const maxDuration = duration > 0 ? duration : 3600;
        const target = Math.max(0, Math.min(maxDuration, currentPos + deltaSeconds));
        if (partyRoom) {
          if (isPartyHost) {
            hostSeek(target);
            return;
          } else {
            return;
          }
        }
        if (!audioEngine.hasSound()) {
          get().playSong(currentSong, queue, target);
        } else {
          get().seek(target);
        }
      },
      next: () => {
        const { partyRoom, isPartyHost, hostNextSong, queue, queueIndex } = get();
        if (partyRoom) {
          if (isPartyHost) {
            hostNextSong();
            return;
          } else {
            return;
          }
        }
        if (queueIndex + 1 < queue.length) {
          get().playSong(queue[queueIndex + 1], queue);
        } else if (queue.length > 0) {
          // Seamless cyclical rotation back to beginning
          get().playSong(queue[0], queue);
        }
      },
      prev: () => {
        const { partyRoom, isPartyHost, hostPrevSong, queue, queueIndex, position } = get();
        if (partyRoom) {
          if (isPartyHost) {
            hostPrevSong();
            return;
          } else {
            return;
          }
        }
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

      // Tunes into a station's live position instead of picking one song to play on
      // demand — every listener who calls this at the same moment gets back the same
      // track at the same position, because the backend derives it from elapsed wall-clock
      // time (see radioController.js), not from a per-user shuffle. Re-called automatically
      // on track-finish while a station is active (see the audioEngine.onStatus handler
      // below), which is what makes the station keep playing 24/7 instead of stopping
      // after one song.
      activeRadioStationId: null,
      tuneInRadio: async (stationId) => {
        try {
          const { song, positionMs } = await api.getRadioNowPlaying(stationId);
          await get().playSong(song, [song], positionMs / 1000);
          set({ activeRadioStationId: stationId });
        } catch (e) {
          console.warn('radio tune-in failed', e);
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
          activeRadioStationId: null, // this is a real external stream, not a simulated catalog station
        });
        try {
          await audioEngine.load(station.streamUrl, true);
        } catch (e) {
          console.warn('live radio playback failed', e);
          set({ isBuffering: false });
        }
      },

      // --- party room (persistent host-controlled) ---
      partyRoomId: null,
      partyRoom: null,
      publicPartyRooms: [],
      myPartyRooms: [],
      isLoadingPartyRooms: false,
      isPartyHost: false,
      isPartyRoomVisible: false,
      setPartyRoomVisible: (visible) => set({ isPartyRoomVisible: visible }),

      fetchPublicPartyRooms: async () => {
        set({ isLoadingPartyRooms: true });
        try {
          const res = await api.getPublicPartyRooms();
          if (res?.success && Array.isArray(res.rooms)) {
            set({ publicPartyRooms: res.rooms });
          }
        } catch (err) {
          console.warn('Failed to fetch public party rooms:', err);
        } finally {
          set({ isLoadingPartyRooms: false });
        }
      },

      fetchMyPartyRooms: async () => {
        if (!get().user) return;
        try {
          const res = await api.getMyPartyRooms();
          if (res?.success && Array.isArray(res.rooms)) {
            set({ myPartyRooms: res.rooms });
          }
        } catch (err) {
          console.warn('Failed to fetch my party rooms:', err);
        }
      },

      createPartyRoom: async (options?: { name?: string; description?: string; isPublic?: boolean; genre?: string; forceNew?: boolean } | string) => {
        // Anti-collision: if user was in another party room as guest, leave it first
        const prevRoom = get().partyRoom;
        if (prevRoom && !get().isPartyHost) {
          await get().leavePartyRoom();
        }

        try {
          const { currentSong, queue } = get();
          const res = await api.createPartyRoom(options, currentSong, queue);
          if (res?.success && res.room) {
            const room: PartyRoomData = res.room;
            const socket = getSocket();
            socket.emit('join_room', room.code, {
              userId: get().user?._id,
              name: get().user?.nickname || get().user?.username || 'Host',
              avatar: get().user?.avatarUrl,
              isHost: true,
            });
            set({
              partyRoom: room,
              partyRoomId: room.code,
              isPartyHost: true,
              isPartyRoomVisible: true,
            });
            get().fetchMyPartyRooms();
            get().fetchPublicPartyRooms();
            return room.code;
          }
        } catch (err: any) {
          console.error('Failed to create party room:', err);
          throw err;
        }
        return null;
      },

      updatePartyRoom: async (code: string, data: { name?: string; description?: string; isPublic?: boolean; genre?: string }) => {
        try {
          const res = await api.updatePartyRoom(code, data);
          if (res?.success && res.room) {
            set((state) => ({
              partyRoom: state.partyRoom?.code === code ? { ...state.partyRoom, ...res.room } : state.partyRoom,
            }));
            get().fetchMyPartyRooms();
            get().fetchPublicPartyRooms();
            return true;
          }
        } catch (err) {
          console.error('Failed to update party room:', err);
          throw err;
        }
        return false;
      },

      joinPartyRoom: async (code: string) => {
        const cleanCode = code.trim().toUpperCase();

        // Anti-collision: if user is currently in a different party room, clean up first!
        const prevRoom = get().partyRoom;
        if (prevRoom && prevRoom.code !== cleanCode) {
          if (get().isPartyHost) {
            await get().deletePartyRoom();
          } else {
            await get().leavePartyRoom();
          }
        }

        try {
          const socket = getSocket();
          const user = get().user;
          const res = await api.joinPartyRoom(
            cleanCode,
            socket.id,
            user?.nickname || user?.username || 'Khách',
            user?.avatarUrl,
            user?._id
          );
          if (res?.success && res.room) {
            const room: PartyRoomData = res.room;
            const isHost = res.isHost || (user && room.host === user._id);
            socket.emit('join_room', room.code, {
              userId: user?._id,
              name: user?.nickname || user?.username || 'Khách',
              avatar: user?.avatarUrl,
              isHost,
            });
            set({
              partyRoom: room,
              partyRoomId: room.code,
              isPartyHost: !!isHost,
              isPartyRoomVisible: true,
            });

            // If guest and room has playing track, sync immediately!
            if (!isHost && room.currentSong) {
              applyPartyRemotePlayback({
                song: room.currentSong,
                position: room.position,
                isPlaying: room.isPlaying,
                queue: room.queue,
                queueIndex: room.queueIndex,
              });
            }
            return true;
          }
        } catch (err: any) {
          console.error('Failed to join party room:', err);
          throw err;
        }
        return false;
      },

      leavePartyRoom: async () => {
        const { partyRoom, partyRoomId } = get();
        const code = partyRoom?.code || partyRoomId;
        if (code) {
          const socket = getSocket();
          socket.emit('leave_room', code);
          try {
            await api.leavePartyRoom(code, socket.id);
          } catch (e) {
            console.warn('leavePartyRoom API error:', e);
          }
        }
        set({
          partyRoom: null,
          partyRoomId: null,
          isPartyHost: false,
          isPartyRoomVisible: false,
        });
      },

      deletePartyRoom: async (codeToDelete?: string, permanent?: boolean) => {
        const currentRoom = get().partyRoom;
        const targetCode = codeToDelete || currentRoom?.code || get().partyRoomId;
        if (!targetCode) return;

        try {
          await api.deletePartyRoom(targetCode, permanent);
        } catch (e) {
          console.warn('deletePartyRoom API error:', e);
        }

        if (!codeToDelete || (currentRoom && currentRoom.code === codeToDelete)) {
          set({
            partyRoom: null,
            partyRoomId: null,
            isPartyHost: false,
            isPartyRoomVisible: false,
          });
        }
        get().fetchMyPartyRooms();
        get().fetchPublicPartyRooms();
      },

      checkActivePartyRoom: async () => {
        const { user } = get();
        if (!user) return;
        try {
          const res = await api.getMyActivePartyRoom();
          if (res?.success && res.room) {
            const room: PartyRoomData = res.room;
            const socket = getSocket();
            socket.emit('join_room', room.code, {
              userId: user._id,
              name: user.nickname || user.username || 'Host',
              avatar: user.avatarUrl,
              isHost: true,
            });
            set({
              partyRoom: room,
              partyRoomId: room.code,
              isPartyHost: true,
            });
          }
        } catch (e) {
          // quiet
        }
      },

      hostPlayPause: () => {
        const { isPlaying, partyRoom, isPartyHost, currentSong, position } = get();
        if (!isPartyHost || !partyRoom) return;
        const newPlayState = !isPlaying;
        if (newPlayState) audioEngine.play();
        else audioEngine.pause();
        set({ isPlaying: newPlayState });

        const payload = {
          roomId: partyRoom.code,
          action: newPlayState ? 'play' : 'pause',
          currentSong,
          position,
          isPlaying: newPlayState,
          queue: partyRoom.queue,
          queueIndex: partyRoom.queueIndex,
        };
        getSocket().emit('party:host_action', payload);
        api.syncPartyPlayback(partyRoom.code, payload).catch(() => {});
      },

      hostSeek: (newPos: number) => {
        const { partyRoom, isPartyHost, currentSong, isPlaying } = get();
        if (!isPartyHost || !partyRoom) return;
        audioEngine.seek(newPos);
        set({ position: newPos });

        const payload = {
          roomId: partyRoom.code,
          action: 'seek',
          currentSong,
          position: newPos,
          isPlaying,
          queue: partyRoom.queue,
          queueIndex: partyRoom.queueIndex,
        };
        getSocket().emit('party:host_action', payload);
        api.syncPartyPlayback(partyRoom.code, payload).catch(() => {});
      },

      hostNextSong: () => {
        const { partyRoom, isPartyHost, currentSong, songs } = get();
        if (!isPartyHost || !partyRoom) return;

        let roomQueue = partyRoom.queue || [];
        if (roomQueue.length === 0 && (currentSong || partyRoom.currentSong)) {
          roomQueue = [currentSong || partyRoom.currentSong!];
        } else if (roomQueue.length === 0 && songs && songs.length > 0) {
          roomQueue = [songs[0]];
        }

        if (roomQueue.length === 0) return;

        // Cyclical endless rotation: when reaching the end, wrap back to track 0
        const nextIdx = (partyRoom.queueIndex + 1) % roomQueue.length;
        const nextSong = roomQueue[nextIdx];
        if (nextSong) {
          get().hostSelectSong(nextSong, roomQueue, nextIdx);
        }
      },

      hostPrevSong: () => {
        const { partyRoom, isPartyHost, currentSong, songs } = get();
        if (!isPartyHost || !partyRoom) return;

        let roomQueue = partyRoom.queue || [];
        if (roomQueue.length === 0 && (currentSong || partyRoom.currentSong)) {
          roomQueue = [currentSong || partyRoom.currentSong!];
        } else if (roomQueue.length === 0 && songs && songs.length > 0) {
          roomQueue = [songs[0]];
        }

        if (roomQueue.length === 0) return;

        const prevIdx = (partyRoom.queueIndex - 1 + roomQueue.length) % roomQueue.length;
        const prevSong = roomQueue[prevIdx];
        if (prevSong) {
          get().hostSelectSong(prevSong, roomQueue, prevIdx);
        }
      },

      hostSelectSong: async (song: Song, forcedQueue?: Song[], targetIndex?: number) => {
        const { partyRoom, isPartyHost } = get();
        if (!isPartyHost || !partyRoom) return;

        let newQueue = forcedQueue || partyRoom.queue || [];
        const exists = newQueue.some((s) => s._id === song._id);
        if (!exists) {
          newQueue = [...newQueue, song];
        }
        const newIdx = typeof targetIndex === 'number' ? targetIndex : newQueue.findIndex((s) => s._id === song._id);

        const updatedRoom = {
          ...partyRoom,
          currentSong: song,
          queue: newQueue,
          queueIndex: newIdx >= 0 ? newIdx : 0,
          isPlaying: true,
          position: 0,
        };
        set({ partyRoom: updatedRoom });

        // Always restart at 0 seconds for continuous smooth flow
        await get().playSong(song, newQueue, 0);

        const payload = {
          roomId: partyRoom.code,
          action: 'change_song',
          currentSong: song,
          position: 0,
          isPlaying: true,
          queue: newQueue,
          queueIndex: updatedRoom.queueIndex,
        };
        getSocket().emit('party:host_action', payload);
        api.syncPartyPlayback(partyRoom.code, payload).catch(() => {});
      },

      addSongToPartyQueue: (song: Song) => {
        const { partyRoom, isPartyHost } = get();
        if (!isPartyHost || !partyRoom) return;
        const updatedQueue = [...partyRoom.queue, song];
        const updatedRoom = { ...partyRoom, queue: updatedQueue };
        set({ partyRoom: updatedRoom });

        getSocket().emit('party:host_action', {
          roomId: partyRoom.code,
          action: 'queue',
          queue: updatedQueue,
        });
        api.updatePartyQueue(partyRoom.code, updatedQueue).catch(() => {});
      },

      removeSongFromPartyQueue: (index: number) => {
        const { partyRoom, isPartyHost } = get();
        if (!isPartyHost || !partyRoom) return;
        const updatedQueue = partyRoom.queue.filter((_, i) => i !== index);
        const updatedRoom = { ...partyRoom, queue: updatedQueue };
        set({ partyRoom: updatedRoom });

        getSocket().emit('party:host_action', {
          roomId: partyRoom.code,
          action: 'queue',
          queue: updatedQueue,
        });
        api.updatePartyQueue(partyRoom.code, updatedQueue).catch(() => {});
      },

      // legacy helpers
      createParty: () => {
        get().createPartyRoom();
      },
      joinParty: (roomId) => {
        get().joinPartyRoom(roomId);
      },
      leaveParty: () => {
        get().leavePartyRoom();
      },

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
          getSocket().emit('join_room', roomId);
          set({ workspaceEnabled: true });
        }
      },

      // --- offline & cache ---
      offlineSongIds: [],
      offlineSongs: [],
      isOfflineMode: false,
      toggleOfflineMode: () => set((s) => ({ isOfflineMode: !s.isOfflineMode })),
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
      clearHistory: () => set({ historySongs: [] }),

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
        partyRoomId: state.partyRoomId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.loadOfflineSongs();
        if (state?.user) {
          setAuthToken(state.user.token);
          reauthSocket();
          state.refreshUser();
          state.fetchPlaylists();
          state.fetchLikedSongs();
          if (state.workspaceEnabled) {
            getSocket().emit('join_room', workspaceRoomId(state.user._id));
          }
          state.checkActivePartyRoom().then(() => {
            const current = useStore.getState();
            if (!current.partyRoom && state.partyRoomId) {
              state.joinPartyRoom(state.partyRoomId).catch(() => {});
            }
          });
        } else if (state?.partyRoomId) {
          state.joinPartyRoom(state.partyRoomId).catch(() => {});
        }
      },
    }
  )
);

// HM-13: token phát chỉ sống vài phút và nằm trong URL, nên khi nó hết hạn (bài dài,
// tạm dừng lâu rồi phát tiếp, tua xa) lần tải kế tiếp nhận 401 và trình phát báo lỗi.
// Xin token mới bằng cách nạp lại bài tại đúng vị trí. Tối đa 1 lần / 15 giây để
// lỗi thật (bài bị xoá, mất mạng hẳn) không thành vòng lặp.
let lastRecoveryAt = 0;
audioEngine.onError(() => {
  const { currentSong, queue, position, activeRadioStationId, playSong } = useStore.getState();
  // Radio: luồng của bên thứ ba, không có token.
  if (!currentSong || activeRadioStationId) return;
  if (Date.now() - lastRecoveryAt < 15000) return;
  lastRecoveryAt = Date.now();
  playSong(currentSong, queue, position);
});

// Feed native playback status straight into the store. Registered once at module load.
audioEngine.onStatus((status) => {
  useStore.setState({
    isPlaying: status.isPlaying,
    isBuffering: status.isBuffering,
    position: status.position,
    duration: status.duration,
  });
  if (status.didFinish) {
    const { activeRadioStationId, tuneInRadio, next, isPartyHost, partyRoom, hostNextSong } = useStore.getState();
    if (activeRadioStationId) {
      tuneInRadio(activeRadioStationId);
    } else if (partyRoom && isPartyHost) {
      hostNextSong();
    } else if (partyRoom && !isPartyHost) {
      // Guest in party room: do NOT trigger local next().
      // Wait for Host to advance or loop track via party sync.
    } else {
      next();
    }
  }
});

// Push the current playback state to the party room (if in one) AND the personal
// workspace room (if enabled) — a device can be doing both at once.
function emitPartySync() {
  const { partyRoomId, partyRoom, isPartyHost, workspaceEnabled, user, currentSong, isPlaying, position } = useStore.getState();
  if (!currentSong) return;

  // If in a party room, only the HOST broadcasts to avoid guest audio loops
  if (partyRoom && !isPartyHost) return;

  const rooms = [partyRoomId, workspaceEnabled && user ? workspaceRoomId(user._id) : null].filter(
    (r): r is string => !!r
  );
  if (rooms.length === 0) return;

  const payload = {
    songId: currentSong._id,
    positionMs: Math.round(position * 1000),
    isPlaying,
  };
  rooms.forEach((roomId) => getSocket().emit('play_sync', { roomId, ...payload }));

  if (partyRoom && isPartyHost) {
    const hostPayload = {
      roomId: partyRoom.code,
      action: isPlaying ? 'play' : 'pause',
      currentSong,
      position,
      isPlaying,
      queue: partyRoom.queue,
      queueIndex: partyRoom.queueIndex,
    };
    getSocket().emit('party:host_action', hostPayload);
    api.syncPartyPlayback(partyRoom.code, hostPayload).catch(() => {});
  }
}

// Apply a state broadcast from another party member without re-emitting (would loop).
async function applyRemoteState(remote: { songId?: string; positionMs?: number; isPlaying?: boolean }) {
  if (!remote?.songId) return;
  const state = useStore.getState();
  // Don't apply legacy sync if we're Host in a persistent party room
  if (state.partyRoom && state.isPartyHost) return;

  const sameSong = state.currentSong?._id === remote.songId;

  if (!sameSong) {
    const song =
      state.songs.find((s) => s._id === remote.songId) ||
      ({ _id: remote.songId, title: 'Party track', artist: 'Synced from party' } as Song);
    useStore.setState({ currentSong: song, queue: [song], queueIndex: 0, isBuffering: true });
    try {
      const { url } = await resolvePlayback(song, state.audioQuality);
      await audioEngine.load(url, !!remote.isPlaying);
    } catch (e) {
      console.warn('party sync playback failed', e);
    }
  }
  if (typeof remote.positionMs === 'number') {
    audioEngine.seek(remote.positionMs / 1000);
  }
  if (remote.isPlaying) audioEngine.play();
  else audioEngine.pause();
}

async function applyPartyRemotePlayback(remote: {
  action?: string;
  song?: Song | null;
  position?: number;
  isPlaying?: boolean;
  queue?: Song[];
  queueIndex?: number;
}) {
  const state = useStore.getState();
  if (state.isPartyHost) return; // Do not override Host device!

  if (remote.song && remote.song._id) {
    const isSameSong = state.currentSong?._id === remote.song._id;
    if (!isSameSong || !audioEngine.hasSound()) {
      const songToPlay = remote.song;
      useStore.setState({
        currentSong: songToPlay,
        queue: remote.queue && remote.queue.length > 0 ? remote.queue : [songToPlay],
        queueIndex: remote.queueIndex ?? 0,
        position: remote.position ?? 0,
        isBuffering: true,
      });
      try {
        const { url } = await resolvePlayback(songToPlay, state.audioQuality);
        await audioEngine.load(url, !!remote.isPlaying);
        if (typeof remote.position === 'number' && remote.position > 0) {
          audioEngine.seek(remote.position);
        }
      } catch (err) {
        console.warn('party sync playback load failed:', err);
      }
    } else {
      // Loop replay of same track, explicit song change, or seek
      if (remote.action === 'change_song' || (typeof remote.position === 'number' && remote.position < 2 && state.position > 2)) {
        await audioEngine.seek(0);
        if (remote.isPlaying) {
          await audioEngine.play();
        }
        useStore.setState({ position: 0, isPlaying: !!remote.isPlaying });
      } else if (typeof remote.position === 'number') {
        const currentPos = state.position;
        if (Math.abs(currentPos - remote.position) > 1.5) {
          audioEngine.seek(remote.position);
          useStore.setState({ position: remote.position });
        }
      }
    }
  }

  if (remote.isPlaying !== undefined) {
    if (remote.isPlaying && !state.isPlaying) {
      audioEngine.play();
      useStore.setState({ isPlaying: true });
    } else if (!remote.isPlaying && state.isPlaying) {
      audioEngine.pause();
      useStore.setState({ isPlaying: false });
    }
  }

  if (state.partyRoom) {
    useStore.setState({
      partyRoom: {
        ...state.partyRoom,
        currentSong: remote.song !== undefined ? remote.song : state.partyRoom.currentSong,
        position: remote.position !== undefined ? remote.position : state.partyRoom.position,
        isPlaying: remote.isPlaying !== undefined ? remote.isPlaying : state.partyRoom.isPlaying,
        queue: remote.queue !== undefined ? remote.queue : state.partyRoom.queue,
        queueIndex: remote.queueIndex !== undefined ? remote.queueIndex : state.partyRoom.queueIndex,
      },
    });
  }
}

// Socket event listeners
// Socket.IO rooms don't survive a reconnect (network drop, server restart, or the
// re-auth reconnect on login/logout) — rejoin whatever this client was in.
getSocket().on('connect', () => {
  const { user, workspaceEnabled, partyRoom } = useStore.getState();
  if (user && workspaceEnabled) getSocket().emit('join_room', workspaceRoomId(user._id));
  if (partyRoom) {
    getSocket().emit('join_room', partyRoom.code, {
      name: user?.nickname || user?.username || 'Khách',
      avatar: user?.avatarUrl,
    });
  }
});
getSocket().on('room_state', applyRemoteState);
getSocket().on('sync_playback', applyRemoteState);

getSocket().on('party:room_state', (data: { room: PartyRoomData }) => {
  if (!data?.room) return;
  const state = useStore.getState();
  const isHost = (state.user && data.room.host === state.user._id) || state.isPartyHost;
  useStore.setState({
    partyRoom: data.room,
    partyRoomId: data.room.code,
    isPartyHost: isHost,
  });
  if (!isHost && data.room.currentSong) {
    applyPartyRemotePlayback({
      song: data.room.currentSong,
      position: data.room.position,
      isPlaying: data.room.isPlaying,
      queue: data.room.queue,
      queueIndex: data.room.queueIndex,
    });
  }
});

getSocket().on('party:room_updated', (data: { room: PartyRoomData }) => {
  if (!data?.room) return;
  const state = useStore.getState();
  if (state.partyRoom && state.partyRoom.code === data.room.code) {
    useStore.setState({
      partyRoom: {
        ...state.partyRoom,
        ...data.room,
      },
    });
    // If we are Host and currently playing, immediately broadcast current live playback
    // so any new or rejoining member synchronizes immediately
    if (state.isPartyHost && state.isPlaying && state.currentSong) {
      const payload = {
        roomId: state.partyRoom.code,
        action: 'sync',
        currentSong: state.currentSong,
        position: state.position,
        isPlaying: state.isPlaying,
        queue: state.partyRoom.queue,
        queueIndex: state.partyRoom.queueIndex,
      };
      getSocket().emit('party:host_action', payload);
    }
  }
});

getSocket().on('party:sync_playback', (data: any) => {
  applyPartyRemotePlayback({
    action: data.action,
    song: data.currentSong,
    position: data.position,
    isPlaying: data.isPlaying,
    queue: data.queue,
    queueIndex: data.queueIndex,
  });
});

getSocket().on('party:queue_updated', (data: { code: string; queue: Song[] }) => {
  const state = useStore.getState();
  if (state.partyRoom && state.partyRoom.code === data.code) {
    useStore.setState({
      partyRoom: {
        ...state.partyRoom,
        queue: data.queue,
      },
    });
  }
});

getSocket().on('party:room_closed', (data: { code: string; message?: string }) => {
  const state = useStore.getState();
  if (state.partyRoom && state.partyRoom.code === data.code) {
    Alert.alert('Phòng Party', data.message || 'Host đã xóa phòng');
    useStore.setState({
      partyRoom: null,
      partyRoomId: null,
      isPartyHost: false,
      isPartyRoomVisible: false,
    });
  }
});

// Periodic heartbeat to guarantee sub-second alignment across all connected devices in party room
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const { partyRoom, isPartyHost, isPlaying, position, currentSong } = useStore.getState();
    if (partyRoom && isPartyHost && isPlaying && currentSong) {
      const payload = {
        roomId: partyRoom.code,
        action: 'heartbeat',
        currentSong,
        position,
        isPlaying: true,
        queue: partyRoom.queue,
        queueIndex: partyRoom.queueIndex,
      };
      getSocket().emit('party:host_action', payload);
    }
  }, 4000);
}

// Only care about member-count updates for our own workspace room, not every room
// this socket happens to be in (e.g. a Sync Party).
getSocket().on('room_members', (data: { roomId: string; count: number }) => {
  const { user } = useStore.getState();
  if (user && data.roomId === workspaceRoomId(user._id)) {
    useStore.setState({ workspaceMemberCount: data.count });
  }
});
