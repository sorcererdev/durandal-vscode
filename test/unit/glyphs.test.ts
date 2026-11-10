import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concealOf, conceals, DEFAULT_GLYPHS } from '../../src/plans/glyphs';
import { decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND, TokSpec } from '../planTokens';

const tok = (spec: TokSpec) => decode(encode([spec]), PLAN_LEGEND)[0];

test('concealOf: a marker by its trimmed text; the glyph keeps the marker\'s trailing space (nvim plans.lua:85-118)', () => {
  const g = DEFAULT_GLYPHS;
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [ ] a step', g), { line: 2, start: 0, end: 5, glyph: '☐' });
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [x] done', g), { line: 2, start: 0, end: 5, glyph: '☑' });
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [X] done', g), { line: 2, start: 0, end: 5, glyph: '☑' });
  assert.deepEqual(concealOf(tok([2, 0, 4, 'planMarker']), '- ? Why F?', g), { line: 2, start: 0, end: 3, glyph: '?' });
  assert.deepEqual(concealOf(tok([2, 2, 8, 'planMarker']), '  - test: it works', g), { line: 2, start: 2, end: 9, glyph: '·' });
  assert.deepEqual(concealOf(tok([2, 2, 7, 'planMarker']), '  - also @a.py:F', g), { line: 2, start: 2, end: 8, glyph: '+' });
});

test('concealOf: an empty glyph hides the whole token, its space too', () => {
  const g = DEFAULT_GLYPHS;
  assert.deepEqual(concealOf(tok([4, 2, 2, 'planMarker']), '  - a claim', g), { line: 4, start: 2, end: 4, glyph: '' });
  assert.deepEqual(concealOf(tok([2, 13, 10, 'planAnchorPath']), '- [ ] a step @src/a.py:F', g), { line: 2, start: 13, end: 23, glyph: '' });
  assert.deepEqual(concealOf(tok([3, 30, 7, 'planFingerprint']), '- [x] done step @src/a.py:F ✓ abc1234', g), { line: 3, start: 30, end: 37, glyph: '' });
});

test('concealOf: overrides apply; other types and a token past its line\'s end give nothing', () => {
  const g = { ...DEFAULT_GLYPHS, todo: '[]', path: '@' };
  assert.equal(concealOf(tok([0, 0, 6, 'planMarker']), '- [ ] s', g)!.glyph, '[]');
  assert.deepEqual(concealOf(tok([0, 7, 4, 'planAnchorPath']), '- [ ] s @a.py:F', g), { line: 0, start: 7, end: 11, glyph: '@' });
  assert.equal(concealOf(tok([0, 6, 1, 'planStep']), '- [ ] s', g), undefined);
  assert.equal(concealOf(tok([0, 0, 6, 'planMarker']), '- [ ]', g), undefined);
});

test('conceals: none for a stale reading (undefined: leave what is drawn); cursor lines raw; no reading draws nothing', () => {
  const toks = decode(encode([[0, 0, 6, 'planMarker'], [1, 0, 6, 'planMarker']]), PLAN_LEGEND);
  const lines = ['- [ ] a', '- [x] b'];
  const at = (l: number) => lines[l];
  assert.equal(conceals({ version: 3, toks }, 4, at, DEFAULT_GLYPHS, new Set()), undefined);
  assert.deepEqual(conceals({ version: 4, toks }, 4, at, DEFAULT_GLYPHS, new Set([1])), [{ line: 0, start: 0, end: 5, glyph: '☐' }]);
  assert.deepEqual(conceals(undefined, 4, at, DEFAULT_GLYPHS, new Set()), []);
  assert.deepEqual(conceals({ version: 4, toks }, 4, l => (l === 0 ? lines[0] : undefined), DEFAULT_GLYPHS, new Set()), [{ line: 0, start: 0, end: 5, glyph: '☐' }]);
});
