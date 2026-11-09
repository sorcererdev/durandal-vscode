import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fact } from '../../src/protocol';
import { factEdits, type TextEdit0 } from '../../src/plans/facts';

const PLAN = ['# T', '', '- [ ] add a label @src/a.py:Table.label', '- [ ] next'];

// the edits applied one by one, in their order
const apply = (lines: string[], edits: TextEdit0[]): string[] => {
  const out = [...lines];
  for (const e of edits) out.splice(e.start, e.end - e.start, ...e.lines);
  return out;
};

test('{row, text} replaces that line (review_spec: t lands the tick)', () => {
  const facts: Fact[] = [{ row: 2, text: '- [x] add a label @src/a.py:Table.label ✓ abc1234' }];
  assert.deepEqual(factEdits(PLAN, facts), [{ start: 2, end: 3, lines: ['- [x] add a label @src/a.py:Table.label ✓ abc1234'] }]);
});

test('a replace that changes nothing is dropped; out of range is dropped; the last for a row wins', () => {
  assert.deepEqual(factEdits(PLAN, [{ row: 3, text: '- [ ] next' }]), []);
  assert.deepEqual(factEdits(PLAN, [{ row: 4, text: 'x' }, { row: -1, text: 'x' }]), []);
  assert.deepEqual(factEdits(PLAN, [{ row: 3, text: 'a' }, { row: 3, text: 'b' }]), [{ start: 3, end: 4, lines: ['b'] }]);
});

test('{after, lines} inserts below that row; several below one row keep the engine\'s order', () => {
  assert.deepEqual(factEdits(PLAN, [{ after: 2, lines: ['  - also @src/a.py:Table'] }]), [{ start: 3, end: 3, lines: ['  - also @src/a.py:Table'] }]);
  const facts: Fact[] = [{ after: 2, lines: ['  - one'] }, { after: 2, lines: ['  - two', '  - three'] }];
  assert.deepEqual(apply(PLAN, factEdits(PLAN, facts)), ['# T', '', '- [ ] add a label @src/a.py:Table.label', '  - one', '  - two', '  - three', '- [ ] next']);
});

test('inserts are clamped: -1 is the top, past the end the bottom; no lines is dropped', () => {
  assert.deepEqual(factEdits(PLAN, [{ after: -1, lines: ['top'] }]), [{ start: 0, end: 0, lines: ['top'] }]);
  assert.deepEqual(factEdits(PLAN, [{ after: 99, lines: ['end'] }]), [{ start: 4, end: 4, lines: ['end'] }]);
  assert.deepEqual(factEdits(PLAN, [{ after: 1, lines: [] }]), []);
});

test('replaces and inserts together: bottom up, the replace before an insert at the same line', () => {
  const facts: Fact[] = [{ after: 0, lines: ['under title'] }, { row: 2, text: '- [x] a' }, { after: 1, lines: ['above a'] }, { after: 3, lines: ['last'] }];
  const edits = factEdits(PLAN, facts);
  assert.deepEqual(edits, [
    { start: 4, end: 4, lines: ['last'] },
    { start: 2, end: 3, lines: ['- [x] a'] },
    { start: 2, end: 2, lines: ['above a'] },
    { start: 1, end: 1, lines: ['under title'] },
  ]);
  assert.deepEqual(apply(PLAN, edits), ['# T', 'under title', '', 'above a', '- [x] a', '- [ ] next', 'last']);
});

test('edits never overlap: as one workspace edit they give the same text', () => {
  const facts: Fact[] = [{ row: 0, text: '# U' }, { after: 0, lines: ['x'] }, { from: 2, to: 3, lines: ['y'] }, { after: 3, lines: ['z'] }];
  const edits = factEdits(PLAN, facts);
  const asc = [...edits].reverse();
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].end <= asc[i].start, JSON.stringify(asc));
  assert.deepEqual(apply(PLAN, edits), ['# U', 'x', '', 'y', 'z']);
});

test('{from, to, lines} replaces rows from..to (to inclusive), as the server\'s applyFactsText', () => {
  // olifant LoopSpec: applyFactsText [ReplaceRows 1 2 [B1,B2,B3], ReplaceRows 4 6 [E], Insert 6 [after], Insert 2 [below B]]
  const lines = ['a', 'b1', 'b2', 'c', 'e1', 'e2', 'e3', 'f'];
  const facts: Fact[] = [
    { from: 1, to: 2, lines: ['B1', 'B2', 'B3'] }, { from: 4, to: 6, lines: ['E'] }, { after: 6, lines: ['after'] }, { after: 2, lines: ['below B'] },
  ];
  assert.deepEqual(apply(lines, factEdits(lines, facts)), ['a', 'B1', 'B2', 'B3', 'below B', 'c', 'E', 'after', 'f']);
  assert.deepEqual(factEdits(lines, [{ from: 1, to: 2, lines: ['B'] }]), [{ start: 1, end: 3, lines: ['B'] }]);
});

test('a range: clamped to the document; changing nothing, dropped; a replace inside it, dropped; an insert inside it goes below it', () => {
  assert.deepEqual(factEdits(PLAN, [{ from: 3, to: 9, lines: ['N'] }]), [{ start: 3, end: 4, lines: ['N'] }]);
  assert.deepEqual(factEdits(PLAN, [{ from: 7, to: 9, lines: ['N'] }]), []);
  assert.deepEqual(factEdits(PLAN, [{ from: 2, to: 3, lines: PLAN.slice(2) }]), []);
  assert.deepEqual(factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { row: 2, text: 'lost' }]), [{ start: 1, end: 3, lines: ['R'] }]);
  assert.deepEqual(apply(PLAN, factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { after: 1, lines: ['below'] }])), ['# T', 'R', 'below', '- [ ] next']);
  // a second range over the first's rows is dropped
  assert.deepEqual(factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { from: 2, to: 3, lines: ['S'] }]), [{ start: 1, end: 3, lines: ['R'] }]);
});

test('no facts, no edits', () => {
  assert.deepEqual(factEdits(PLAN, []), []);
});
