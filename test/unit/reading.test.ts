import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTokens, liveExcerpts, Readings, tokText, typedInto } from '../../src/plans/reading';
import { encode, PLAN_LEGEND } from '../planTokens';

test('Readings: each part keeps its own version; changed hears the part', () => {
  const heard: string[] = [];
  const r = new Readings((uri, part) => heard.push(`${uri} ${part}`));
  r.tokens('u', 3, encode([[0, 0, 2, 'planMarker']]), PLAN_LEGEND, 'r1');
  r.folds('u', 4, [{ start: 2, end: 5 }]);
  r.lenses('u', 4, [{ line: 1, command: 'olifant.plans.excerpt', args: [] }]);
  assert.deepEqual(heard, ['u tokens', 'u folds', 'u lenses']);
  const p = r.get('u')!;
  assert.deepEqual([p.tokens!.version, p.tokens!.resultId, p.tokens!.toks.length], [3, 'r1', 1]);
  assert.deepEqual([p.folds!.version, p.folds!.ranges], [4, [{ start: 2, end: 5 }]]);
  assert.equal(p.lenses!.version, 4);
});

test('Readings: token edits apply to the reading whose resultId they name; otherwise the tokens stay at their version, open to no edits', () => {
  const r = new Readings();
  r.tokens('u', 1, encode([[0, 0, 2, 'planMarker']]), PLAN_LEGEND, 'r1');
  assert.equal(r.tokenEdits('u', 2, 'r1', [{ start: 5, deleteCount: 0, data: encode([[1, 0, 2, 'planMarker']]) }], PLAN_LEGEND, 'r2'), true);
  assert.deepEqual(r.get('u')!.tokens!.toks.map(t => t.line), [0, 1]);
  assert.equal(r.get('u')!.tokens!.resultId, 'r2');
  assert.equal(r.tokenEdits('u', 3, 'other', [], PLAN_LEGEND, 'r3'), false);
  const kept = r.get('u')!.tokens!;
  assert.deepEqual([kept.version, kept.resultId, kept.toks.map(t => t.line)], [2, undefined, [0, 1]]);
  assert.equal(r.tokenEdits('u', 4, 'r2', [], PLAN_LEGEND, 'r4'), false);
  assert.equal(r.get('u')!.tokens!.version, 2);
  assert.equal(new Readings().tokenEdits('v', 1, 'r1', [], PLAN_LEGEND, 'r2'), false);
});

test('Readings: drop and clear forget; uris lists what is held', () => {
  const r = new Readings();
  r.folds('a', 1, []);
  r.folds('b', 1, []);
  assert.deepEqual(r.uris().sort(), ['a', 'b']);
  r.drop('a');
  assert.equal(r.get('a'), undefined);
  r.clear();
  assert.deepEqual(r.uris(), []);
});

test('lineTokens and tokText: one row\'s tokens, in column order, and their text', () => {
  const r = new Readings();
  r.tokens('u', 1, encode([[2, 6, 6, 'planStep'], [2, 0, 6, 'planMarker'], [3, 0, 2, 'planMarker']]), PLAN_LEGEND);
  const row = lineTokens(r.get('u')!.tokens!.toks, 2);
  assert.deepEqual(row.map(t => t.type), ['planMarker', 'planStep']);
  assert.equal(tokText(row[1], '- [ ] a step @src/a.py:F'), 'a step');
});

test('liveExcerpts: the excerpt lenses whose live argument is true, keyed by anchor, else by opening row', () => {
  const ex = liveExcerpts([
    { line: 3, command: 'olifant.plans.excerpt', args: ['u', 3, 6, true, '@src/a.py:F'] },
    { line: 8, command: 'olifant.plans.excerpt', args: ['u', 8, 10, false, '@src/b.py:G'] },
    { line: 12, command: 'olifant.plans.excerpt', args: ['u', 12, 14, true] },
    { line: 1, command: 'olifant.plans.review', args: ['reconcile', 'u'] },
    { line: 20, command: 'olifant.plans.excerpt', args: ['u', '20', 22, true] },
  ]);
  assert.deepEqual(ex, [{ open: 3, close: 6, key: '@src/a.py:F' }, { open: 12, close: 14, key: '12' }]);
});

test('typedInto: a change strictly between a live excerpt\'s fences; each key once, in excerpt order', () => {
  const ex = [{ open: 3, close: 6, key: '@a.py:F' }, { open: 10, close: 12, key: '10' }];
  assert.deepEqual(typedInto(ex, [{ start: 4, end: 4 }]), ['@a.py:F']);
  assert.deepEqual(typedInto(ex, [{ start: 3, end: 3 }, { start: 6, end: 6 }, { start: 2, end: 4 }]), []);
  assert.deepEqual(typedInto(ex, [{ start: 11, end: 11 }, { start: 5, end: 5 }, { start: 4, end: 5 }]), ['@a.py:F', '10']);
});
