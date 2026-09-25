const Artist = require('../models/Artist');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/artists — real Wikipedia-sourced photos, matched once for the original catalogue.
// Only artists with a confident match exist here; the frontend falls back to a song
// cover for everyone else instead of treating an absent row as an error.
const getArtists = asyncHandler(async (req, res) => {
  const artists = await Artist.find({}).select('name photo bio sourceUrl');
  res.json(artists);
});

module.exports = { getArtists };
