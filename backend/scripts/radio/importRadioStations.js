/**
 * Imports real, currently-live internet radio stations from radio-browser.info's
 * open, free, no-API-key station directory — https://api.radio-browser.info/
 *
 * Pulls the best Vietnamese stations plus a diversified set of top global stations,
 * keeping only ones radio-browser's own health check ("lastcheckok") marked as
 * currently working.
 *
 * Safe to re-run: each station is keyed by its radio-browser stationuuid
 * (externalId), so a second run updates existing rows instead of duplicating.
 *
 * Usage: node scripts/radio/importRadioStations.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const RadioStation = require('../../models/RadioStation');

const API_BASE = 'https://de1.api.radio-browser.info/json';
// Identify ourselves per radio-browser's usage guidelines (they ask non-browser
// clients to set a descriptive User-Agent).
const HEADERS = { 'User-Agent': 'HugoMusic/1.0 (contact: hugomusic@example.com)' };

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// HLS (.m3u8) plays fine on native (iOS/Android) and Safari, but not on Chrome/Firefox
// web without an extra HLS.js dependency this app doesn't have — direct MP3/AAC
// streams are the ones guaranteed to "just work" everywhere right now.
const isDirectStream = (url) => !/\.m3u8(\?|$)/i.test(url);

// Real value or blank -- never a fabricated "curated" image standing in for a real
// station's icon. A missing favicon is a display-layer fallback concern (see
// frontend/src/utils/radioArtwork.ts getStationFallback), not something baked into
// the stored data as if it were the station's own icon.
function resolveStationCover(s) {
  const fav = (s.favicon || '').trim();
  if (fav && !fav.includes('reyfm.de') && !fav.includes('rfi.fr/apple-touch-icon')) {
    return fav;
  }
  return '';
}

function toStationDoc(s) {
  return {
    name: s.name.trim(),
    streamUrl: s.url_resolved || s.url,
    country: s.country || '',
    countryCode: s.countrycode || '',
    genre: (s.tags || '').split(',')[0]?.trim() || '',
    favicon: resolveStationCover(s),
    codec: s.codec || '',
    bitrate: s.bitrate || 0,
    language: s.language || '',
    votes: s.votes || 0,
    externalId: s.stationuuid,
  };
}


async function upsertStations(stations) {
  let count = 0;
  for (const s of stations) {
    if (!s.stationuuid || !(s.url_resolved || s.url)) continue;
    await RadioStation.updateOne(
      { externalId: s.stationuuid },
      { $set: toStationDoc(s) },
      { upsert: true }
    );
    count++;
  }
  return count;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  console.log('Fetching Vietnamese stations...');
  const vietnam = await fetchJson(`${API_BASE}/stations/bycountry/vietnam?order=votes&reverse=true&limit=100`);
  const goodVietnam = vietnam.filter((s) => s.lastcheckok === 1 && isDirectStream(s.url_resolved || s.url)).slice(0, 12);
  const vnCount = await upsertStations(goodVietnam);
  console.log(`  imported/updated ${vnCount} Vietnamese stations (of ${goodVietnam.length} candidates, ${vietnam.length} fetched)`);

  console.log('Fetching top global stations...');
  const global = await fetchJson(`${API_BASE}/stations/topvote/200`);
  const goodGlobal = global.filter((s) => s.lastcheckok === 1 && isDirectStream(s.url_resolved || s.url));
  // Diversify by genre instead of just taking the top N by votes (which skews heavily
  // toward whatever's most popular overall) — one station per first-tag, in vote order.
  const seenGenres = new Set();
  const diversified = [];
  for (const s of goodGlobal) {
    const genre = (s.tags || 'other').split(',')[0]?.trim().toLowerCase() || 'other';
    if (seenGenres.has(genre)) continue;
    seenGenres.add(genre);
    diversified.push(s);
    if (diversified.length >= 25) break;
  }
  const globalCount = await upsertStations(diversified);
  console.log(`  imported/updated ${globalCount} global stations (of ${goodGlobal.length} working candidates, ${global.length} fetched)`);

  console.log('Done. Total stations in DB:', await RadioStation.countDocuments());
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
