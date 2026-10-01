import { resolvePlayback, getAuthToken } from '../api/api';

// Download the beginning of the next song in advance so you can click Next to hear it immediately.
//
// With HLS, prefetching is much cheaper than separate files: just master playlist +
// Variant playlist + 1 first segment is enough to play, instead of having to drag a whole file of several MB.
//
// Since the segment shortened from 10 seconds to 4 seconds (see apps/server/src/pipeline/jobs/HlsJob.js), the prefetch cost
// Further reduction: the first segment in tier 64k is only ~39 KB instead of ~90 KB. Compared to files
// Leaving 7.2 MB reduces 99.5%.
//
// Intentionally only load the FIRST segment. Listeners often skip cards, so they should pre-load more
// is gambling with their data — exactly the kind of waste that the measurement layer has caught.


const prefetched = new Set<string>();

async function warm(url: string, range?: string) {
  await fetch(url, {
    // Just go to the browser/edge cache, no need to read the content.
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}

export async function prefetchNext(
  song: { _id: string; filePath?: string; hlsPath?: string; hlsTiers?: string[] } | null,
  quality: string
) {
  // Guest: asking for a pre-download token will be counted as a free listen -> skipped.
  if (!song || !getAuthToken()) return;
  if (prefetched.has(song._id)) return;
  prefetched.add(song._id);
  // Keep files small so as not to bloat your memory during long listening sessions.
  if (prefetched.size > 50) prefetched.clear();

  try {
    // Tokens are minted per 5-minute window, so this URL is the same one playSong
    // will request next — the browser reuses what we warm here.
    const { url } = await resolvePlayback(song, quality);
    if (!/\.m3u8(\?|$)/i.test(url)) {
      // Separate file: only takes the first few hundred KB, enough to play immediately when clicking Next.
      await warm(url, 'bytes=0-262143');
      return;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const text = await res.text();
    const base = url.replace(/[^/]+$/, '');

    // master.m3u8 points to variant playlists; get the top (lowest) variant
    // because that's what ABR is most likely to boot with.
    const variant = text.split('\n').find((l) => l.trim() && !l.startsWith('#') && l.includes('.m3u8'));
    const variantUrl = variant ? base + variant.trim() : url;

    const vRes = await fetch(variantUrl, { signal: AbortSignal.timeout(15000) });
    if (!vRes.ok) return;
    const vText = await vRes.text();
    const firstSegment = vText.split('\n').find((l) => l.trim() && !l.startsWith('#'));
    if (firstSegment) await warm(base + firstSegment.trim());
  } catch {
    // If the prefetch is broken, that's okay — it absolutely cannot affect the song being played.
  }
}
