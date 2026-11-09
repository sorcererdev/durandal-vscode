import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConjureLanded } from '../../src/protocol';
import {
  changedSpan, conjureNotice, cursorColumn, savedWord, selectionLines, stubWord,
} from '../../src/tdd/landing';

const landed = (o: Partial<ConjureLanded> = {}): ConjureLanded => ({
  file: '/p/a.py', unit: 'f', edits: { documentChanges: [] }, summary: 'green', green: true,
  tests: { file: '/p/a__test.py', passed: ['x'], scope: 'file', test: null, failed: [], broken: null, seconds: 0.4 },
  rounds: 1, rungs: ['local'], stopped: false, ...o,
});

test('savedWord: write_landed\'s words', () => {
  assert.equal(savedWord(0, 0), 'saved');
  assert.equal(savedWord(1, 0), 'saved');
  assert.equal(savedWord(3, 0), '3 files saved');
  assert.equal(savedWord(0, 1), 'unsaved');
  assert.equal(savedWord(0, 2), '2 files unsaved');
  assert.equal(savedWord(2, 1), '2 saved, 1 unsaved');
});

test('conjured: the summary and the save; info when green', () => {
  assert.deepEqual(conjureNotice(landed(), 'saved'), { level: 'info', text: 'conjured · green · saved' });
});

test('conjured without edits: no save word', () => {
  assert.deepEqual(conjureNotice(landed({ edits: null, summary: 'green: already passes' }), undefined),
    { level: 'info', text: 'conjured · green: already passes' });
});

test('red: a warning; rounds and rungs when more than one, unless the summary names its round', () => {
  assert.deepEqual(conjureNotice(landed({ green: false, summary: 'red: test_x · boom', rounds: 3, rungs: ['local', 'cloud'] }), 'saved'),
    { level: 'warn', text: 'conjured · red: test_x · boom · 3 rounds · local → cloud · saved' });
  assert.equal(conjureNotice(landed({ rounds: 1, rungs: ['local', 'cloud'] }), 'saved').text, 'conjured · green · 1 rounds · local → cloud · saved');
  assert.equal(conjureNotice(landed({ summary: 'green in round 2', rounds: 2, rungs: ['a', 'b'] }), 'saved').text, 'conjured · green in round 2 · saved');
});

test('stopped: the summary, the save, undo; nothing landed without edits', () => {
  assert.deepEqual(conjureNotice(landed({ stopped: true, green: false, summary: 'red: test_x' }), 'saved'),
    { level: 'warn', text: 'red: test_x · saved · undo reverts it' });
  assert.deepEqual(conjureNotice(landed({ stopped: true, edits: null }), undefined), { level: 'info', text: 'stopped · nothing landed' });
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
