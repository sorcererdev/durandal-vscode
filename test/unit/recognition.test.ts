import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan, Suggestion } from '../../src/protocol';
import { acceptWay, decorationText, followupOf, ghostOf, inlineGhost, recognitionOf } from '../../src/suggest/recognition';

const base: Suggestion = { uri: 'u', version: 1, kind: 'recognition', label: 'Command', summary: 'a command', line: 2, lines: null, at: 2, planId: 9, generator: 'p/command', sets: { command: 'x' } };
const plan: Plan = { files: [], conflicts: [], warnings: [], holes: [], snippet: null };

// ports durandal.nvim tests/suggest_spec.lua "recognitions"
test('a recognition\'s offer, choice and hint texts', () => {
  assert.equal(decorationText(recognitionOf({ ...base, band: 'offer' })), '⚡ Command — Tab: review');
  assert.equal(decorationText(recognitionOf({ ...base, band: 'offer', or: 'p/add-query' })), '⚡ Command or a add query — Tab: choose');
  assert.equal(decorationText(recognitionOf({ ...base, band: 'hint' })), '⚡ Command');
});

test('a recognition offer keeps the generator, its sets, band, reasons, score and plan', () => {
  const o = recognitionOf({ ...base, band: 'hint', or: null, reasons: ['the name fits'], score: 0.4 }, plan);
  assert.deepEqual(o, {
    kind: 'recognition', generator: 'p/command', name: 'Command', sets: { command: 'x' }, label: 'Command', summary: 'a command',
    band: 'hint', choice: undefined, reasons: ['the name fits'], score: 0.4, plan, planId: 9,
  });
  assert.equal(recognitionOf({ ...base }).band, 'offer', 'no band reads as an offer');
});

test('a follow-up and a ghost are named by the server\'s label (nvim :275)', () => {
  const f = followupOf({ ...base, kind: 'followup', generator: null, label: 'Failure arms', summary: '2 files' }, plan);
  assert.equal(f.generator, 'Failure arms');
  assert.equal(decorationText(f), '⚡ Tab: review Failure arms (2 files)');
  const g = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a', 'b', 'c'] });
  assert.deepEqual(g.lines, ['a', 'b', 'c']);
  assert.equal(decorationText(g), '⚡ Tab: Arms (+3 lines)');
});

test('the accept way: a follow-up, a ghost and a planned offer review; a choice, a hint, an unplanned non-offer choose', () => {
  assert.equal(acceptWay(followupOf({ ...base, kind: 'followup' })), 'review');
  assert.equal(acceptWay(ghostOf({ ...base, kind: 'ghost', lines: [] })), 'review');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'offer' }, plan)), 'review');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'offer', or: 'p/q' }, plan)), 'choose');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'hint' })), 'choose');
  assert.equal(acceptWay({ kind: 'snippet', generator: 'g', name: 'g', sets: {} }), 'none');
});

// M7 spec §4, decision 8: server lines are 1-based; a block at at + 1 goes under the cursor line
test('a ghost knows whether its block goes under the cursor line; only then is it drawn inline', () => {
  const below = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a'], line: 3, at: 2 });
  assert.equal(below.below, true);
  assert.equal(inlineGhost(below), true);
  const above = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a'], line: 2, at: 2 });
  assert.equal(above.below, false);
  assert.equal(inlineGhost(above), false);
  assert.equal(ghostOf({ ...base, kind: 'ghost', lines: ['a'], line: null, at: 2 }).below, false);
  assert.equal(inlineGhost(followupOf({ ...base, kind: 'followup', line: 3, at: 2 })), false);
});
