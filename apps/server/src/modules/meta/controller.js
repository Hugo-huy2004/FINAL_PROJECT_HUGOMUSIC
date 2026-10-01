const Song = require('../songs/Song');
const { GENRE_GROUPS } = require('./genreGroups');
const { LICENSES, PREFERENCE_GENRES } = require('./taxonomy');
const { NO_DERIVATIVE } = require('../songs/songReview');

// Built once from the server's own tables and schema enums — adding a license, a genre group or a song
// status on the server shows up in every client without a client release.
function buildMeta() {
  return {
    genreGroups: Object.entries(GENRE_GROUPS).map(([key, g]) => ({
      key, label: g.label, labelEn: g.labelEn, colors: g.colors,
      match: g.match ? { source: g.match.source, flags: g.match.flags } : null,
    })),
    // noDerivatives: the pipeline must not transcode these (no HLS), clients show the original file instead
    licenses: Object.entries(LICENSES).map(([key, label]) => ({ key, label, noDerivatives: NO_DERIVATIVE.includes(key) })),
    preferenceGenres: PREFERENCE_GENRES,
    songStatuses: Song.schema.path('status').enumValues,
  };
}

let cached;
const getMeta = (req, res) => res.json((cached ||= buildMeta()));

module.exports = { getMeta, buildMeta };

if (require.main === module) {
  const assert = require('assert');
  const m = buildMeta();
  assert.ok(m.genreGroups.find((g) => g.key === 'rock').match.source.includes('metal'));
  assert.ok(new RegExp(m.genreGroups[1].match.source, m.genreGroups[1].match.flags).test('Lo-Fi beats'), 'regex survives JSON');
  assert.deepStrictEqual(m.songStatuses, ['pending', 'published', 'rejected'], 'statuses come from the schema enum');
  assert.deepStrictEqual(m.licenses.map((l) => l.key), Song.schema.path('licenseType').enumValues, 'licenses match the schema enum');
  assert.deepStrictEqual(m.licenses.filter((l) => l.noDerivatives).map((l) => l.key).sort(), ['cc-by-nc-nd', 'cc-by-nd']);
  console.log('meta self-check: ok');
}
