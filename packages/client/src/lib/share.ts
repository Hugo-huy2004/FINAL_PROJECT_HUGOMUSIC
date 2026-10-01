import { Platform, Share } from 'react-native';
import { showAlert } from './alert';
import type { Song } from '../store/useStore';

// Share an article: the website sends a link to directly open the search results for that article (SearchScreen reads ?q=).
// If you have Web Share (phone), open the device's share panel; If not, copy the link.
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
    if (e?.name !== 'AbortError') showAlert(url); // If you can't copy, then let the user copy it themselves
  }
}
