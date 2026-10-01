// Used at upload time (songController.js uploadSong); the one-off lyrics pass over
// the original catalogue used the same algorithm:
//   1. Embedded ID3 lyrics (USLT), read straight from music-metadata's parse result -
//      same file as the audio, so it's guaranteed to be the right lyrics.
//   2. LRCLIB (lrclib.net) - free, open, no API key, built for exactly this - matched
//      by title+artist.
// Neither found -> returns null; the caller stamps lyricsCheckedAt so a genuinely
// lyric-less song (most obscure netlabel acts) isn't re-queried forever.

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'HugoMusic/1.0 (lyrics lookup)' } });
  } finally {
    clearTimeout(id);
  }
}

// `metadataCommon` is music-metadata's `metadata.common` - pass it in when the
// caller already parsed the file (uploadSong has the buffer in memory already)
// so this never re-parses audio itself.
function id3Lyrics(metadataCommon) {
  const lyrics = metadataCommon?.lyrics;
  if (lyrics && lyrics.length > 0 && lyrics[0].text && lyrics[0].text.trim().length > 20) {
    return lyrics[0].text.trim();
  }
  return null;
}

async function lrclibLyrics(title, artist) {
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.plainLyrics && !data.syncedLyrics) return null;
    return { plainLyrics: data.plainLyrics || undefined, syncedLyrics: data.syncedLyrics || undefined };
  } catch {
    return null;
  }
}

// Runs the full priority order and returns { plainLyrics?, syncedLyrics?, lyricsSource }
// or null if nothing was found anywhere.
async function findLyrics({ metadataCommon, title, artist }) {
  const id3Text = id3Lyrics(metadataCommon);
  if (id3Text) return { plainLyrics: id3Text, lyricsSource: 'id3' };

  const lrc = await lrclibLyrics(title, artist);
  if (lrc) return { ...lrc, lyricsSource: 'lrclib' };

  return null;
}

module.exports = { findLyrics };
