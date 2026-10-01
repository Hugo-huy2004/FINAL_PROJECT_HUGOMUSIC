# Hugo Music CDN Worker

Serves audio, HLS and cover art straight from R2 through Cloudflare's global network, instead of pushing every
byte through the Node server (`streamSong` in `apps/server/src/modules/songs/song.controller.js`, now only a
fallback).

## Why

| | Node proxy | Worker |
|---|---|---|
| Path | user → Node → R2 → Node → user | user → nearest point of presence → R2 (binding, no egress) |
| Edge cache | none | full objects cached `immutable` for a year; Range requests answered from the cache |
| Bottleneck | every stream goes through one server | none |
| Browser ORB blocking | needed the proxy to avoid it | gone, thanks to CORS headers |

## Access by key prefix

| Prefix | Access |
|---|---|
| `audio/*` | original files — playback token required |
| `hls/*` | HLS renditions — playback token required; one token covers every segment of a song |
| `covers/*` | cover art — public |

The API decides who may listen and mints the token (`GET /api/songs/:id/playback`). The Worker only verifies it
with `verifyToken` from `hugo-stream` — the same code the server uses, with the same `JWT_SECRET` — so the two can
never disagree. Players send it as `?token=`; for `.m3u8` playlists the Worker appends it to every child URI, so
any player (hls.js, AVPlayer, ExoPlayer) carries it to each segment.

## Deploy

```bash
cd apps/edge
npm install                          # hugo-stream (bundled into the Worker)
npx wrangler login                   # opens the browser
npx wrangler secret put JWT_SECRET   # exactly the value in apps/server/.env
npx wrangler deploy                  # prints https://hugomusic-cdn.<account>.workers.dev
```

Then point the apps at it:

- `apps/server/.env`: `CDN_URLS=cloudflare=https://hugomusic-cdn.<account>.workers.dev` (signed playback URLs)
- `apps/web/.env` and `apps/mobile/.env`: `EXPO_PUBLIC_CDN_URL=` the same URL (cover art)

## Test

```bash
npm test    # mocked R2 + cache: tokens, Range from cache, playlist rewriting
```

## Custom domain

The edge cache does **not** work on `*.workers.dev` (the Worker detects it and skips the cache). Attach a domain in
the dashboard (Workers → your Worker → Domains & Routes), then change `CDN_URLS` and `EXPO_PUBLIC_CDN_URL`. No code
change is needed.

## Free plan quota

100,000 requests a day. HLS segments are 4 seconds long, so a 4-minute song is about 60 segments plus 2–3 playlists
≈ 63 requests — roughly **1,600 plays a day**.
