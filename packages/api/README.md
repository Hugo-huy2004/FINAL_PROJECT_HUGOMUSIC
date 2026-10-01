# hugo-api

Call any REST endpoint by the line your API reference prints, and read it into React with one cached hook.

```
npm install hugo-api
```

## Use

```tsx
import { configure, useApi, call } from 'hugo-api';

configure({ baseUrl: 'https://api.example.com', getToken: () => session?.token });

function JazzList() {
  const { data, loading, error, reload } = useApi('GET /api/songs', {
    select: (songs) => songs.filter((s) => /jazz/i.test(s.genre)),
  });
  // …
}

await call('POST /api/playlists/:id/songs', { params: { id }, body: { songIds } });
```

- **One key everywhere** — the endpoint line itself. `params` fill `:placeholders`, `query` builds the query string, `body` is JSON or `FormData`.
- **Cached and shared** — the same endpoint and arguments make one request, however many components read it.
- **Never stale** — a successful write refreshes every `useApi` of the same module (`/api/playlists/…`).
- **Resilient** — timeouts, retries with exponential backoff and full jitter, `Retry-After`, request coalescing, ETag / 304.
- **Uniform errors** — `{ message }` bodies become `Error`s carrying `status` and `data`; one `onSessionExpired` hook.

## Typed endpoints

Generate the endpoint union from your server (with [hugo-server](https://www.npmjs.com/package/hugo-server): `hugo-server types`), and editors autocomplete every endpoint while the compiler rejects typos:

```ts
declare module 'hugo-api' {
  interface Register { endpoints: 'GET /api/songs' | 'POST /api/playlists/:id/songs' }
}
```

In development, a call to an endpoint the server does not have logs a warning with the closest real endpoints.

## API

| Export | Purpose |
|---|---|
| `configure({ baseUrl, getToken, onSessionExpired, dev, docsPath, http })` | Point the client at a server |
| `useApi(endpoint, { params, query, select, enabled })` | Read into a component: `{ data, loading, error, reload }` |
| `call(endpoint, { params, query, body })` | Any request; writes refresh reads of the same module |
| `invalidate(prefix)` | Refresh cached reads under a path |
| `request(path, init)` | Low-level JSON request with auth and uniform errors |
| `createHttpClient(options)` | The resilient fetch layer on its own |
| `snippetsFor(route, baseUrl)` | Copy-ready commands for API reference pages |

## License

MIT
