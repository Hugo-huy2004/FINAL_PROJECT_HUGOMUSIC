import { Audio, AVPlaybackStatus } from 'expo-av';
import {
  isWeb, isHlsUrl, loadHlsWeb, destroyHlsWeb, getWebAudioEl,
} from './hlsWebPlayer';

export type PlaybackStatus = {
  isPlaying: boolean;
  isBuffering: boolean;
  position: number; // seconds
  duration: number; // seconds
  didFinish: boolean;
};

type StatusListener = (status: PlaybackStatus) => void;
type ErrorListener = (reason: string) => void;

// Số liệu chỉ client mới đo được: server không biết người nghe phải chờ bao lâu
// mới ra tiếng, hay nhạc đứt mấy lần giữa chừng. Đây là mốc để so sánh trước/sau
// khi áp Source-Aware ABR (byte truyền đi thì backend đã tự đếm ở streamSong).
export type PlaybackTelemetry = {
  startupMs: number;
  rebufferCount: number;
  rebufferMs: number;
  playedMs: number;
  completed: boolean;
};

// Thin singleton wrapper around expo-av's Audio.Sound. Keeping it outside React/zustand
// means there's exactly one native player instance no matter how many components render.
class AudioEngine {
  private sound: Audio.Sound | null = null;
  private listener: StatusListener | null = null;
  private errorListener: ErrorListener | null = null;

  // --- đo đạc cho bài hiện tại ---
  private loadStartedAt = 0;
  private firstSoundAt = 0;
  private rebufferCount = 0;
  private rebufferMs = 0;
  private bufferingSince = 0;
  private lastPositionMs = 0;
  private completed = false;

  onStatus(listener: StatusListener) {
    this.listener = listener;
  }

  // Lỗi giữa chừng khi phát (mất mạng, hoặc 401 vì token phát hết hạn). Store bắt
  // lỗi này để xin token mới và nạp lại đúng vị trí — xem HM-13.
  onError(listener: ErrorListener) {
    this.errorListener = listener;
  }

  private resetTelemetry() {
    this.loadStartedAt = Date.now();
    this.firstSoundAt = 0;
    this.rebufferCount = 0;
    this.rebufferMs = 0;
    this.bufferingSince = 0;
    this.lastPositionMs = 0;
    this.completed = false;
  }

  // Chốt số liệu của bài vừa nghe. Gọi trước khi chuyển bài hoặc khi dừng hẳn.
  takeTelemetry(): PlaybackTelemetry | null {
    if (!this.loadStartedAt) return null;
    const t: PlaybackTelemetry = {
      // Chưa kịp ra tiếng thì startup = 0, nghĩa là user bỏ trước khi nghe được.
      startupMs: this.firstSoundAt ? this.firstSoundAt - this.loadStartedAt : 0,
      rebufferCount: this.rebufferCount,
      rebufferMs: this.rebufferMs,
      playedMs: this.lastPositionMs,
      completed: this.completed,
    };
    this.loadStartedAt = 0;
    return t;
  }

  private handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ('error' in status && status.error) {
        console.warn('Playback error:', status.error);
        this.errorListener?.(status.error);
      }
      return;
    }

    // Lần đầu thực sự phát ra tiếng — đây mới là cái người dùng cảm nhận là
    // "bấm play bao lâu thì nghe được", không phải lúc tải xong metadata.
    if (!this.firstSoundAt && status.isPlaying && (status.positionMillis ?? 0) > 0) {
      this.firstSoundAt = Date.now();
    }

    // Đứt tiếng giữa chừng: chỉ tính khi đã phát được rồi, để không nhầm với
    // lần nạp đầu tiên (lần đó đã nằm trong startupMs).
    if (status.isBuffering && this.firstSoundAt && !this.bufferingSince) {
      this.bufferingSince = Date.now();
      this.rebufferCount += 1;
    } else if (!status.isBuffering && this.bufferingSince) {
      this.rebufferMs += Date.now() - this.bufferingSince;
      this.bufferingSince = 0;
    }

    this.lastPositionMs = status.positionMillis ?? 0;
    if (status.didJustFinish) this.completed = true;

    this.listener?.({
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
      position: (status.positionMillis ?? 0) / 1000,
      duration: (status.durationMillis ?? 0) / 1000,
      didFinish: !!status.didJustFinish,
    });
  };

  private loadToken = 0;
  private usingWebHls = false;

  async load(url: string, autoPlay = true, hlsToken: string | null = null) {
    const token = ++this.loadToken;
    this.resetTelemetry();

    // Don't await the previous sound's teardown: if it's still stuck mid-network-load
    // (a dead/blocked stream host), unloadAsync() never resolves and would hang every
    // future load() call forever. Best-effort unload in the background instead.
    if (this.sound) {
      this.sound.unloadAsync().catch(() => {});
      this.sound = null;
    }

    // Trên web, Chrome/Firefox không phát được .m3u8 qua thẻ <audio> — phải đi
    // đường hls.js riêng. iOS (AVPlayer) và Android (ExoPlayer) phát HLS gốc nên
    // vẫn dùng expo-av như thường.
    destroyHlsWeb();
    this.usingWebHls = false;
    if (isWeb() && isHlsUrl(url)) {
      await loadHlsWeb(url, autoPlay, hlsToken, (st) => {
        if (!this.firstSoundAt && st.isPlaying && st.position > 0) this.firstSoundAt = Date.now();
        if (st.isBuffering && this.firstSoundAt && !this.bufferingSince) {
          this.bufferingSince = Date.now();
          this.rebufferCount += 1;
        } else if (!st.isBuffering && this.bufferingSince) {
          this.rebufferMs += Date.now() - this.bufferingSince;
          this.bufferingSince = 0;
        }
        this.lastPositionMs = st.position * 1000;
        if (st.didFinish) this.completed = true;
        this.listener?.(st);
      }, (reason) => this.errorListener?.(reason));
      this.usingWebHls = true;
      return;
    }

    const { sound } = await Promise.race([
      Audio.Sound.createAsync({ uri: url }, { shouldPlay: autoPlay }, this.handleStatus),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Audio load timed out')), 15000)
      ),
    ]);

    if (token !== this.loadToken) {
      // A newer load() started while this one was in flight - drop this stale result.
      sound.unloadAsync().catch(() => {});
      return;
    }
    this.sound = sound;
  }

  hasSound(): boolean {
    return this.sound !== null || (this.usingWebHls && !!getWebAudioEl());
  }

  async play() {
    if (this.usingWebHls) { await getWebAudioEl()?.play(); return; }
    await this.sound?.playAsync();
  }

  async pause() {
    if (this.usingWebHls) { getWebAudioEl()?.pause(); return; }
    await this.sound?.pauseAsync();
  }

  async seek(seconds: number) {
    if (this.usingWebHls) {
      const el = getWebAudioEl();
      if (el) el.currentTime = Math.max(0, seconds);
      return;
    }
    if (!this.sound) return;
    try {
      await this.sound.setPositionAsync(Math.max(0, Math.round(seconds * 1000)));
    } catch (err) {
      console.warn('Seek error:', err);
    }
  }

  async setVolume(volume: number) {
    if (this.usingWebHls) {
      const el = getWebAudioEl();
      if (el) el.volume = Math.max(0, Math.min(1, volume));
      return;
    }
    if (!this.sound) return;
    try {
      await this.sound.setVolumeAsync(Math.max(0, Math.min(1, volume)));
    } catch (err) {
      console.warn('SetVolume error:', err);
    }
  }

  async unload() {
    destroyHlsWeb();
    this.usingWebHls = false;
    await this.sound?.unloadAsync();
    this.sound = null;
  }
}

export const audioEngine = new AudioEngine();
