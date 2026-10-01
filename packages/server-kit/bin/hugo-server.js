#!/usr/bin/env node
// hugo-server <command> — settings come from the "hugoServer" field of the app's package.json:
//   { "modulesDir": "src/modules", "auth": "src/core/middleware/auth.js", "collection": "events", "typesOut": "…/endpoints.d.ts" }
//
//   hugo-server new <name> [--fields a,b] [--owner]   create a documented CRUD module
//   hugo-server types                                 write the endpoint union used by hugo-api
//   hugo-server test                                  run every discovered test
const fs = require('fs');
const path = require('path');
const { scaffold, discoverModules, describeApi, endpointTypes, runTests } = require('..');

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfg = { modulesDir: 'src/modules', collection: 'events', ...(pkg.hugoServer || {}) };
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };

if (cmd === 'new') {
  const name = rest.find((a) => !a.startsWith('--') && rest[rest.indexOf(a) - 1] !== '--fields');
  if (!name) { console.error('usage: hugo-server new <name> [--fields title,body] [--owner]'); process.exit(1); }
  if (!cfg.auth) { console.error('set "hugoServer.auth" in package.json to the module exporting protect/isAdmin'); process.exit(1); }
  const fields = (flag('fields') || 'title').split(',').map((f) => f.trim()).filter(Boolean);
  const out = scaffold({ name, modulesDir: path.resolve(root, cfg.modulesDir), authModule: path.resolve(root, cfg.auth), collection: cfg.collection, fields, owner: rest.includes('--owner') });
  console.log(`created ${path.relative(root, out.dir)}/{${out.files.join(', ')}}`);
  console.log(`restart the server: /api/${name} is live and documented. In the app:`);
  console.log(`  const { data } = useApi('GET /api/${name}');`);
  console.log(`  await call('POST /api/${name}', { body: { ${fields.join(', ')} } });`);
} else if (cmd === 'types') {
  if (!cfg.typesOut) { console.error('set "hugoServer.typesOut" in package.json'); process.exit(1); }
  const groups = describeApi(discoverModules(path.resolve(root, cfg.modulesDir)));
  const out = path.resolve(root, cfg.typesOut);
  const next = endpointTypes(groups);
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (rest.includes('--check') && current !== next) { console.error(`${cfg.typesOut} is stale — run hugo-server types`); process.exit(1); }
  if (current !== next) fs.writeFileSync(out, next);
  console.log(`endpoint types: ${groups.reduce((n, g) => n + g.routes.length, 0)} endpoints → ${path.relative(root, out)}${rest.includes('--check') ? ' (up to date)' : ''}`);
  process.exit(0); // loading the routes may open database connections
} else if (cmd === 'test') {
  process.exit(runTests(root) ? 1 : 0);
} else {
  console.error('commands: new <name> [--fields a,b] [--owner] · types [--check] · test');
  process.exit(1);
}
