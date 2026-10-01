// HTTP layer under call()/useApi(). Plain fetch has no timeout, no retry and no de-duplication, so flaky mobile
// networks or a server instance restarting show up as errors or hangs. This adds:
//
//   1. A timeout per attempt (AbortController) — never hangs forever.
//   2. Retries for repeatable requests (GET/HEAD) on network errors, timeouts and 502/503/504, waiting with
//      exponential backoff and full jitter (random in [0, min(cap, base·2^n)]) so thousands of clients do not retry
//      in lockstep after an outage; Retry-After is honoured. Writes are never retried automatically.
//   3. Request coalescing: identical GETs in flight at the same time share one request.
//   4. Conditional GETs: the ETag is remembered and sent as If-None-Match; a 304 reuses the cached body.

export type HttpResult = { status: number; ok: boolean; data: any; retries: number; fromCache: boolean };
export type HttpOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
};

const RETRY_STATUS = new Set([502, 503, 504]);
type Init = Omit<RequestInit, 'headers'> & { headers: Record<string, string> };

/** Full jitter: uniformly random in [0, min(cap, base·2^attempt)). */
export const backoffMs = (attempt: number, base: number, cap: number, rand: () => number) =>
  Math.floor(rand() * Math.min(cap, base * 2 ** attempt));

export function createHttpClient(opts: HttpOptions = {}) {
  const {
    fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
    timeoutMs = 15000, retries = 2, baseDelayMs = 300, maxDelayMs = 4000,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    rand = Math.random,
  } = opts;
  const inflight = new Map<string, Promise<HttpResult>>();
  const etags = new Map<string, { etag: string; data: any }>();

  async function attempt(url: string, init: Init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = res.status === 304 ? null : isJson ? await res.json() : null;
      return { res, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(url: string, init: Init, cacheKey: string): Promise<HttpResult> {
    const method = (init.method || 'GET').toUpperCase();
    const idempotent = method === 'GET' || method === 'HEAD';
    const cached = idempotent ? etags.get(cacheKey) : undefined;
    const headers: Record<string, string> = cached ? { ...init.headers, 'If-None-Match': cached.etag } : init.headers;
    for (let n = 0; ; n += 1) {
      let wait = -1;
      try {
        const { res, data } = await attempt(url, { ...init, headers });
        if (res.status === 304 && cached) return { status: 200, ok: true, data: cached.data, retries: n, fromCache: true };
        if (!(idempotent && RETRY_STATUS.has(res.status) && n < retries)) {
          const etag = res.headers.get('etag');
          if (idempotent && res.ok && etag) etags.set(cacheKey, { etag, data });
          return { status: res.status, ok: res.ok, data, retries: n, fromCache: false };
        }
        const ra = Number(res.headers.get('retry-after'));
        if (ra > 0) wait = Math.min(maxDelayMs, ra * 1000);
      } catch (e) {
        // network error or timeout (AbortError)
        if (!idempotent || n >= retries) throw e;
      }
      await sleep(wait >= 0 ? wait : backoffMs(n, baseDelayMs, maxDelayMs, rand));
    }
  }

  /** Sends a request. Identical GETs (same URL and session) in flight share one promise. */
  function send(url: string, init: Init): Promise<HttpResult> {
    const method = (init.method || 'GET').toUpperCase();
    const cacheKey = `${init.headers.Authorization || ''} ${url}`;
    if (method !== 'GET') return run(url, init, cacheKey);
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
    const p = run(url, init, cacheKey).finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, p);
    return p;
  }

  return { send, clearCache: () => etags.clear() };
}
