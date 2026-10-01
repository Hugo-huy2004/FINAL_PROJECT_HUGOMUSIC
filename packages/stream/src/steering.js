// Client-side multi-CDN steering. The server hands out signed URLs of the same song on every CDN; only the
// client can measure its own network path to each, so the client ranks them:
//
//   - Passive measurement: time from load to first sound of every play, smoothed per CDN (EWMA).
//   - Active measurement: `claimProbe` allows one tiny request per CDN per period, so the CDNs ranked
//     lower keep fresh numbers instead of stale ones.
//   - Exploration: `explore` of the time the top two swap places (epsilon-greedy), in case the leader is
//     only "fast" because of an old sample.
//   - Circuit breaker: a failing CDN is skipped for `openBaseMs`, doubling on every repeat failure up to
//     `openMaxMs`; while open it is used only when every other path has failed too.
//
// Final order: healthy CDNs (fast → slow) → origin (your own server, independent of every CDN) → tripped CDNs.

/** @typedef {{ ewmaMs: number, samples: number, fails: number, openUntil: number, lastProbe: number }} CdnStat */

/** Name of your own origin server in a ranking. */
export const ORIGIN = 'origin';

/**
 * @param {{ now?: () => number, rand?: () => number, alpha?: number, explore?: number,
 *   openBaseMs?: number, openMaxMs?: number, probeEveryMs?: number }} [opts]
 */
export function createSteering({
  now = () => Date.now(), rand = Math.random, alpha = 0.3, explore = 0.1,
  openBaseMs = 30_000, openMaxMs = 600_000, probeEveryMs = 300_000,
} = {}) {
  /** @type {Map<string, CdnStat>} */
  const stats = new Map();
  /** @param {string} name */
  const stat = (name) => {
    let s = stats.get(name);
    if (!s) stats.set(name, (s = { ewmaMs: 0, samples: 0, fails: 0, openUntil: 0, lastProbe: 0 }));
    return s;
  };
  /** @param {string} name */
  const isOpen = (name) => stat(name).openUntil > now();

  /**
   * Order CDN names (given in the server's preference order) plus ORIGIN, best first.
   * @param {string[]} names
   * @returns {string[]}
   */
  function rank(names) {
    const healthy = names.filter((n) => !isOpen(n));
    // An unmeasured CDN scores 0 ms so it gets tried; ties keep the server's order (stable sort).
    /** @param {string} n */
    const score = (n) => (stat(n).samples ? stat(n).ewmaMs : 0);
    healthy.sort((a, b) => score(a) - score(b));
    if (healthy.length > 1 && rand() < explore) [healthy[0], healthy[1]] = [healthy[1], healthy[0]];
    const tripped = names.filter(isOpen).sort((a, b) => stat(a).openUntil - stat(b).openUntil);
    return isOpen(ORIGIN) ? [...healthy, ...tripped, ORIGIN] : [...healthy, ORIGIN, ...tripped];
  }

  /** Record a successful play (or probe) that took `ms`; closes the circuit. @param {string} name @param {number} ms */
  function success(name, ms) {
    const s = stat(name);
    s.ewmaMs = s.samples ? s.ewmaMs * (1 - alpha) + ms * alpha : ms;
    s.samples += 1;
    s.fails = 0;
    s.openUntil = 0;
  }

  /** Record a failure; opens the circuit for an exponentially growing time. @param {string} name */
  function failure(name) {
    const s = stat(name);
    s.fails += 1;
    s.openUntil = now() + Math.min(openMaxMs, openBaseMs * 2 ** (s.fails - 1));
  }

  /** Whether to probe this CDN now (and mark it probed). @param {string} name */
  function claimProbe(name) {
    const s = stat(name);
    if (isOpen(name) || now() - s.lastProbe < probeEveryMs) return false;
    s.lastProbe = now();
    return true;
  }

  /** @returns {Record<string, CdnStat & { open: boolean }>} */
  const snapshot = () => Object.fromEntries([...stats].map(([k, v]) => [k, { ...v, open: v.openUntil > now() }]));

  return { rank, success, failure, claimProbe, snapshot, isOpen };
}
