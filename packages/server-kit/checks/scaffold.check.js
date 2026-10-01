// scaffold(): files a new module needs, wired to crud(): node checks/scaffold.check.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scaffold } = require('..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-'));
const modules = path.join(tmp, 'src/modules');
const auth = path.join(tmp, 'src/core/middleware/auth.js');
const out = scaffold({ name: 'notes', modulesDir: modules, authModule: auth, collection: 'events', fields: ['title', 'body'], owner: true });
const routes = fs.readFileSync(path.join(out.dir, 'routes.js'), 'utf8');
const model = fs.readFileSync(path.join(out.dir, 'Note.js'), 'utf8');
assert.strictEqual(out.Model, 'Note');
assert.match(routes, /require\('\.\.\/\.\.\/core\/middleware\/auth'\)/, 'auth path relative to the module');
assert.match(routes, /owner: 'owner'/);
assert.match(model, /mongoose\.model\('Note', schema, 'events'\)/, 'shared collection');
assert.match(model, /kind: \{ type: String, default: 'note'/);
assert.throws(() => scaffold({ name: 'notes', modulesDir: modules, authModule: auth, collection: 'events' }), /already exists/);
assert.throws(() => scaffold({ name: 'Bad Name', modulesDir: modules, authModule: auth, collection: 'events' }), /lowercase/);
fs.rmSync(tmp, { recursive: true });
console.log('hugo-server scaffold: ok');
