import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GLYPHS } from '../../src/plans/glyphs';
import { colourOf, DiagLike, worstPerLine } from '../../src/plans/verdicts';

const d = (line: number, code: string | undefined, severity: 0 | 1 | 2 | 3, source = 'olifant-plan'): DiagLike => ({ line, code, severity, source });

test('one mark per line, the worst wins: ✗ › ? › … › ○ › ✓ (nvim plans.lua:160-205)', () => {
  assert.deepEqual(worstPerLine([d(1, 'claim-right', 3), d(1, 'claim-queued', 3), d(1, 'claim-checking', 3)], DEFAULT_GLYPHS),
    [{ line: 1, kind: 'checking', text: '…' }]);
  assert.deepEqual(worstPerLine([d(2, 'claim-unsure', 3), d(2, 'claim-wrong', 1)], DEFAULT_GLYPHS), [{ line: 2, kind: 'wrong', text: '✗' }]);
  assert.deepEqual(worstPerLine([d(3, 'claim-right', 3)], DEFAULT_GLYPHS), [{ line: 3, kind: 'right', text: '✓' }]);
});

test('any verdict outranks any other diagnostic; among the others error › warning › information › hint, as E W I H', () => {
  assert.deepEqual(worstPerLine([d(1, undefined, 0, 'olifant'), d(1, 'claim-right', 3)], DEFAULT_GLYPHS), [{ line: 1, kind: 'right', text: '✓' }]);
  assert.deepEqual(worstPerLine([d(2, undefined, 3, 'olifant'), d(2, undefined, 2, 'olifant')], DEFAULT_GLYPHS), [{ line: 2, kind: 'I', text: 'I' }]);
  assert.deepEqual(worstPerLine([d(3, undefined, 0, 'olifant')], DEFAULT_GLYPHS), [{ line: 3, kind: 'E', text: 'E' }]);
  assert.deepEqual(worstPerLine([d(4, undefined, 1, 'olifant')], DEFAULT_GLYPHS), [{ line: 4, kind: 'W', text: 'W' }]);
  assert.deepEqual(worstPerLine([d(5, undefined, 3, 'olifant')], DEFAULT_GLYPHS), [{ line: 5, kind: 'H', text: 'H' }]);
});

test('only olifant-plan and olifant diagnostics count; an unknown code is a plain diagnostic; lines in order', () => {
  assert.deepEqual(worstPerLine([d(5, 'claim-wrong', 1, 'cSpell'), d(5, undefined, 0, 'markdownlint'), d(5, 'claim-queued', 3)], DEFAULT_GLYPHS),
    [{ line: 5, kind: 'queued', text: '○' }]);
  assert.deepEqual(worstPerLine([d(6, 'toString', 3)], DEFAULT_GLYPHS), [{ line: 6, kind: 'H', text: 'H' }]);
  assert.deepEqual(worstPerLine([d(9, 'claim-right', 3), d(2, 'claim-right', 3)], DEFAULT_GLYPHS).map(m => m.line), [2, 9]);
});

test('the glyphs setting names the verdict marks; the colours: wrong and warnings, errors, right, the rest', () => {
  assert.equal(worstPerLine([d(1, 'claim-wrong', 1)], { ...DEFAULT_GLYPHS, wrong: 'X' })[0].text, 'X');
  assert.deepEqual(['wrong', 'W', 'E', 'right', 'unsure', 'checking', 'queued', 'I', 'H'].map(k => colourOf(k as never)),
    ['warning', 'warning', 'error', 'passed', 'hint', 'hint', 'hint', 'hint', 'hint']);
});
