import { useMemo, useSyncExternalStore } from 'react';
import { createHttpClient, type HttpOptions, type HttpResult } from './http';
import { resolveEndpoint, moduleOf, suggest, type CallArgs, type Endpoint } from './endpoint';

// One way to talk to a server: the key is the endpoint line itself ("GET /api/songs"), exactly as the API
// reference prints it. Reads are cached and shared; a successful write refreshes every read of the same module.

type Config = {
  /** Server origin, e.g. https://api.example.com (no trailing slash). */
  baseUrl: string;
  /** Returns the bearer token of the current session, if any. */
  getToken: () => string | null | undefined;
  /** Called once when the server says the session is dead (401 with sessionExpired: true). */
  onSessionExpired: () => void;
  /** Warn about endpoints the server does not have (reads GET <docsPath>). */
  dev: boolean;
  docsPath: string;
  http: HttpOptions;
};

declare const __DEV__: boolean | undefined;
const config: Config = {
  baseUrl: '', getToken: () => null, onSessionExpired: () => {},
  dev: typeof __DEV__ !== 'undefined' ? !!__DEV__ : false, docsPath: '/api/docs', http: {},
};
let http = createHttpClient();

/** Points the client at a server. Call once at start-up. */
export function configure(next: Partial<Config>) {
  Object.assign(config, next);
  if (next.http) http = createHttpClient(next.http);
}

export type ApiError = Error & { status: number; data: unknown; requiresLogin: boolean };

/** Low-level request: JSON in and out, bearer token, uniform errors ({ message } → Error with status and data). */
export async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = config.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: HttpResult;
  try {
    res = await http.send(`${config.baseUrl}${path}`, { ...init, headers });
  } catch {
    throw Object.assign(new Error('Cannot reach the server.'), { status: 0, data: null, requiresLogin: false });
  }
  if (!res.ok) {
    const data = res.data;
    if (data?.sessionExpired && token) config.onSessionExpired();
    throw Object.assign(new Error(data?.message || `Request failed (${res.status})`), { status: res.status, data, requiresLogin: !!data?.requiresLogin }) as ApiError;
  }
  return res.data as T;
}

/** Calls any endpoint. Writes (POST/PUT/PATCH/DELETE) refresh the cached reads of the same module. */
export async function call<T = any>(endpoint: Endpoint, args: CallArgs = {}): Promise<T> {
  if (config.dev) checkEndpoint(endpoint);
  const { method, path } = resolveEndpoint(endpoint, args);
  const body = args.body === undefined ? undefined : args.body instanceof FormData ? args.body : JSON.stringify(args.body);
  const data = await request<T>(path, { method, body: body as BodyInit | undefined });
  if (method !== 'GET') invalidate(moduleOf(path));
  return data;
}

type Entry = { endpoint: Endpoint; args: CallArgs; data?: unknown; error: ApiError | null; loading: boolean; version: number; listeners: Set<() => void> };
const cache = new Map<string, Entry>();
const keyOf = (endpoint: Endpoint, args: CallArgs) => `${endpoint} ${JSON.stringify([args.params ?? {}, args.query ?? {}])}`;
const notify = (e: Entry) => { e.version += 1; e.listeners.forEach((l) => l()); };

function load(e: Entry) {
  e.loading = true;
  notify(e);
  call(e.endpoint, e.args)
    .then((d) => { e.data = d; e.error = null; }, (err: ApiError) => { e.error = err; })
    .finally(() => { e.loading = false; notify(e); });
}

/** Re-fetches every cached read whose path starts with `prefix` (e.g. '/api/playlists'); forgets unused ones. */
export function invalidate(prefix: string) {
  for (const [key, e] of cache) {
    if (!resolveEndpoint(e.endpoint, e.args).path.startsWith(prefix)) continue;
    if (e.listeners.size) load(e);
    else cache.delete(key);
  }
}

/**
 * Reads a GET endpoint into a component: `{ data, error, loading, reload }`.
 * `select` shapes the data (filter, sort, pick) without another request; `enabled: false` waits (e.g. for an id).
 */
export function useApi<T = any, R = T>(endpoint: Endpoint, opts: CallArgs & { select?: (data: T) => R; enabled?: boolean } = {}) {
  const { select, enabled = true, ...args } = opts;
  const key = keyOf(endpoint, args);
  const e = useMemo(() => {
    let found = cache.get(key);
    if (!found) cache.set(key, (found = { endpoint, args, error: null, loading: false, version: 0, listeners: new Set() }));
    return found;
  }, [key]);
  useSyncExternalStore((listener) => {
    e.listeners.add(listener);
    if (enabled && e.data === undefined && !e.loading && !e.error) load(e);
    return () => { e.listeners.delete(listener); };
  }, () => e.version);
  const data = e.data === undefined ? undefined : select ? select(e.data as T) : (e.data as unknown as R);
  return { data, error: e.error, loading: e.loading || (enabled && e.data === undefined && !e.error), reload: () => load(e) };
}

// Dev only: warn when an endpoint does not exist on the server, with the closest matches.
let known: Promise<string[]> | null = null;
function checkEndpoint(endpoint: Endpoint) {
  known ||= request(config.docsPath)
    .then((d: { groups: { routes: { method: string; path: string }[] }[] }) => d.groups.flatMap((g) => g.routes.map((r) => `${r.method} ${r.path}`)))
    .catch(() => []);
  known.then((list) => {
    if (list.length && !list.includes(endpoint)) console.warn(`[hugo-api] ${endpoint} is not a server endpoint. Did you mean: ${suggest(endpoint, list).join(' | ') || `see ${config.docsPath}`}`);
  });
}
