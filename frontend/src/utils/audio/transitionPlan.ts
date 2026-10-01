// Kế hoạch chuyển từ bài đang phát sang bài kế — logic THUẦN (không đụng máy phát/store) để
// kiểm tra được bằng scripts/check-transition-plan.mjs. Dữ liệu đầu vào lấy từ Song.transition
// (backend/pipeline/analyzers/transition_analyze.py).
//
//  gapless   — nối ngay điểm hết nhạc thật (bỏ im lặng cuối), chồng 120 ms để xoá tiếng "tách"
//  crossfade — hai bài chồng nhau N giây, kết thúc đúng lúc bài trước hết nhạc thật
//  automix   — kiểu DJ nhẹ: vào ở đoạn outro (lúc nhạc bắt đầu nhỏ dần), độ dài fade tính theo
//              ô nhịp (4 phách), điểm bắt đầu rơi đúng phách, bài sau vào đúng phách đầu của nó.
//              Không co giãn tốc độ — hai bài lệch tempo nhiều thì fade ngắn lại cho khỏi "lệch nhịp".
//              Không đủ dữ liệu nhịp → lùi về crossfade.
// Hai bài liên tiếp cùng album luôn nối liền mạch (Apple cũng không crossfade album liền mạch).
// Không import gì — Node chạy thẳng tệp này khi kiểm tra.

export type TransitionInfo = {
  trimStart?: number; trimEnd?: number; introEnd?: number; outroStart?: number;
  lufs?: number; bpm?: number; beatOffset?: number; beatConfidence?: number;
};
export type TrackInfo = { duration?: number; transition?: TransitionInfo; albumKey?: string };
export type TransitionMode = 'gapless' | 'crossfade' | 'automix';
export type Plan = {
  at: number;        // giây trên bài hiện tại: lúc bắt đầu chuyển
  fadeMs: number;    // thời gian hai bài chồng nhau
  nextStart: number; // bài kế bắt đầu phát từ giây này (bỏ im lặng đầu / vào đúng phách)
  kind: 'gapless' | 'crossfade' | 'beatmatch';
};

export const TARGET_LUFS = -16;   // gần Sound Check của Apple; bài to hơn bị hạ xuống mức này
const DEFAULT_LUFS = -12;         // bài chưa phân tích: coi như độ to điển hình của kho
const GAPLESS_MS = 120;
const MIN_CONFIDENCE = 0.2;       // độ tin cậy nhịp tối thiểu để canh phách
const MAX_TEMPO_DRIFT = 0.06;     // lệch tempo > 6% thì fade chỉ 1 ô nhịp

// Hệ số âm lượng để mọi bài về cùng độ to cảm nhận. Chỉ HẠ (≤ 1): phần tử <audio>/expo-av
// không khuếch đại quá 1, và khuếch đại bài nhỏ dễ vỡ tiếng.
export function gainFor(t?: TransitionInfo): number {
  const lufs = t?.lufs ?? DEFAULT_LUFS;
  return Math.max(0.1, Math.min(1, Math.pow(10, (TARGET_LUFS - lufs) / 20)));
}

export const startOf = (t?: TransitionInfo) => t?.trimStart ?? 0;
const endOf = (track: TrackInfo) => track.transition?.trimEnd ?? track.duration ?? 0;
const beatOf = (t?: TransitionInfo) =>
  t?.bpm && t.beatConfidence !== undefined && t.beatConfidence >= MIN_CONFIDENCE && t.beatOffset !== undefined
    ? { period: 60 / t.bpm, offset: t.beatOffset, bpm: t.bpm }
    : null;

export function planTransition(cur: TrackInfo, next: TrackInfo, mode: TransitionMode, fadeSeconds: number): Plan {
  const end = endOf(cur);
  const begin = startOf(cur.transition);
  const nextStart = startOf(next.transition);
  // Bài quá ngắn: fade không được ăn quá 1/3 phần có nhạc.
  const room = Math.max(0, (end - begin) / 3);

  if (mode === 'gapless' || (cur.albumKey && cur.albumKey === next.albumKey) || room < 1) {
    return { at: Math.max(begin, end - GAPLESS_MS / 1000), fadeMs: GAPLESS_MS, nextStart, kind: 'gapless' };
  }

  const crossfade = (): Plan => {
    const fade = Math.min(fadeSeconds, room);
    return { at: end - fade, fadeMs: Math.round(fade * 1000), nextStart, kind: 'crossfade' };
  };
  if (mode === 'crossfade') return crossfade();

  // --- automix ---
  const a = beatOf(cur.transition);
  if (!a) return crossfade();
  const b = beatOf(next.transition);
  // Tempo gấp đôi/một nửa vẫn khớp phách (69 và 138 BPM là cùng một mạch) — lấy độ lệch nhỏ nhất.
  const drift = b ? Math.min(...[0.5, 1, 2].map((k) => Math.abs(b.bpm * k - a.bpm) / a.bpm)) : 1;
  const bar = 4 * a.period;
  // Số ô nhịp: gần ~8 s nhất, tối thiểu 1 ô; lệch tempo nhiều thì chỉ 1 ô.
  let bars = drift > MAX_TEMPO_DRIFT ? 1 : Math.max(1, Math.round(8 / bar));
  while (bars > 1 && bars * bar > room) bars -= 1;
  const fade = Math.min(bars * bar, room);
  // Vào ở đoạn outro nếu bài có đuôi nhỏ dần rõ ràng (2–20 s), không thì kết thúc đúng lúc hết nhạc.
  const outro = cur.transition?.outroStart;
  const target = outro !== undefined && end - outro >= 2 && end - outro <= 20 ? Math.min(outro, end - fade) : end - fade;
  // Rơi xuống phách gần nhất trước target (không kéo fade vượt quá điểm hết nhạc).
  const k = Math.floor((target - a.offset) / a.period);
  const at = Math.max(begin, a.offset + k * a.period);
  return {
    at,
    fadeMs: Math.round(fade * 1000),
    nextStart: b ? b.offset : nextStart, // bài sau vào đúng phách đầu (phách đầu đã ≥ trimStart)
    kind: 'beatmatch',
  };
}
