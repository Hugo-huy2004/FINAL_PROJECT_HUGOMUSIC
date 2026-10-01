// LRC parsing, active line and per-word highlighting.
import assert from 'node:assert/strict';
import { parseLrc, activeLine, activeWord } from '../src/index.js';

const lines = parseLrc('[ti:x]\n[00:01.00]One\n[00:05.50][01:00.00]Chorus\n[00:03.20]Two\n[00:08.00]\n');
assert.deepEqual(lines.map((l) => [l.time, l.text]), [[1, 'One'], [3.2, 'Two'], [5.5, 'Chorus'], [60, 'Chorus']], 'sorted, multi-stamp lines repeated, empty lines dropped');
assert.equal(lines[0].end, 3.2);
assert.equal(activeLine(lines, 0.5), -1);
assert.equal(activeLine(lines, 3.2), 1, 'exactly on the stamp lights up');
assert.equal(activeLine(lines, 59.99), 2);

// Per-word stamps + offset (+500 ms = shown 0.5 s earlier).
const [k] = parseLrc('[offset:+500]\n[00:10.00]<00:10.00>I <00:10.80>love <00:11.40>you');
assert.equal(k.time, 9.5);
assert.equal(k.text, 'I love you');
assert.equal(activeWord(k, 10.0), 0, 'at 10.0 s only the first word is due');
assert.equal(activeWord(k, 10.3), 1, 'second word is due at 10.3 s (10.8 − 0.5 offset)');
assert.equal(activeWord(k, 9.4), -1);
assert.equal(activeWord(parseLrc('[00:01.00]no word stamps')[0], 5), -1);
console.log('lyrics: ok');
