const mongoose = require('mongoose');
const { kindScope } = require('./kindScope');

// Một phiếu trong phòng nghe mù (rooms/blindTest.js): người nghe nghe cùng một đoạn ở
// hai mức chất lượng A/B rồi chọn bản hay hơn hoặc "không phân biệt được". Dữ liệu
// dùng để đối chiếu thang PSL (đo bằng ViSQOL) với tai người.
const conditionSchema = new mongoose.Schema({
  key: String,  // 'low' | 'mid' | 'high' | 'original'
  kbps: Number, // null với tệp gốc
}, { _id: false });

const listeningVoteSchema = new mongoose.Schema({
  kind: { type: String, default: 'blind-vote' },
  room: String,
  trialId: { type: String, index: true },
  song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
  excerptStart: Number,
  excerptSeconds: Number,
  a: conditionSchema,
  b: conditionSchema,
  choice: { type: String, enum: ['A', 'B', 'same'] },
  control: Boolean, // lượt kiểm tra: A và B giống hệt nhau (đáp án đúng là 'same')
  correct: Boolean, // người nghe đoán đúng không (rooms/blindTest.js isCorrect)
  level: Number,    // độ khó của phòng lúc đó (0 = cặp xa nhất, 1 = cặp gần nhất)
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Phiếu của phòng nghe mù — một loại sự kiện, nằm chung collection `events` (models/kindScope.js).
listeningVoteSchema.plugin(kindScope, { kinds: ['blind-vote'] });
module.exports = mongoose.model('ListeningVote', listeningVoteSchema, 'events');
