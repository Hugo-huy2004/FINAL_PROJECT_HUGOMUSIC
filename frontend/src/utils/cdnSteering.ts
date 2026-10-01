// Điều hướng multi-CDN phía client (tự viết; kiểm được: node scripts/check-cdn.mjs).
//
// Server đưa URL đã ký của cùng một bài trên mọi CDN (backend/utils/cdnSources.js); CHỈ client đo được
// đường mạng thật của chính nó tới từng CDN, nên client xếp hạng:
//
//   - Đo thụ động: thời gian từ lúc nạp tới lúc ra tiếng của mỗi lần phát (startup) → EWMA theo CDN.
//   - Đo chủ động: sau khi chọn CDN, lấy 1 byte của cùng bài từ các CDN còn lại (tối đa 1 lần / 5 phút
//     mỗi CDN) để số đo của CDN đang xếp sau không bị cũ — kiểu RUM beacon của các hệ multi-CDN thương mại.
//   - Khám phá: `explore` phần trăm số lần đổi chỗ hai CDN đứng đầu (epsilon-greedy), phòng khi CDN đầu
//     bảng chỉ "nhanh" nhờ số đo cũ.
//   - Circuit breaker: CDN lỗi (trình phát báo lỗi, probe thất bại) bị "ngắt" 30 s, tái phạm thì gấp đôi
//     (tối đa 10 phút); đang ngắt thì chỉ dùng khi mọi đường khác đều hỏng.
//
// Thứ tự cuối cùng: CDN khoẻ (nhanh → chậm) → origin (proxy Node, đắt nhưng độc lập với CDN) → CDN đang ngắt.

export type CdnStat = { ewmaMs: number; samples: number; fails: number; openUntil: number; lastProbe: number };
export const ORIGIN = 'origin';

export function createSteering({
  now = () => Date.now(), rand = Math.random, alpha = 0.3, explore = 0.1,
  openBaseMs = 30_000, openMaxMs = 600_000, probeEveryMs = 300_000,
} = {}) {
  const stats = new Map<string, CdnStat>();
  const stat = (name: string) => {
    let s = stats.get(name);
    if (!s) stats.set(name, (s = { ewmaMs: 0, samples: 0, fails: 0, openUntil: 0, lastProbe: 0 }));
    return s;
  };
  const isOpen = (name: string) => stat(name).openUntil > now();

  /** Xếp hạng các CDN (tên theo thứ tự ưu tiên của server) + origin. */
  function rank(names: string[]): string[] {
    const healthy = names.filter((n) => !isOpen(n));
    // CDN chưa có số đo coi như 0 ms → được thử (khám phá); cùng điểm thì giữ thứ tự của server.
    const score = (n: string) => (stat(n).samples ? stat(n).ewmaMs : 0);
    healthy.sort((a, b) => score(a) - score(b));
    if (healthy.length > 1 && rand() < explore) [healthy[0], healthy[1]] = [healthy[1], healthy[0]];
    const tripped = names.filter(isOpen).sort((a, b) => stat(a).openUntil - stat(b).openUntil);
    const origin = isOpen(ORIGIN) ? [] : [ORIGIN];
    return [...healthy, ...origin, ...tripped, ...(isOpen(ORIGIN) ? [ORIGIN] : [])];
  }

  function success(name: string, ms: number) {
    const s = stat(name);
    s.ewmaMs = s.samples ? s.ewmaMs * (1 - alpha) + ms * alpha : ms;
    s.samples += 1;
    s.fails = 0;
    s.openUntil = 0;
  }

  function failure(name: string) {
    const s = stat(name);
    s.fails += 1;
    s.openUntil = now() + Math.min(openMaxMs, openBaseMs * 2 ** (s.fails - 1));
  }

  /** Có nên đo chủ động CDN này bây giờ không (và đánh dấu đã đo). */
  function claimProbe(name: string) {
    const s = stat(name);
    if (isOpen(name) || now() - s.lastProbe < probeEveryMs) return false;
    s.lastProbe = now();
    return true;
  }

  const snapshot = () => Object.fromEntries([...stats].map(([k, v]) => [k, { ...v, open: v.openUntil > now() }]));

  return { rank, success, failure, claimProbe, snapshot, isOpen };
}

export const steering = createSteering();
