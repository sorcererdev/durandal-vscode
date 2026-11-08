import { test } from 'node:test';
import assert from 'node:assert/strict';
import { early, fetchFailure, GateIn, inlineGate, MAX_GHOST_LINES, snippetData } from '../../src/suggest/gate';
import { keyOf } from '../../src/suggest/keys';
import type { InlineItem } from '../../src/protocol';

const data = { kind: 'action', path: '/p/a.py', generator: 'p/failure', sets: { app: 'bistro' }, line: 5 };
const item = (o: Partial<InlineItem> = {}): InlineItem => ({
  insertText: { kind: 'snippet', value: 'class ${1:Name}:' }, range: { start: { line: 4, character: 0 }, end: { line: 4, character: 0 } },
  filterText: '', ghost: ['class ⟨Name⟩:'], data, ...o,
});
const g = (o: Partial<GateIn> = {}): GateIn => ({
  enabled: true, inProject: true, completionOpen: false, nonInline: false, dismissed: () => false, line: 4, lineText: '', ...o,
});

test('an action item with a short ghost is shown, its body and key with it', () => {
  const r = inlineGate(item(), g());
  assert.ok(r.ok);
  assert.equal(r.body, 'class ${1:Name}:');
  assert.equal(r.data.generator, 'p/failure');
  assert.equal(r.key, keyOf({ generator: 'p/failure', sets: { app: 'bistro' } }, '', 5));
});

test('nothing when ghosts are off, out of a project, the completion widget is open or a decoration holds the line', () => {
  for (const o of [{ enabled: false }, { inProject: false }, { completionOpen: true }, { nonInline: true }] as Partial<GateIn>[]) {
    assert.equal(inlineGate(item(), g(o)).ok, false, JSON.stringify(o));
    assert.ok(early(g(o)), JSON.stringify(o));
  }
  assert.equal(early(g()), undefined);
});

test('nothing for no item, data that is not an action, a ghost that is not lines, or one of more than 8 lines', () => {
  assert.equal(inlineGate(undefined, g()).ok, false);
  assert.equal(inlineGate(item({ data: { kind: 'other' } }), g()).ok, false);
  assert.equal(inlineGate(item({ data: undefined }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: 'class X:' }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: Array(MAX_GHOST_LINES + 1).fill('x') }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: Array(MAX_GHOST_LINES).fill('x') }), g()).ok, true);
});

test('nothing once dismissed on this line\'s text', () => {
  const key = keyOf({ generator: 'p/failure', sets: { app: 'bistro' } }, '', 5);
  assert.equal(inlineGate(item(), g({ dismissed: k => k === key })).ok, false);
});

test('a plain-text insertText is taken as the body', () => {
  const r = inlineGate(item({ insertText: 'pass' }), g());
  assert.ok(r.ok && r.body === 'pass');
});

test('snippetData: an action with a generator; sets default to {}', () => {
  assert.deepEqual(snippetData({ kind: 'action', path: 'p', generator: 'g', line: 1 })?.sets, {});
  assert.equal(snippetData({ kind: 'action', path: 'p', line: 1 }), undefined);
  assert.equal(snippetData(null), undefined);
});

test('nothing when the item\'s range is not on the cursor line', () => {
  const at = (line: number, end = line) => item({ range: { start: { line, character: 0 }, end: { line: end, character: 0 } } });
  assert.equal(inlineGate(at(3), g()).ok, false);
  assert.equal(inlineGate(at(5), g()).ok, false);
  assert.equal(inlineGate(at(4, 5), g()).ok, false);
  assert.equal(inlineGate(at(4), g()).ok, true);
});

test('fetchFailure: a refused inline fetch is said as the server put it; a cancelled one is not', () => {
  assert.equal(fetchFailure(new Error('no project for this file'), false), 'no project for this file');
  assert.equal(fetchFailure(Object.assign(new Error('Request cancelled'), { code: -32800 }), false), undefined);
  assert.equal(fetchFailure(new Error('Canceled'), true), undefined);
});
