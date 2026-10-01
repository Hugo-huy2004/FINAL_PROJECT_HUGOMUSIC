// Tự kiểm bộ đọc lời LRC: node scripts/check-lrc.mjs
import assert from 'node:assert/strict';
import { parseLrc, activeLine, activeWord } from '../src/utils/lrc.ts';

const lines = parseLrc('[ti:x]\n[00:01.00]Một\n[00:05.50][01:00.00]Điệp khúc\n[00:03.20]Hai\n[00:08.00]\n');
assert.deepEqual(lines.map((l) => [l.time, l.text]), [[1, 'Một'], [3.2, 'Hai'], [5.5, 'Điệp khúc'], [60, 'Điệp khúc']], 'sắp theo thời gian, nhân dòng nhiều mốc, bỏ dòng trống');
assert.equal(lines[0].end, 3.2);
assert.equal(activeLine(lines, 0.5), -1);
assert.equal(activeLine(lines, 3.2), 1, 'đúng mốc là sáng');
assert.equal(activeLine(lines, 59.99), 2);

// Mốc từng chữ + offset (+500 ms = hiện sớm 0,5 s).
const [k] = parseLrc('[offset:+500]\n[00:10.00]<00:10.00>Anh <00:10.80>yêu <00:11.40>em');
assert.equal(k.time, 9.5);
assert.equal(k.text, 'Anh yêu em');
assert.equal(activeWord(k, 10.0), 0, 'lúc 10,0 s mới hát chữ đầu');
assert.equal(activeWord(k, 10.3), 1, 'chữ thứ hai tới giờ ở 10,3 s (10,8 − offset 0,5)');
assert.equal(activeWord(k, 9.4), -1);
assert.equal(activeWord(parseLrc('[00:01.00]không có mốc chữ')[0], 5), -1);
console.log('lrc self-check: ok');
