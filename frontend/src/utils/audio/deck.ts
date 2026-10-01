import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

if (Platform.OS !== 'web') {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}

// Một "deck" = một luồng phát độc lập (như một mâm đĩa của DJ). AudioEngine giữ HAI deck để
// nạp sẵn bài kế và chồng tiếng khi chuyển bài (utils/audioEngine.ts).
//   WebDeck    — thẻ <audio> riêng; HLS qua hls.js riêng (Chrome/Firefox không phát .m3u8),
//                Safari phát HLS gốc.
//   NativeDeck — expo-audio AudioPlayer (iOS AVPlayer / Android ExoPlayer, cả hai phát HLS gốc).
export type DeckStatus = {
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  didFinish: boolean;
  bitrate?: number; // kbps
  codec?: string;
  segmentIndex?: number;
  isHls?: boolean;
};

export interface Deck {
  load(url: string, opts: { autoPlay: boolean; startAt?: number; hlsToken?: string | null }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(v: number): void;
  setRate(rate: number): Promise<void>;
  getPosition(): Promise<number | null>;
  isLoaded(): boolean;
  unload(): Promise<void>;
  // Trình duyệt iOS khoá thuộc tính volume của <audio> (luôn 1) → không fade được bằng volume.
  canFade(): boolean;
  // Mở bộ chọn thiết bị phát của hệ thống (AirPlay trên Safari). Không hỗ trợ thì không có hàm này.
  pickOutput?(): void;
  onStatus: (s: DeckStatus) => void;
  onError: (reason: string) => void;
}

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);
// ~0,05 s im lặng: phát một lần trong cú chạm của người dùng để "mở khoá" thẻ <audio> trên
// Safari — thẻ đã mở khoá thì sau này tự phát được (lúc chuyển bài không có cú chạm nào).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

class WebDeck implements Deck {
  private el: HTMLAudioElement;
  private hls: any = null;
  private loaded = false;
  private unlocked = false;
  private currentBitrate = 0;
  private currentCodec = 'AAC';
  private currentSegment = 0;
  onStatus: (s: DeckStatus) => void = () => {};
  onError: (reason: string) => void = () => {};

  private emit(over: Partial<DeckStatus> = {}) {
    if (this.loaded) {
      this.onStatus({
        isPlaying: !this.el.paused && !this.el.ended,
        isBuffering: false,
        position: this.el.currentTime || 0,
        duration: Number.isFinite(this.el.duration) ? this.el.duration : 0,
        didFinish: this.el.ended,
        bitrate: this.currentBitrate || undefined,
        codec: this.currentCodec,
        segmentIndex: this.currentSegment,
        isHls: !!this.hls,
        ...over,
      });
    }
  }

  constructor() {
    const el = document.createElement('audio');
    el.preload = 'auto';
    this.el = el;
    el.addEventListener('timeupdate', () => this.emit());
    el.addEventListener('play', () => this.emit());
    el.addEventListener('pause', () => this.emit());
    el.addEventListener('waiting', () => this.emit({ isBuffering: true }));
    el.addEventListener('playing', () => this.emit());
    el.addEventListener('ended', () => this.emit({ didFinish: true }));
    // Safari phát HLS gốc: lỗi (vd. 401 khi token hết hạn) chỉ lộ qua sự kiện này.
    el.addEventListener('error', () => { if (this.loaded) this.onError('media error'); });
  }

  pickOutput() {
    (this.el as any).webkitShowPlaybackTargetPicker?.();
  }

  unlock() {
    if (this.unlocked || this.loaded) return;
    this.unlocked = true;
    this.el.src = SILENT_WAV;
    this.el.play().then(() => this.el.pause()).catch(() => {});
  }

  canFade() {
    const before = this.el.volume;
    this.el.volume = 0.5;
    const ok = this.el.volume === 0.5;
    this.el.volume = before;
    return ok;
  }

  async load(url: string, { autoPlay, startAt, hlsToken }: { autoPlay: boolean; startAt?: number; hlsToken?: string | null }) {
    await this.unload();
    this.loaded = true;
    this.unlocked = true;
    const el = this.el;
    if (startAt) {
      // Đặt vị trí ngay khi có metadata (với HLS, trước khi tải đoạn đầu → không tải phần bỏ đi).
      const seek = () => { el.currentTime = startAt; };
      el.addEventListener('loadedmetadata', seek, { once: true });
    }
    if (/\.flac(\?|$)/i.test(url)) {
      this.currentCodec = 'FLAC';
      this.currentBitrate = 921;
    } else if (/\.mp3(\?|$)/i.test(url)) {
      this.currentCodec = 'MP3';
      this.currentBitrate = 320;
    } else {
      this.currentCodec = 'AAC';
      this.currentBitrate = 256;
    }

    if (isHls(url) && el.canPlayType('application/vnd.apple.mpegurl') === '') {
      const Hls = (await import('hls.js')).default;
      if (!Hls.isSupported()) throw new Error('Trình duyệt không hỗ trợ HLS');
      this.hls = new Hls({
        enableWorker: true,
        startPosition: startAt ?? -1,
        // hls.js phân giải URL đoạn TƯƠNG ĐỐI theo danh mục nên mất query token — gắn lại vào
        // từng request (token ký theo tiền tố thư mục chính vì vậy).
        xhrSetup: (xhr: XMLHttpRequest, requestUrl: string) => {
          if (!hlsToken || requestUrl.includes('token=')) return;
          const sep = requestUrl.includes('?') ? '&' : '?';
          xhr.open('GET', `${requestUrl}${sep}token=${encodeURIComponent(hlsToken)}`, true);
        },
      });

      this.hls.on(Hls.Events.MANIFEST_PARSED, (_: unknown, data: any) => {
        if (data?.levels && data.levels.length > 0) {
          const idx = this.hls.currentLevel >= 0 ? this.hls.currentLevel : 0;
          const lvl = data.levels[idx];
          if (lvl?.bitrate) this.currentBitrate = Math.round(lvl.bitrate / 1000);
          if (lvl?.audioCodec) this.currentCodec = lvl.audioCodec.toUpperCase();
          this.emit();
        }
      });

      this.hls.on(Hls.Events.LEVEL_SWITCHED, (_: unknown, data: { level: number }) => {
        const lvl = this.hls?.levels?.[data.level];
        if (lvl?.bitrate) {
          this.currentBitrate = Math.round(lvl.bitrate / 1000);
          this.emit();
        }
      });

      this.hls.on(Hls.Events.FRAG_CHANGED, (_: unknown, data: any) => {
        if (data?.frag) {
          this.currentSegment = data.frag.sn ?? 0;
          const lvl = this.hls?.levels?.[data.frag.level ?? this.hls.currentLevel];
          if (lvl?.bitrate) {
            this.currentBitrate = Math.round(lvl.bitrate / 1000);
          }
          this.emit();
        }
      });

      this.hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; details: string }) => {
        if (data.fatal) this.onError(data.details);
      });
      this.hls.loadSource(url);
      this.hls.attachMedia(el);
    } else {
      el.src = url;
    }
    if (autoPlay) await el.play().catch(() => {});
  }

  async play() { await this.el.play().catch(() => {}); }
  async pause() { this.el.pause(); }
  async seek(s: number) { this.el.currentTime = Math.max(0, s); }
  setVolume(v: number) { this.el.volume = Math.max(0, Math.min(1, v)); }
  async setRate(rate: number) { this.el.playbackRate = rate; }
  async getPosition() { return this.loaded ? this.el.currentTime : null; }
  isLoaded() { return this.loaded; }

  async unload() {
    this.loaded = false;
    this.currentBitrate = 0;
    this.currentSegment = 0;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

class NativeDeck implements Deck {
  private player: AudioPlayer | null = null;
  private sub: { remove: () => void } | null = null;
  private token = 0;
  private ready = false;     // AVPlayer/ExoPlayer đã nạp xong phần đầu (tua được chính xác)
  private wantPlay = false;  // người dùng/engine muốn phát — áp dụng ngay khi sẵn sàng
  private startAt = 0;
  private begun = false;     // đã bắt đầu tua/phát lần đầu cho bài này
  private failed = 0;        // token của lần nạp đã báo lỗi (chỉ báo một lần)
  private readyWaiter: (() => void) | null = null;
  onStatus: (s: DeckStatus) => void = () => {};
  onError: (reason: string) => void = () => {};

  canFade() { return true; }

  // Gắn player vào deck NGAY (bấm phát/dừng lúc đang nạp vẫn có tác dụng), còn tua tới `startAt`
  // và bắt đầu phát thì đợi lần trạng thái "đã nạp" đầu tiên: tua trước lúc đó dễ bị bỏ qua và nghe
  // lọt vài phần trăm giây đầu bài trước khi nhảy. load() trả về khi đã sẵn sàng (tối đa 8 s) để nạp
  // sẵn bài kế / chồng tiếng biết deck chờ đã phát được ngay.
  async load(url: string, { autoPlay, startAt }: { autoPlay: boolean; startAt?: number }) {
    await this.unload();
    const token = ++this.token;
    this.ready = false;
    this.begun = false;
    this.wantPlay = autoPlay;
    this.startAt = startAt && startAt > 0 ? startAt : 0;
    try {
      const player = createAudioPlayer(url, { updateInterval: 100 });
      this.player = player;
      this.sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (token !== this.token) return;
        // Lỗi nạp/phát (mất mạng, token hết hạn → 401, file hỏng): báo lên để engine xin token mới
        // và nạp lại (store: audioEngine.onError). Trước đây bị bỏ qua vì chưa isLoaded.
        if (status.error) {
          this.fail(token, status.error);
          return;
        }
        if (!status.isLoaded) return;
        if (!this.begun) {
          this.begun = true;
          this.begin(player, token).catch(() => {});
        }
        this.onStatus({
          isPlaying: status.playing,
          isBuffering: status.isBuffering,
          position: status.currentTime || 0,
          duration: status.duration || 0,
          didFinish: !!status.didJustFinish,
        });
      });
    } catch (e: any) {
      this.onError(e?.message || 'Lỗi phát âm thanh');
      return;
    }
    await new Promise<void>((resolve) => {
      this.readyWaiter = resolve;
      setTimeout(resolve, 8000);
    });
    if (token === this.token && !this.ready) this.fail(token, 'load timeout'); // 8 s vẫn chưa nạp được
  }

  // Báo lỗi một lần cho lần nạp này rồi thôi chờ.
  private fail(token: number, reason: string) {
    if (token !== this.token || this.failed === token) return;
    this.failed = token;
    this.readyWaiter?.();
    this.readyWaiter = null;
    this.onError(reason);
  }

  private async begin(player: AudioPlayer, token: number) {
    if (this.startAt) await player.seekTo(this.startAt).catch(() => {});
    if (token !== this.token) return;
    this.ready = true;
    if (this.wantPlay) player.play();
    this.readyWaiter?.();
    this.readyWaiter = null;
  }

  async play() {
    this.wantPlay = true;
    if (this.ready) this.player?.play();
  }

  async pause() {
    this.wantPlay = false;
    this.player?.pause();
  }

  async seek(s: number) {
    const to = Math.max(0, s);
    if (!this.ready) this.startAt = to; // chưa nạp xong: đổi điểm bắt đầu thay vì tua
    else await this.player?.seekTo(to).catch(() => {});
  }

  setVolume(v: number) {
    if (this.player) {
      this.player.volume = Math.max(0, Math.min(1, v));
    }
  }

  async setRate(rate: number) {
    this.player?.setPlaybackRate(rate);
  }

  async getPosition() {
    return this.player && this.ready ? this.player.currentTime : null;
  }

  isLoaded() {
    return !!this.player;
  }

  async unload() {
    this.token++;
    this.readyWaiter?.(); // lần nạp dở không treo người đang chờ
    this.readyWaiter = null;
    this.ready = false;
    this.begun = false;
    this.wantPlay = false;
    this.sub?.remove();
    this.sub = null;
    const p = this.player;
    this.player = null;
    p?.remove();
  }
}

export const createDeck = (): Deck & { unlock?: () => void } => (Platform.OS === 'web' ? new WebDeck() : new NativeDeck());
