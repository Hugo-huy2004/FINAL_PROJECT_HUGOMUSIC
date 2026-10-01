import { useEffect, useState } from 'react';
import { api } from './api';
import type { Song } from '../store/useStore';

// Thứ tự "mới nhất" theo MỐC THỜI GIAN thật (createdAt), không dựa vào thứ tự API trả về.
export const newestFirst = (a: Song, b: Song) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
export const byNewest = (list: Song[]) => [...list].sort(newestFirst);

// Bảng xếp hạng — lượt nghe trên Hugo (≥ 30 s hoặc nghe hết) trộn với độ phổ biến toàn cầu
// (backend/controllers/metricController.js getTopSongs, backend/ranking/score.js).
export type TopEntry = { rank: number; song: Song; plays: number; listeners: number; globalPlays: number; score: number };

// Mỗi (khoảng, số lượng) chỉ tải một lần trong phiên; quay lại khoảng đã xem thì có ngay, không nháy trắng.
// Làm mới ngầm sau MAX_AGE_MS để số liệu vẫn "sống".
const MAX_AGE_MS = 60_000;
const cache = new Map<string, { at: number; top: TopEntry[] }>();

export function useTopSongs(days: number, limit = 50, group?: string) {
  const key = `${days}:${limit}:${group ?? 'all'}`;
  const [state, setState] = useState<{ key: string; top: TopEntry[] } | null>(() => (cache.has(key) ? { key, top: cache.get(key)!.top } : null));
  useEffect(() => {
    let alive = true;
    const hit = cache.get(key);
    if (hit) setState({ key, top: hit.top });
    if (hit && Date.now() - hit.at < MAX_AGE_MS) return;
    api.getTopSongs(days, limit, group)
      .then((r: { top: TopEntry[] }) => {
        cache.set(key, { at: Date.now(), top: r.top });
        if (alive) setState({ key, top: r.top });
      })
      .catch(() => alive && !hit && setState({ key, top: [] }));
    return () => { alive = false; };
  }, [key]);
  // Đang tải khoảng MỚI: vẫn trả danh sách cũ (để giao diện chuyển mượt), kèm cờ loading.
  return { top: state?.top ?? [], loading: state?.key !== key, ready: state !== null };
}
