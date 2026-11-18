import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Shown } from '../../src/protocol';
import { HeldStep, reopens, stepLines, StepStore } from '../../src/pause/stepStore';
import { stepFixture } from '../stepFixtures';

const U = 'file:///p/src/a.py';
const T = 'file:///p/src/a__test.py';
const at = (line: number) => ({ line, character: 0 });
const edit = (uri: string, a: number, b: number) => ({ textDocument: { uri, version: 3 }, edits: [{ range: { start: { line: a, character: 0 }, end: { line: b, character: 4 } }, newText: 'x' }] });
const withEdits = (edits: Shown['edits'], name: 'took' | 'nostep' = 'took'): Shown => ({ ...stepFixture(name), edits });

test('the lines the step edits in this document: documentChanges and changes, other documents left out', () => {
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [edit(U, 4, 6), edit(T, 0, 9), edit(U, 2, 2)] }), at(5)), { first: 2, last: 6 });
  assert.deepEqual(stepLines(U, withEdits({ changes: { [U]: [{ range: { start: at(7), end: at(8) }, newText: 'y' }] } }), at(5)), { first: 7, last: 8 });
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [{ kind: 'create', uri: T }, edit(T, 0, 1)] }), at(5)), undefined);
});

test('a uri spelled differently still finds the lines (Review Focus 1)', () => {
  const server = 'file:///p/src/a%2Epy';
  const same = (a: string, b: string) => decodeURIComponent(a) === decodeURIComponent(b);
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [edit(server, 3, 4)] }), at(3), same), { first: 3, last: 4 });
});

test('edits elsewhere only: no lines, never reopens (Review Focus 2)', () => {
  const s = withEdits({ documentChanges: [edit(T, 0, 3)] });
  const lines = stepLines(U, s, at(5));
  assert.equal(lines, undefined);
  const h: HeldStep = { uri: U, shown: s, position: at(5), version: 3, lines };
  assert.equal(reopens(h, 3, 5, false), false);
});

test('a step that took none: the asked line; null edits on a took step: no lines', () => {
  assert.deepEqual(stepLines(U, withEdits(null, 'nostep'), at(9)), { first: 9, last: 9 });
  assert.equal(stepLines(U, withEdits(null), at(9)), undefined);
});

test('reopens: the same version, the cursor on its lines, no selection', () => {
  const h: HeldStep = { uri: U, shown: stepFixture('took'), position: at(4), version: 3, lines: { first: 2, last: 6 } };
  assert.equal(reopens(h, 3, 2, false), true);
  assert.equal(reopens(h, 3, 6, false), true);
  assert.equal(reopens(h, 3, 7, false), false);
  assert.equal(reopens(h, 4, 4, false), false);
  assert.equal(reopens(h, 3, 4, true), false);
});

test('the store: one step a document, replaced, dropped, all dropped', () => {
  const st = new StepStore();
  const h = (uri: string, token: string): HeldStep => ({ uri, shown: { ...stepFixture('took'), token }, position: at(0), version: 1, lines: undefined });
  st.set(h(U, 'step-1'));
  st.set(h(U, 'step-2'));
  st.set(h(T, 'step-3'));
  assert.equal(st.get(U)?.shown.token, 'step-2');
  st.drop(U);
  assert.equal(st.get(U), undefined);
  assert.equal(st.get(T)?.shown.token, 'step-3');
  st.dropAll();
  assert.equal(st.get(T), undefined);
});
