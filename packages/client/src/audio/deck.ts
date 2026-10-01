import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

if (Platform.OS !== 'web') {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}

// A "deck" = an independent stream (like a DJ turntable). AudioEngine holds TWO decks to
// pre-load the next track and overlay the sound when switching tracks (utils/audioEngine.ts).
// WebDeck — private <audio> tag; HLS via native hls.js (Chrome/Firefox doesn't play .m3u8),
// Safari plays native HLS.
// NativeDeck — expo-audio AudioPlayer (iOS AVPlayer / Android ExoPlayer, both play native HLS).
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
  // The iOS browser locks the volume attribute of <audio> (always 1) → cannot fade with volume.
  canFade(): boolean;
  // Open the system's playback device selector (AirPlay on Safari). If this function is not supported, this function is not available.
  pickOutput?(): void;
  onStatus: (s: DeckStatus) => void;
  onError: (reason: string) => void;
}

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);
// ~0.05 s silence: plays once during a user tap to "unlock" the upper <audio> tag
// Safari — unlocked cards can be played automatically later (there is no touch when switching cards).
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
    // Safari generates native HLS: errors (e.g. 401 when token expires) are exposed only through this event.
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
      // Set position as soon as metadata is available (with HLS, before loading the first paragraph → don't load the cutout).
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
        // hls.js resolves the RELATIVE segment URL by category, so it loses the query token — reattaches it
        // each request (token signed by home directory prefix so).
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
  private ready = false;     // AVPlayer/ExoPlayer has finished loading the first part (rewinds correctly)
  private wantPlay = false;  // user/engine wants to play — apply as soon as ready
  private startAt = 0;
  private begun = false;     // started rewind/play for the first time for this song
  private failed = 0;        // Token of failed load (once indicated)
  private readyWaiter: (() => void) | null = null;
  onStatus: (s: DeckStatus) => void = () => {};
  onError: (reason: string) => void = () => {};

  canFade() { return true; }

  // Attach the player to the deck NOW (pressing play/pause while loading still works), but fast forward to `startAt`
  // and start playing, wait for the first "loaded" status: rewind before then it's easy to skip and listen
  // last a few hundredths of a second at the beginning of the song before jumping. load() returns when ready (up to 8 s) to load
  // Have the next song ready / stack the sound so you know the waiting deck can be played immediately.
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
        // Loading/transmitting error (lost life, expired token → 401, corrupted file): report to the engine to ask for a new token
        // and reload (store: audioEngine.onError). Previously ignored because it was not isLoaded.
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
    if (token === this.token && !this.ready) this.fail(token, 'load timeout'); // 8 s still not loaded
  }

  // Report the error once for this load and then stop waiting.
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
    if (!this.ready) this.startAt = to; // not loaded yet: change start point instead of rewind
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
    this.readyWaiter?.(); // Bad reloads don't hang up while waiting
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
