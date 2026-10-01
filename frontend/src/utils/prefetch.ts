import { resolvePlayback, getAuthToken } from './api';

// Tải trước phần đầu bài kế tiếp để bấm Next là kêu ngay.
//
// Với HLS, prefetch rẻ hơn hẳn so với file rời: chỉ cần master playlist +
// playlist biến thể + 1 segment đầu là đủ phát, thay vì phải kéo cả file vài MB.
//
// Từ khi segment rút từ 10 giây xuống 4 giây (xem backend/pipeline/jobs/HlsJob.js), chi phí prefetch
// giảm tiếp: segment đầu ở tier 64k chỉ còn ~39 KB thay vì ~90 KB. So với file
// rời 7.2 MB thì giảm 99.5%.
//
// Cố ý chỉ nạp segment ĐẦU TIÊN. Người nghe hay bỏ bài, nên tải sẵn nhiều hơn
// là đánh cược bằng data của họ — đúng kiểu lãng phí mà lớp đo lường đã bắt được.


const prefetched = new Set<string>();

async function warm(url: string, range?: string) {
  await fetch(url, {
    // Chỉ cần vào cache trình duyệt/edge, không cần đọc nội dung.
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}

export async function prefetchNext(
  song: { _id: string; filePath?: string; hlsPath?: string; hlsTiers?: string[] } | null,
  quality: string
) {
  // Khách: xin token tải trước sẽ bị tính là một lượt nghe miễn phí -> bỏ qua.
  if (!song || !getAuthToken()) return;
  if (prefetched.has(song._id)) return;
  prefetched.add(song._id);
  // Giữ tập nhỏ để không phình bộ nhớ trong phiên nghe dài.
  if (prefetched.size > 50) prefetched.clear();

  try {
    // Tokens are minted per 5-minute window, so this URL is the same one playSong
    // will request next — the browser reuses what we warm here.
    const { url } = await resolvePlayback(song, quality);
    if (!/\.m3u8(\?|$)/i.test(url)) {
      // File rời: chỉ lấy vài trăm KB đầu, đủ để phát ngay khi bấm Next.
      await warm(url, 'bytes=0-262143');
      return;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const text = await res.text();
    const base = url.replace(/[^/]+$/, '');

    // master.m3u8 trỏ tới các playlist biến thể; lấy biến thể đầu (thấp nhất)
    // vì đó là thứ ABR nhiều khả năng khởi động cùng.
    const variant = text.split('\n').find((l) => l.trim() && !l.startsWith('#') && l.includes('.m3u8'));
    const variantUrl = variant ? base + variant.trim() : url;

    const vRes = await fetch(variantUrl, { signal: AbortSignal.timeout(15000) });
    if (!vRes.ok) return;
    const vText = await vRes.text();
    const firstSegment = vText.split('\n').find((l) => l.trim() && !l.startsWith('#'));
    if (firstSegment) await warm(base + firstSegment.trim());
  } catch {
    // Prefetch hỏng thì thôi — tuyệt đối không được ảnh hưởng bài đang phát.
  }
}
