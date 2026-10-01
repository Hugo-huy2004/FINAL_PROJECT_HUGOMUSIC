const mongoose = require('mongoose');
const { kindScope } = require('../../core/kindScope');

// An OFFICIAL public listening room from Hugo Music (users do not create rooms themselves; admins create/edit everything
// rooms — rooms/admin.js). Two types:
// station — channel broadcast continuously 24/7, songs selected by `rules` (rooms/catalog.js compileRules)
// blind — A/B blind listening room (rooms/blindTest.js)
// Playing status (track, start time, queue, blind listen) is in server memory, not here.
const rulesSchema = new mongoose.Schema({
  groups: [String],       // category group key (utils/genreGroups.js); empty = all categories
  excludeGroups: [String], // remove these genre groups (eg chill channels remove rock, classical)
  categories: [String],   // category of the repository (e.g. 'Ensemble'); empty = every category
  instrumental: Boolean,  // Just music without lyrics
  calm: Boolean,          // only quiet songs: slow tempo, light volume (measured by TransitionJob)
  popular: Boolean,       // Prioritize globally popular posts (GlobalStatsJob)
}, { _id: false });

const listeningRoomSchema = new mongoose.Schema({
  kind: { type: String, enum: ['station', 'blind'], required: true },
  slug: { type: String }, // default room (catalog.js) — to avoid creating duplicates (unique index below)
  name: { type: String, required: true, trim: true, maxlength: 40 },
  tagline: { type: String, trim: true, maxlength: 120 },
  colors: { type: [String], default: ['#5E5CE6', '#0A84FF'] }, // two color gradient cover photo
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },   // hide room without deleting
  allowRequests: { type: Boolean, default: true }, // recommended/voted listeners (channel)
  rules: { type: rulesSchema, default: () => ({}) },
  // The songs the admin chooses for the channel (Admin › Listening Room): if you choose the songs yourself, these songs will be given priority before the rules.
  pinned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
}, { timestamps: true });

// General collection `rooms` (models/kindScope.js): Hugo's listening room + external radio station (RadioStation).
listeningRoomSchema.plugin(kindScope, { kinds: ['station', 'blind'] });
listeningRoomSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
module.exports = mongoose.model('ListeningRoom', listeningRoomSchema, 'rooms');
