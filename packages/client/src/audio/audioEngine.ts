import { Platform } from 'react-native';
import { createDeck, Deck, DeckStatus } from './deck';

export type PlaybackStatus = DeckStatus;

type StatusListener = (status: PlaybackStatus) => void;
type ErrorListener = (reason: string) => void;

// Metrics can only be measured by the client: the server does not know how long the listener has to wait
// The sound just came out, or the music cut out a few times in the middle. This is the benchmark for before/after comparison
// When applying Source-Aware ABR (bytes are transmitted, the backend will automatically count them in streamSong).
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
    // The first time it actually makes a sound - what the user feels is "how long it takes to hear it".
    if (!this.firstSoundAt && st.isPlaying && st.position > 0) this.firstSoundAt = Date.now();
    // No sound in the middle: only counted when playback has been completed (first load is in startupMs).
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
      // Before the sound can be heard, startup = 0, meaning the user quits before hearing it.
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

// One-instance player shared by the entire app, including TWO decks: `active` playing, `standby` pre-loaded
// the next song (preload) to move to the next song without silence - gapless or overlapping
// (crossfade, cos/sine isopower curve so that the total loudness is not lost in the middle).
// The actual volume of a deck = user volume × song volume factor × fade factor.
// The "when to transfer, how long to transfer" plan is located in utils/audio/transitionPlan.ts; store decides
// call anytime (store/useStore.ts — Transitioner).
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
        if (i !== this.activeIdx) return; // Decks waiting/turning off are not reported on the UI
        this.telemetry.observe(st);
        this.listener?.(st);
      };
      deck.onError = (reason) => {
        if (i !== this.activeIdx) {
          // Failed preload: discard, when the card runs out, it will be loaded normally.
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
  // Mid-stream error (no life, 401 because token expired) — store asks for new token and reloads (HM-13).
  onError(listener: ErrorListener) { this.errorListener = listener; }
  // Finalize the data of the song you just listened to. Call before changing songs or when stopping completely.
  takeTelemetry() { return this.telemetry.take(); }

  // End the unfinished audio at once (user rewinds, pauses, changes tracks...).
  private endFade() { this.fade?.finish(); }

  async load(url: string, autoPlay = true, opts: { startAt?: number; gain?: number; hlsToken?: string | null } = {}) {
    this.endFade();
    this.telemetry.reset();
    this.gains[this.activeIdx] = opts.gain ?? 1;
    // The user's click leads here → takes advantage of unlocking the other deck for automatic card transfer.
    if (autoPlay) this.standby.unlock?.();
    this.dropStandby();
    this.apply(this.activeIdx);
    await this.active.load(url, { autoPlay, startAt: opts.startAt, hlsToken: opts.hlsToken });
    this.apply(this.activeIdx);
  }

  // Load the next card into the waiting deck, stop at `startAt`. `key` lets the store know which song has been loaded.
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

  // iOS browser locks volume of <audio> → cannot fade; then switch straight (still can remove silence).
  canFade() { return this.active.canFade(); }

  // Select speaker/player (AirPlay) — only Safari has a real selector; elsewhere this button does not appear.
  canPickOutput() {
    return Platform.OS === 'web' && typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;
  }
  pickOutput() { this.active.pickOutput?.(); }

  // Switch to the preloaded song: the waiting deck plays, the old deck fades out in `fadeMs`, then two decks
  // change roles. Returns the data of the last post for the store to send.
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
    this.activeIdx = inIdx; // From now on UI follows the new post

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
    const step = Platform.OS === 'web' ? 30 : 60; // native: each setVolume passes through the bridge
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

  // Diagnosis (test): the roles of the two decks now.
  debugState() { return { activeIdx: this.activeIdx, standbyKey: this.standbyKey, fading: !!this.fade, gains: [...this.gains] }; }

  async play() { await this.active.play(); }

  async pause() {
    this.endFade();
    await this.active.pause();
  }

  // Actual broadcast position during call (seconds) — shared listening room used to measure deviation from room clock.
  async getPosition() { return this.active.getPosition(); }

  // Play rate (pitch hold) — shared listening room used to keep up with the room clock without having to rewind.
  async setRate(rate: number) { await this.active.setRate(rate); }

  async seek(seconds: number) {
    this.endFade();
    await this.active.seek(seconds);
  }

  async setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.fade) this.apply(this.activeIdx); // While fading, the next fade beat automatically applies a new level
  }

  // Sound Check coefficient of the currently playing song.
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
