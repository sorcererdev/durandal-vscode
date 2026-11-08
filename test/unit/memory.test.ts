import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MutateResult, MutateSurvivor } from '../../src/protocol';
import { killedBetween, markText, nextMarked, plainSurvivor, rowsOf, SurvivorMemory } from '../../src/tdd/memory';

const U = 'file:///p/a.py';
const s = (line: number, from: string, to: string, dim = false): MutateSurvivor => ({ line, operator: 'swap', from, to, mutated: `    y = a ${to} b`, dim });
const answer = (first: number, last: number, survivors: MutateSurvivor[]): MutateResult => ({
  file: '/p/a.py', unit: 'f', lines: { first, last }, killed: 1, survived: survivors.length, waived: 0, survivors, summary: 'x',
});

test('markText: from → to survives, likely equivalent when dim', () => {
  assert.equal(markText(s(3, '+', '-')), '+ → - survives');
  assert.equal(markText(s(3, '<', '<=', true)), '< → <= survives (likely equivalent)');
});

test('replace: the answer\'s survivors in place of those inside its lines; other units\' stay', () => {
  const m = new SurvivorMemory();
  m.replace(U, answer(1, 5, [s(2, '+', '-'), s(4, '<', '<=')]));
  m.replace(U, answer(10, 20, [s(12, '0', '1')]));
  m.replace(U, answer(1, 5, [s(4, '<', '<=')]));
  assert.deepEqual(m.survivors(U).map(x => x.line), [12, 4]);
  assert.deepEqual(m.within(U, { first: 1, last: 5 }).map(x => x.line), [4]);
  assert.deepEqual(m.survivors('file:///p/b.py'), []);
});

test('remove: the first survivor with its line, from and to; forget drops the document', () => {
  const m = new SurvivorMemory();
  m.replace(U, answer(1, 5, [s(2, '+', '-'), s(2, '+', '-'), s(3, '+', '-')]));
  assert.equal(m.remove(U, { line: 2, operator: 'swap', from: '+', to: '-', mutated: '' }), true);
  assert.deepEqual(m.survivors(U).map(x => x.line), [2, 3]);
  assert.equal(m.remove(U, { line: 9, operator: 'swap', from: '+', to: '-', mutated: '' }), false);
  m.forget(U);
  assert.deepEqual(m.survivors(U), []);
});

test('shift: lines added or removed above a survivor move it; edits below or on its line do not (Review Focus 1)', () => {
  const m = new SurvivorMemory();
  m.replace(U, answer(1, 30, [s(5, '+', '-'), s(20, '<', '<=')]));
  // two lines inserted at 0-based line 2, column 4 (one line replaced by three)
  assert.equal(m.shift(U, 2, 4, 2, 2), true);
  assert.deepEqual(m.survivors(U).map(x => x.line), [7, 22]);
  // three lines deleted: 0-based 9..12 become one
  m.shift(U, 9, 0, 12, 0);
  assert.deepEqual(m.survivors(U).map(x => x.line), [7, 19]);
  // an edit on survivor 7's own line (0-based 6) leaves it; one below it changes nothing above
  assert.equal(m.shift(U, 6, 3, 6, 0), false);
  m.shift(U, 25, 0, 25, 1);
  assert.deepEqual(m.survivors(U).map(x => x.line), [7, 19]);
});

test('shift: an insert at column 0 of the survivor\'s own line moves it, as an extmark at column 0 would (F4)', () => {
  const m = new SurvivorMemory();
  m.replace(U, answer(1, 30, [s(5, '+', '-')]));
  // "x\n" inserted at line 4 (0-based), column 0: the survivor's text is pushed down a line
  assert.equal(m.shift(U, 4, 0, 4, 1), true);
  assert.deepEqual(m.survivors(U).map(x => x.line), [6]);
  // the same insert after column 0 splits the line after the survivor's start: it stays
  assert.equal(m.shift(U, 5, 2, 5, 1), false);
  assert.deepEqual(m.survivors(U).map(x => x.line), [6]);
});

test('killedBetween: the marks gone, as from → to on line N', () => {
  const before = [s(2, '+', '-'), s(4, '<', '<=')];
  assert.deepEqual(killedBetween(before, [s(4, '<', '<=')]), ['+ → - on line 2']);
  assert.deepEqual(killedBetween(before, before), []);
});

test('nextMarked: the first marked line no done unit holds', () => {
  const ss = [s(12, 'a', 'b'), s(3, 'a', 'b'), s(30, 'a', 'b')];
  assert.equal(nextMarked(ss, []), 3);
  assert.equal(nextMarked(ss, [{ first: 1, last: 10 }]), 12);
  assert.equal(nextMarked(ss, [{ first: 1, last: 20 }, { first: 30, last: 30 }]), undefined);
});

test('rows: the server\'s order, the dim ones last; line, operator, from → to; the mutated line', () => {
  const rows = rowsOf([s(4, '<', '<=', true), s(2, '+', '-'), { ...s(9, 'x', 'y'), mutated: '' }]);
  assert.deepEqual(rows.map(r => r.label), ['line 2  swap  + → -', 'line 9  swap  x → y', 'line 4  swap  < → <=']);
  assert.deepEqual(rows.map(r => r.description), [undefined, undefined, 'likely equivalent']);
  assert.deepEqual(rows.map(r => r.detail), ['y = a - b', 'x → y', 'y = a <= b']);
});

test('plainSurvivor: what olifant/stub and olifant/waive take (no dim)', () => {
  assert.deepEqual(plainSurvivor(s(2, '+', '-', true)), { line: 2, operator: 'swap', from: '+', to: '-', mutated: '    y = a - b' });
});
