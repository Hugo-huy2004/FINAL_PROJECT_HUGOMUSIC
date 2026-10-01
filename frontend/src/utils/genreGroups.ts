// Thể loại trong kho là chữ tự do (~80 giá trị) — gom thành vài nhóm. Phải khớp
// GENRE_GROUPS ở backend/rooms/stations.js để "mix" trên app và đài cùng một cách hiểu.
export const GENRE_GROUPS: { key: string; label: string; match: RegExp; colors: [string, string] }[] = [
  { key: 'chill', label: 'Chill', match: /lo.?fi|ambient|chill|downtempo|jazz|instrumental/i, colors: ['#5AC8FA', '#5856D6'] },
  { key: 'electronic', label: 'Điện tử', match: /electro|techno|house|trance|idm|dance|club|industrial/i, colors: ['#BF5AF2', '#FF2D55'] },
  { key: 'pop', label: 'Pop', match: /pop/i, colors: ['#FF9F0A', '#FF375F'] },
  { key: 'rock', label: 'Rock & Metal', match: /rock|metal|punk|grind|noise/i, colors: ['#FF453A', '#1C1C1E'] },
  { key: 'hiphop', label: 'Hip hop', match: /hip.?hop|rap|grime/i, colors: ['#FFD60A', '#FF9500'] },
  { key: 'folk', label: 'Folk & Acoustic', match: /folk|acoustic|singer|country|blues/i, colors: ['#34C759', '#0A84FF'] },
  { key: 'classical', label: 'Cổ điển', match: /classical|orchestral|opera|waltz|ballet/i, colors: ['#AC8E68', '#3A3A3C'] },
];
