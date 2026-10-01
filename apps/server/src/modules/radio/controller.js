const RadioStation = require('./RadioStation');
const asyncHandler = require('../../core/asyncHandler');

// GET /api/radio/stations?country=VN — real, currently-live third-party Icecast/Shoutcast
// streams (see scripts/radio/importRadioStations.js). The client plays streamUrl directly.
// (The station playing from the app's own music store is now Radio Hugo 24/7 — apps/server/src/modules/rooms/stations.js.)
const getStations = asyncHandler(async (req, res) => {
  const { country } = req.query;
  const filter = country ? { countryCode: country.toUpperCase(), isLive: true } : { isLive: true };
  const stations = await RadioStation.find(filter).sort({ votes: -1 });
  res.json(stations);
});

module.exports = { getStations };
