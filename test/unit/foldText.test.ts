import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapsedStarts, entryTargets, foldLabel, stillOpen } from '../../src/plans/foldText';
import { decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND, TokSpec } from '../planTokens';

const QUESTION = ['- ? Why F?', '  - because @src/a.py:F ✓ abc1234', '  - An early note.', '    - a detail', '  - A later note.'];
const Q_TOKS: TokSpec[] = [
  [0, 0, 4, 'planMarker'], [0, 4, 6, 'planQuestion'],
  [1, 2, 2, 'planMarker'], [1, 4, 7, 'planEvidence'],
  [2, 2, 2, 'planMarker'], [2, 4, 14, 'planClaim'],
  [3, 4, 2, 'planMarker'], [3, 6, 8, 'planClaim'],
  [4, 2, 2, 'planMarker'], [4, 4, 13, 'planClaim'],
];
const toks = (specs: TokSpec[]) => decode(encode(specs), PLAN_LEGEND);
const at = (lines: string[]) => (r: number) => lines[r];

test('a question\'s label: its conclusion, the last claim at its first child\'s indent (nvim plans_spec :594)', () => {
  assert.equal(foldLabel(toks(Q_TOKS), at(QUESTION), 0, 4), ' — A later note. ▸ 4');
  // the deeper claim on row 3 is not at the child indent: the scan from row 2 finds the early note
  assert.equal(foldLabel(toks(Q_TOKS), at(QUESTION), 0, 3), ' — An early note. ▸ 3');
  assert.equal(foldLabel(toks(Q_TOKS.filter(t => t[3] !== 'planClaim')), at(QUESTION), 0, 4), ' ▸ 4');
});

test('a done step\'s label: its unit and verdict (nvim plans_spec :602)', () => {
  const line = '- [x] done step @src/a.py:F ✓ abc1234';
  const t = toks([[0, 0, 6, 'planMarker'], [0, 6, 9, 'planStepDone'], [0, 16, 10, 'planAnchorPath'], [0, 26, 1, 'planAnchorUnit'], [0, 28, 1, 'planVerdict'], [0, 30, 7, 'planFingerprint']]);
  assert.equal(foldLabel(t, at([line, '  - child']), 0, 1), '  F ✓ ▸ 1');
  assert.equal(foldLabel(toks([[0, 0, 6, 'planMarker'], [0, 6, 9, 'planStepDone']]), at(['- [x] done step', '  - c']), 0, 1), ' ▸ 1');
});

test('anything else, or no tokens yet: the count alone', () => {
  assert.equal(foldLabel([], at(['  ```python @a.py:F', '  x', '  ```']), 0, 2), ' ▸ 2');
});

test('the label is cut at the width with …, keeping ▸ N (nvim plans_spec :609)', () => {
  const long = ['- ? Why?', `  - ${'word '.repeat(30).trim()}`];
  const t = toks([[0, 0, 4, 'planMarker'], [0, 4, 4, 'planQuestion'], [1, 2, 2, 'planMarker'], [1, 4, long[1].length - 4, 'planClaim']]);
  const label = foldLabel(t, at(long), 0, 1, 30);
  assert.equal(label.length, 30);
  assert.ok(label.endsWith('… ▸ 1'), label);
  assert.ok(foldLabel(t, at(long), 0, 1).length <= 80);
});

test('entryTargets: every range that spans rows, latest first; foldDone false keeps the excerpts only', () => {
  const lines = ['- [x] a', '  - c', '- [ ] b', '  ```python @a.py:F', '  x', '  ```'];
  const folds = [{ start: 0, end: 1 }, { start: 3, end: 5 }, { start: 2, end: 2 }];
  assert.deepEqual(entryTargets(folds, at(lines), true), [3, 0]);
  assert.deepEqual(entryTargets(folds, at(lines), false), [3]);
});

test('collapsedStarts: a start shown and the row after it hidden, with something shown below it', () => {
  const folds = [{ start: 3, end: 4 }, { start: 6, end: 8 }, { start: 12, end: 15 }];
  assert.deepEqual(collapsedStarts(folds, [{ start: 0, end: 3 }, { start: 5, end: 12 }], 30), [{ start: 3, end: 4 }]);
  // 12 is the viewport's last row: its next row may just be below the screen
  assert.deepEqual(collapsedStarts([{ start: 12, end: 15 }], [{ start: 0, end: 12 }], 30), []);
  // a fold to the document's end, collapsed: nothing below it to show
  assert.deepEqual(collapsedStarts([{ start: 12, end: 15 }], [{ start: 0, end: 12 }], 16), [{ start: 12, end: 15 }]);
});

test('stillOpen: targets whose row and next row are both shown', () => {
  assert.deepEqual(stillOpen([3, 6, 12], [{ start: 0, end: 3 }, { start: 5, end: 12 }]), [6]);
});
