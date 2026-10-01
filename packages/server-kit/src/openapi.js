// OpenAPI 3.1 document from describeApi() groups — importable into API clients and code generators.
function schemaFor(spec) {
  return { type: 'object', properties: Object.fromEntries(Object.entries(spec || {}).map(([k, v]) => [k, { type: 'string', ...(v ? { description: String(v) } : {}) }])) };
}

function toOpenApi(groups, { title = 'API', version = '1.0.0', serverUrl = '/' } = {}) {
  const paths = {};
  for (const g of groups) {
    for (const r of g.routes) {
      const p = r.path.replace(/:(\w+)/g, '{$1}');
      const op = {
        tags: [g.title],
        summary: r.summary || `${r.method} ${r.path} (undocumented)`,
        operationId: `${r.method.toLowerCase()}${p.replace(/[{}]/g, '').split('/').filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1).replace(/-(\w)/g, (_, c) => c.toUpperCase())).join('')}`,
        parameters: [
          ...r.params.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
          ...Object.entries(r.query || {}).map(([name, d]) => ({ name, in: 'query', required: false, schema: { type: 'string' }, ...(d ? { description: d } : {}) })),
        ],
        ...(r.notes ? { description: r.notes } : {}),
        responses: {
          200: { description: r.returns ? String(r.returns) : 'OK' },
          ...Object.fromEntries(Object.entries(r.errors || {}).map(([code, d]) => [code, { description: String(d) }])),
        },
      };
      if (r.body) op.requestBody = { content: { [r.upload ? 'multipart/form-data' : 'application/json']: { schema: schemaFor(r.body) } } };
      if (r.auth === 'user' || r.auth === 'admin') op.security = [{ bearerAuth: [] }];
      if (r.auth === 'optional') op.security = [{}, { bearerAuth: [] }];
      if (g.tier && g.tier !== 'api') op['x-tier'] = g.tier;
      (paths[p] ||= {})[r.method.toLowerCase()] = op;
    }
  }
  return {
    openapi: '3.1.0',
    info: { title, version, description: 'Generated from the live route tree. Routes without a description are listed as undocumented.' },
    servers: [{ url: serverUrl }],
    tags: groups.map((g) => ({ name: g.title, description: [g.description, g.guide].filter(Boolean).join('\n\n') })),
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  };
}

module.exports = { toOpenApi };
