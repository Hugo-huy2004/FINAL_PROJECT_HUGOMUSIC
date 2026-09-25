const Song = require('../models/Song');
const RadioStation = require('../models/RadioStation');
const asyncHandler = require('../utils/asyncHandler');

// Fixed reference point (not server boot time) so a station's position in its own
// timeline survives a restart — anchoring to boot time would snap every station
// back to track 1 every time the process restarts.
const STATION_EPOCH = new Date('2025-01-01T00:00:00Z').getTime();

// Same category grouping HugoRadioScreen used to do client-side with a fresh random
// shuffle per listener — moved here so "what's playing right now" is one answer every
// listener computes from the same server clock, instead of everyone hearing something
// different. `null` means "no dedicated category for this station yet, use the whole
// catalog".
const STATION_CATEGORY_FILTERS = {
  'hugo-1': null,
  'thanh-ca-live': (cat) => cat === 'Thánh Ca' || cat.includes('Phụng Vụ') || cat === 'Tôn giáo',
  'quoc-ca-live': (cat) => cat === 'Quốc Ca',
  'lofi-chill': (cat) => cat === 'Nhạc Public',
};

// GET /api/radio/:stationId/now-playing — deterministic function of (station playlist,
// wall-clock time). No background job or per-listener session needed: every client
// hitting this at the same moment gets the same track at the same position, because
// position is derived from elapsed time since STATION_EPOCH, not from any stored
// "currently playing" pointer. Two listeners a minute apart land a minute apart in the
// same track (or the next one) automatically.
const getNowPlaying = asyncHandler(async (req, res) => {
  const { stationId } = req.params;
  if (!(stationId in STATION_CATEGORY_FILTERS)) {
    return res.status(404).json({ message: 'Unknown radio station' });
  }

  const allSongs = await Song.find({ status: 'published' }).sort({ _id: 1 }); // stable order — never reshuffled between requests
  const filterFn = STATION_CATEGORY_FILTERS[stationId];
  let playlist = filterFn ? allSongs.filter((s) => filterFn(s.category || 'Nhạc Public')) : allSongs;
  playlist = playlist.filter((s) => s.duration > 0);
  if (playlist.length === 0) playlist = allSongs.filter((s) => s.duration > 0); // station's category is empty right now

  if (playlist.length === 0) {
    return res.status(404).json({ message: 'No playable songs in the catalog yet' });
  }

  const totalDurationMs = playlist.reduce((sum, s) => sum + s.duration * 1000, 0);
  const elapsedMs = (Date.now() - STATION_EPOCH) % totalDurationMs;

  let cursor = 0;
  let current = playlist[0];
  let positionMs = 0;
  for (const song of playlist) {
    const songDurationMs = song.duration * 1000;
    if (elapsedMs < cursor + songDurationMs) {
      current = song;
      positionMs = Math.floor(elapsedMs - cursor);
      break;
    }
    cursor += songDurationMs;
  }

  res.json({ song: current, positionMs, serverTime: Date.now() });
});

// GET /api/radio/stations?country=VN — real, currently-live stations (see
// scripts/radio/importRadioStations.js). Unlike the deterministic "now-playing" stations
// above (which simulate a live broadcast from this app's own song
// catalog), these are genuine third-party Icecast/Shoutcast streams — the client
// just plays streamUrl directly, no position/scheduling involved.
const getStations = asyncHandler(async (req, res) => {
  const { country } = req.query;
  const filter = country ? { countryCode: country.toUpperCase(), isLive: true } : { isLive: true };
  const stations = await RadioStation.find(filter).sort({ votes: -1 });
  res.json(stations);
});

module.exports = { getNowPlaying, getStations };
