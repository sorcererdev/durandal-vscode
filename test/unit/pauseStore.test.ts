import { test } from 'node:test';
import assert from 'node:assert/strict';
import { held, Pause, PauseStore } from '../../src/pause/store';
import { fixture } from '../pauseFixtures';

const at = { line: 26, character: 4 };

test('held: the server\'s 1-based lines become 0-based, last clamped to the document', () => {
  const p = fixture('plain');
  p.lines = { first: 27, last: 28 };
  const h = held('file:///a.py', at, p, 7, 40);
  assert.deepEqual([h.first, h.last, h.version, h.token], [26, 27, 7, p.token]);
  assert.deepEqual(h.position, at);
  assert.equal(h.selected, undefined);
  assert.equal(held('file:///a.py', at, p, 7, 27).last, 26);
  // a document shorter than the unit's start still gives an ordered range
  const short = held('file:///a.py', at, p, 7, 10);
  assert.deepEqual([short.first, short.last], [9, 9]);
});

test('PauseStore: one pause per document; set replaces without a drop', () => {
  const dropped: [string, string | undefined][] = [];
  const s = new PauseStore((p, why) => dropped.push([p.token, why]));
  const a = held('file:///a.py', at, fixture('plain'), 1, 40);
  const b = { ...held('file:///a.py', at, fixture('wired'), 2, 40), token: 'conjure-9' };
  s.set(a);
  s.set(b);
  assert.equal(s.get('file:///a.py'), b);
  assert.deepEqual(dropped, []);
  assert.deepEqual(s.uris(), ['file:///a.py']);
});

test('PauseStore: take removes without a drop; drop says why; dropAll is silent', () => {
  const dropped: [string, string | undefined][] = [];
  const s = new PauseStore((p, why) => dropped.push([p.uri, why]));
  const mk = (uri: string): Pause => held(uri, at, fixture('plain'), 1, 40);
  s.set(mk('file:///a.py'));
  s.set(mk('file:///b.py'));
  s.set(mk('file:///c.py'));
  assert.equal(s.take('file:///a.py')?.uri, 'file:///a.py');
  assert.equal(s.get('file:///a.py'), undefined);
  assert.deepEqual(dropped, []);
  s.drop('file:///b.py', 'the earlier pause is forgotten');
  s.drop('file:///nothing.py', 'never said');
  assert.deepEqual(dropped, [['file:///b.py', 'the earlier pause is forgotten']]);
  s.dropAll();
  assert.deepEqual(dropped, [['file:///b.py', 'the earlier pause is forgotten'], ['file:///c.py', undefined]]);
  assert.deepEqual(s.uris(), []);
});
