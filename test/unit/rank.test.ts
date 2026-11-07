import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GeneratorItem } from '../../src/protocol';
import { fuzzy, pickerRows, rank, remember } from '../../src/generate/rank';

const g = (id: string, name: string, summary = '', here = false): GeneratorItem => ({ id, name, summary, here });
const ids = (xs: GeneratorItem[]) => xs.map(x => x.id);
const items = [
  g('p/query', 'Query', 'reads data'),
  g('p/command', 'Command', 'a use case that changes state', true),
  g('p/event', 'Event', 'something that happened'),
  g('p/repository', 'Repository', 'stores entities'),
];

test('with no query: here first, then recent (most recent first), then by name', () => {
  assert.deepEqual(ids(rank(items, '', ['p/repository', 'p/query'])), ['p/command', 'p/repository', 'p/query', 'p/event']);
});

test('filters fuzzily on the name and the summary', () => {
  assert.deepEqual(ids(rank(items, 'stores', [])), ['p/repository']);
  assert.ok(!ids(rank(items, 'zzz', [])).length);
});

test('a match in the name beats one only in the summary, even one that applies here', () => {
  const more = [g('p/wire', 'Wire', 'adds a port', true), g('p/port', 'Port', 'an adapter')];
  assert.deepEqual(ids(rank(more, 'port', [])), ['p/port', 'p/wire']);
});

test('among matches, here comes first, then recent', () => {
  const more = [g('p/a', 'Alpha', 'data'), g('p/b', 'Beta', 'data', true), g('p/c', 'Gamma', 'data')];
  assert.deepEqual(ids(rank(more, 'data', ['p/c'])), ['p/b', 'p/c', 'p/a']);
});

test('fuzzy: characters in order, ignoring case; earliest and tightest first', () => {
  assert.deepEqual(fuzzy(['xabc', 'abc', 'a-b-c', 'cba'], 'ABC', s => s), ['abc', 'xabc', 'a-b-c']);
});

test('remember: most recent first, once each, ten at most', () => {
  let r: string[] = [];
  for (let i = 0; i < 12; i++) r = remember(r, `g${i}`);
  assert.equal(r.length, 10);
  assert.equal(r[0], 'g11');
  assert.deepEqual(remember(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
});

test('pickerRows: here and all headings with no query; none with one', () => {
  const ranked = rank(items, '', []);
  assert.deepEqual(pickerRows(ranked, '').map(r => ('heading' in r ? `[${r.heading}]` : r.item.id)),
    ['[here]', 'p/command', '[all]', 'p/event', 'p/query', 'p/repository']);
  assert.deepEqual(pickerRows(rank(items, 'que', []), 'que').every(r => 'item' in r), true);
});
