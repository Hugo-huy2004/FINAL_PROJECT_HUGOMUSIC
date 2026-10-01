// crud(): five documented endpoints, field whitelist, owner scoping, 404/400 — on an in-memory model: node checks/crud.check.js
const assert = require('assert');
const http = require('http');
const express = require('express');
const { crud, describeApi } = require('..');

// Tiny in-memory stand-in for a Mongoose model (only what crud() uses).
const rows = [];
let seq = 0;
const match = (doc, f) => Object.entries(f).every(([k, v]) => (k === '$or' ? v.some((o) => match(doc, o)) : v instanceof RegExp ? v.test(doc[k] ?? '') : String(doc[k]) === String(v)));
const wrap = (d) => Object.assign(d, { set(p) { Object.assign(this, p); }, async save() {}, async deleteOne() { rows.splice(rows.indexOf(this), 1); }, toJSON() { const { set, save, deleteOne, toJSON, ...o } = this; return o; } });
const Note = {
  modelName: 'Note',
  async create(d) { const row = wrap({ _id: (++seq).toString(16).padStart(24, '0'), ...d }); rows.push(row); return row; },
  async findOne(f) { return rows.find((d) => match(d, f)) || null; },
  async countDocuments(f) { return rows.filter((d) => match(d, f)).length; },
  find(f) { let out = rows.filter((d) => match(d, f)); const q = { sort: () => q, skip: (n) => { out = out.slice(n); return q; }, limit: (n) => Promise.resolve(out.slice(0, n)) }; return q; },
};
const signIn = (req, res, next) => { req.user = { _id: req.headers['x-user'] }; if (!req.user._id) return res.status(401).end(); next(); };
signIn.access = 'user';
const app = express();
app.use(express.json());
const router = crud(express.Router(), Note, { name: 'note', fields: ['title', 'body'], required: ['title'], owner: 'owner', scope: { kind: 'note' }, read: [signIn], write: [signIn] });
app.use('/api/notes', router);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/notes`;
  const go = async (method, path, body, userId = 'u1') => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user': userId }, body: body && JSON.stringify(body) });
    return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  try {
    assert.strictEqual((await go('POST', '/', { body: 'no title' })).status, 400, 'required field');
    const a = await go('POST', '/', { title: 'Jazz picks', body: 'x', hacked: true });
    assert.strictEqual(a.status, 201);
    assert.strictEqual(a.data.hacked, undefined, 'unknown fields ignored');
    assert.deepStrictEqual([a.data.kind, a.data.owner], ['note', 'u1'], 'scope and owner stamped');
    await go('POST', '/', { title: 'Rock' });
    await go('POST', '/', { title: 'Other user' }, 'u2');
    const list = await go('GET', '/?q=jazz');
    assert.deepStrictEqual([list.data.total, list.data.items[0].title], [1, 'Jazz picks'], 'text search');
    assert.strictEqual((await go('GET', '/')).data.total, 2, 'owner sees only their own');
    assert.strictEqual((await go('GET', `/${a.data._id}`, null, 'u2')).status, 404, 'other users get 404');
    assert.strictEqual((await go('GET', '/not-an-id')).status, 404);
    assert.strictEqual((await go('PATCH', `/${a.data._id}`, { title: 'Jazz' })).data.title, 'Jazz');
    assert.deepStrictEqual((await go('DELETE', `/${a.data._id}`)).data, { ok: true });
    const [g] = describeApi([{ prefix: '/api/notes', router, ...router.meta }]);
    assert.deepStrictEqual(g.routes.map((r) => `${r.method} ${r.path} ${r.auth}`), ['GET /api/notes user', 'GET /api/notes/:id user', 'POST /api/notes user', 'PATCH /api/notes/:id user', 'DELETE /api/notes/:id user']);
    assert.ok(g.guide.includes('own items') && g.routes.every((r) => r.summary), 'documented automatically');
    console.log('hugo-server crud: ok');
  } finally { server.close(); }
});
