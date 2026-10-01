const mongoose = require('mongoose');
const { kindScope } = require('../../core/kindScope');

// A real, continuously-live broadcast (Icecast/Shoutcast/HLS), unlike Song — no
// duration, no seeking, nothing to cache offline. Sourced from radio-browser.info's
// open station directory (see scripts/radio/importRadioStations.js), not uploaded/owned by
// this app.
const radioStationSchema = new mongoose.Schema({
  kind: { type: String, default: 'radio' },
  name: { type: String, required: true },
  streamUrl: { type: String, required: true },
  country: { type: String, default: '' },
  countryCode: { type: String, default: '' },
  genre: { type: String, default: '' }, // first tag from radio-browser, human-facing
  favicon: { type: String, default: '' },
  codec: { type: String, default: '' },
  bitrate: { type: Number, default: 0 },
  language: { type: String, default: '' },
  votes: { type: Number, default: 0 }, // radio-browser's community quality signal
  // radio-browser's stationuuid — lets a re-import skip/update instead of duplicating.
  externalId: { type: String }, // id of radio-browser (unique index below)
  // Set by scripts/radio/checkRadioLiveness.js actually connecting to streamUrl — a station
  // list is only "smart" if dead entries get hidden instead of shown and failing on tap.
  isLive: { type: Boolean, default: true },
  lastCheckedAt: { type: Date },
}, { timestamps: true });

// External online radio station — located in the same `rooms` collection as Hugo's listening room (models/kindScope.js).
radioStationSchema.plugin(kindScope, { kinds: ['radio'] });
radioStationSchema.index({ externalId: 1 }, { unique: true, partialFilterExpression: { kind: 'radio', externalId: { $type: 'string' } } });
const RadioStation = mongoose.model('RadioStation', radioStationSchema, 'rooms');
module.exports = RadioStation;
