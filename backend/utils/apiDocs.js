// Tài liệu API tự sinh từ CHÍNH các route đang chạy — không có tệp tài liệu riêng để lệch khỏi code.
//
//   router.get('/:id/lyrics', doc('Lời bài hát', { returns: '{ hasLyrics, plainLyrics, syncedLyrics }' }), getLyrics);
//
// `doc()` là middleware không làm gì, chỉ mang mô tả. `describeApi()` đi qua cây route của Express và tự nhận
// ra từ middleware thật: mức quyền (protect → cần đăng nhập, isAdmin → admin, optionalAuth → tuỳ chọn), có
// giới hạn tần suất không (express-rate-limit), nhận tệp (multer). Route chưa có `doc()` vẫn được liệt kê,
// đánh dấu "chưa mô tả" — thêm route mới là tự có trên trang tài liệu (frontend: màn Developer).
const { protect, optionalAuth, isAdmin } = require('../middleware/authMiddleware');

function doc(summary, spec = {}) {
  const passthrough = (req, res, next) => next();
  passthrough.apiDoc = { summary, ...spec };
  return passthrough;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function traits(handles) {
  const has = (fn) => handles.includes(fn);
  return {
    auth: has(isAdmin) ? 'admin' : has(protect) ? 'user' : has(optionalAuth) ? 'optional' : 'public',
    rateLimited: handles.some((h) => typeof h.resetKey === 'function'), // express-rate-limit gắn resetKey vào middleware
    upload: handles.some((h) => h.name === 'multerMiddleware'),
    doc: handles.find((h) => h.apiDoc)?.apiDoc || null,
  };
}

/** mounts: [{ prefix, router, title, tier }] → danh sách nhóm route kèm mô tả. */
function describeApi(mounts) {
  return mounts.map(({ prefix, router, title, tier }) => {
    const routes = [];
    let inherited = []; // router.use(protect, isAdmin) áp cho mọi route khai báo SAU nó
    for (const layer of router.stack) {
      if (!layer.route) { inherited = [...inherited, layer.handle]; continue; }
      for (const method of METHODS.filter((m) => layer.route.methods[m])) {
        const own = layer.route.stack.filter((l) => !l.method || l.method === method).map((l) => l.handle);
        const t = traits([...inherited, ...own]);
        const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`;
        routes.push({
          method: method.toUpperCase(), path,
          params: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]),
          auth: t.auth, rateLimited: t.rateLimited, upload: t.upload,
          summary: t.doc?.summary || null,
          ...(t.doc ? Object.fromEntries(Object.entries(t.doc).filter(([k]) => k !== 'summary')) : {}),
        });
      }
    }
    return { prefix, title, tier, routes };
  });
}

module.exports = { doc, describeApi };

if (require.main === module) {
  const assert = require('assert');
  const express = require('express');
  const r = express.Router();
  const limiter = Object.assign((q, s, n) => n(), { resetKey() {} });
  r.get('/open', doc('Mở', { returns: 'x' }), (q, s) => s.end());
  r.post('/login', limiter, (q, s) => s.end());
  r.use(protect);
  r.route('/').get(doc('Danh sách'), (q, s) => s.end()).post(isAdmin, (q, s) => s.end());
  r.delete('/:id/items/:itemId', (q, s) => s.end());
  const [g] = describeApi([{ prefix: '/api/x', router: r, title: 'X' }]);
  const by = (m, p) => g.routes.find((x) => x.method === m && x.path === p);
  assert.deepStrictEqual([by('GET', '/api/x/open').auth, by('GET', '/api/x/open').summary, by('GET', '/api/x/open').returns], ['public', 'Mở', 'x']);
  assert.strictEqual(by('POST', '/api/x/login').rateLimited, true);
  assert.strictEqual(by('GET', '/api/x').auth, 'user', 'router.use(protect) áp cho route phía sau');
  assert.strictEqual(by('GET', '/api/x').summary, 'Danh sách');
  assert.strictEqual(by('POST', '/api/x').auth, 'admin', 'router.route() tách mô tả/quyền theo từng method');
  assert.strictEqual(by('POST', '/api/x').summary, null, 'chưa mô tả vẫn được liệt kê');
  assert.deepStrictEqual(by('DELETE', '/api/x/:id/items/:itemId').params, ['id', 'itemId']);
  console.log('apiDocs self-check: ok');
}
