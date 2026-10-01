// Project rules for the generated API docs (hugo-server builds them; these rules keep them on-brand):
// every route and module documented in English, and no third-party brand named in the prose.
const path = require('path');

/** Words the docs must not contain — they describe behaviour, not vendors. */
const BRANDS = /\b(apple|ios|ipados|macos|android|google|telegram|wikimedia|wikipedia|cloudflare|bunny|redis|mongo(db)?|r2|s3|aws|swagger|postman|liquid glass|spotify|youtube|netflix)\b/gi;

module.exports = { BRANDS };

if (require.main === module && process.argv.includes('--self-check')) {
  const assert = require('assert');
  const { discoverModules, describeApi, checkDocs } = require('hugo-server');
  const groups = describeApi(discoverModules(path.join(__dirname, '..', 'modules')));
  const english = groups.flatMap((g) => g.routes).filter((r) => /[À-ỹđĐ]/.test(`${r.summary}`)).map((r) => `${r.method} ${r.path}: summary must be English`);
  assert.deepStrictEqual([...checkDocs(groups, { forbid: BRANDS }), ...english], []);
  console.log(`docs rules self-check: ok (${groups.length} modules, ${groups.reduce((n, g) => n + g.routes.length, 0)} routes)`);
  process.exit(0); // the routes open database clients on require
}
