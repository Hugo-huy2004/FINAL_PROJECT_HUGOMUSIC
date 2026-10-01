import { useMemo } from 'react';
import { useGenreGroups, useGroupLabel } from '../../lib/meta';

// List of rankings on the New page. Each table = one getTopSongs query (date range + possible group
// optional type) + color for color box cover image (ChartArt). Add new table: add a row here.
export type Chart = {
  id: string;
  size: number;       // Top N
  scope: string;      // Large text on cover photo
  days: number;       // 7 | 30 | 0 (all the time)
  group?: string;     // category group key (utils/genreGroups.ts)
  colors: [string, string];
};

export const SCOPE_CHARTS: Chart[] = [
  { id: 'week', size: 50, scope: 'Tuần này', days: 7, colors: ['#FF2D55', '#FF9F0A'] },
  { id: 'month', size: 50, scope: 'Tháng này', days: 30, colors: ['#5E5CE6', '#FF2D55'] },
  { id: 'all', size: 50, scope: 'Mọi lúc', days: 0, colors: ['#0A84FF', '#30D158'] },
];

// One chart per genre group served by GET /api/meta — a new group on the server is a new chart here.
export function useGenreCharts(): Chart[] {
  const groups = useGenreGroups();
  const label = useGroupLabel();
  return useMemo(() => groups.map((g) => ({
    id: `genre-${g.key}`, size: 25, scope: label(g), days: 0, group: g.key, colors: g.colors,
  })), [groups, label]);
}

export const chartTitle = (c: Chart) => `Top ${c.size}: ${c.scope}`;
export const findChart = (id: string, genreCharts: Chart[]) => [...SCOPE_CHARTS, ...genreCharts].find((c) => c.id === id);
