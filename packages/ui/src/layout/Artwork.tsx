import { useState } from 'react';
import { Image } from 'react-native';
import { useArtworkRenderer, type ArtworkProps } from '../theme';
import GlassArt from './GlassArt';

/**
 * Square artwork that falls back to GlassArt when there is no image or the image fails to load.
 *
 * @usage Anywhere you show a cover. Prefer it over a bare Image so every screen handles missing covers the same way.
 * @remarks If HugoProvider has a `renderArtwork`, that renderer is used instead — one place to route every cover through a CDN or a cache.
 * @a11y Images ignore colour inversion so covers keep their real colours under smart invert.
 * @example <Artwork uri={album.cover} title={album.title} size={64} radius={8} />
 */
export default function Artwork(props: ArtworkProps) {
  const custom = useArtworkRenderer();
  const [failed, setFailed] = useState(false);
  if (custom) return <>{custom(props)}</>;
  const { uri, size, radius } = props;
  if (!uri || failed) return <GlassArt width={size} height={size} radius={radius} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
}
