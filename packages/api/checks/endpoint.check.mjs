// useApi/call path building and module invalidation: node checks/endpoint.check.mjs
import assert from 'node:assert/strict';
import { resolveEndpoint, moduleOf, suggest } from '../src/endpoint.ts';

assert.deepEqual(resolveEndpoint('GET /api/songs'), { method: 'GET', path: '/api/songs' });
assert.deepEqual(resolveEndpoint('POST /api/playlists/:id/songs', { params: { id: 'a b' } }), { method: 'POST', path: '/api/playlists/a%20b/songs' });
assert.equal(resolveEndpoint('GET /api/metrics/top', { query: { days: 7, group: undefined, limit: 20 } }).path, '/api/metrics/top?days=7&limit=20');
assert.throws(() => resolveEndpoint('DELETE /api/playlists/:id'), /missing params.id/);
assert.equal(moduleOf('/api/playlists/123/songs?x=1'), '/api/playlists');
assert.deepEqual(suggest('GET /api/song', ['GET /api/songs', 'GET /api/songs/:id/lyrics', 'POST /api/playlists']), ['GET /api/songs', 'GET /api/songs/:id/lyrics'], 'a typo still finds the module');
assert.deepEqual(suggest('GET /api/songs/:id/lyric', ['GET /api/songs', 'GET /api/songs/:id/lyrics', 'POST /api/songs/upload']), ['GET /api/songs', 'GET /api/songs/:id/lyrics']);
console.log('endpoint helpers: ok');
