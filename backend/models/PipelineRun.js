const mongoose = require('mongoose');
const { kindScope } = require('./kindScope');

// Một lần chạy pipeline cho một bài (backend/pipeline/): gồm nhiều bước (release → psl → transition
// → hls), mỗi bước có trạng thái + mô tả kết quả + thời gian. Thay cho tệp log: admin xem được dòng
// thời gian xử lý của từng bài, bước nào lỗi thì chạy lại đúng bước đó.
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
  status: { type: String, enum: ['running', 'ok', 'failed'], default: 'running' },
  stages: [stageSchema],
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
}, { timestamps: true });

// Collection chung `runs` (models/kindScope.js): mọi lần chạy có kết quả cần lưu — pipeline xử lý bài,
// kết quả thí nghiệm/kiểm tra (ResearchResult)…
pipelineRunSchema.plugin(kindScope, { kinds: ['pipeline'] });
pipelineRunSchema.index({ kind: 1, song: 1, startedAt: -1 }); // lần chạy mới nhất của từng bài (trang quản trị)
module.exports = mongoose.model('PipelineRun', pipelineRunSchema, 'runs');
