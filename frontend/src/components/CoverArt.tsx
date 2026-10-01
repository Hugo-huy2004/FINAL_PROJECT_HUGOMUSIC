import { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL, CDN_BASE_URL } from '../utils/api';
import GlassArt from '../ui/kit/GlassArt';

// The raw R2 endpoint has no CORS/CORP headers, so Chrome's Opaque Response
// Blocking rejects a cross-origin fetch/XHR-loaded <Image> the same way it rejects
// audio (see backend/controllers/songController.js streamSong for the full
// writeup) — serve it from the Worker CDN (covers/ is public there, with CORS, cached at the edge),
// falling back to our own backend proxy when no CDN is configured. Keeps image bytes off the API tier.
export function resolveImageUri(uri?: string): string | undefined {
  if (!uri) return uri;
  const match = uri.match(/r2\.cloudflarestorage\.com\/[^/]+\/(covers\/.+)$/);
  if (!match) return uri;
  if (CDN_BASE_URL) return `${CDN_BASE_URL.replace(/\/$/, '')}/${match[1].split('/').map(encodeURIComponent).join('/')}`;
  return `${API_BASE_URL}/api/images/proxy?key=${encodeURIComponent(match[1])}`;
}

// Kho có ~300 bài dùng chung ảnh minh hoạ lấy từ Unsplash làm ảnh giữ chỗ — đó không phải
// ảnh bìa thật. Những bài đó (và bài không có ảnh) hiện ảnh bìa TẠO TỰ ĐỘNG (ui/kit/GlassArt).
export const isRealCover = (uri?: string) => !!uri && !/images\.unsplash\.com/.test(uri);

export default function CoverArt({
  uri,
  fallbackUri,
  fallbackIcon = 'musical-note',
  size,
  radius = 6,
  style,
  title,
}: {
  title?: string;
  uri?: string;
  fallbackUri?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  size: number;
  radius?: number;
  style?: ImageStyle | ViewStyle;
}) {
  const [hasError, setHasError] = useState(false);
  const [hasFallbackError, setHasFallbackError] = useState(false);
  const resolvedUri = resolveImageUri(uri);
  const resolvedFallbackUri = resolveImageUri(fallbackUri);

  useEffect(() => {
    setHasError(false);
    setHasFallbackError(false);
  }, [uri, fallbackUri]);

  // Ảnh giữ chỗ / không có ảnh / ảnh lỗi → ảnh bìa tạo tự động
  if (!isRealCover(uri) || (hasError && !resolvedFallbackUri)) {
    return <GlassArt title={title || ''} width={size} height={size} radius={radius} style={style as ViewStyle} />;
  }

  // Primary image
  if (resolvedUri && !hasError) {
    return (
      <Image
        source={{ uri: resolvedUri }}
        onError={() => setHasError(true)}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: '#222',
          },
          style as ImageStyle,
        ]}
      />
    );
  }

  // Fallback image
  if (resolvedFallbackUri && !hasFallbackError) {
    return (
      <Image
        source={{ uri: resolvedFallbackUri }}
        onError={() => setHasFallbackError(true)}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: '#222',
          },
          style as ImageStyle,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style as ViewStyle,
      ]}
    >
      <Ionicons name={fallbackIcon} size={size * 0.45} color="#1CD8A9" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#1a1a1c',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});

