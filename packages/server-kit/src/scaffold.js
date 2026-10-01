// `hugo-server new <name>` — a documented CRUD module in one command: <modules>/<name>/{Model.js, routes.js}.
// Records live in an existing shared collection told apart by `kind`, so new features never add collections.
const fs = require('fs');
const path = require('path');

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const singular = (s) => s.replace(/ies$/, 'y').replace(/s$/, '');

function scaffold({ name, modulesDir, authModule, collection, fields = ['title'], owner = false }) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('module names are lowercase words, e.g. notes');
  const dir = path.join(modulesDir, name);
  if (fs.existsSync(dir)) throw new Error(`${path.relative(process.cwd(), dir)} already exists`);
  const item = singular(name);
  const Model = cap(item.replace(/-(\w)/g, (_, c) => c.toUpperCase()));
  const auth = path.relative(dir, authModule).replace(/\\/g, '/').replace(/\.js$/, '');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${Model}.js`), `const mongoose = require('mongoose');

// ${Model}s live in the shared "${collection}" collection with kind: '${item}' — crud() scopes every query to it.
const schema = new mongoose.Schema({
  kind: { type: String, default: '${item}', index: true },
${fields.map((f) => `  ${f}: { type: String, trim: true, maxlength: 2000 },`).join('\n')}${owner ? `
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },` : ''}
}, { timestamps: true });

module.exports = mongoose.models.${Model} || mongoose.model('${Model}', schema, '${collection}');
`);
  fs.writeFileSync(path.join(dir, 'routes.js'), `const express = require('express');
const { crud } = require('hugo-server');
const { protect${owner ? '' : ', isAdmin'} } = require('${auth.startsWith('.') ? auth : `./${auth}`}');
const ${Model} = require('./${Model}');

// GET/POST /api/${name}, GET/PATCH/DELETE /api/${name}/:id — documented at /developer/api/${name}.
module.exports = crud(express.Router(), ${Model}, {
  name: '${item}',
  fields: [${fields.map((f) => `'${f}'`).join(', ')}],
  required: ['${fields[0]}'],
  scope: { kind: '${item}' },${owner ? `
  owner: 'owner',
  read: [protect],
  write: [protect],` : `
  write: [protect, isAdmin],`}
});
`);
  return { dir, Model, files: [`${Model}.js`, 'routes.js'] };
}

module.exports = { scaffold };
