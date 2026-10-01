// Actually connects to every station's streamUrl and marks isLive accordingly, so the
// radio list only ever shows stations that really play right now instead of trusting
// radio-browser.info's snapshot from import time (stations go offline constantly).
//
// Usage: node scripts/radio/checkRadioLiveness.js
// Safe to re-run any time (e.g. on a cron) — it only updates isLive/lastCheckedAt.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const RadioStation = require('../../src/modules/radio/RadioStation');

const TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

async function isStreamAlive(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-1024' } });
    // Icecast/Shoutcast streams reply 200 or 206 with an audio content-type and then
    // keep the body open indefinitely — we only need the headers, not the full body.
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ok = (res.ok || res.status === 206) && (ct.includes('audio') || ct.includes('ogg') || ct.includes('mpeg') || ct.includes('stream') || ct === '');
    if (res.body?.cancel) res.body.cancel().catch(() => {});
    return ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await connectDB();
  const stations = await RadioStation.find({});
  console.log(`Checking ${stations.length} stations (timeout ${TIMEOUT_MS}ms, concurrency ${CONCURRENCY})...`);

  let alive = 0;
  let dead = 0;
  let idx = 0;

  async function worker() {
    while (idx < stations.length) {
      const station = stations[idx++];
      const ok = await isStreamAlive(station.streamUrl);
      station.isLive = ok;
      station.lastCheckedAt = new Date();
      await station.save();
      if (ok) alive++;
      else dead++;
      console.log(`${ok ? 'LIVE' : 'DEAD'} — ${station.name} (${station.country})`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nDone. ${alive} live, ${dead} dead out of ${stations.length}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
