const mongoose = require('mongoose');
const { kindScope } = require('../core/kindScope');

// One pipeline run for one article (apps/server/src/pipeline/): includes many steps (release → psl → transition
// → hls), each step has status + result description + time. Instead of the log file: admin can see the line
// processing time of each lesson, if any step fails, run the same step again.
const stageSchema = new mongoose.Schema({
  job: { type: String, required: true },
  status: { type: String, enum: ['pending', 'running', 'ok', 'failed', 'skipped'], default: 'pending' },
  note: { type: String, default: '' },
  startedAt: Date,
  finishedAt: Date,
}, { _id: false });

const pipelineRunSchema = new mongoose.Schema({
  kind: { type: String, default: 'pipeline' },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
  trigger: { type: String, default: 'approve' }, // approve | cli
  status: { type: String, enum: ['queued', 'running', 'ok', 'failed'], default: 'queued' },
  stages: [stageSchema],
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
}, { timestamps: true });

// Generic collection `runs` (models/kindScope.js): all runs with results to save — post processing pipeline,
// Experimental/test results (ResearchResult)…
pipelineRunSchema.plugin(kindScope, { kinds: ['pipeline'] });
pipelineRunSchema.index({ kind: 1, song: 1, startedAt: -1 }); // Latest run of each article (admin page)
module.exports = mongoose.model('PipelineRun', pipelineRunSchema, 'runs');
