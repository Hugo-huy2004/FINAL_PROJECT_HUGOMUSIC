// Reference data owned by the server and published at GET /api/meta, so clients never hard-code it.

// Licenses a song may carry. The keys are the Song.licenseType enum (songs/songReview.js derives
// LICENSE_TYPES from here); labels are what listeners and admins see.
const LICENSES = {
  'public-domain': 'Public Domain',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nc': 'CC BY-NC',
  'cc-by-nd': 'CC BY-ND',
  'cc-by-nc-sa': 'CC BY-NC-SA',
  'cc-by-nc-nd': 'CC BY-NC-ND',
  'cc-other': 'Creative Commons',
};

// Genres a listener can pick as preferences at sign-up / in the profile.
const PREFERENCE_GENRES = ['Pop', 'Rock', 'Hip Hop', 'EDM', 'R&B', 'Jazz', 'Cổ điển', 'Indie', 'Lo-fi', 'Ballad', 'Rap Việt', 'Bolero'];

module.exports = { LICENSES, PREFERENCE_GENRES };
