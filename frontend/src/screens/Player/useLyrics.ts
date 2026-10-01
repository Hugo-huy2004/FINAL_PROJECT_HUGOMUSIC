import { useEffect, useState } from 'react';
import { api } from '../../utils/api';

import { parseLrc } from '../../utils/lrc';
import type { Lyrics } from '../../utils/lrc';
export { parseLrc, activeLine, activeWord } from '../../utils/lrc';
export type { Lyrics, LyricLine, LyricWord } from '../../utils/lrc';

// Lời có mốc thời gian (LRCLIB) thì chạy theo nhạc; chỉ có lời thường thì hiện nguyên văn.
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
