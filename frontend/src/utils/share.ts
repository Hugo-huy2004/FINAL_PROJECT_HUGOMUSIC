import { Platform, Share } from 'react-native';
import { showAlert } from './alert';
import type { Song } from '../store/useStore';

// Chia sẻ một bài: web gửi liên kết mở thẳng kết quả tìm kiếm bài đó (SearchScreen đọc ?q=).
// Có Web Share (điện thoại) thì mở bảng chia sẻ của máy; không có thì chép liên kết.
export async function shareSong(song: Song) {
  const text = `${song.title} — ${song.artist}`;
  if (Platform.OS !== 'web') {
    await Share.share({ message: `${text} · Hugo Music` }).catch(() => {});
    return;
  }
  const url = `${window.location.origin}/search?q=${encodeURIComponent(`${song.title} ${song.artist}`)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: song.title, text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showAlert('Đã chép liên kết bài hát.');
  } catch (e: any) {
    if (e?.name !== 'AbortError') showAlert(url); // không chép được thì hiện để người dùng tự chép
  }
}
