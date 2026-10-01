import { useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';

// Ảnh đại diện nghệ sĩ: CHỈ ảnh thật của nghệ sĩ (bảng artists — nguồn Wikimedia, có giấy phép).
// Không có ảnh thật thì trả undefined để CoverArt tự vẽ ảnh theo tên — không lấy bìa album của một bài
// làm ảnh nghệ sĩ (người xem tưởng đó là ảnh của nghệ sĩ → "sai hình").
export function useArtistPhoto() {
  const artists = useStore((s) => s.artists);
  const fetchArtists = useStore((s) => s.fetchArtists);
  useEffect(() => { if (!artists.length) fetchArtists(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const byName = useMemo(() => new Map(artists.map((a: { name: string; photo?: string }) => [a.name, a.photo])), [artists]);
  return (name?: string) => (name ? byName.get(name) || undefined : undefined);
}
