import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataKey, keyOf, recognitionKey, short } from '../../src/suggest/keys';

// ports durandal.nvim tests/suggest_spec.lua "dismissing on blank lines (review)"
test('a blank line\'s key names the line; a written line\'s does not', () => {
  const a = { generator: 'p/failure', sets: { app: 'bistro' } };
  assert.notEqual(keyOf(a, '', 3), keyOf(a, '', 5));
  assert.notEqual(keyOf(a, '   ', 3), keyOf(a, '   ', 5));
  assert.equal(keyOf(a, '    x,', 3), keyOf(a, '    x,', 5));
});

test('the key is the generator, its sets (in any order) and the line\'s text', () => {
  assert.equal(keyOf({ generator: 'g', sets: { a: '1', b: '2' } }, 'x', 1), keyOf({ generator: 'g', sets: { b: '2', a: '1' } }, 'x', 1));
  assert.notEqual(keyOf({ generator: 'g', sets: { a: '1' } }, 'x', 1), keyOf({ generator: 'g', sets: { a: '2' } }, 'x', 1));
  assert.notEqual(keyOf({ generator: 'g' }, 'x', 1), keyOf({ generator: 'h' }, 'x', 1));
  assert.equal(keyOf({ generator: 'g' }, 'x', 1), keyOf({ generator: 'g', sets: {} }, 'x', 1));
});

test('a recognition\'s band and choice are part of its key (a hint upgraded to an offer is new)', () => {
  const k = keyOf({ generator: 'p/command' }, 'def f():', 2);
  assert.notEqual(recognitionKey(k, 'hint'), recognitionKey(k, 'offer'));
  assert.notEqual(recognitionKey(k, 'offer'), recognitionKey(k, 'offer', 'p/query'));
  assert.equal(recognitionKey(k, 'offer'), recognitionKey(k, 'offer', undefined));
});

test('short: a generator id as people read it', () => {
  assert.equal(short('python-htmx/add-dependency'), 'add dependency');
  assert.equal(short('p/close_table'), 'close table');
  assert.equal(short('plain'), 'plain');
});

test('dataKey ignores key order', () => {
  assert.equal(dataKey({ generator: 'g', sets: { a: '1', b: '2' }, line: 3 }), dataKey({ line: 3, sets: { b: '2', a: '1' }, generator: 'g' }));
  assert.notEqual(dataKey({ generator: 'g', line: 3 }), dataKey({ generator: 'g', line: 4 }));
});
