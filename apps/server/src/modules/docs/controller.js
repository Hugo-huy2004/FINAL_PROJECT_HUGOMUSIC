const fs = require('fs');
const path = require('path');
const { describeApi, toOpenApi } = require('hugo-server');
const { SOCKET_EVENTS } = require('../../sockets/events');
const { GUIDE } = require('./guide');

// Built once per process from the modules the server actually mounted (index.js puts them in app.locals).
const generatedAt = new Date().toISOString();
let docs;
const apiDocs = (app) => (docs ||= { generatedAt, guide: GUIDE, groups: describeApi(app.locals.modules), socketEvents: SOCKET_EVENTS });

const getDocs = (req, res) => res.json(apiDocs(req.app));
const getOpenApi = (req, res) => res.json(toOpenApi(apiDocs(req.app).groups, { title: 'Hugo Music API', version: require('../../../package.json').version }));

// Component documentation generated from the UI source by packages/client/scripts/gen-component-docs.mjs.
const COMPONENTS_FILE = path.join(__dirname, 'components.json');
const getComponents = (req, res) => {
  if (!fs.existsSync(COMPONENTS_FILE)) return res.status(404).json({ message: 'Component docs not generated yet — run npm run gen -w @hugo/client' });
  res.type('json').send(fs.readFileSync(COMPONENTS_FILE));
};

module.exports = { getDocs, getOpenApi, getComponents };
