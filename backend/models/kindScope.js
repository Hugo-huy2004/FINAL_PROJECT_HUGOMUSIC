// Nhiều model dùng CHUNG một collection, phân biệt bằng trường `kind` — để DB giữ ít collection và mỗi
// collection dùng lại được cho nhiều tác vụ (thêm tính năng = thêm một giá trị `kind`, không thêm bảng):
//
//   rooms   ListeningRoom (station | blind) · RadioStation (radio)
//   events  PlaybackMetric (stream | playback) · ListeningVote (blind-vote)
//   runs    PipelineRun (pipeline) · ResearchResult (research)
//
// Plugin này giới hạn MỌI truy vấn của một model vào đúng các `kind` của nó (find/count/update/delete/
// aggregate), để model này không bao giờ đọc/sửa nhầm bản ghi của model kia — kể cả khi code gọi
// `Model.find()` không kèm điều kiện. Truy vấn tự ghi rõ `kind` thì được giữ nguyên.
const QUERY_OPS = [
  'find', 'findOne', 'countDocuments', 'distinct', 'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
];

function kindScope(schema, { kinds }) {
  if (!Array.isArray(kinds) || !kinds.length) throw new Error('kindScope: cần danh sách kinds');
  // Một kind: so sánh bằng — upsert (findOneAndUpdate + upsert) nhờ vậy tự ghi đúng `kind` vào bản ghi mới.
  const scope = kinds.length === 1 ? kinds[0] : { $in: kinds };

  schema.pre(QUERY_OPS, function scopeQuery() {
    if (this.getFilter().kind === undefined) this.where({ kind: scope });
  });

  schema.pre('aggregate', function scopeAggregate() {
    const first = this.pipeline()[0];
    if (!(first?.$match && 'kind' in first.$match)) this.pipeline().unshift({ $match: { kind: scope } });
  });

  // Tạo/ghi bản ghi mà thiếu kind (model một kind): gán mặc định; kind lạ: từ chối.
  schema.pre('validate', function checkKind() {
    if (!this.kind && kinds.length === 1) this.kind = kinds[0];
    if (!kinds.includes(this.kind)) throw new Error(`kind "${this.kind}" không thuộc ${kinds.join('|')}`);
  });
}

module.exports = { kindScope };

// Tự kiểm (cần MongoDB): node models/kindScope.js — hai model chung một collection tạm, xoá sau khi xong.
if (require.main === module) {
  const path = require('path');
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
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
