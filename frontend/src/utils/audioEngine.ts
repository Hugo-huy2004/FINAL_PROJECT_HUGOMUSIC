import { Platform } from 'react-native';
import { createDeck, Deck, DeckStatus } from './audio/deck';

export type PlaybackStatus = DeckStatus;

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

class Telemetry {
  loadStartedAt = 0;
  firstSoundAt = 0;
  rebufferCount = 0;
  rebufferMs = 0;
  bufferingSince = 0;
  lastPositionMs = 0;
  completed = false;

  reset() {
    Object.assign(this, { loadStartedAt: Date.now(), firstSoundAt: 0, rebufferCount: 0, rebufferMs: 0, bufferingSince: 0, lastPositionMs: 0, completed: false });
  }

  observe(st: DeckStatus) {
    // Lần đầu thực sự ra tiếng — cái người dùng cảm nhận là "bấm bao lâu thì nghe được".
    if (!this.firstSoundAt && st.isPlaying && st.position > 0) this.firstSoundAt = Date.now();
    // Đứt tiếng giữa chừng: chỉ tính khi đã phát được rồi (lần nạp đầu nằm trong startupMs).
    if (st.isBuffering && this.firstSoundAt && !this.bufferingSince) {
      this.bufferingSince = Date.now();
      this.rebufferCount += 1;
    } else if (!st.isBuffering && this.bufferingSince) {
      this.rebufferMs += Date.now() - this.bufferingSince;
      this.bufferingSince = 0;
    }
    this.lastPositionMs = st.position * 1000;
    if (st.didFinish) this.completed = true;
  }

  take(): PlaybackTelemetry | null {
    if (!this.loadStartedAt) return null;
    const t = {
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
}

// Máy phát một-thể-hiện dùng chung cả app, gồm HAI deck: `active` đang phát, `standby` nạp sẵn
// bài kế (preload) để chuyển bài không khoảng lặng — nối liền (gapless) hoặc chồng tiếng
// (crossfade, đường cong đẳng công suất cos/sin để tổng độ to không bị hụt ở giữa).
// Âm lượng thật của một deck = âm lượng người dùng × hệ số cân âm lượng của bài × hệ số fade.
// Kế hoạch "khi nào chuyển, chồng bao lâu" nằm ở utils/audio/transitionPlan.ts; store quyết định
// gọi lúc nào (store/useStore.ts — Transitioner).
class AudioEngine {
  private decks: [Deck & { unlock?: () => void }, Deck & { unlock?: () => void }] = [createDeck(), createDeck()];
  private activeIdx = 0;
  private gains = [1, 1];
  private volume = 1;
  private telemetry = new Telemetry();
  private listener: StatusListener | null = null;
  private errorListener: ErrorListener | null = null;
  private standbyKey: string | null = null;
  private fade: { timer: ReturnType<typeof setTimeout> | null; finish: () => void } | null = null;

  constructor() {
    this.decks.forEach((deck, i) => {
      deck.onStatus = (st) => {
        if (i !== this.activeIdx) return; // deck đang chờ/đang tắt dần không được báo lên UI
        this.telemetry.observe(st);
        this.listener?.(st);
      };
      deck.onError = (reason) => {
        if (i !== this.activeIdx) {
          // Nạp sẵn hỏng: bỏ, lúc hết bài sẽ nạp thường.
          if (this.standbyKey) this.standbyKey = null;
          return;
        }
        console.warn('Playback error:', reason);
        this.errorListener?.(reason);
      };
    });
  }

  private get active() { return this.decks[this.activeIdx]; }
  private get standby() { return this.decks[1 - this.activeIdx]; }
  private apply(i: number, fadeFactor = 1) { this.decks[i].setVolume(this.volume * this.gains[i] * fadeFactor); }

  onStatus(listener: StatusListener) { this.listener = listener; }
  // Lỗi giữa chừng (mất mạng, 401 vì token hết hạn) — store xin token mới và nạp lại (HM-13).
  onError(listener: ErrorListener) { this.errorListener = listener; }
  // Chốt số liệu của bài vừa nghe. Gọi trước khi chuyển bài hoặc khi dừng hẳn.
  takeTelemetry() { return this.telemetry.take(); }

  // Kết thúc ngay một lần chồng tiếng đang dở (người dùng tua, tạm dừng, đổi bài...).
  private endFade() { this.fade?.finish(); }

  async load(url: string, autoPlay = true, opts: { startAt?: number; gain?: number; hlsToken?: string | null } = {}) {
    this.endFade();
    this.telemetry.reset();
    this.gains[this.activeIdx] = opts.gain ?? 1;
    // Cú bấm của người dùng dẫn tới đây → tranh thủ mở khoá deck kia cho lần chuyển bài tự động.
    if (autoPlay) this.standby.unlock?.();
    this.dropStandby();
    this.apply(this.activeIdx);
    await this.active.load(url, { autoPlay, startAt: opts.startAt, hlsToken: opts.hlsToken });
    this.apply(this.activeIdx);
  }

  // Nạp sẵn bài kế vào deck chờ, dừng sẵn ở `startAt`. `key` để store biết đã nạp bài nào.
  async preload(url: string, key: string, opts: { startAt?: number; gain?: number; hlsToken?: string | null } = {}) {
    const i = 1 - this.activeIdx;
    this.standbyKey = null;
    this.gains[i] = opts.gain ?? 1;
    this.apply(i, 0);
    await this.decks[i].load(url, { autoPlay: false, startAt: opts.startAt, hlsToken: opts.hlsToken });
    this.apply(i, 0);
    this.standbyKey = key;
  }

  preloadedKey() { return this.standbyKey; }

  dropStandby() {
    this.standbyKey = null;
    this.standby.unload().catch(() => {});
  }

  // Trình duyệt iOS khoá volume của <audio> → không fade được; khi đó chuyển thẳng (vẫn bỏ được im lặng).
  canFade() { return this.active.canFade(); }

  // Chọn loa/thiết bị phát (AirPlay) — chỉ Safari có bộ chọn thật; nơi khác nút này không hiện.
  canPickOutput() {
    return Platform.OS === 'web' && typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;
  }
  pickOutput() { this.active.pickOutput?.(); }

  // Chuyển sang bài đã nạp sẵn: deck chờ phát lên, deck cũ tắt dần trong `fadeMs`, rồi hai deck
  // đổi vai. Trả về số liệu của bài vừa rời để store gửi đi.
  async crossfade(fadeMs: number): Promise<PlaybackTelemetry | null> {
    if (!this.standbyKey) return null;
    this.endFade();
    const outIdx = this.activeIdx;
    const inIdx = 1 - outIdx;
    const outgoing = this.decks[outIdx];
    const incoming = this.decks[inIdx];
    const report = this.telemetry.take();
    this.telemetry.reset();
    this.standbyKey = null;
    this.activeIdx = inIdx; // từ giờ UI theo bài mới

    const smooth = fadeMs > 0 && this.canFade();
    this.apply(inIdx, smooth ? 0 : 1);
    await incoming.play();

    const started = Date.now();
    const finish = () => {
      if (!this.fade) return;
      if (this.fade.timer) clearTimeout(this.fade.timer);
      this.fade = null;
      this.apply(inIdx, 1);
      outgoing.unload().catch(() => {});
    };
    this.fade = { timer: null, finish };
    if (!smooth) {
      finish();
      return report;
    }
    const step = Platform.OS === 'web' ? 30 : 60; // native: mỗi setVolume đi qua bridge
    const tick = () => {
      if (!this.fade) return;
      const p = Math.min(1, (Date.now() - started) / fadeMs);
      this.apply(outIdx, Math.cos((p * Math.PI) / 2));
      this.apply(inIdx, Math.sin((p * Math.PI) / 2));
      if (p >= 1) finish();
      else this.fade.timer = setTimeout(tick, step);
    };
    tick();
    return report;
  }

  hasSound() { return this.active.isLoaded(); }

  // Chẩn đoán (kiểm thử): vai của hai deck lúc này.
  debugState() { return { activeIdx: this.activeIdx, standbyKey: this.standbyKey, fading: !!this.fade, gains: [...this.gains] }; }

  async play() { await this.active.play(); }

  async pause() {
    this.endFade();
    await this.active.pause();
  }

  // Vị trí phát thật lúc gọi (giây) — phòng nghe chung dùng để đo độ lệch với đồng hồ phòng.
  async getPosition() { return this.active.getPosition(); }

  // Tốc độ phát (giữ cao độ) — phòng nghe chung dùng để bắt kịp đồng hồ phòng mà không phải tua.
  async setRate(rate: number) { await this.active.setRate(rate); }

  async seek(seconds: number) {
    this.endFade();
    await this.active.seek(seconds);
  }

  async setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.fade) this.apply(this.activeIdx); // đang fade thì nhịp fade kế tiếp tự áp mức mới
  }

  // Hệ số cân âm lượng (Sound Check) của bài đang phát.
  setGain(gain: number) {
    this.gains[this.activeIdx] = gain;
    if (!this.fade) this.apply(this.activeIdx);
  }

  async unload() {
    this.endFade();
    this.standbyKey = null;
    await Promise.all(this.decks.map((d) => d.unload()));
  }
}

export const audioEngine = new AudioEngine();
