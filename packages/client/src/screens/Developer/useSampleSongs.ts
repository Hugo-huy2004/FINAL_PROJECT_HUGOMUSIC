import { useEffect } from 'react';
import { useStore } from '../../store/useStore';

/** Real songs from the catalog for live demos (the developer page sits outside the app shell that loads them). */
export function useSampleSongs(n = 3) {
  const songs = useStore((s) => s.songs);
  const fetchSongs = useStore((s) => s.fetchSongs);
  useEffect(() => { if (!songs.length) fetchSongs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return songs.slice(0, n);
}
