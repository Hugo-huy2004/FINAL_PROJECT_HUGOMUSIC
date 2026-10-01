// Keeping many devices on ONE shared timeline: a server clock every device agrees on, and a controller that
// decides, every SYNC.PERIOD_MS, whether to seek or how fast to play. Pure math, no player — so it is simulated
// in checks/sync.check.mjs.
//
// Promise: the first HLS segment (4 s) may drift; from the second one every device stays within 20 ms.
//  - Catch-up: drift above SEEK_ABOVE_S → seek; smaller → change speed up to ±FAST_MAX to close it within HORIZON_S.
//  - Lock: drift below LOCK_S → only ±LOCK_MAX (pitch kept, practically inaudible); below DEADBAND_S → speed 1.
// Measurements are lightly smoothed so one noisy position reading does not trigger a wrong correction.

export const SYNC = {
  PERIOD_MS: 250,
  SEEK_ABOVE_S: 0.35,
  LOCK_S: 0.03,
  DEADBAND_S: 0.005,
  FAST_MAX: 0.1,
  LOCK_MAX: 0.02,
  HORIZON_S: 1,
  SMOOTH: 0.5, // weight of the newest measurement
};

/** @typedef {{ filtered: number | null }} SyncCtl */
/** @typedef {{ seek: true } | { seek: false, rate: number }} SyncAction */

/** @returns {SyncCtl} */
export const newSyncCtl = () => ({ filtered: null });

/**
 * One control step.
 * @param {SyncCtl} ctl state kept between steps (one per device)
 * @param {number} drift seconds this device is AHEAD of the shared timeline (negative = behind)
 * @returns {SyncAction}
 */
export function controlStep(ctl, drift) {
  if (Math.abs(drift) > SYNC.SEEK_ABOVE_S) {
    ctl.filtered = null;
    return { seek: true };
  }
  const f = ctl.filtered === null ? drift : ctl.filtered * (1 - SYNC.SMOOTH) + drift * SYNC.SMOOTH;
  ctl.filtered = f;
  if (Math.abs(f) < SYNC.DEADBAND_S) return { seek: false, rate: 1 };
  const cap = Math.abs(f) < SYNC.LOCK_S ? SYNC.LOCK_MAX : SYNC.FAST_MAX;
  return { seek: false, rate: 1 + Math.max(-cap, Math.min(cap, -f / SYNC.HORIZON_S)) };
}

/**
 * Server clock by Cristian's algorithm: ask the server for its time; offset = server + RTT/2 − local receive time.
 * Of several samples the one with the smallest RTT wins — it waited least in network queues (error ≤ ±RTT/2).
 * @param {() => Promise<number | null>} ping resolves the server's time in ms, or null when the ping failed
 * @param {{ now?: () => number }} [opts] local clock (tests)
 */
export function createServerClock(ping, { now = () => Date.now() } = {}) {
  let offsetMs = 0;
  return {
    /** Current server time in ms. */
    now: () => now() + offsetMs,
    /** Re-measure the offset from `samples` pings. @param {number} [samples] */
    async sync(samples = 8) {
      let best = Infinity;
      for (let i = 0; i < samples; i++) {
        const sent = now();
        const server = await ping();
        const received = now();
        if (server == null || received - sent >= best) continue;
        best = received - sent;
        offsetMs = server + best / 2 - received;
      }
    },
  };
}
