# hugo-server

Express modules that document themselves. Drop a folder to mount an API, write CRUD in one line, and get API docs, OpenAPI and typed endpoints for free.

```
npm install hugo-server
```

## A module is a folder

```
src/modules/notes/routes.js   →   /api/notes
```

```js
const express = require('express');
const { discoverModules, mountModules } = require('hugo-server');
mountModules(app, discoverModules(path.join(__dirname, 'modules')));
```

Describe each route next to it; access level, rate limits, uploads and possible errors are read from the middleware the route really uses:

```js
const { doc } = require('hugo-server');
router.get('/:id/lyrics', doc('Lyrics, plain and time-synced', { returns: '{ plainLyrics, syncedLyrics }' }), getLyrics);
router.meta = { title: 'Songs', description: 'Catalog and playback.', guide: 'Long-form guide in markdown…' };
```

Mark your auth middleware once so the docs know who may call what: `protect.access = 'user'; isAdmin.access = 'admin'; optionalAuth.access = 'optional'`.

## CRUD in one line

```js
module.exports = crud(express.Router(), Note, {
  fields: ['title', 'body'], required: ['title'],
  owner: 'owner', read: [protect], write: [protect],
  scope: { kind: 'note' },            // share a collection between models
});
```

Five documented endpoints: list (`?page`, `?limit`, `?sort=-field`, `?q=` search, `?field=value` filters), get, create, update, delete — with a field whitelist, owner scoping, 404 for unknown ids and 400 for invalid input.

## CLI

Settings live in the `hugoServer` field of your `package.json`:

```json
{ "hugoServer": { "modulesDir": "src/modules", "auth": "src/core/middleware/auth.js", "collection": "events", "typesOut": "../app/src/api/endpoints.d.ts" } }
```

| Command | What it does |
|---|---|
| `hugo-server new notes --fields title,body --owner` | Creates a documented CRUD module (model + routes) |
| `hugo-server types [--check]` | Writes the endpoint union used by [hugo-api](https://www.npmjs.com/package/hugo-api) |
| `hugo-server test` | Runs every `*.test.js` and every module with a self-check — no list to maintain |

## Library

| Export | Purpose |
|---|---|
| `doc(summary, spec)` | Describe a route (`query`, `body`, `returns`, `notes`, `errors`) |
| `discoverModules(dir)`, `mountModules(app, modules, skip)` | Folder-based mounting |
| `describeApi(modules)` | The route tree as documentation data |
| `toOpenApi(groups, info)` | OpenAPI 3.1 |
| `checkDocs(groups, { forbid })` | Undocumented routes, missing guides, forbidden words |
| `crud(router, Model, options)` | One-line documented CRUD |
| `endpointTypes(groups)` | Endpoint union for hugo-api |
| `runTests(root)`, `discoverTests(root)` | Self-discovering test runner |

## License

MIT
