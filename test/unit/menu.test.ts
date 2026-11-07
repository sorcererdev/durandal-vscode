import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CodeAction } from 'vscode-languageserver-protocol';
import type { FileAction } from '../../src/protocol';
import { askWay, explainMiss, generatorOf, menuItems } from '../../src/actions/menu';

const act = (title: string, kind: string, data: object): CodeAction => ({ title, kind, data });
const fa = (label: string, line: number): FileAction =>
  ({ generator: 'rust-htmx/wire-command', name: 'Wire', label, range: { start: [line, 5], end: [line, 20] }, sets: { command: 'c' }, missing: [], snippet: false });

test('menuItems: the fixes first, as Fix:, then the rest in the server\'s order; (asks …) from missing', () => {
  const items = menuItems([
    act('Extract', 'refactor.rewrite', { generator: 'g/extract', missing: [] }),
    act('Add a service', 'quickfix', { rule: 'r/service', missing: ['app', 'service'] }),
    act('Wire', 'refactor.rewrite', { generator: 'g/wire' }),
  ]);
  assert.deepEqual(items.map(i => [i.label, i.description]), [['Fix: Add a service', '(asks app, service)'], ['Extract', undefined], ['Wire', undefined]]);
  assert.deepEqual(items.map(i => generatorOf(i.action)), ['r/service', 'g/extract', 'g/wire']);
});

test('askWay: a generator with inputs missing asks in the form (a fix hands its values back); else each input', () => {
  assert.deepEqual(askWay(act('x', 'refactor', { generator: 'g', missing: ['a'] })), { kind: 'form', generator: 'g', done: false });
  assert.deepEqual(askWay(act('x', 'quickfix', { generator: 'g', missing: ['a'] })), { kind: 'form', generator: 'g', done: true });
  assert.deepEqual(askWay(act('x', 'quickfix', { rule: 'r', missing: ['a'] })), { kind: 'direct', missing: ['a'] });
  assert.deepEqual(askWay(act('x', 'refactor', { generator: 'g', missing: [] })), { kind: 'direct', missing: [] });
});

test('(a) explainMiss points to actions elsewhere in the file, by line', () => {
  const m = explainMiss({ actions: [fa('Wire c', 9)], nearby: [] }, 'src/a.rs');
  assert.equal(m.kind, 'elsewhere');
  assert.ok(m.kind === 'elsewhere');
  assert.deepEqual(m.items, [{ label: '⚡ Wire c — line 9', line: 9, col: 5 }]);
});

test('(b) explainMiss says what a nearby generator looks for', () => {
  assert.deepEqual(explainMiss({ actions: [], nearby: [{ generator: 'rust-htmx/wire-command', label: 'Wire', why: 'on a field of the CancelInvoice struct' }] }, 'src/a.rs'),
    { kind: 'nearby', text: 'rust-htmx/wire-command applies on a field of the CancelInvoice struct — none yet' });
});

test('explainMiss shows what a generator waits for above the actions elsewhere (review I5)', () => {
  const m = explainMiss({ actions: [fa('Add Unknown to every match', 22)], nearby: [{ generator: 'rust-htmx/wire-command', name: 'Wire Command Dependencies', label: 'Wire', why: 'on a field of the CancelInvoice struct' }] }, 'src/a.rs');
  assert.ok(m.kind === 'elsewhere');
  assert.deepEqual(m.items[0], { label: 'Wire Command Dependencies applies on a field of the CancelInvoice struct — none yet', separator: true });
  assert.equal(m.items[1].line, 22);
});

test('(c) explainMiss says when nothing relates to the file', () => {
  assert.deepEqual(explainMiss({ actions: [], nearby: [] }, 'src/a.rs'), { kind: 'none', text: 'No Olifant generators apply to src/a.rs' });
  assert.deepEqual(explainMiss(null, 'src/a.rs'), { kind: 'none', text: 'No Olifant generators apply to src/a.rs' });
});
