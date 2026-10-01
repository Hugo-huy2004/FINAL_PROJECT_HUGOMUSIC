// Pure helpers behind call()/useApi() (no React, so checks/endpoint.check.mjs runs them in Node).

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Apps narrow Endpoint to their server's real endpoints with a generated declaration (hugo-server types):
 *   declare module 'hugo-api' { interface Register { endpoints: 'GET /api/songs' | 'POST /api/playlists' } }
 * Editors then autocomplete endpoint strings and the compiler rejects typos.
 */
export interface Register {}
/** An endpoint exactly as the API reference prints it, e.g. "GET /api/songs/:id/lyrics". */
export type Endpoint = Register extends { endpoints: infer E extends string } ? E : `${Method} /${string}`;
export type CallArgs = {
  /** Values for the :placeholders in the path. */
  params?: Record<string, string | number>;
  /** Query string; undefined values are skipped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body, or FormData for uploads. */
  body?: unknown;
};

/** "PATCH /api/songs/:id" + { params: { id: 'x' }, query } → { method: 'PATCH', path: '/api/songs/x?…' } */
export function resolveEndpoint(endpoint: Endpoint, { params = {}, query }: CallArgs = {}) {
  const space = endpoint.indexOf(' ');
  const method = endpoint.slice(0, space) as Method;
  const path = endpoint.slice(space + 1).replace(/:(\w+)/g, (_, k: string) => {
    if (params[k] === undefined || params[k] === '') throw new Error(`${endpoint}: missing params.${k}`);
    return encodeURIComponent(String(params[k]));
  });
  const qs = Object.entries(query || {}).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return { method, path: qs ? `${path}?${qs}` : path };
}

/** The module a path belongs to: /api/playlists/123/songs → /api/playlists. A write there refreshes its reads. */
export const moduleOf = (path: string) => path.split('?')[0].split('/').slice(0, 3).join('/');

/** Endpoints from /api/docs that look like the one asked for — for the "did you mean" warning. */
export function suggest(endpoint: string, known: string[]) {
  const [method, path = ''] = endpoint.split(' ');
  const mod = moduleOf(path);
  return known.filter((k) => k.split(' ')[1]?.startsWith(mod) && (k.startsWith(method) || k.split(' ')[1] === path)).slice(0, 5);
}
