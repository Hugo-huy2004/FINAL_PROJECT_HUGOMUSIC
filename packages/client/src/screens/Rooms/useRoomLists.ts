import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/api';
import type { StationInfo, BlindRoomInfo } from '../../rooms/types';

// 24/7 channel list + Hugo's blind listening room (apps/server/src/modules/rooms/), refreshed every 10 s based on listener count
// and the song is constantly changing. Shared for the Radio and Library › Public Listening Room tab.
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
