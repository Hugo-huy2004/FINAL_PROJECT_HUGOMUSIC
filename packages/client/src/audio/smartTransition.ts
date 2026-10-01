/**
 * =============================================================================
 * SMART TRANSITION & DJ AUTOPLAY ENGINE
 * =============================================================================
 * WHAT IT DOES:
 *    - Calculates BPM tempo matching and harmonic transitions between songs.
 *    - Automatically picks the best next song when the play queue is empty (DJ Autoplay).
 *    - Provides 6 Equalizer presets (Flat, Bass Boost, Vocal, Electronic, Acoustic, Lofi).
 * 
 * WHO CALLS THIS FILE:
 *    - `shared/src/store/useStore.ts`: Preloads next track into Deck B at outro.
 *    - `shared/src/screens/Account/AccountScreen.tsx`: Toggles DJ mode & EQ presets.
 * =============================================================================
 */

import type { TransitionInfo } from './transitionPlan';

export interface SmartTrack {
  _id: string;
  title?: string;
  artist?: string;
  genre?: string;
  transition?: TransitionInfo;
}

export type EqualizerPreset =
  | 'flat'
  | 'bass_boost'
  | 'vocal_boost'
  | 'treble_boost'
  | 'electronic'
  | 'acoustic'
  | 'lofi';

export interface EqualizerGains {
  bass: number;   // -10dB to +10dB
  mid: number;    // -10dB to +10dB
  treble: number; // -10dB to +10dB
}

export const EQ_PRESETS: Record<EqualizerPreset, EqualizerGains> = {
  flat: { bass: 0, mid: 0, treble: 0 },
  bass_boost: { bass: 6, mid: 0, treble: -1 },
  vocal_boost: { bass: -2, mid: 5, treble: 1 },
  treble_boost: { bass: -1, mid: 1, treble: 6 },
  electronic: { bass: 5, mid: -1, treble: 4 },
  acoustic: { bass: 2, mid: 2, treble: 3 },
  lofi: { bass: 3, mid: -2, treble: -3 },
};

export interface TempoMatchResult {
  drift: number;
  relation: 'exact' | 'half' | 'double' | 'compatible' | 'drifted';
  score: number;
}

/**
 * Calculates tempo compatibility between two songs based on BPM.
 * Considers half-time (e.g. 70 vs 140 BPM) and double-time relationships.
 */
export function matchTempo(bpmA?: number, bpmB?: number): TempoMatchResult {
  if (!bpmA || !bpmB || bpmA <= 0 || bpmB <= 0) {
    return { drift: 1, relation: 'drifted', score: 10 };
  }

  // Exact or near-exact match (within 6%)
  const directDrift = Math.abs(bpmB - bpmA) / bpmA;
  if (directDrift <= 0.06) {
    return { drift: directDrift, relation: 'exact', score: 50 * (1 - directDrift / 0.06) };
  }

  // Double-time (e.g. A=75, B=150)
  const doubleDrift = Math.abs(bpmB - bpmA * 2) / (bpmA * 2);
  if (doubleDrift <= 0.06) {
    return { drift: doubleDrift, relation: 'double', score: 40 * (1 - doubleDrift / 0.06) };
  }

  // Half-time (e.g. A=140, B=70)
  const halfDrift = Math.abs(bpmB * 2 - bpmA) / bpmA;
  if (halfDrift <= 0.06) {
    return { drift: halfDrift, relation: 'half', score: 40 * (1 - halfDrift / 0.06) };
  }

  // Compatible within 15%
  if (directDrift <= 0.15) {
    return { drift: directDrift, relation: 'compatible', score: 25 * (1 - directDrift / 0.15) };
  }

  return { drift: directDrift, relation: 'drifted', score: 5 };
}

/**
 * DJ Recommendation Engine: Finds the next best song in the catalog
 * based on genre alignment, harmonic tempo matching (BPM), and recent playback history.
 */
export function findBestDJNextSong<T extends SmartTrack>(
  current: T,
  candidates: T[],
  recentSongIds: string[] = []
): T | null {
  if (!candidates || candidates.length === 0) return null;

  const recentSet = new Set(recentSongIds);
  recentSet.add(current._id);

  // Pool of unplayed candidates
  let pool = candidates.filter((s) => !recentSet.has(s._id));
  if (pool.length === 0) {
    // If all songs have been played, fall back to any song other than the current one
    pool = candidates.filter((s) => s._id !== current._id);
  }
  if (pool.length === 0) return null;

  const curBpm = current.transition?.bpm;
  const curGenre = current.genre?.toLowerCase().trim();
  const curArtist = current.artist?.toLowerCase().trim();

  let bestSong: T | null = null;
  let bestScore = -1;

  for (const song of pool) {
    let score = 0;

    // 1. Genre matching (+40 points)
    const candGenre = song.genre?.toLowerCase().trim();
    if (curGenre && candGenre) {
      if (curGenre === candGenre) {
        score += 40;
      } else if (curGenre.includes(candGenre) || candGenre.includes(curGenre)) {
        score += 25;
      }
    }

    // 2. Tempo & BPM Matching (up to +50 points)
    const tempoMatch = matchTempo(curBpm, song.transition?.bpm);
    score += tempoMatch.score;

    // 3. Outro / Beat Confidence bonus (+10 points)
    if (song.transition?.beatConfidence && song.transition.beatConfidence > 0.3) {
      score += 10;
    }

    // 4. Same Artist diversity penalty / balance
    const candArtist = song.artist?.toLowerCase().trim();
    if (curArtist && candArtist === curArtist) {
      score += 15; // Pleasant continuity, but not overwhelming
    }

    if (score > bestScore) {
      bestScore = score;
      bestSong = song;
    }
  }

  return bestSong || pool[0];
}
