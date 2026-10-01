// LRC lyrics. `words` exists only when the source carries per-word stamps (extended LRC "<mm:ss.xx>word");
// stamps are never invented — without them the whole line lights up at once.

/** @typedef {{ time: number, text: string }} LyricWord */
/** @typedef {{ time: number, end: number, text: string, words: LyricWord[] | null }} LyricLine */
/** @typedef {{ status: 'loading' | 'none' | 'ready', synced: LyricLine[] | null, plain: string | null }} Lyrics */

const TIME = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
const WORD = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
/** @param {string} m @param {string} s */
const toSeconds = (m, s) => Number(m) * 60 + Number(s.replace(':', '.'));

/**
 * Parse LRC into lines sorted by time. Supports several stamps on one line ("[00:12.00][01:30.00] chorus"),
 * per-word stamps and the [offset:±ms] tag (positive = lyrics show EARLIER, as the format defines).
 * @param {string} lrc
 * @returns {LyricLine[]}
 */
export function parseLrc(lrc) {
  const offset = Number((lrc.match(/\[offset:\s*([+-]?\d+)\]/i) || [])[1] || 0) / 1000;
  /** @type {Omit<LyricLine, 'end'>[]} */
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIME)];
    if (!stamps.length) continue;
    const body = raw.replace(TIME, '');
    const words = [...body.matchAll(WORD)]
      .map((w) => ({ time: toSeconds(w[1], w[2]) - offset, text: w[3] }))
      .filter((w) => w.text.trim());
    const text = (words.length ? words.map((w) => w.text).join('') : body).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    for (const st of stamps) lines.push({ time: toSeconds(st[1], st[2]) - offset, text, words: words.length ? words : null });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines.map((l, i) => ({ ...l, end: lines[i + 1]?.time ?? l.time + 6 }));
}

/**
 * Index of the line being sung: the last line whose time has come (binary search — called ~20×/s). -1 before the first.
 * @param {LyricLine[]} lines
 * @param {number} position seconds
 */
export function activeLine(lines, position) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Index of the last word whose time has come in a line with per-word stamps; -1 otherwise.
 * @param {LyricLine} line
 * @param {number} position seconds
 */
export function activeWord(line, position) {
  if (!line.words) return -1;
  let i = -1;
  for (let k = 0; k < line.words.length && line.words[k].time <= position; k++) i = k;
  return i;
}
