const { doc } = require('./docs');

// crud(router, Model, options) → five documented endpoints in one line:
//   GET /        list   ?page ?limit ?sort=-field ?q=text and ?field=value for every listed field
//   GET /:id     one item
//   POST /       create (only `fields` are accepted; `required` must be present)
//   PATCH /:id   update (only `fields`)
//   DELETE /:id  delete
// `owner` scopes every query to the signed-in user (and stamps it on create); `scope` adds fixed conditions
// (e.g. { kind: 'note' } to share a collection). Invalid ids answer 404, validation errors 400.
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function crud(router, Model, options = {}) {
  const {
    name = Model.modelName.toLowerCase(), fields = [], required = [], read = [], write = [], owner, scope = {},
    sort = '-createdAt', maxLimit = 100, title, description, guide,
  } = options;
  const plural = `${name}s`;
  const where = (req) => ({ ...scope, ...(owner ? { [owner]: req.user?._id } : {}) });
  const pick = (body) => Object.fromEntries(fields.filter((f) => body?.[f] !== undefined).map((f) => [f, body[f]]));
  const run = (fn) => async (req, res, next) => {
    try { await fn(req, res); } catch (e) {
      if (e?.name === 'ValidationError' || e?.name === 'CastError') return res.status(400).json({ message: e.message });
      next(e);
    }
  };
  const findOne = async (req, res) => {
    if (!isId(req.params.id)) { res.status(404).json({ message: `No ${name} with this id` }); return null; }
    const item = await Model.findOne({ ...where(req), _id: req.params.id });
    if (!item) res.status(404).json({ message: `No ${name} with this id` });
    return item;
  };
  const body = Object.fromEntries(fields.map((f) => [f, required.includes(f) ? 'required' : '']));
  const query = { page: '1-based page', limit: `≤ ${maxLimit}`, sort: `field or -field (default ${sort})`, q: 'text search across the fields', ...Object.fromEntries(fields.map((f) => [f, 'exact match'])) };

  router.get('/', doc(`List ${plural}`, { query, returns: `{ total, page, limit, items: ${name}[] }` }), ...read, run(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || 20));
    const filter = { ...where(req), ...Object.fromEntries(fields.filter((f) => typeof req.query[f] === 'string').map((f) => [f, req.query[f]])) };
    if (typeof req.query.q === 'string' && req.query.q.trim() && fields.length) {
      const re = new RegExp(escape(req.query.q.trim()), 'i');
      filter.$or = fields.map((f) => ({ [f]: re }));
    }
    const by = typeof req.query.sort === 'string' && fields.concat('createdAt', 'updatedAt').includes(req.query.sort.replace(/^-/, '')) ? req.query.sort : sort;
    const [total, items] = await Promise.all([Model.countDocuments(filter), Model.find(filter).sort(by).skip((page - 1) * limit).limit(limit)]);
    res.json({ total, page, limit, items });
  }));
  router.get('/:id', doc(`One ${name}`, { returns: name }), ...read, run(async (req, res) => {
    const item = await findOne(req, res);
    if (item) res.json(item);
  }));
  router.post('/', doc(`Create a ${name}`, { body, returns: name }), ...write, run(async (req, res) => {
    const missing = required.filter((f) => req.body?.[f] === undefined || req.body[f] === '');
    if (missing.length) return res.status(400).json({ message: `Missing ${missing.join(', ')}` });
    const item = await Model.create({ ...pick(req.body), ...where(req) });
    res.status(201).json(item);
  }));
  router.patch('/:id', doc(`Update a ${name}`, { body: Object.fromEntries(fields.map((f) => [f, ''])), returns: name }), ...write, run(async (req, res) => {
    const item = await findOne(req, res);
    if (!item) return;
    item.set(pick(req.body));
    await item.save();
    res.json(item);
  }));
  router.delete('/:id', doc(`Delete a ${name}`, { returns: '{ ok: true }' }), ...write, run(async (req, res) => {
    const item = await findOne(req, res);
    if (!item) return;
    await item.deleteOne();
    res.json({ ok: true });
  }));

  router.meta = {
    title: title || plural[0].toUpperCase() + plural.slice(1),
    description: description || `Create, read, update and delete ${plural}.`,
    guide: guide || [
      `Standard CRUD for ${plural}${owner ? ' — every call only sees the signed-in user\'s own items' : ''}.`,
      '',
      `- **List** with \`?page\`, \`?limit\` (≤ ${maxLimit}), \`?sort=-createdAt\` and \`?q=\` text search${fields.length ? `; filter on ${fields.map((f) => `\`${f}\``).join(', ')} with \`?field=value\`` : ''}.`,
      `- **Create** accepts ${fields.length ? fields.map((f) => `\`${f}\``).join(', ') : 'no fields yet'}${required.length ? ` (${required.map((f) => `\`${f}\``).join(', ')} required)` : ''}; other fields are ignored.`,
      '- **Update** changes only the fields you send. Unknown ids answer 404, invalid values 400.',
    ].join('\n'),
  };
  return router;
}

module.exports = { crud };
