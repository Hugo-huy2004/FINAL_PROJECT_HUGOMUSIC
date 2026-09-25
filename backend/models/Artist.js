const mongoose = require('mongoose');

// Only created for artists a real Wikipedia/Wikimedia match was found for (a one-off
// pass over the original catalogue) — an artist with no confident match simply has no
// row here, and the frontend falls back to a song cover instead of a fake photo.
const artistSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  photo: { type: String, required: true },
  bio: { type: String, default: '' },
  sourceUrl: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Artist', artistSchema);
