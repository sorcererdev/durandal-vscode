import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedSpan, cursorColumn, savedWord, selectionLines, stepLanded, stubWord,
} from '../../src/tdd/landing';

test('savedWord: write_landed\'s words', () => {
  assert.equal(savedWord(0, 0), 'saved');
  assert.equal(savedWord(1, 0), 'saved');
  assert.equal(savedWord(3, 0), '3 files saved');
  assert.equal(savedWord(0, 1), 'unsaved');
  assert.equal(savedWord(0, 2), '2 files unsaved');
  assert.equal(savedWord(2, 1), '2 saved, 1 unsaved');
});

test('the landing\'s line: the goal and what was written; the step when no goal; nothing changed when no edit', () => {
  assert.equal(stepLanded('fill f', 'saved'), 'conjured · fill f · saved');
  assert.equal(stepLanded(null, '2 files saved'), 'conjured · the step · 2 files saved');
  assert.equal(stepLanded(undefined, 'nothing changed'), 'conjured · the step · nothing changed');
  assert.equal(stepLanded('', '1 saved, 1 unsaved'), 'conjured · the step · 1 saved, 1 unsaved');
});

test('changedSpan: the first to the last changed line of after, 0-based', () => {
  assert.equal(changedSpan(['a', 'b'], ['a', 'b']), undefined);
  assert.deepEqual(changedSpan(['def f():', '    pass', ''], ['def f():', '    x = 1', '    return x', '']), { first: 1, last: 2 });
  assert.deepEqual(changedSpan(['a', 'b', 'c'], ['a', 'c']), { first: 1, last: 1 });
  assert.deepEqual(changedSpan(['a'], ['z', 'a']), { first: 0, last: 0 });
  assert.equal(changedSpan(['a'], []), undefined);
});

test('selectionLines: none when empty; a whole-line selection stops on the line before (Review Focus 2)', () => {
  assert.equal(selectionLines({ line: 3, character: 2 }, { line: 3, character: 2 }), undefined);
  assert.deepEqual(selectionLines({ line: 3, character: 0 }, { line: 5, character: 0 }), { start: 3, end: 4 });
  assert.deepEqual(selectionLines({ line: 3, character: 4 }, { line: 5, character: 1 }), { start: 3, end: 5 });
  assert.deepEqual(selectionLines({ line: 3, character: 1 }, { line: 3, character: 9 }), { start: 3, end: 3 });
});

test('stub: the cursor on the name (column 0 when absent); the notice names what it saved', () => {
  assert.equal(cursorColumn('def test_handle() -> None:', 'test_handle'), 4);
  assert.equal(cursorColumn('', 'test_handle'), 0);
  assert.equal(stubWord('test_f', ['a__test.py'], [], []), 'stubbed test_f · saved a__test.py');
  assert.equal(stubWord('test_f', [], [], ['a__test.py']), 'stubbed test_f · unsaved a__test.py');
  assert.equal(stubWord('test_f', [], [], []), 'stubbed test_f');
});
