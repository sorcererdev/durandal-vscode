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
  assert.equal(shiftRow(6, { startLine: 2, startChar: 1, endLine: 6, newLines: 1 }), 3);
});

test('shiftRows applies the changes in their order', () => {
  assert.equal(shiftRows(3, [ins(0, 0, 1), ins(0, 0, 1)]), 5);
  assert.equal(shiftRows(3, []), 3);
});

// durandal.nvim, headless nvim: right-gravity extmarks at (row, 0)
test('a row whose column 0 is replaced goes after the new text (nvim extmarks)', () => {
  assert.equal(shiftRow(3, { startLine: 3, startChar: 0, endLine: 5, newLines: 3 }), 6);
  assert.equal(shiftRow(3, { startLine: 3, startChar: 0, endLine: 4, newLines: 2 }), 5);
  assert.equal(shiftRow(6, { startLine: 2, startChar: 1, endLine: 6, newLines: 1 }), 3);
  assert.equal(shiftRow(4, { startLine: 2, startChar: 1, endLine: 6, newLines: 1 }), 3);
});

test('an insert at column 0 of the row pushes it down; edits wholly above or below', () => {
  assert.equal(shiftRow(3, ins(3, 0, 2)), 5);
  assert.equal(shiftRow(3, { startLine: 0, startChar: 0, endLine: 1, newLines: 4 }), 6);
  assert.equal(shiftRow(3, { startLine: 4, startChar: 0, endLine: 6, newLines: 0 }), 3);
});
