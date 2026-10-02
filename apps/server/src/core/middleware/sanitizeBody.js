// NoSQL injection guard. JSON bodies can carry objects, so { "email": { "$ne": "" } } would turn a lookup into
// "any user". Keys that start with '$' (query operators) or contain '.' (nested-path writes) are dropped from
// req.body before any controller sees it. Query strings and route params are plain strings in Express 5.
// ponytail: multipart fields (multer, admin upload only) are parsed later per route and are not covered here.

function strip(value) {
  if (Array.isArray(value)) value.forEach(strip);
  else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else strip(value[key]);
    }
  }
  return value;
}

const sanitizeBody = (req, res, next) => {
  strip(req.body);
  next();
};

module.exports = { sanitizeBody, strip };

if (require.main === module) {
  const assert = require('assert');
  assert.deepStrictEqual(
    strip({ email: { $ne: '' }, list: [{ 'role.admin': true, ok: 1 }], nested: { a: { $gt: 0, b: 2 } }, n: null, s: 'x' }),
    { email: {}, list: [{ ok: 1 }], nested: { a: { b: 2 } }, n: null, s: 'x' },
  );
  console.log('sanitizeBody self-check: ok');
}
