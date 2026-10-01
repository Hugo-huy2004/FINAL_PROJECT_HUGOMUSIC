const mongoose = require('mongoose');
const { kindScope } = require('./kindScope');

// Một phòng nghe chung CHÍNH THỨC của Hugo Music (người dùng không tự tạo phòng; admin tạo/sửa mọi
// phòng — rooms/admin.js). Hai loại:
//   station — kênh phát liên tục 24/7, bài chọn theo `rules` (rooms/catalog.js compileRules)
//   blind   — phòng nghe mù A/B (rooms/blindTest.js)
// Trạng thái đang phát (bài, giờ bắt đầu, hàng chờ, lượt nghe mù) nằm trong bộ nhớ server, không ở đây.
const rulesSchema = new mongoose.Schema({
  groups: [String],       // khoá nhóm thể loại (utils/genreGroups.js); rỗng = mọi thể loại
  excludeGroups: [String], // bỏ các nhóm thể loại này (vd. kênh chill bỏ rock, cổ điển)
  categories: [String],   // danh mục của kho (vd. 'Hòa tấu'); rỗng = mọi danh mục
  instrumental: Boolean,  // chỉ nhạc không lời
  calm: Boolean,          // chỉ bài êm: nhịp chậm, âm lượng nhẹ (số đo của TransitionJob)
  popular: Boolean,       // ưu tiên bài phổ biến toàn cầu (GlobalStatsJob)
}, { _id: false });

const listeningRoomSchema = new mongoose.Schema({
  kind: { type: String, enum: ['station', 'blind'], required: true },
  slug: { type: String }, // phòng mặc định (catalog.js) — để không tạo trùng (index unique bên dưới)
  name: { type: String, required: true, trim: true, maxlength: 40 },
  tagline: { type: String, trim: true, maxlength: 120 },
  colors: { type: [String], default: ['#5E5CE6', '#0A84FF'] }, // hai màu ảnh bìa gradient
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },   // ẩn phòng mà không xoá
  allowRequests: { type: Boolean, default: true }, // người nghe được đề xuất/bầu bài (kênh)
  rules: { type: rulesSchema, default: () => ({}) },
  // Bài admin chọn cho kênh (Quản trị › Phòng nghe): tự chọn bài thì ưu tiên các bài này trước luật.
  pinned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
}, { timestamps: true });

// Collection chung `rooms` (models/kindScope.js): phòng nghe của Hugo + đài radio bên ngoài (RadioStation).
listeningRoomSchema.plugin(kindScope, { kinds: ['station', 'blind'] });
listeningRoomSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: 'string' } } });
module.exports = mongoose.model('ListeningRoom', listeningRoomSchema, 'rooms');
