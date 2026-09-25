const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  socketId: { type: String, default: '' },
  name: { type: String, default: 'Khách' },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['host', 'guest'], default: 'guest' },
  isOnline: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
}, { _id: true });

const partyRoomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    default: 'Phòng Nghe Chung',
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  isPublic: {
    type: Boolean,
    default: true,
    index: true,
  },
  genre: {
    type: String,
    default: 'Tổng hợp',
    trim: true,
  },
  maxParticipants: {
    type: Number,
    default: 50,
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  hostName: {
    type: String,
    default: 'Host',
  },
  hostAvatar: {
    type: String,
    default: '',
  },
  currentSong: {
    _id: { type: String },
    title: { type: String },
    artist: { type: String },
    filePath: { type: String },
    coverArt: { type: String },
    duration: { type: Number, default: 0 },
    plainLyrics: { type: String },
    syncedLyrics: { type: String },
  },
  queue: [{
    _id: { type: String },
    title: { type: String },
    artist: { type: String },
    filePath: { type: String },
    coverArt: { type: String },
    duration: { type: Number, default: 0 },
  }],
  queueIndex: {
    type: Number,
    default: 0,
  },
  isPlaying: {
    type: Boolean,
    default: false,
  },
  position: {
    type: Number,
    default: 0,
  },
  lastSyncTime: {
    type: Date,
    default: Date.now,
  },
  participants: [participantSchema],
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
}, { timestamps: true });

const PartyRoom = mongoose.model('PartyRoom', partyRoomSchema);
module.exports = PartyRoom;
