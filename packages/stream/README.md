# hugo-stream

Streaming building blocks for music apps. Zero dependencies; the same code runs on a Node server, an edge worker, in the browser and in React Native.

| Piece | What it does |
|---|---|
| Playback tokens | Sign and verify short-lived `<exp>.<sig>` tokens bound to a file, or to a whole HLS rendition |
| CDN steering | Rank CDNs by measured start-up time, skip failing ones with a circuit breaker, keep probing the rest |
| Lyrics | Parse LRC (multi-stamp lines, per-word stamps, offset) and find the active line/word fast |
| Sync | Server clock by lowest-RTT ping, and a controller that keeps many devices within 20 ms of one timeline |

```
npm install hugo-stream
```

Node 20.19+ (works from CommonJS `require` too), any edge runtime with Web Crypto, Expo/React Native.

## Playback tokens

Mint on the server when a user is allowed to listen; verify wherever the bytes are served.

```js
import { mintToken, verifyToken } from 'hugo-stream';

// server: GET /songs/:id/playback
const token = await mintToken('audio/a.mp3', process.env.SECRET);
res.json({ url: `${CDN}/audio/a.mp3?token=${encodeURIComponent(token)}` });

// edge worker or file proxy
if (!(await verifyToken(key, url.searchParams.get('token'), env.SECRET))) return new Response('Sign in', { status: 401 });
```

- **HLS:** any key under `hls/<id>/` is signed as `hls/<id>`, so one token covers the playlist and every segment.
- **Cache friendly:** expiry rounds to 5-minute windows, so every mint in the same window returns the same token and a prefetched URL equals the URL played later. A token lives 5–10 minutes; change it with `{ ttl }`.
- **Safe:** verification never throws, rejects expired or malformed tokens, and compares signatures in constant time.

## CDN steering

The server lists the same song on every CDN; only the client can measure its own path, so the client chooses.

```js
import { createSteering, ORIGIN } from 'hugo-stream';
const steering = createSteering();

for (const cdn of steering.rank(sources.map((s) => s.cdn))) {
  const url = cdn === ORIGIN ? originUrl : sources.find((s) => s.cdn === cdn).url;
  // play url…
}
steering.success(cdn, msUntilFirstSound); // feeds the moving average
steering.failure(cdn);                    // opens the circuit: 30 s, doubling to 10 min
if (steering.claimProbe(other)) fetch(otherUrl, { headers: { Range: 'bytes=0-0' } })
  .then((r) => (r.ok ? steering.success(other, elapsed) : steering.failure(other)));
```

Order returned by `rank`: healthy CDNs fastest first → `ORIGIN` → tripped CDNs (earliest to recover first). A share of calls (`explore`, 10 %) swaps the top two so a stale leader gets re-measured. Every timing constant is an option; `now` and `rand` can be injected for tests.

## Lyrics

```js
import { parseLrc, activeLine, activeWord } from 'hugo-stream';

const lines = parseLrc(lrcText);              // [{ time, end, text, words }]
const i = activeLine(lines, position);         // binary search, safe to call every frame
const w = i >= 0 ? activeWord(lines[i], position) : -1;
```

`words` is filled only when the file has per-word stamps (`<mm:ss.xx>word`); timings are never invented.

## Sync

Keep a room of devices on one timeline.

```js
import { createServerClock, controlStep, newSyncCtl, SYNC } from 'hugo-stream';

const clock = createServerClock(() => askServerForItsTimeMs()); // resolve null on failure
await clock.sync();                                             // 8 pings, lowest RTT wins

const ctl = newSyncCtl();
setInterval(async () => {
  const drift = (await player.position()) - (clock.now() - startedAtMs) / 1000; // > 0 = ahead
  const step = controlStep(ctl, drift);
  if (step.seek) player.seekTo((clock.now() - startedAtMs) / 1000 + startupCostS);
  else player.setRate(step.rate);              // pitch-preserving, within ±10 %
}, SYNC.PERIOD_MS);
```

Above 0.35 s of drift the controller asks for a seek; below that it nudges the speed (±10 %, then ±2 % once within 30 ms) and stops correcting under 5 ms. A seeded simulation in `checks/sync.check.mjs` holds every device within 20 ms of the others after the first 4 seconds.

## License

MIT
