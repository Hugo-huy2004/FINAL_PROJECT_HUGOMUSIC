import { useEffect, useState } from 'react';
import { api } from '../api/api';
import type { Song } from '../store/useStore';

// The "latest" order is based on the actual TIMESTAMP (createdAt), not based on the order the API returns.
export const newestFirst = (a: Song, b: Song) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
export const byNewest = (list: Song[]) => [...list].sort(newestFirst);

// Chart — Hugo listens (≥ 30 s or complete) mixed with global popularity
// (apps/server/src/modules/metrics/controller.js getTopSongs, apps/server/src/ranking/score.js).
export type TopEntry = { rank: number; song: Song; plays: number; listeners: number; globalPlays: number; score: number };

// Each (range, quantity) loads only once per session; When I go back to the viewed interval, it's there immediately, no white flashing.
// Implicit refresh after MAX_AGE_MS so the metric remains "alive".
const MAX_AGE_MS = 60_000;
const cache = new Map<string, { at: number; top: TopEntry[] }>();

export function useTopSongs(days: number, limit = 50, group?: string) {
  const key = `${days}:${limit}:${group ?? 'all'}`;
  const [state, setState] = useState<{ key: string; top: TopEntry[] } | null>(() => (cache.has(key) ? { key, top: cache.get(key)!.top } : null));
  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) setState({ key, top: hit.top });
    if (hit && Date.now() - hit.at < MAX_AGE_MS) return;
    api.getTopSongs(days, limit, group)
      .then((r: { top: TopEntry[] }) => {
        cache.set(key, { at: Date.now(), top: r.top });
        if (alive) setState({ key, top: r.top });
      })
      .catch(() => alive && !hit && setState({ key, top: [] }));
    return () => { alive = false; };
  }, [key]);
  // Loading NEW space: still returns the old list (so the interface transitions smoothly), with a loading flag.
  return { top: state?.top ?? [], loading: state?.key !== key, ready: state !== null };
}
