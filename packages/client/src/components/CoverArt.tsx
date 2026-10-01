import { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { API_BASE_URL, CDN_BASE_URL } from '../api/api';
import { GlassArt, Icon } from 'hugo-music';

// The raw R2 endpoint has no CORS/CORP headers, so Chrome's Opaque Response
// Blocking rejects a cross-origin fetch/XHR-loaded <Image> the same way it rejects
// audio (see apps/server/src/modules/songs/controller.js streamSong for the full
// writeup) — serve it from the Worker CDN (covers/ is public there, with CORS, cached at the edge),
// falling back to our own backend proxy when no CDN is configured. Keeps image bytes off the API tier.
export function resolveImageUri(uri?: string): string | undefined {
  if (!uri) return uri;
  const match = uri.match(/r2\.cloudflarestorage\.com\/[^/]+\/(covers\/.+)$/);
  if (!match) return uri;
  if (CDN_BASE_URL) return `${CDN_BASE_URL.replace(/\/$/, '')}/${match[1].split('/').map(encodeURIComponent).join('/')}`;
  return `${API_BASE_URL}/api/images/proxy?key=${encodeURIComponent(match[1])}`;
}

// The repository has ~300 articles that share an illustration taken from Unsplash as a placeholder image — that's not it
// real cover photo. Those posts (and posts without images) show AUTOMATICALLY GENERATED cover art (ui/kit/GlassArt).
export const isRealCover = (uri?: string) => !!uri && !/images\.unsplash\.com/.test(uri);

/**
 * Song or album cover. Loads through the CDN and falls back to generated artwork — never an empty square.
 *
 * @example <CoverArt uri={song.coverArt} title={song.title} size={48} radius={8} />
 */
export default function CoverArt({
  uri,
  fallbackUri,
  fallbackIcon = 'musical-note',
  size,
  radius = 6,
  style,
  title,
}: {
  /** Used to generate artwork when there is no cover. */
  title?: string;
  /** Cover URL (R2 URLs are rewritten to the CDN). */
  uri?: string;
  /** Second image to try before the generated artwork. */
  fallbackUri?: string;
  fallbackIcon?: keyof typeof Icon.glyphMap;
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

  // Placeholder image / no image / error image → automatically generated cover image
  if (!isRealCover(uri) || (hasError && !resolvedFallbackUri)) {
    return <GlassArt width={size} height={size} radius={radius} style={style as ViewStyle} />;
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
      <Icon name={fallbackIcon} size={size * 0.45} color="#1CD8A9" />
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

