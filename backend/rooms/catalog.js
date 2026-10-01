// Danh mục phòng nghe chung của Hugo: các phòng mặc định (tạo lần đầu khi chưa có phòng nào) và
// cách dịch `rules` của một kênh thành truy vấn MongoDB chọn bài.
const assert = require('assert');
const ListeningRoom = require('../models/ListeningRoom');
const { GENRE_GROUPS } = require('../utils/genreGroups');

// Không lời: danh mục Hòa tấu hoặc thể loại vốn không lời.
const INSTRUMENTAL = /instrumental|classical|orchestral|ambient|piano|soundtrack|waltz|ballet|lo.?fi|downtempo/i;
// Êm: nhịp chậm (hoặc không đo được nhịp — thường là nhạc không phách rõ) và không quá to.
const CALM_MAX_BPM = 115;
const CALM_MAX_LUFS = -11;

const DEFAULT_ROOMS = [
  { kind: 'station', slug: 'lofi-chill', order: 1, name: 'Lofi · Chill', tagline: 'Giai điệu thư thái chạy suốt 24/7', colors: ['#5AC8FA', '#5856D6'], rules: { calm: true, excludeGroups: ['classical', 'rock', 'hiphop'], categories: ['Nhạc Quốc Tế', 'Nhạc trẻ'] } },
  { kind: 'station', slug: 'study', order: 2, name: 'Study with Hugo', tagline: 'Nhạc không lời nhẹ nhàng để tập trung', colors: ['#30D158', '#0A84FF'], allowRequests: false, rules: { instrumental: true, calm: true } },
  { kind: 'station', slug: 'hugo-hits', order: 3, name: 'Hugo Hits 24/7', tagline: 'Những bài được nghe nhiều nhất', colors: ['#FF2D55', '#FF9F0A'], rules: { popular: true } },
  { kind: 'station', slug: 'electronic', order: 4, name: 'Điện tử không ngừng', tagline: 'Electro, techno, house — không nghỉ', colors: ['#BF5AF2', '#FF2D55'], rules: { groups: ['electronic'] } },
  { kind: 'station', slug: 'classical', order: 5, name: 'Cổ điển thư thái', tagline: 'Hoà tấu và giao hưởng kinh điển', colors: ['#AC8E68', '#3A3A3C'], allowRequests: false, rules: { groups: ['classical'], calm: true } },
  { kind: 'station', slug: 'indie', order: 6, name: 'Indie & Acoustic', tagline: 'Folk, acoustic và pop độc lập', colors: ['#34C759', '#FF9F0A'], rules: { groups: ['folk', 'pop'] } },
  { kind: 'blind', slug: 'blind-hugo', order: 1, name: 'Nghe mù Hugo', tagline: 'Nghe hai bản, đoán bản nào chất lượng cao hơn', colors: ['#1C1C1E', '#5E5CE6'] },
];

// rules → điều kiện Mongo (không gồm status/duration — người gọi tự thêm).
function compileRules(rules = {}) {
  const and = [];
  const regexes = (rules.groups || []).map((k) => GENRE_GROUPS[k]?.match).filter(Boolean);
  if (regexes.length) and.push({ genre: { $in: regexes } });
  const excluded = (rules.excludeGroups || []).map((k) => GENRE_GROUPS[k]?.match).filter(Boolean);
  if (excluded.length) and.push({ genre: { $nin: excluded } });
  if (rules.categories?.length) and.push({ category: { $in: rules.categories } });
  if (rules.instrumental) and.push({ $or: [{ category: 'Hòa tấu' }, { genre: INSTRUMENTAL }] });
  if (rules.calm) {
    and.push({ $or: [{ 'transition.bpm': { $lt: CALM_MAX_BPM } }, { 'transition.bpm': null }] });
    and.push({ $or: [{ 'transition.lufs': { $lte: CALM_MAX_LUFS } }, { 'transition.lufs': null }] });
  }
  return and.length ? { $and: and } : {};
}

// Tạo các phòng mặc định còn thiếu (theo slug) — gọi khi liệt kê phòng. Phòng admin đã XOÁ thì
// không tạo lại: chỉ tạo khi kho chưa có phòng nào cùng loại.
async function ensureSeeded(kind) {
  if (await ListeningRoom.exists({ kind })) return;
  await ListeningRoom.insertMany(DEFAULT_ROOMS.filter((r) => r.kind === kind));
}

function selfCheck() {
  assert.deepStrictEqual(compileRules({}), {});
  const q = compileRules({ groups: ['chill', 'nope'], instrumental: true, calm: true });
  assert.strictEqual(q.$and.length, 4, 'nhóm + không lời + nhịp + âm lượng');
  assert.ok(q.$and[0].genre.$in[0].test('Lo-Fi'));
  assert.ok(INSTRUMENTAL.test('Piano') && !INSTRUMENTAL.test('Hip Hop'));
  assert.deepStrictEqual(compileRules({ categories: ['Hòa tấu'] }), { $and: [{ category: { $in: ['Hòa tấu'] } }] });
  assert.ok(compileRules({ excludeGroups: ['rock'] }).$and[0].genre.$nin[0].test('Metal'));
  const slugs = DEFAULT_ROOMS.map((r) => r.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length, 'slug không trùng');
}

module.exports = { compileRules, ensureSeeded, selfCheck };

if (require.main === module) {
  selfCheck();
  console.log('rooms catalog self-check: ok');
}
