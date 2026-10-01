const express = require('express');
const { doc } = require('hugo-server');
const { getDocs, getOpenApi, getComponents } = require('./controller');

const router = express.Router();

router.get('/', doc('This API reference as JSON: guide, route groups with endpoints, realtime events', { returns: '{ generatedAt, guide, groups, socketEvents }' }), getDocs);
router.get('/openapi.json', doc('OpenAPI 3.1 description of every endpoint, for API clients and code generators', { returns: 'OpenAPI document' }), getOpenApi);
router.get('/components', doc('UI component library documentation: package info, guide, every component with props, usage notes and examples', { returns: '{ package, guide, components }' }), getComponents);

// Mounted automatically at /api/docs (hugo-server discoverModules).
router.meta = {
  title: 'Docs',
  description: 'Machine-readable documentation for this API and for the UI component library.',
  guide: `Everything the developer pages show comes from this group, so documentation can never drift from the running code:

- **/api/docs** walks the live route tree. Summaries, request fields and notes come from \`doc()\` next to each route; access level, rate limits, uploads and possible errors are read from the middleware the route really uses.
- **/api/docs/openapi.json** is the same data as OpenAPI 3.1.
- **/api/docs/components** is generated from the UI source: JSDoc blocks, prop types, defaults and examples.

All three are public: they describe the API, they never return user data.`,
};

module.exports = router;
