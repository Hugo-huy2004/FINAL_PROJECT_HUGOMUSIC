// Tự kiểm ô ngày gõ tay (Android): node scripts/check-date.mjs
import assert from 'node:assert/strict';
import { parseDmy, maskDmy } from '../src/utils/date.ts';

assert.equal(parseDmy('29/02/2004'), '2004-02-29', 'năm nhuận');
assert.equal(parseDmy('29/02/2003'), null, 'không nhuận');
assert.equal(parseDmy('31/04/2000'), null, 'tháng 4 có 30 ngày');
assert.equal(parseDmy('01/01/2999'), null, 'tương lai');
assert.equal(parseDmy('01/01/1850'), null, 'quá xa');
assert.equal(parseDmy('1/1/2000'), null, 'chưa đủ 8 số');
assert.equal(maskDmy('01022000'), '01/02/2000');
assert.equal(maskDmy('01/0'), '01/0');
assert.equal(maskDmy('0102200099'), '01/02/2000');
console.log('date self-check: ok');
