// Backend selection — pure computation, no I/O, so every rule is unit-tested (checks/lb.check.js).
//
// Algorithms (pick one per pool to compare them under load):
//   random       baseline.
//   round-robin  one backend after another; counts requests, blind to how heavy each one is.
//   least-conn   the backend with the fewest requests in flight; good when durations differ wildly
//                (an audio stream held for minutes next to a JSON call of a few ms).
//   p2c-ewma     power of two choices + peak-EWMA latency: draw two backends at random, keep the one with the
//                lower latency × (in-flight + 1). Two comparisons are enough to get close to optimal, and a
//                backend that starts slowing down is avoided before it fails.
//
// Each pool has a mode: 'balance' (share the load) or 'failover' (always the first healthy backend in order —
// for a stateful tier whose state lives in one process).
//
// Two ways a bad backend is detected:
//   active   a health check polls the health path; `rise` passes bring it up, `fall` failures take it down.
//   passive  outlier ejection: `ejectAfter` consecutive errors eject it for ejectBaseMs, doubling on every
//            repeat up to ejectMaxMs.

const EWMA_ALPHA = 0.3;

function createBackend(addr) {
  const [host, port] = addr.split(':');
  return {
    addr, host, port: Number(port),
    up: true,            // set by the active health check; starts up so there is no 503 at boot
    hcOk: 0, hcFail: 0,  // consecutive health-check passes / failures
    inflight: 0,         // requests / connections in progress
    ewmaMs: 0,           // time to response headers (TTFB), peak EWMA
    errors: 0,           // consecutive connection errors (passive)
    ejections: 0, ejectedUntil: 0,
    requests: 0, failures: 0, // totals, for the stats endpoint
  };
}

function createPool(name, addrs, { mode = 'balance', algo = 'p2c-ewma', rise = 2, fall = 2, ejectAfter = 3, ejectBaseMs = 5000, ejectMaxMs = 60000, rand = Math.random } = {}) {
  return { name, mode, algo, rise, fall, ejectAfter, ejectBaseMs, ejectMaxMs, rand, rr: 0, backends: addrs.map(createBackend) };
}

const available = (pool, now) => pool.backends.filter((b) => b.up && b.ejectedUntil <= now);

// p2c-ewma score. An unmeasured backend (ewmaMs = 0) counts as fastest, so it gets tried.
const cost = (b) => (b.ewmaMs || 1) * (b.inflight + 1);

/** Pick a backend, skipping those in `exclude` (already tried for this request). null when none is available. */
function pick(pool, { exclude = new Set(), now = Date.now() } = {}) {
  const list = available(pool, now).filter((b) => !exclude.has(b));
  if (!list.length) return null;
  if (pool.mode === 'failover') return list[0];
  switch (pool.algo) {
    case 'random':
      return list[Math.floor(pool.rand() * list.length)];
    case 'round-robin':
      return list[pool.rr++ % list.length];
    case 'least-conn': {
      const min = Math.min(...list.map((b) => b.inflight));
      const ties = list.filter((b) => b.inflight === min);
      return ties[Math.floor(pool.rand() * ties.length)];
    }
    case 'p2c-ewma': {
      if (list.length === 1) return list[0];
      const i = Math.floor(pool.rand() * list.length);
      let j = Math.floor(pool.rand() * (list.length - 1));
      if (j >= i) j += 1; // two DIFFERENT backends
      return cost(list[i]) <= cost(list[j]) ? list[i] : list[j];
    }
    default:
      throw new Error(`Unknown algorithm: ${pool.algo}`);
  }
}

// Peak EWMA: a higher sample is taken at once (react fast when a backend slows down); a lower one decays slowly.
function recordLatency(b, ms) {
  b.ewmaMs = b.ewmaMs === 0 || ms > b.ewmaMs ? ms : b.ewmaMs * (1 - EWMA_ALPHA) + ms * EWMA_ALPHA;
}

function recordSuccess(b) {
  b.errors = 0;
}

/** A connection error or 502/503. Returns true when this failure ejected the backend. */
function recordFailure(pool, b, now = Date.now()) {
  b.failures += 1;
  b.errors += 1;
  if (b.errors < pool.ejectAfter) return false;
  b.errors = 0;
  b.ejectedUntil = now + Math.min(pool.ejectMaxMs, pool.ejectBaseMs * 2 ** b.ejections);
  b.ejections += 1;
  return true;
}

/** Result of one active health check. Returns 'up' | 'down' when the state changes, null otherwise. */
function recordHealth(pool, b, ok) {
  if (ok) {
    b.hcFail = 0;
    b.hcOk += 1;
    if (!b.up && b.hcOk >= pool.rise) {
      b.up = true;
      b.ejections = 0; // truly recovered → forget past ejections
      b.ejectedUntil = 0;
      return 'up';
    }
  } else {
    b.hcOk = 0;
    b.hcFail += 1;
    if (b.up && b.hcFail >= pool.fall) {
      b.up = false;
      return 'down';
    }
  }
  return null;
}

module.exports = { createPool, pick, recordLatency, recordSuccess, recordFailure, recordHealth, available };
