// "Using the API" — the overview page of the API reference. Served by GET /api/docs; clients render it as-is.
// Markdown subset: paragraphs, **bold**, `code`, - lists, ``` fenced code.
const GUIDE = [
  {
    id: 'quickstart', title: 'Build a feature in three lines', icon: 'flash-outline',
    body: `Every endpoint below shows a ready-to-copy line. In the app there is exactly one way to call the server — the key is the endpoint line itself, so nothing needs naming or wiring:

\`\`\`
import { useApi, call } from '../../api/hugo';

// read: cached, shared between screens, refreshed after writes
const { data: jazz, loading } = useApi('GET /api/songs', {
  select: (songs) => songs.filter((s) => /jazz/i.test(s.genre)),
});

// write: refreshes every useApi of the same module automatically
await call('POST /api/playlists/:id/songs', { params: { id }, body: { songIds } });
\`\`\`

- **Find** the endpoint in the sidebar, **copy** its line from *Use it*, **shape** the data with \`select\` (filter, sort, slice).
- \`params\` fill the \`:placeholders\`, \`query\` builds the query string, \`body\` is JSON or a \`FormData\` for uploads.
- \`useApi\` returns \`{ data, loading, error, reload }\` and accepts \`enabled: false\` to wait for an id.
- In development a mistyped endpoint logs a warning with the closest real endpoints.`,
  },
  {
    id: 'basics', title: 'Base URL and formats', icon: 'server-outline',
    body: `Every endpoint lives under \`/api\` on the API host. Requests and responses are JSON (\`Content-Type: application/json\`); file uploads use \`multipart/form-data\`.

Endpoints are grouped by module. Each group has its own page in this reference, generated from the server's live route tree — a new route appears here as soon as the server starts.`,
  },
  {
    id: 'auth', title: 'Authentication', icon: 'key-outline',
    body: `Send the session token on every call that needs a user:

\`\`\`
Authorization: Bearer <token>
\`\`\`

- Get a token from \`POST /api/auth/login\`. Administrators receive \`{ requiresOtp, tempToken }\` instead and finish with \`POST /api/auth/verify-otp\`.
- Tokens live 30 days. Changing or resetting the password revokes every older token.
- Routes marked **Optional sign-in** work for guests but give signed-in users more (for example unlimited playback).`,
  },
  {
    id: 'errors', title: 'Errors', icon: 'alert-circle-outline',
    body: `Errors always have the shape \`{ "message": "…" }\` plus a few flags:

- **400** invalid input — the message names the field.
- **401** with \`sessionExpired: true\`: the token is dead, sign in again. With \`requiresLogin: true\`: a guest used the free songs of the day.
- **403** signed in without the required role, or the account is disabled.
- **404** the item in the path does not exist.
- **409** conflict, e.g. a duplicate upload or a phone number already in use.
- **429** rate limit exceeded — wait for \`Retry-After\` seconds.

Each endpoint page lists the errors that route can actually return, derived from the middleware it uses.`,
  },
  {
    id: 'limits', title: 'Limits and caching', icon: 'speedometer-outline',
    body: `- Routes marked **Rate limited** allow 50 requests per 15 minutes per IP address, shared by every API server.
- \`GET\` responses carry an \`ETag\`. Send it back as \`If-None-Match\` to receive an empty **304** when nothing changed — the catalog is about 1 MB, so this saves most of the traffic.
- Media and images set their own long \`Cache-Control\` lifetimes.`,
  },
  {
    id: 'playback', title: 'Playback flow', icon: 'musical-notes-outline',
    body: `1. \`GET /api/songs/:id/playback\` returns a short-lived token (5–10 minutes) and the same song signed on every CDN in \`sources\`.
2. The client measures each CDN and plays from the fastest; if one fails mid-song it switches to the next with a fresh token.
3. If every CDN fails, \`GET /api/songs/stream/:id?token=…\` streams through the API server (supports \`Range\`).
4. Guests get 3 different songs per day; the 4th answers **401** \`requiresLogin\`.`,
  },
  {
    id: 'realtime', title: 'Realtime', icon: 'pulse-outline',
    body: `Listening rooms and device sync use a websocket connection to the API host. Pass the token in the connection's \`auth: { token }\`. Client → server events reply through an acknowledgement callback; the **Realtime events** page lists every event with its payload.`,
  },
  {
    id: 'architecture', title: 'Architecture', icon: 'git-network-outline',
    body: `- A load balancer spreads REST calls across several API servers; \`/api/rooms\` and the websocket go to the realtime tier that holds room state.
- Every response carries \`X-Instance\` naming the server that answered — useful when reporting a bug.
- Modules are discovered from \`src/modules/<name>/routes.js\` and mounted at \`/api/<name>\`; nothing is registered by hand.`,
  },
  {
    id: 'machine', title: 'Machine-readable docs', icon: 'code-slash-outline',
    body: `- \`GET /api/docs\` — this reference as JSON (guide, groups, endpoints, realtime events).
- \`GET /api/docs/openapi.json\` — OpenAPI 3.1, ready for API clients and code generators.
- \`GET /api/docs/components\` — the UI component library documentation.`,
  },
];

module.exports = { GUIDE };

if (require.main === module) {
  // self-check: the guide is English and names no third-party brand (code spans may hold identifiers)
  const assert = require('assert');
  const { BRANDS } = require('../../core/docsRules');
  const prose = GUIDE.map((g) => `${g.title} ${g.body}`).join(' ').replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  assert.strictEqual(prose.match(BRANDS), null);
  assert.ok(!/[À-ỹđĐ]/.test(prose), 'English only');
  console.log(`docs guide self-check: ok (${GUIDE.length} sections)`);
}
