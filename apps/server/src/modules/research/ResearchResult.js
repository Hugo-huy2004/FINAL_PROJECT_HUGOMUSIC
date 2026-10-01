const mongoose = require('mongoose');
const { kindScope } = require('../../core/kindScope');

// Results of experiments/tests (research/, scripts/catalog/reviewCatalog.js) — stored in DB,
// DO NOT write to file in source code. Each experiment has a record by `name`, rerun and overwritten
// (run history is located at `runAt`); `rows` preserves the structure that the script creates.
const researchResultSchema = new mongoose.Schema({
  kind: { type: String, default: 'research' },
  name: { type: String, required: true }, // e.g. audio_quality_audit, codec_compare, license_purge (unique below)
  rows: { type: mongoose.Schema.Types.Mixed, required: true },
  meta: { type: mongoose.Schema.Types.Mixed },
  runAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Experiment/test results/records — located in the `runs` collection (models/kindScope.js).
researchResultSchema.plugin(kindScope, { kinds: ['research'] });
researchResultSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { kind: 'research' } });
module.exports = mongoose.model('ResearchResult', researchResultSchema, 'runs');
