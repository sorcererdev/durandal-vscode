import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Placed } from '../../src/plans/blocks';
import { applyLineEdits, factEdits, hunks, type TextEdit0 } from '../../src/plans/facts';
import { Ghosts, hoverText, lineCount, markerText, rowLines } from '../../src/plans/ghosts';
import type { LineChange } from '../../src/plans/rows';

const U = 'file:///w/one/plans/v.md';
const p = (index: number, row: number, lines: string[], replace = false): Placed => ({ index, row, replace, lines });

// durandal.nvim ghosts.lua show / at: an answer's blocks under their rows, kept per buffer
test('add keeps each block with its answer\'s id and verb; at gives a row\'s blocks in the order they came', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two']), p(2, 2, ['  - early'])]);
  g.add(U, 'ask', 'S1', [p(0, 5, ['  - three'])]);
  assert.deepEqual(g.at(U, 5).map(b => [b.id, b.verb, b.index, b.lines[0]]),
    [['V1', 'validate', 0, '  - one'], ['V1', 'validate', 1, '  - two'], ['S1', 'ask', 0, '  - three']]);
  assert.deepEqual(g.rows(U), [2, 5]);
  assert.deepEqual(g.at(U, 3), []);
  assert.deepEqual(g.rows('file:///w/other.md'), []);
});

test('every block gets a key of its own; an answer without an id keeps undefined', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 1, ['a']), p(1, 1, ['b'])]);
  g.add(U, 'do', undefined, [p(0, 1, ['c'])]);
  const keys = g.at(U, 1).map(b => b.key);
  assert.equal(new Set(keys).size, 3);
  assert.equal(g.at(U, 1)[2].id, undefined);
});

test('add copies the lines: changing the answer\'s array changes no ghost', () => {
  const g = new Ghosts();
  const lines = ['  - one'];
  g.add(U, 'validate', 'V1', [p(0, 5, lines)]);
  lines.push('  - more');
  assert.deepEqual(g.at(U, 5)[0].lines, ['  - one']);
});

test('takeKeys removes and returns the blocks named that are still here', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a']), p(1, 2, ['b'])]);
  const two = g.at(U, 2)[0];
  assert.deepEqual(g.takeKeys(U, [two.key, 9999]).map(b => b.index), [1]);
  assert.deepEqual(g.takeKeys(U, [two.key]), []);
  assert.deepEqual(g.rows(U), [5]);
  assert.deepEqual(g.takeKeys(U, g.at(U, 5).map(b => b.key)).map(b => b.index), [0]);
  assert.deepEqual(g.rows(U), []);
});

test('has: whether any block named is still here, wherever its row went', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a'])]);
  const k = g.at(U, 5)[0].key;
  g.shift(U, [{ startLine: 0, startChar: 0, endLine: 0, newLines: 1 }]);
  assert.equal(g.has(U, [9999, k]), true);
  g.takeKeys(U, [k]);
  assert.equal(g.has(U, [k]), false);
});

// the rows follow the edits as M6b's verbs' rows do (rows.ts, nvim's extmarks without invalidate)
test('shift: typed above or at column 0 moves the row; a line break inside it does not; a deleted row\'s ghost takes the next row\'s place', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a'])]);
  assert.equal(g.shift(U, [{ startLine: 0, startChar: 0, endLine: 0, newLines: 1 }]), true);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 6, startChar: 3, endLine: 6, newLines: 1 }]);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 6, startChar: 0, endLine: 7, newLines: 0 }]);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 2, startChar: 0, endLine: 4, newLines: 0 }]);
  assert.deepEqual(g.rows(U), [4]);
  assert.equal(g.shift('file:///w/other.md', [{ startLine: 0, startChar: 0, endLine: 0, newLines: 1 }]), false);
});

test('drop forgets one plan; clear forgets every plan', () => {
  const g = new Ghosts();
  const V = 'file:///w/one/plans/w.md';
  g.add(U, 'validate', 'V1', [p(0, 1, ['a'])]);
  g.add(V, 'validate', 'V2', [p(0, 1, ['b'])]);
  g.drop(U);
  assert.deepEqual(g.rows(U), []);
  assert.deepEqual(g.rows(V), [1]);
  g.clear();
  assert.deepEqual(g.rows(V), []);
});

// ghosts.lua accept_id: under the row, or over it (a do's step); several under one row in order
test('rowLines: the row once its blocks are in', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two', '  - three'])]);
  assert.deepEqual(rowLines('- e target line', g.at(U, 5)), ['- e target line', '  - one', '  - two', '  - three']);
  g.add(U, 'do', 'D1', [p(0, 8, ['- [x] step @src/a.py:Foo', '  - did it'], true)]);
  assert.deepEqual(rowLines('- [ ] step @src/a.py:Foo', g.at(U, 8)), ['- [x] step @src/a.py:Foo', '  - did it']);
  g.add(U, 'validate', 'V2', [p(0, 3, [])]);
  assert.deepEqual(rowLines('- c', g.at(U, 3)), ['- c']);
});

test('lineCount and the marker: ai · +N lines, one line singular', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a']), p(1, 5, ['b', 'c'])]);
  assert.equal(lineCount(g.at(U, 5)), 3);
  assert.equal(markerText(3), 'ai · +3 lines');
  assert.equal(markerText(1), 'ai · +1 line');
  assert.equal(markerText(0), 'ai · +0 lines');
});

test('hoverText: the row\'s lines fenced as markdown, the fence longer than any backticks in them', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two'])]);
  assert.equal(hoverText(g.at(U, 5)), '```markdown\n  - one\n  - two\n```');
  g.add(U, 'validate', 'V2', [p(0, 7, ['  - see ```code``` here'])]);
  assert.equal(hoverText(g.at(U, 7)), '````markdown\n  - see ```code``` here\n````');
  // blocks with no lines (an answer whose lines were all dropped): no empty fence
  g.add(U, 'validate', 'V3', [p(0, 9, [])]);
  assert.equal(hoverText(g.at(U, 9)), '_no lines to add_');
  g.add(U, 'validate', 'V4', [p(0, 9, ['  - late'])]);
  assert.equal(hoverText(g.at(U, 9)), '```markdown\n  - late\n```');
});

// the change VS Code reports for one of lineEdits' edits (rows [start, end) replaced by its
// lines, each ending in a line break), bottom-up as in one event
const changes = (es: readonly TextEdit0[]): LineChange[] =>
  [...es].sort((x, y) => y.start - x.start).map(e => ({ startLine: e.start, startChar: 0, endLine: e.end, newLines: e.lines.length }));

// final review Important 1: a landing whose facts straddle a ghost row
test('a plan write with changes above and below a ghost row (hunks) leaves the ghost on its row', () => {
  const lines = ['# T', '- a', '- b', '- c', '- d', '- e target line', '- f', '## Next', '- [ ] step', ''];
  const after = applyLineEdits(lines, factEdits(lines, [{ row: 1, text: '- a ✓' }, { row: 8, text: '- [x] step' }]));
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - ok'])]);
  g.shift(U, changes(hunks(lines, after)));
  assert.deepEqual(g.rows(U), [5]);
  // lines added above and taken below: the ghost moves by what was added above it only
  const more = applyLineEdits(lines, factEdits(lines, [{ after: 1, lines: ['  - x', '  - y'] }, { from: 7, to: 8, lines: ['## N'] }]));
  g.shift(U, changes(hunks(lines, more)));
  assert.deepEqual(g.rows(U), [7]);
});
