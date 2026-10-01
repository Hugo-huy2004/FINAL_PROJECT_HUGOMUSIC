const assert = require('assert');
const Job = require('../Job');

// GLOBAL popularity of the release containing the article: downloads on archive.org (total / 7 days / 30 days),
// used for rankings (ranking/score.js). Release-level metrics — not published by archive.org
// according to each article. Do it in LOT: one API call for up to 100 items, should run periodically (cli.js global).
// The article does not require an audio file; Works with all licenses.
const BATCH = 100;
const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours: archive.org updates week/month numbers approximately every day
const SEARCH = 'https://archive.org/advancedsearch.php';

const itemIdOf = (song) => (song.sourceUrl || '').split('/details/')[1]?.split(/[/?#]/)[0] || null;

function searchUrl(ids) {
  const q = `identifier:(${ids.join(' OR ')})`;
  const params = new URLSearchParams({ q, rows: String(ids.length), output: 'json' });
  for (const f of ['identifier', 'downloads', 'week', 'month']) params.append('fl[]', f);
  return `${SEARCH}?${params}`;
}

// Archive.org document → compact data (missing fields are 0, not fabricated).
const toStats = (doc) => ({
  total: Number(doc.downloads) || 0,
  week: Number(doc.week) || 0,
  month: Number(doc.month) || 0,
});

class GlobalStatsJob extends Job {
  constructor() {
    super({ name: 'global', label: 'Số liệu toàn cầu (archive.org)', allowNoDerivative: true, select: 'sourceUrl globalStats' });
  }

  pending({ redo } = {}) {
    const base = { status: 'published', sourceUrl: /archive\.org\/details\// };
    return redo ? base : { ...base, $or: [{ 'globalStats.fetchedAt': { $exists: false } }, { 'globalStats.fetchedAt': { $lt: new Date(Date.now() - STALE_MS) } }] };
  }

  needsRun(song) {
    return !!itemIdOf(song) && !(song.globalStats?.fetchedAt > Date.now() - STALE_MS);
  }

  // Get metrics for ONE item — aggregate calls in the same beat into one batched request.
  async statsFor(id, ctx) {
    if (!ctx.cache.has('global:queue')) ctx.cache.set('global:queue', new Map());
    const queue = ctx.cache.get('global:queue');
    if (!queue.has(id)) {
      queue.set(id, new Promise((resolve, reject) => {
        const pending = ctx.cache.get('global:pending') || [];
        pending.push({ id, resolve, reject });
        ctx.cache.set('global:pending', pending);
        if (pending.length >= BATCH) this.flush(ctx);
        else if (pending.length === 1) setTimeout(() => this.flush(ctx), 0);
      }));
    }
    return queue.get(id);
  }

  async flush(ctx) {
    const batch = ctx.cache.get('global:pending') || [];
    ctx.cache.set('global:pending', []);
    if (!batch.length) return;
    try {
      const res = await fetch(searchUrl(batch.map((b) => b.id)), { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`archive.org ${res.status}`);
      const docs = (await res.json()).response?.docs || [];
      const byId = new Map(docs.map((d) => [d.identifier, toStats(d)]));
      for (const b of batch) b.resolve(byId.get(b.id) || null);
    } catch (err) {
      for (const b of batch) b.reject(err);
    }
  }

  async run(song, ctx) {
    const id = itemIdOf(song);
    if (!id) return 'không có item nguồn';
    const stats = await this.statsFor(id, ctx);
    if (!stats) return 'archive.org không trả số liệu';
    song.globalStats = { ...stats, source: 'archive.org', fetchedAt: new Date() };
    await song.save();
    return `toàn cầu: ${stats.total} lượt (7 ngày: ${stats.week}, 30 ngày: ${stats.month})`;
  }

  selfCheck() {
    const u = new URL(searchUrl(['a', 'b'])).searchParams;
    assert.strictEqual(u.get('q'), 'identifier:(a OR b)');
    assert.strictEqual(u.get('rows'), '2');
    assert.ok(u.getAll('fl[]').includes('week'));
    assert.deepStrictEqual(toStats({ downloads: 236628, week: 14, month: 77 }), { total: 236628, week: 14, month: 77 });
    assert.deepStrictEqual(toStats({}), { total: 0, week: 0, month: 0 });
  }
}

module.exports = GlobalStatsJob;
