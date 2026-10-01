// Pure utility for managing Offline music downloads (does not depend on React Native runtime)
export function extractSongId(streamUrl?: string): string | null {
  if (!streamUrl) return null;
  const match = /\/api\/songs\/stream\/([a-f0-9]{24}|[a-zA-Z0-9_-]+)/.exec(streamUrl);
  return match ? match[1] : null;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'MB'}`;
}

export function localAudioPathFor(baseDir: string, songId: string): string {
  const normalizedBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  return `${normalizedBase}${songId}.audio`;
}
