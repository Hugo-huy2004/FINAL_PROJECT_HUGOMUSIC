import { useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';

// Artist profile photo: ONLY actual photo of the artist (artists panel — Wikimedia source, with license).
// If you don't have a real photo, return undefined so CoverArt can draw the photo by name — don't take the album cover of a song
// as an artist's photo (the viewer thinks it is the artist's photo → "wrong image").
export function useArtistPhoto() {
  const artists = useStore((s) => s.artists);
  const fetchArtists = useStore((s) => s.fetchArtists);
  useEffect(() => { if (!artists.length) fetchArtists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const byName = useMemo(() => new Map(artists.map((a: { name: string; photo?: string }) => [a.name, a.photo])), [artists]);
  return (name?: string) => (name ? byName.get(name) || undefined : undefined);
}
