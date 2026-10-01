// Modules are discovered, not listed: every <dir>/<name>/routes.js is mounted at /api/<name>.
//   router.meta = { title, description, guide, tier }   optional; title defaults to the folder name
const fs = require('fs');
const path = require('path');

function discoverModules(dir, { prefix = '/api' } = {}) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && (
      fs.existsSync(path.join(dir, e.name, `${e.name}.routes.js`)) ||
      fs.existsSync(path.join(dir, e.name, 'routes.js'))
    ))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const routeFile = fs.existsSync(path.join(dir, name, `${name}.routes.js`))
        ? path.join(dir, name, `${name}.routes.js`)
        : path.join(dir, name, 'routes.js');
      const router = require(routeFile);
      if (typeof router !== 'function' || !Array.isArray(router.stack)) throw new Error(`${name} routes must export an Express router`);
      const meta = router.meta || {};
      return {
        name, prefix: `${prefix}/${name}`, router,
        title: meta.title || name[0].toUpperCase() + name.slice(1),
        description: meta.description || '', guide: meta.guide || '', tier: meta.tier || 'api',
      };
    });
}

/** Mounts discovered modules on an Express app; `skip(m)` leaves some out (e.g. a tier this instance does not run). */
function mountModules(app, modules, skip = () => false) {
  for (const m of modules) if (!skip(m)) app.use(m.prefix, m.router);
  return modules;
}

module.exports = { discoverModules, mountModules };
