const mongoose = require('mongoose');
const { kindScope } = require('./kindScope');

// Kết quả các thí nghiệm/kiểm định (research/, scripts/catalog/reviewCatalog.js) — lưu trong DB,
// KHÔNG ghi thành tệp trong mã nguồn. Mỗi thí nghiệm một bản ghi theo `name`, chạy lại thì ghi đè
// (lịch sử chạy nằm ở `runAt`); `rows` giữ nguyên cấu trúc mà script tạo ra.
const researchResultSchema = new mongoose.Schema({
  kind: { type: String, default: 'research' },
  name: { type: String, required: true }, // vd. audio_quality_audit, codec_compare, license_purge (unique bên dưới)
  rows: { type: mongoose.Schema.Types.Mixed, required: true },
  meta: { type: mongoose.Schema.Types.Mixed },
  runAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Kết quả thí nghiệm/kiểm tra/biên bản — nằm chung collection `runs` (models/kindScope.js).
researchResultSchema.plugin(kindScope, { kinds: ['research'] });
researchResultSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { kind: 'research' } });
module.exports = mongoose.model('ResearchResult', researchResultSchema, 'runs');
