import assert from 'node:assert/strict';
import { matchTempo, findBestDJNextSong, EQ_PRESETS } from '../src/audio/smartTransition.ts';

// 1. Equalizer presets check
assert.equal(EQ_PRESETS.bass_boost.bass, 6);
assert.equal(EQ_PRESETS.flat.bass, 0);
assert.equal(EQ_PRESETS.vocal_boost.mid, 5);

// 2. matchTempo check
const exact = matchTempo(120, 122);
assert.equal(exact.relation, 'exact');
assert.ok(exact.score > 35);

const double = matchTempo(70, 140);
assert.equal(double.relation, 'double');
assert.ok(double.score > 30);

const half = matchTempo(130, 65);
assert.equal(half.relation, 'half');
assert.ok(half.score > 30);

const drifted = matchTempo(120, 180);
assert.equal(drifted.relation, 'drifted');

// 3. findBestDJNextSong check
const current = {
  _id: 'song_1',
  title: 'Current Hit',
  artist: 'Hugo',
  genre: 'Indie Pop',
  transition: { bpm: 120, beatConfidence: 0.8 },
};

const candidates = [
  {
    _id: 'song_2',
    title: 'Rock Song',
    artist: 'Band X',
    genre: 'Rock Metal',
    transition: { bpm: 165 },
  },
  {
    _id: 'song_3',
    title: 'Indie Groove',
    artist: 'Hugo',
    genre: 'Indie Pop',
    transition: { bpm: 121, beatConfidence: 0.7 },
  },
  {
    _id: 'song_4',
    title: 'Pop Vibe',
    genre: 'Pop',
    transition: { bpm: 119 },
  },
];

const best = findBestDJNextSong(current, candidates, []);
assert.equal(best._id, 'song_3', 'Should choose song_3 due to genre + exact BPM match');

// Exclude song_3 from history, should pick song_4
const nextBest = findBestDJNextSong(current, candidates, ['song_3']);
assert.equal(nextBest._id, 'song_4', 'Should choose song_4 when song_3 is in history');

console.log('smart transition & DJ match self-check: ok');
