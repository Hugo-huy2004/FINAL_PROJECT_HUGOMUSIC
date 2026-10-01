// Self-check Offline music download utility functions: node checks/offline.check.mjs
import assert from 'node:assert/strict';
import { formatBytes, extractSongId, localAudioPathFor } from '../src/audio/offlineUtils.ts';

// 1. formatBytes formatting checks
assert.equal(formatBytes(0), '0 B', '0 bytes');
assert.equal(formatBytes(500), '500.0 B', 'sub-kilobyte');
assert.equal(formatBytes(1024), '1.0 KB', 'exact 1 KB');
assert.equal(formatBytes(1024 * 1024 * 15.5), '15.5 MB', '15.5 MB');
assert.equal(formatBytes(1024 * 1024 * 1024 * 1.2), '1.2 GB', '1.2 GB');

// 2. extractSongId checks
assert.equal(extractSongId('/api/songs/stream/60c72b2f9b1d8b2bad000001'), '60c72b2f9b1d8b2bad000001', 'mongo objectid');
assert.equal(extractSongId('https://domain.com/api/songs/stream/my-song-id?token=123.abc'), 'my-song-id', 'full url with token');
assert.equal(extractSongId(''), null, 'empty streamUrl');
assert.equal(extractSongId(undefined), null, 'undefined streamUrl');
assert.equal(extractSongId('https://example.com/other/path'), null, 'unmatched path');

// 3. localAudioPathFor check
const samplePath = localAudioPathFor('/var/mobile/hugomusic/', 'song123');
assert.equal(samplePath, '/var/mobile/hugomusic/song123.audio', 'path must join correctly');

const samplePathNoSlash = localAudioPathFor('/var/mobile/hugomusic', 'song123');
assert.equal(samplePathNoSlash, '/var/mobile/hugomusic/song123.audio', 'path must handle missing slash');

console.log('offline self-check: ok');
