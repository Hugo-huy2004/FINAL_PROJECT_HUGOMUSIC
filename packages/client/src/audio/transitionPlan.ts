// Plan to move from the currently playing song to the next song — PURE logic (no contact with the player/store) to
// Can be checked with scripts/check-transition-plan.mjs. Input data comes from Song.transition
// (apps/server/src/pipeline/analyzers/transition_analyze.py).
//
// gapless — immediately connect the end of the real music (remove the last silence), overlap 120 ms to remove the "click" sound
// crossfade — two songs overlap N seconds, ending right when the first song stops real music
// automix — light DJ style: input at the outro (when the music starts to fade out), fade length calculated accordingly
// bar (4 beats), the starting point falls on the right beat, the next song falls on its first beat.
// Don't stretch the tempo - if two songs have a lot of tempo difference, fade it shorter to avoid being "out of tune".
// Not enough span data → back to crossfade.
// Two consecutive songs on the same album are always connected seamlessly (Apple also does not crossfade albums seamlessly).
// Do not import anything — Node runs this file directly when testing.

export type TransitionInfo = {
  trimStart?: number; trimEnd?: number; introEnd?: number; outroStart?: number;
  lufs?: number; bpm?: number; beatOffset?: number; beatConfidence?: number;
};
export type TrackInfo = { duration?: number; transition?: TransitionInfo; albumKey?: string };
export type TransitionMode = 'gapless' | 'crossfade' | 'automix';
export type Plan = {
  at: number;        // seconds on current post: at the start of transfer
  fadeMs: number;    // The time the two articles overlap
  nextStart: number; // The next song starts playing from this second (skip the beginning silence / enter the correct beat)
  kind: 'gapless' | 'crossfade' | 'beatmatch';
};

export const TARGET_LUFS = -16;   // near Apple's Sound Check; Bigger cards are downgraded to this level
const DEFAULT_LUFS = -12;         // Unanalyzed articles: considered the typical size of the warehouse
const GAPLESS_MS = 120;
const MIN_CONFIDENCE = 0.2;       // Minimum rhythm reliability for keeping the beat
const MAX_TEMPO_DRIFT = 0.06;     // Tempo difference > 6% will fade for only 1 bar

// Volume coefficient so that all songs have the same perceived loudness. LOW index (≤ 1): element <audio>/expo-av
// Do not amplify more than 1, and amplify small songs that can easily break the sound.
export function gainFor(t?: TransitionInfo): number {
  const lufs = t?.lufs ?? DEFAULT_LUFS;
  return Math.max(0.1, Math.min(1, Math.pow(10, (TARGET_LUFS - lufs) / 20)));
}

export const startOf = (t?: TransitionInfo) => t?.trimStart ?? 0;
const endOf = (track: TrackInfo) => track.transition?.trimEnd ?? track.duration ?? 0;
const beatOf = (t?: TransitionInfo) =>
  t?.bpm && t.beatConfidence !== undefined && t.beatConfidence >= MIN_CONFIDENCE && t.beatOffset !== undefined
    ? { period: 60 / t.bpm, offset: t.beatOffset, bpm: t.bpm }
    : null;

export function planTransition(cur: TrackInfo, next: TrackInfo, mode: TransitionMode, fadeSeconds: number): Plan {
  const end = endOf(cur);
  const begin = startOf(cur.transition);
  const nextStart = startOf(next.transition);
  // The song is too short: the fade cannot take up more than 1/3 of the part with music.
  const room = Math.max(0, (end - begin) / 3);

  if (mode === 'gapless' || (cur.albumKey && cur.albumKey === next.albumKey) || room < 1) {
    return { at: Math.max(begin, end - GAPLESS_MS / 1000), fadeMs: GAPLESS_MS, nextStart, kind: 'gapless' };
  }

  const crossfade = (): Plan => {
    const fade = Math.min(fadeSeconds, room);
    return { at: end - fade, fadeMs: Math.round(fade * 1000), nextStart, kind: 'crossfade' };
  };
  if (mode === 'crossfade') return crossfade();

  // --- automix ---
  const a = beatOf(cur.transition);
  if (!a) return crossfade();
  const b = beatOf(next.transition);
  // Double/half the tempo still matches the beat (69 and 138 BPM are the same circuit) — take the smallest deviation.
  const drift = b ? Math.min(...[0.5, 1, 2].map((k) => Math.abs(b.bpm * k - a.bpm) / a.bpm)) : 1;
  const bar = 4 * a.period;
  // Number of bars: nearest ~8 s, minimum 1 bar; If the tempo is too different, it's only 1 box.
  let bars = drift > MAX_TEMPO_DRIFT ? 1 : Math.max(1, Math.round(8 / bar));
  while (bars > 1 && bars * bar > room) bars -= 1;
  const fade = Math.min(bars * bar, room);
  // Enter the outro if the song has a clear fade-out (2–20 seconds), otherwise end right at the end of the music.
  const outro = cur.transition?.outroStart;
  const target = outro !== undefined && end - outro >= 2 && end - outro <= 20 ? Math.min(outro, end - fade) : end - fade;
  // Fall to the nearest beat before the target (do not drag the fade beyond the end of the music).
  const k = Math.floor((target - a.offset) / a.period);
  const at = Math.max(begin, a.offset + k * a.period);
  return {
    at,
    fadeMs: Math.round(fade * 1000),
    nextStart: b ? b.offset : nextStart, // The next song is on the first beat (first beat is ≥ trimStart)
    kind: 'beatmatch',
  };
}
