# Hugo Music

COMP1682 final-year project (University of Greenwich): a streaming service for openly licensed music with
adaptive playback (HLS + ABR) on the web, iOS and Android. The main research technique is **PSL** — a bitrate
ladder built from the point where perceived quality saturates.

## Structure

Monorepo: every folder in `apps/` is deployed on its own, and its name says where it runs.

```
apps/
  server/   Node/Express API + Socket.IO + audio pipeline              → Render (render.yaml)
    src/modules/<name>/  <name>.routes.js · .controller.js · .model.js — each module mounts itself at /api/<name>
                         (hugo-server) and appears in /api/docs and /api/docs/openapi.json
    src/core/            middleware, r2, email, kindScope…
    src/pipeline/        Job · jobs/ (Release, Psl, Transition, Hls) · cli.js · analyzers/*.py
    scripts/ research/   admin tools run by hand · experiments for the report
  web/      Web app (Expo web export)                                 → Vercel (apps/web/vercel.json)
  mobile/   iOS/Android app (Expo)                                    → EAS / Expo Go
  edge/     Cloudflare Worker: checks playback tokens, serves R2, rewrites HLS playlists → Cloudflare
packages/
  ui/         `hugo-music`: self-made frosted-glass UI kit (no third-party UI library)
  api/        `hugo-api`: call an endpoint by its own line ("GET /api/songs"); useApi hook with cache/retry/ETag
  server-kit/ `hugo-server`: doc(), module discovery, crud(), OpenAPI, CLI new/types/test
  stream/     `hugo-stream`: playback tokens (shared by server and edge), CDN steering, LRC lyrics, multi-device sync
  balancer/   `hugo-balancer`: self-made load balancer (p2c-EWMA, least-conn, round-robin), self-healing cluster, bench
  client/     Screens, store and API client shared by web and mobile (@hugo/client), built on hugo-music
    src/lib/meta.ts      reference data (genres, licences…) from GET /api/meta, never hard-coded
    scripts/gen-component-docs.mjs  generates the component library from source (JSDoc + prop types + *.demos.tsx)
```

Developer pages (generated, in English): `/developer/components` (component library) and `/developer/api`
(API reference from the running routes).

## Run

```bash
npm install            # once, at the root (npm workspaces for web + mobile + packages)
npm run dev            # server (:5001) + web (:8081)
npm run dev:mobile     # server + Expo for iOS/Android (QR code)
npm run clean:ports    # free ports 5001 and 8081 if they are stuck
npm run build:web      # static web build into apps/web/dist (the exact command Vercel runs)
```

The server needs `apps/server/.env` (template: `.env.example`); run `cd apps/server && npm install` once.
PSL needs ViSQOL: `cd apps/server && python3 -m venv .venv && .venv/bin/pip install visqol-python`.

## Test

```bash
npm test               # server + every hugo-* package + client + edge
npm run cluster        # 3 API copies + 1 realtime copy behind the load balancer on :5001 (kill -HUP = rolling restart)
```

Tests are discovered, never listed by hand: the server runs every `src/**/*.test.js` and every module with a
self-check; the client runs the typecheck, checks that the component library still matches the source, and runs
every `checks/*.check.mjs`. A route without an English description or a component without JSDoc fails the tests.

## Main flows

- **Catalogue intake:** an admin uploads a song (licence and source URL required) → `pending` → an admin approves
  → `published` + the child process `src/pipeline/cli.js approve`: release info and cover art → PSL → transition
  analysis → HLS; every step is recorded in `PipelineRun` (DB). Backfill the whole catalogue for one job:
  `node apps/server/src/pipeline/cli.js <release|psl|transition|hls> [--limit=N] [--redo]`.
- **Listening:** the app asks for a token at `GET /api/songs/:id/playback` → plays through the Worker. When a token
  expires mid-song the app fetches a new one and resumes at the same position. Guests get 3 songs a day, then must
  sign in.
- **Listening together** (`apps/server/src/modules/rooms/`, `packages/client/src/rooms/`): the server keeps the room
  clock and devices sync their time NTP-style. *24/7 stations*: suggest and vote for songs, the server moves to the
  next one. *Blind test*: hear one passage at two quality levels and vote — votes are stored in `ListeningVote` to
  compare against PSL.
