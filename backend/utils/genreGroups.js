// Thể loại trong kho là chữ tự do (~80 giá trị) — gom thành vài nhóm. Dùng chung cho đài 24/7
// (rooms/stations.js) và bảng xếp hạng theo thể loại (controllers/metricController.js).
// Phải khớp frontend/src/utils/genreGroups.ts để app và server cùng một cách hiểu.
const GENRE_GROUPS = {
  all: { label: 'Tất cả', match: null },
  chill: { label: 'Chill', match: /lo.?fi|ambient|chill|downtempo|jazz|instrumental/i },
  electronic: { label: 'Điện tử', match: /electro|techno|house|trance|idm|dance|club|industrial/i },
  pop: { label: 'Pop', match: /pop/i },
  rock: { label: 'Rock & Metal', match: /rock|metal|punk|grind|noise/i },
  hiphop: { label: 'Hip hop', match: /hip.?hop|rap|grime/i },
  folk: { label: 'Folk & Acoustic', match: /folk|acoustic|singer|country|blues/i },
  classical: { label: 'Cổ điển', match: /classical|orchestral|opera|waltz|ballet/i },
};

module.exports = { GENRE_GROUPS };
