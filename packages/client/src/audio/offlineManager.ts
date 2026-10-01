/**
 * =============================================================================
 * OFFLINE MANAGER (Offline Audio Downloads & Storage Management)
 * =============================================================================
 * WHAT IT DOES:
 *    - Downloads binary audio files directly to device disk using `expo-file-system` (iOS/Android).
 *    - Caches audio in browser Cache Storage API (Web).
 *    - Tracks downloaded song metadata and measures disk storage usage (MB).
 *    - Provides `getPlayableUrl()` to play songs instantly when offline (no internet).
 * 
 * WHO CALLS THIS FILE:
 *    - `shared/src/screens/Library/DownloadedTab.tsx`: Lists offline songs & clears cache.
 *    - `shared/src/components/SongActions/SongActions.tsx`: When user clicks "Download".
 *    - `shared/src/store/useStore.ts`: Prioritizes local file playback when playing.
 * =============================================================================
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Song } from '../store/useStore';
import { extractSongId, formatBytes, localAudioPathFor } from './offlineUtils';

export { extractSongId, formatBytes, localAudioPathFor };

const OFFLINE_SONGS_KEY = '@hugomusic_offline_songs';
const CACHE_NAME = 'hugomusic-offline-audio-v1';

export type OfflineSongMetadata = Song & {
  downloadedAt?: number;
  fileSizeBytes?: number;
};

export function getOfflineDir(): string {
  if (Platform.OS === 'web') return '';
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return `${base}hugomusic_offline/`;
}

class OfflineManager {
  // Get a list of metadata of downloaded articles
  async getOfflineSongs(): Promise<OfflineSongMetadata[]> {
    try {
      const json = await AsyncStorage.getItem(OFFLINE_SONGS_KEY);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  // Check if a song is saved locally
  async isSongDownloaded(songId: string): Promise<boolean> {
    const list = await this.getOfflineSongs();
    return list.some((s) => s._id === songId);
  }

  // Load binary audio files and store metadata.
  // fetchUrl carries a temporary token; On Native it is saved to file system, on Web it is saved to Cache API.
  async downloadSong(song: Song, fetchUrl: string, cacheKey: string): Promise<boolean> {
    try {
      let fileSizeBytes = 0;

      // 1. Download the audio binary
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'caches' in window) {
          const cache = await window.caches.open(CACHE_NAME);
          const res = await fetch(fetchUrl);
          if (!res.ok) return false;
          const contentLength = res.headers.get('content-length');
          if (contentLength) fileSizeBytes = parseInt(contentLength, 10) || 0;
          await cache.put(cacheKey, res);
        }
      } else {
        const dir = getOfflineDir();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        const localPath = localAudioPathFor(dir, song._id);
        const res = await FileSystem.downloadAsync(fetchUrl, localPath);
        if (res.status < 200 || res.status >= 300) {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
          return false;
        }
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists && typeof fileInfo.size === 'number') {
          fileSizeBytes = fileInfo.size;
        }
      }

      // 2. Save metadata to AsyncStorage
      const currentList = await this.getOfflineSongs();
      const metaItem: OfflineSongMetadata = {
        ...song,
        downloadedAt: Date.now(),
        fileSizeBytes: fileSizeBytes || undefined,
      };
      const filtered = currentList.filter((s) => s._id !== song._id);
      const updated = [metaItem, ...filtered];
      await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(updated));

      return true;
    } catch (err) {
      console.warn('Failed to cache song offline:', err);
      return false;
    }
  }

  // Delete articles from offline memory
  async removeSong(songId: string, streamUrl?: string): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'caches' in window && streamUrl) {
          const cache = await window.caches.open(CACHE_NAME);
          await cache.delete(streamUrl);
        }
      } else {
        const dir = getOfflineDir();
        const localPath = localAudioPathFor(dir, songId);
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      }

      const currentList = await this.getOfflineSongs();
      const updated = currentList.filter((s) => s._id !== songId);
      await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(updated));
      return true;
    } catch (err) {
      console.warn('Failed to remove offline song:', err);
      return false;
    }
  }

  // Get a local path that can be played immediately (file:// on Native or blob: on Web)
  async getPlayableUrl(streamUrl: string, songId?: string): Promise<string | null> {
    try {
      const sId = songId || extractSongId(streamUrl);

      // 1. Test on Native
      if (Platform.OS !== 'web' && sId) {
        const dir = getOfflineDir();
        const localPath = localAudioPathFor(dir, sId);
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && !info.isDirectory) {
          return localPath;
        }
      }

      // 2. Check on the Web
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'caches' in window) {
        const cache = await window.caches.open(CACHE_NAME);
        const match = await cache.match(streamUrl);
        if (match) {
          const blob = await match.blob();
          return URL.createObjectURL(blob);
        }
      }
    } catch {
      // Fallback when cache cannot be read
    }
    return null;
  }

  // Calculate the total capacity of downloaded articles
  async getTotalOfflineSize(): Promise<number> {
    try {
      const list = await this.getOfflineSongs();
      const totalFromMeta = list.reduce((acc, s) => acc + (s.fileSizeBytes || 0), 0);
      if (totalFromMeta > 0) return totalFromMeta;

      if (Platform.OS !== 'web') {
        const dir = getOfflineDir();
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) return 0;
        const files = await FileSystem.readDirectoryAsync(dir);
        let total = 0;
        for (const file of files) {
          const info = await FileSystem.getInfoAsync(`${dir}${file}`);
          if (info.exists && typeof info.size === 'number') {
            total += info.size;
          }
        }
        return total;
      }
    } catch {}
    return 0;
  }

  // Delete all downloaded articles
  async clearAllOffline(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && 'caches' in window) {
          await window.caches.delete(CACHE_NAME);
        }
      } else {
        const dir = getOfflineDir();
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
      await AsyncStorage.removeItem(OFFLINE_SONGS_KEY);
    } catch (err) {
      console.warn('Failed to clear all offline storage:', err);
    }
  }
}

export const offlineManager = new OfflineManager();
