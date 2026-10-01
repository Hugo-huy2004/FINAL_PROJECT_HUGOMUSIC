import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import type { StationInfo, BlindRoomInfo } from '../../rooms/types';

// Danh sách kênh 24/7 + phòng nghe mù của Hugo (backend/rooms/), làm mới mỗi 10 s vì số người nghe
// và bài đang phát đổi liên tục. Dùng chung cho tab Radio và Thư viện › Phòng nghe chung.
export function useRoomLists() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [blindRooms, setBlindRooms] = useState<BlindRoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [st, bl] = await Promise.all([api.getStations(), api.getBlindRooms()]);
      setStations(st?.stations || []);
      setBlindRooms(bl?.rooms || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [reload]);

  return { stations, blindRooms, loading, error, reload };
}
