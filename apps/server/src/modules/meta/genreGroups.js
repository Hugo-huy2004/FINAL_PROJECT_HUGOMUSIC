// Genres in the catalog are free text (~80 values) — grouped into a few families. Single source of truth:
// 24/7 stations (rooms/catalog.js), genre charts (metrics/controller.js) and every client
// (GET /api/meta → packages/client/src/lib/meta.ts) read this table; nothing is copied by hand.
const GENRE_GROUPS = {
  all: { label: 'Tất cả', labelEn: 'All', match: null, colors: ['#8E8E93', '#3A3A3C'] },
  chill: { label: 'Chill', labelEn: 'Chill', match: /lo.?fi|ambient|chill|downtempo|jazz|instrumental/i, colors: ['#5AC8FA', '#5856D6'] },
  electronic: { label: 'Điện tử', labelEn: 'Electronic', match: /electro|techno|house|trance|idm|dance|club|industrial/i, colors: ['#BF5AF2', '#FF2D55'] },
  pop: { label: 'Pop', labelEn: 'Pop', match: /pop/i, colors: ['#FF9F0A', '#FF375F'] },
  rock: { label: 'Rock & Metal', labelEn: 'Rock & Metal', match: /rock|metal|punk|grind|noise/i, colors: ['#FF453A', '#1C1C1E'] },
  hiphop: { label: 'Hip hop', labelEn: 'Hip hop', match: /hip.?hop|rap|grime/i, colors: ['#FFD60A', '#FF9500'] },
  folk: { label: 'Folk & Acoustic', labelEn: 'Folk & Acoustic', match: /folk|acoustic|singer|country|blues/i, colors: ['#34C759', '#0A84FF'] },
  classical: { label: 'Cổ điển', labelEn: 'Classical', match: /classical|orchestral|opera|waltz|ballet/i, colors: ['#AC8E68', '#3A3A3C'] },
};

module.exports = { GENRE_GROUPS };
