const RadioStation = require('../models/RadioStation');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/radio/stations?country=VN — real, currently-live third-party Icecast/Shoutcast
// streams (see scripts/radio/importRadioStations.js). The client plays streamUrl directly.
// (Đài phát từ kho nhạc của chính app giờ là Đài Hugo 24/7 — backend/rooms/stations.js.)
const getStations = asyncHandler(async (req, res) => {
  const { country } = req.query;
  const filter = country ? { countryCode: country.toUpperCase(), isLive: true } : { isLive: true };
  const stations = await RadioStation.find(filter).sort({ votes: -1 });
  res.json(stations);
});

module.exports = { getStations };
