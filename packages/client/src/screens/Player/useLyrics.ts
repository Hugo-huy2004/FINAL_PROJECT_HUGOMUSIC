import { useEffect, useState } from 'react';
import { api } from '../../api/api';

import { parseLrc } from 'hugo-stream';
import type { Lyrics } from 'hugo-stream';
export { activeLine, activeWord } from 'hugo-stream';
export type { Lyrics, LyricLine } from 'hugo-stream';

// Words with time signatures (LRCLIB) run with the music; Only regular words appear verbatim.
export function useLyrics(songId?: string): Lyrics {
  const [lyrics, setLyrics] = useState<Lyrics>({ status: 'loading', synced: null, plain: null });
  useEffect(() => {
    if (!songId || songId.startsWith('radio-')) return setLyrics({ status: 'none', synced: null, plain: null });
    let alive = true;
    setLyrics({ status: 'loading', synced: null, plain: null });
    api.getLyrics(songId)
      .then((r: { hasLyrics: boolean; syncedLyrics: string | null; plainLyrics: string | null }) => {
        if (!alive) return;
        const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
        setLyrics(r.hasLyrics
          ? { status: 'ready', synced: synced.length ? synced : null, plain: r.plainLyrics }
          : { status: 'none', synced: null, plain: null });
      })
      .catch(() => alive && setLyrics({ status: 'none', synced: null, plain: null }));
    return () => { alive = false; };
  }, [songId]);
  return lyrics;
}
