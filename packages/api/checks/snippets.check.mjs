// Copy-ready commands on the API reference: node checks/snippets.check.mjs
import assert from 'node:assert/strict';
import { snippetsFor } from '../src/snippets.ts';

const B = 'https://api.example';
const list = snippetsFor({ method: 'GET', path: '/api/songs', params: [], auth: 'public', upload: false, returns: 'Song[]' }, B);
assert.equal(list.app, "const { data, loading, error, reload } = useApi('GET /api/songs');");
assert.match(list.recipe, /useApi\('GET \/api\/songs', \{ select: \(items\) => items\.filter/);
const lyrics = snippetsFor({ method: 'GET', path: '/api/songs/:id/lyrics', params: ['id'], auth: 'public', upload: false, returns: '{ hasLyrics }' }, B);
assert.equal(lyrics.app, "const { data, loading, error, reload } = useApi('GET /api/songs/:id/lyrics', { params: { id } });");
assert.equal(lyrics.recipe, null, 'objects are not filterable lists');
const add = snippetsFor({ method: 'POST', path: '/api/playlists/:id/songs', params: ['id'], auth: 'user', upload: false, body: { songId: '', songIds: '' } }, B);
assert.equal(add.app, "await call('POST /api/playlists/:id/songs', { params: { id }, body: { songId, songIds } });");
assert.match(add.curl, /-H 'Authorization: Bearer <token>'/);
assert.match(add.curl, /\/api\/playlists\/<id>\/songs/);
const up = snippetsFor({ method: 'POST', path: '/api/songs/upload', params: [], auth: 'admin', upload: true, body: { audio: '', cover: '' } }, B);
assert.equal(up.app, "const form = new FormData();\nform.append('audio', audio);\nform.append('cover', cover);\nawait call('POST /api/songs/upload', { body: form });");
assert.match(up.curl, /-F 'audio=@/);
const top = snippetsFor({ method: 'GET', path: '/api/metrics/top', params: [], auth: 'public', upload: false, query: { days: '', limit: '' }, returns: 'Song[] with scores' }, B);
assert.equal(top.app, "const { data, loading, error, reload } = useApi('GET /api/metrics/top', { query: { days, limit } });");
console.log('api snippets: ok');
