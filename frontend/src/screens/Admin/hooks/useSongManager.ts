import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../utils/api';
import { Song } from '../../../store/useStore';
import { showAlert, confirmAlert } from '../../../utils/alert';

export type ReviewStatus = 'pending' | 'published' | 'rejected';
type Tier = { pass: boolean; issues: string[] };
export type ReviewedSong = Song & { review: { copyright: Tier; quality: Tier } };

// Hàng chờ duyệt: mọi bài mới vào kho ở 'pending'; admin nghe thử, sửa, rồi
// duyệt (xuất bản) hoặc từ chối. Quy tắc duyệt nằm ở backend
// (backend/utils/songReview.js) — màn hình này chỉ hiển thị kết quả kiểm tra.
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
