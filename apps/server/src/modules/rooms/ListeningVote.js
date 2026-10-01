const mongoose = require('mongoose');
const { kindScope } = require('../../core/kindScope');

// A test in a blind listening room (rooms/blindTest.js): listeners listen to the same passage at
// two quality levels A/B then choose the better or "indistinguishable" version. Data
// used to compare the PSL scale (measured by ViSQOL) with the human ear.
const conditionSchema = new mongoose.Schema({
  key: String,  // 'low' | 'mid' | 'high' | 'original'
  kbps: Number, // null to the original file
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
  control: Boolean, // check: A and B are identical (correct answer is 'same')
  correct: Boolean, // Does the listener guess correctly (rooms/blindTest.js isCorrect)
  level: Number,    // difficulty of the room at that time (0 = furthest pair, 1 = nearest pair)
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Blind listening room ticket — an event type, located in the `events` collection (models/kindScope.js).
listeningVoteSchema.plugin(kindScope, { kinds: ['blind-vote'] });
module.exports = mongoose.model('ListeningVote', listeningVoteSchema, 'events');
