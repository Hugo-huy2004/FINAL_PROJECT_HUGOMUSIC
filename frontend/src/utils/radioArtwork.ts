/**
 * Real station icon (favicon from radio-browser.info) first; a themed, openly-generic
 * placeholder only when a station truly has none — never a fake "specific" image
 * pretending to belong to one station (that was the source of the wrong-icon bug).
 */

export interface StationData {
  name?: string;
  country?: string;
  countryCode?: string;
  genre?: string;
  favicon?: string;
}

// Fallbacks based on genre / tags / country
export function getStationFallback(station: StationData): string {
  const g = (station.genre || '').toLowerCase();
  const n = (station.name || '').toLowerCase();
  const c = (station.countryCode || '').toUpperCase();
  const country = (station.country || '').toLowerCase();

  // Vietnam specific fallback
  if (c === 'VN' || country.includes('vietnam') || n.includes('tiếng việt') || n.includes('viet')) {
    return 'https://images.unsplash.com/photo-1528127269322-539801943592?w=600&auto=format&fit=crop&q=80';
  }

  // News / Talk / Information
  if (g.includes('news') || g.includes('talk') || g.includes('thời sự') || n.includes('news') || n.includes('info')) {
    return 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop&q=80';
  }

  // Dance / Electronic / Club / House / Trance
  if (g.includes('dance') || g.includes('club') || g.includes('electronic') || g.includes('trance') || g.includes('house')) {
    return 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80';
  }

  // Rock / Metal
  if (g.includes('rock') || g.includes('metal')) {
    return 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80';
  }

  // Jazz / Blues / Soul
  if (g.includes('jazz') || g.includes('blues') || g.includes('soul')) {
    return 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&auto=format&fit=crop&q=80';
  }

  // Classical / Symphony / Baroque
  if (g.includes('classic') || g.includes('orchestra') || g.includes('symphony')) {
    return 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80';
  }

  // Pop / Hits
  if (g.includes('pop') || g.includes('hit') || g.includes('top')) {
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80';
  }

  // Default clean radio studio artwork
  return 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80';
}

/**
 * Returns the best available cover art URL for a radio station: the station's own
 * real favicon when it has one, otherwise a generic genre/country-themed placeholder.
 */
// Favicon URLs confirmed dead by direct request (reyfm.de/icon.png -> HTTP 402;
// rfi.fr's apple-touch-icon -> DNS failure) — real, verified breakage, not a guess.
const KNOWN_BROKEN_FAVICONS = [/reyfm\.de\/icon\.png/i, /rfi\.fr\/apple-touch-icon/i];

export function getStationCover(station: StationData): string {
  const favicon = (station.favicon || '').trim();
  if (favicon && !KNOWN_BROKEN_FAVICONS.some((re) => re.test(favicon))) {
    return favicon;
  }
  return getStationFallback(station);
}
