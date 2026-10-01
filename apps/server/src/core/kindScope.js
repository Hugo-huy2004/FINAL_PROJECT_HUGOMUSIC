// Multiple models use the SAME collection, separated by the `kind` field — so the DB keeps fewer and different collections
// reusable collection for multiple tasks (adding features = adding a `kind` value, not adding a table):
//
//   rooms   ListeningRoom (station | blind) · RadioStation (radio)
//   events  PlaybackMetric (stream | playback) · ListeningVote (blind-vote)
//   runs    PipelineRun (pipeline) · ResearchResult (research)
//
// This plugin limits EVERY query of a model to its exact `kinds' (find/count/update/delete/
// aggregate), so that one model never mistakenly reads/modifies the other model's records — even when called by code
// `Model.find()` has no conditions. Queries that specify `kind` themselves are preserved.
const QUERY_OPS = [
  'find', 'findOne', 'countDocuments', 'distinct', 'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
];

function kindScope(schema, { kinds }) {
  if (!Array.isArray(kinds) || !kinds.length) throw new Error('kindScope: cần danh sách kinds');
  // One kind: compares with — upsert (findOneAndUpdate + upsert) thus writing the correct `kind` to the new record.
  const scope = kinds.length === 1 ? kinds[0] : { $in: kinds };

  schema.pre(QUERY_OPS, function scopeQuery() {
    if (this.getFilter().kind === undefined) this.where({ kind: scope });
  });

  schema.pre('aggregate', function scopeAggregate() {
    const first = this.pipeline()[0];
    if (!(first?.$match && 'kind' in first.$match)) this.pipeline().unshift({ $match: { kind: scope } });
  });

  // Create/write record without kind (model one kind): default assignment; kind of strange: refuse.
  schema.pre('validate', function checkKind() {
    if (!this.kind && kinds.length === 1) this.kind = kinds[0];
    if (!kinds.includes(this.kind)) throw new Error(`kind "${this.kind}" không thuộc ${kinds.join('|')}`);
  });
}

module.exports = { kindScope };

// Self-test (needs MongoDB): node models/kindScope.js — two models share a temporary collection, deleted after completion.
if (require.main === module) {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
  const mongoose = require('mongoose');
  const assert = require('assert');
  (async () => {
    await mongoose.connect(process.env.MONGO_URI, { readPreference: 'primary' });
    const coll = `kindscope_selfcheck_${process.pid}`;
    const a = new mongoose.Schema({ kind: String, name: String });
    const b = new mongoose.Schema({ kind: { type: String, default: 'b' }, name: String });
    a.plugin(kindScope, { kinds: ['a1', 'a2'] });
    b.plugin(kindScope, { kinds: ['b'] });
    const A = mongoose.model(`KsA${process.pid}`, a, coll);
    const B = mongoose.model(`KsB${process.pid}`, b, coll);
    try {
      await A.create([{ kind: 'a1', name: 'x' }, { kind: 'a2', name: 'y' }]);
      const made = await B.create({ name: 'z' });
      assert.strictEqual(made.kind, 'b', 'một kind: tự gán');
      assert.strictEqual(await A.countDocuments(), 2);
      assert.strictEqual(await B.countDocuments(), 1);
      assert.deepStrictEqual((await B.find().lean()).map((d) => d.name), ['z'], 'find() không điều kiện vẫn bị giới hạn');
      assert.strictEqual((await A.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]))[0].n, 2, 'aggregate bị giới hạn');
      assert.strictEqual((await B.updateMany({}, { name: 'w' })).modifiedCount, 1, 'update không lan sang model khác');
      assert.strictEqual((await A.deleteMany({})).deletedCount, 2, 'delete không lan sang model khác');
      assert.strictEqual(await B.countDocuments(), 1);
      await B.findOneAndUpdate({ name: 'new' }, { name: 'new' }, { upsert: true });
      assert.strictEqual((await B.findOne({ name: 'new' }).lean()).kind, 'b', 'upsert ghi đúng kind');
      await assert.rejects(A.create({ kind: 'b', name: 'lạ' }), 'kind lạ bị từ chối');
      console.log('kindScope self-check: ok');
    } finally {
      await mongoose.connection.db.collection(coll).drop().catch(() => {});
      await mongoose.disconnect();
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
