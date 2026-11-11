import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftRow, shiftRows } from '../../src/plans/rows';

const ins = (line: number, char: number, newLines: number) => ({ startLine: line, startChar: char, endLine: line, newLines });

test('a row above a change stays; below it moves by the lines added or taken', () => {
  assert.equal(shiftRow(2, ins(5, 0, 1)), 2);
  assert.equal(shiftRow(5, ins(1, 3, 2)), 7);
  assert.equal(shiftRow(5, { startLine: 1, startChar: 0, endLine: 3, newLines: 0 }), 3);
});

test('a line typed before the row (column 0) pushes it down; typed inside it, it stays', () => {
  assert.equal(shiftRow(3, ins(3, 0, 1)), 4);
  assert.equal(shiftRow(3, ins(3, 4, 1)), 3);
  assert.equal(shiftRow(3, ins(3, 0, 0)), 3);
});

test('a row inside a replaced range goes to the range\'s first row', () => {
  assert.equal(shiftRow(4, { startLine: 2, startChar: 1, endLine: 6, newLines: 0 }), 2);
  assert.equal(shiftRow(6, { startLine: 2, startChar: 1, endLine: 6, newLines: 1 }), 2);
});

test('shiftRows applies the changes in their order', () => {
  assert.equal(shiftRows(3, [ins(0, 0, 1), ins(0, 0, 1)]), 5);
  assert.equal(shiftRows(3, []), 3);
});
