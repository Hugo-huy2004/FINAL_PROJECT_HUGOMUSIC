import { Text, StyleSheet } from 'react-native';
import { Song } from '../store/useStore';
import { useLicenseLabels } from '../lib/meta';

// Write down the license right below the song name. All music in the app is music
// Creative Commons or public domain, and these licenses are both
// Attribution/license is REQUIRED when redistributing — so no
// must decorative details which is a legal obligation.
//
// Label obtained from `licenseType` via GET /api/meta (LICENSES table in apps/server/src/modules/meta/taxonomy.js),
// not a self-set description string.

/** Small license label under a song title (CC BY, Public Domain…). Attribution is a legal requirement of these licenses, not decoration; labels come from /api/meta. */
export default function LicenseBadge({
  song,
  color,
}: {
  song: Pick<Song, 'licenseType'>;
  color: string;
}) {
  const labels = useLicenseLabels();
  const label = song.licenseType ? labels[song.licenseType] : null;
  // If you haven't looked up the license, nothing will appear — it's better to be missing than to have it wrong
  // a license that the article does not actually carry.
  if (!label) return null;

  return (
    <Text style={[styles.badge, { color }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.2,
    marginTop: 1,
    opacity: 0.55,
  },
});

