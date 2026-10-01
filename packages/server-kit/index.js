// hugo-server — Express modules that document themselves: auto-mounted folders, doc(), generated API docs and
// OpenAPI, one-line CRUD, endpoint types for hugo-api, a test runner that finds its own tests.
const { doc, describeApi, errorsFor, checkDocs } = require('./src/docs');
const { toOpenApi } = require('./src/openapi');
const { discoverModules, mountModules } = require('./src/modules');
const { crud } = require('./src/crud');
const { endpointTypes } = require('./src/types');
const { discoverTests, runTests } = require('./src/testRunner');
const { scaffold } = require('./src/scaffold');

module.exports = { doc, describeApi, errorsFor, checkDocs, toOpenApi, discoverModules, mountModules, crud, endpointTypes, discoverTests, runTests, scaffold };
