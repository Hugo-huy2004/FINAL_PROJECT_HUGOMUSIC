// Đọc lời LRC — logic THUẦN (không import gì) để kiểm bằng scripts/check-lrc.mjs.
// Một dòng lời có mốc thời gian; `words` chỉ có khi nguồn cho mốc TỪNG CHỮ (LRC mở rộng
// "<mm:ss.xx>chữ"). Không bao giờ tự bịa mốc — không có thì cả dòng sáng cùng lúc.
export type LyricWord = { time: number; text: string };
export type LyricLine = { time: number; end: number; text: string; words: LyricWord[] | null };
export type Lyrics = { status: 'loading' | 'none' | 'ready'; synced: LyricLine[] | null; plain: string | null };

const TIME = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
const WORD = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
const toSeconds = (m: string, s: string) => Number(m) * 60 + Number(s.replace(':', '.'));

// LRC → danh sách dòng. Hỗ trợ: nhiều mốc trên một dòng ("[00:12.00][01:30.00] điệp khúc"),
// mốc từng chữ, và thẻ [offset:±ms] (dương = lời hiện SỚM hơn, theo chuẩn LRC).
export function parseLrc(lrc: string): LyricLine[] {
  const offset = Number((lrc.match(/\[offset:\s*([+-]?\d+)\]/i) || [])[1] || 0) / 1000;
  const lines: Omit<LyricLine, 'end'>[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIME)];
    if (!stamps.length) continue;
    const body = raw.replace(TIME, '');
    const words = [...body.matchAll(WORD)]
      .map((w) => ({ time: toSeconds(w[1], w[2]) - offset, text: w[3] }))
      .filter((w) => w.text.trim());
    const text = (words.length ? words.map((w) => w.text).join('') : body).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    for (const st of stamps) {
      const time = toSeconds(st[1], st[2]) - offset;
      lines.push({ time, text, words: words.length ? words : null });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines.map((l, i) => ({ ...l, end: lines[i + 1]?.time ?? l.time + 6 }));
}

// Chỉ số dòng đang hát: dòng cuối cùng đã tới giờ (tìm nhị phân — gọi ~20 lần/giây).
export function activeLine(lines: LyricLine[], position: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// Chữ cuối cùng đã tới giờ trong một dòng có mốc từng chữ.
export function activeWord(line: LyricLine, position: number): number {
  if (!line.words) return -1;
  let i = -1;
  for (let k = 0; k < line.words.length && line.words[k].time <= position; k++) i = k;
  return i;
}
