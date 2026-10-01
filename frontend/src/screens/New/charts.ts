import { GENRE_GROUPS } from '../../utils/genreGroups';

// Danh mục bảng xếp hạng ở trang Mới. Mỗi bảng = một truy vấn getTopSongs (khoảng ngày + nhóm thể
// loại tuỳ chọn) + màu cho ảnh bìa ô màu (ChartArt). Thêm bảng mới: thêm một dòng ở đây.
export type Chart = {
  id: string;
  size: number;       // Top N
  scope: string;      // dòng chữ lớn trên ảnh bìa
  days: number;       // 7 | 30 | 0 (mọi lúc)
  group?: string;     // khoá nhóm thể loại (utils/genreGroups.ts)
  colors: [string, string];
};

export const SCOPE_CHARTS: Chart[] = [
  { id: 'week', size: 50, scope: 'Tuần này', days: 7, colors: ['#FF2D55', '#FF9F0A'] },
  { id: 'month', size: 50, scope: 'Tháng này', days: 30, colors: ['#5E5CE6', '#FF2D55'] },
  { id: 'all', size: 50, scope: 'Mọi lúc', days: 0, colors: ['#0A84FF', '#30D158'] },
];

export const GENRE_CHARTS: Chart[] = GENRE_GROUPS.map((g) => ({
  id: `genre-${g.key}`, size: 25, scope: g.label, days: 0, group: g.key, colors: g.colors,
}));

export const chartTitle = (c: Chart) => `Top ${c.size}: ${c.scope}`;
export const findChart = (id: string) => [...SCOPE_CHARTS, ...GENRE_CHARTS].find((c) => c.id === id);
