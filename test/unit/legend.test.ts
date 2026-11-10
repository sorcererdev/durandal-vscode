import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND } from '../planTokens';

test('decode: relative rows and columns, the type by legend index, the modifier bits by legend order', () => {
  const toks = decode(encode([
    [2, 0, 6, 'planMarker'], [2, 6, 6, 'planStep'], [2, 13, 10, 'planAnchorPath'],
    [4, 2, 2, 'planMarker', ['done']], [4, 4, 9, 'planClaim', ['done', 'checked', 'resolved']],
  ]), PLAN_LEGEND);
  assert.deepEqual(toks.map(t => [t.line, t.start, t.length, t.type, [...t.modifiers]]), [
    [2, 0, 6, 'planMarker', []], [2, 6, 6, 'planStep', []], [2, 13, 10, 'planAnchorPath', []],
    [4, 2, 2, 'planMarker', ['done']], [4, 4, 9, 'planClaim', ['done', 'checked', 'resolved']],
  ]);
});

test('decode: all 13 types and all 6 modifiers round-trip', () => {
  const specs = PLAN_LEGEND.tokenTypes.map((t, i) => [i, 0, 1, t, [PLAN_LEGEND.tokenModifiers[i % 6]]] as [number, number, number, string, string[]]);
  const toks = decode(encode(specs), PLAN_LEGEND);
  assert.deepEqual(toks.map(t => t.type), [...PLAN_LEGEND.tokenTypes]);
  assert.deepEqual(toks.map(t => [...t.modifiers][0]), specs.map(s => s[4][0]));
});

test('decode: an index the legend lacks gives type "" and no modifier; a short tail is ignored; nothing throws', () => {
  const toks = decode([0, 0, 3, 99, 1 << 20, 1, 0], { tokenTypes: ['a'], tokenModifiers: ['m'] });
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, '');
  assert.equal(toks[0].modifiers.size, 0);
});

test('applyEdits: edits refer to the previous array, applied from the last start down', () => {
  assert.deepEqual(applyEdits([0, 0, 1, 0, 0, 1, 0, 1, 0, 0], [{ start: 5, deleteCount: 5, data: [2, 0, 1, 0, 0] }, { start: 0, deleteCount: 0, data: [0, 0, 2, 1, 0] }]),
    [0, 0, 2, 1, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0]);
  assert.deepEqual(applyEdits([1, 2, 3], [{ start: 1, deleteCount: 1 }]), [1, 3]);
});
