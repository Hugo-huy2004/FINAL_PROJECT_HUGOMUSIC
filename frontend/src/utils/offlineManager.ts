import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Song } from '../store/useStore';

const OFFLINE_SONGS_KEY = '@hugomusic_offline_songs';
const CACHE_NAME = 'hugomusic-offline-audio-v1';

class OfflineManager {
  // Get all cached songs metadata
  async getOfflineSongs(): Promise<Song[]> {
    try {
      const json = await AsyncStorage.getItem(OFFLINE_SONGS_KEY);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  // Check if a song is downloaded
  async isSongDownloaded(songId: string): Promise<boolean> {
    const list = await this.getOfflineSongs();
    return list.some((s) => s._id === songId);
  }

  // Download audio & store metadata. `fetchUrl` carries a short-lived token; the copy
  // is stored under the token-free `cacheKey` so it still matches after that expires.
  async downloadSong(song: Song, fetchUrl: string, cacheKey: string): Promise<boolean> {
    try {
      // 1. Fetch audio binary and store in Cache API or storage
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'caches' in window) {
        const cache = await window.caches.open(CACHE_NAME);
        const res = await fetch(fetchUrl);
        if (res.ok) {
          await cache.put(cacheKey, res);
        }
      }

      // 2. Save metadata to AsyncStorage
      const currentList = await this.getOfflineSongs();
      if (!currentList.some((s) => s._id === song._id)) {
        const updated = [song, ...currentList];
        await AsyncStorage.setItem(OFFLINE_SONGS_KEY, JSON.stringify(updated));
      }

      return true;
    } catch (err) {
      console.warn('Failed to cache song offline:', err);
      return false;
    }
  }

  // Remove song from offline storage
  async removeSong(songId: string, streamUrl?: string): Promise<boolean> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'caches' in window && streamUrl) {
        const cache = await window.caches.open(CACHE_NAME);
        await cache.delete(streamUrl);
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

  // Retrieve cached playable URL if available
  async getPlayableUrl(streamUrl: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'caches' in window) {
        const cache = await window.caches.open(CACHE_NAME);
        const match = await cache.match(streamUrl);
        if (match) {
          const blob = await match.blob();
          return URL.createObjectURL(blob);
        }
      }
    } catch {
      // Fallback
    }
    return null;
  }
}

export const offlineManager = new OfflineManager();
