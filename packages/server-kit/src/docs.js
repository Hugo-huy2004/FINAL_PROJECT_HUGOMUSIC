// API docs generated from the live Express route tree — there is no separate docs file to drift from the code.
//
//   router.get('/:id/lyrics', doc('Lyrics, plain and time-synced', { returns: '{ plainLyrics, syncedLyrics }' }), getLyrics);
//
// doc() is a no-op middleware that only carries a description. describeApi() walks the routers and reads the
// rest from the middleware a route really uses: access level (any middleware with `.access = 'user' | 'admin' |
// 'optional'`), rate limiting (express-rate-limit), file uploads (multer). Undocumented routes are still listed.

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ACCESS_RANK = { optional: 1, user: 2, admin: 3 };

/** Attach a description to a route: doc(summary, { query, body, returns, notes, errors }). */
function doc(summary, spec = {}) {
  const passthrough = (req, res, next) => next();
  passthrough.apiDoc = { summary, ...spec };
  return passthrough;
}

function traits(handles) {
  const access = handles.map((h) => h.access).filter((a) => ACCESS_RANK[a]).sort((a, b) => ACCESS_RANK[b] - ACCESS_RANK[a])[0];
  return {
    auth: access || 'public',
    rateLimited: handles.some((h) => typeof h.resetKey === 'function'), // express-rate-limit adds resetKey
    upload: handles.some((h) => h.name === 'multerMiddleware'),
    doc: handles.find((h) => h.apiDoc)?.apiDoc || null,
  };
}

/** Responses a client should handle, derived from the middleware a route uses; doc(…, { errors }) adds more. */
function errorsFor(method, t, params) {
  const e = {};
  if (t.doc?.body || ['POST', 'PUT', 'PATCH'].includes(method)) e[400] = 'Invalid input — the message says which field';
  if (t.auth === 'user' || t.auth === 'admin') e[401] = 'Not signed in, or the session expired (body carries sessionExpired: true)';
  if (t.auth === 'admin') e[403] = 'Signed in but not an administrator';
  if (params.length) e[404] = `No item matches ${params.map((p) => `:${p}`).join(', ')}`;
  if (t.upload) e[413] = 'File too large';
  if (t.rateLimited) e[429] = 'Too many requests — retry after the Retry-After header';
  return { ...e, ...(t.doc?.errors || {}) };
}

/** mounts: [{ prefix, router, title, description, guide, tier }] → route groups with their docs. */
function describeApi(mounts) {
  return mounts.map(({ prefix, router, title, description, guide, tier }) => {
    const routes = [];
    let inherited = []; // router.use(protect, isAdmin) applies to every route declared after it
    for (const layer of router.stack) {
      if (!layer.route) { inherited = [...inherited, layer.handle]; continue; }
      for (const method of METHODS.filter((m) => layer.route.methods[m])) {
        const own = layer.route.stack.filter((l) => !l.method || l.method === method).map((l) => l.handle);
        const t = traits([...inherited, ...own]);
        const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`;
        const params = [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
        routes.push({
          method: method.toUpperCase(), path, params,
          auth: t.auth, rateLimited: t.rateLimited, upload: t.upload,
          summary: t.doc?.summary || null,
          ...(t.doc ? Object.fromEntries(Object.entries(t.doc).filter(([k]) => k !== 'summary' && k !== 'errors')) : {}),
          errors: errorsFor(method.toUpperCase(), t, params),
        });
      }
    }
    return { prefix, title, description, guide, tier, routes };
  });
}

/**
 * Problems in generated docs: routes without a summary, groups without a guide, and prose matching `forbid`
 * (e.g. words your docs must not use). Paths and `code spans` are identifiers and are not checked.
 */
function checkDocs(groups, { forbid, requireGuide = true } = {}) {
  const problems = [];
  for (const g of groups) {
    if (requireGuide && !g.guide) problems.push(`${g.prefix}: missing router.meta.guide`);
    for (const r of g.routes) if (!r.summary) problems.push(`${r.method} ${r.path}: missing doc()`);
  }
  if (forbid) {
    const prose = JSON.stringify(groups.map((g) => [g.title, g.description, g.guide, g.routes.map((r) => [r.summary, r.notes, r.returns,
      Object.values(r.query || {}), Object.values(r.body || {}), Object.values(r.errors || {})])])).replace(/`[^`]*`/g, '');
    const hits = prose.match(new RegExp(forbid.source, forbid.flags.includes('g') ? forbid.flags : `${forbid.flags}g`));
    if (hits) problems.push(`docs use forbidden words: ${[...new Set(hits.map((h) => h.toLowerCase()))].join(', ')}`);
  }
  return problems;
}

module.exports = { doc, describeApi, errorsFor, checkDocs, METHODS };
