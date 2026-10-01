import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api/api';
import { Song } from '../../../store/useStore';
import { showAlert, confirmAlert } from '../../../lib/alert';

export type ReviewStatus = 'pending' | 'published' | 'rejected';
type Tier = { pass: boolean; issues: string[] };
export type ReviewedSong = Song & { review: { copyright: Tier; quality: Tier } };

// Waiting queue: all new articles are placed in the 'pending' warehouse; Admin listens, edits, okay
// approve (publish) or reject. Browsing rules reside in the backend
// (apps/server/src/modules/songs/songReview.js) — this screen only displays test results.
export function useSongManager() {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [songs, setSongs] = useState<ReviewedSong[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReviewStatus, number>>>({});
  const [isUploading, setIsUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getReviewQueue(status);
      setSongs(data.songs);
      setCounts(data.counts);
    } catch (e: any) {
      showAlert(e.message);
    }
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      await refresh();
      return true;
    } catch (e: any) {
      showAlert(e.message);
      return false;
    }
  }, [refresh]);

  const handleUpload = useCallback(async (form: FormData) => {
    setIsUploading(true);
    const ok = await run(() => api.uploadSong(form));
    setIsUploading(false);
    if (ok) {
      setStatus('pending');
      showAlert('Đã tải lên — bài đang chờ duyệt.');
    }
    return ok;
  }, [run]);

  const handleUpdate = useCallback(
    (id: string, fields: Record<string, string>) => run(() => api.updateSong(id, fields)),
    [run]
  );

  const handleReview = useCallback(
    (id: string, decision: 'publish' | 'reject', note?: string) => run(() => api.reviewSong(id, decision, note)),
    [run]
  );

  const handleCoverChange = useCallback(
    (id: string, form: FormData) => run(() => api.updateSongCover(id, form)),
    [run]
  );

  const handleDelete = useCallback(async (id: string, title: string) => {
    if (await confirmAlert(`Xoá hẳn "${title}" (cả tệp trên R2)?`)) await run(() => api.deleteSong(id));
  }, [run]);

  return { status, setStatus, songs, counts, isUploading, handleUpload, handleUpdate, handleReview, handleDelete, handleCoverChange };
}
