// Copy-ready commands for one endpoint, built from its route metadata (path params, query, body, returns).
// Used by API reference pages; pure, so checks/snippets.check.mjs runs it in Node.
type RouteLike = {
  method: string; path: string; params: string[]; auth: string; upload: boolean;
  query?: Record<string, string>; body?: Record<string, string>; returns?: string;
};

const ident = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const obj = (keys: string[]) => `{ ${keys.map(ident).join(', ')} }`;

/** `useApi`/`call` line for the app, a filter recipe for list endpoints, and a curl command. */
export function snippetsFor(r: RouteLike, baseUrl: string) {
  const endpoint = `${r.method} ${r.path}`;
  const parts: string[] = [];
  if (r.params.length) parts.push(`params: ${obj(r.params)}`);
  const query = Object.keys(r.query || {});
  if (query.length) parts.push(`query: ${obj(query)}`);
  const body = Object.keys(r.body || {});
  let app: string;
  if (r.method === 'GET') {
    app = `const { data, loading, error, reload } = useApi('${endpoint}'${parts.length ? `, { ${parts.join(', ')} }` : ''});`;
  } else if (r.upload) {
    app = ['const form = new FormData();', ...body.map((k) => `form.append('${k}', ${ident(k)});`), `await call('${endpoint}', { ${[...parts, 'body: form'].join(', ')} });`].join('\n');
  } else {
    if (body.length) parts.push(`body: ${obj(body)}`);
    app = `await call('${endpoint}'${parts.length ? `, { ${parts.join(', ')} }` : ''});`;
  }
  const isList = r.method === 'GET' && /\[\]/.test(r.returns || '') && !/^\{/.test(r.returns || '');
  const recipe = isList
    ? `const { data } = useApi('${endpoint}', { ${[...parts, 'select: (items) => items.filter((item) => /* your condition */ true)'].join(', ')} });`
    : null;
  const path = r.path.replace(/:(\w+)/g, '<$1>');
  const curl = [
    `curl -X ${r.method} '${baseUrl}${path}${query.length ? `?${query.map((k) => `${k}=`).join('&')}` : ''}'`,
    r.auth === 'user' || r.auth === 'admin' || r.auth === 'optional' ? "  -H 'Authorization: Bearer <token>'" : null,
    r.upload ? body.map((k) => `  -F '${k}=@<file or value>'`).join(' \\\n') : null,
    !r.upload && body.length && r.method !== 'GET' ? `  -H 'Content-Type: application/json' -d '${JSON.stringify(Object.fromEntries(body.map((k) => [k, ''])))}'` : null,
  ].filter(Boolean).join(' \\\n');
  return { endpoint, app, recipe, curl };
}
