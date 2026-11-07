import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstStale, landedMessage, seenText, staleMessage } from '../../src/generate/stale';

test('seenText: a dirty document\'s text; else the disk\'s, even under a clean document (Review Focus 2)', () => {
  assert.equal(seenText({ dirty: true, text: 'typed' }, 'disk'), 'typed');
  assert.equal(seenText({ dirty: true, text: 'typed' }, null), 'typed');
  assert.equal(seenText({ dirty: false, text: 'old' }, null), null);
  assert.equal(seenText({ dirty: false, text: 'doc' }, 'doc'), 'doc');
  // a clean document the watcher has not reloaded yet: the disk is what will be saved over
  assert.equal(seenText({ dirty: false, text: 'old' }, 'new'), 'new');
  assert.equal(seenText(undefined, 'disk'), 'disk');
  assert.equal(seenText(undefined, null), null);
});

test('firstStale: the first file whose text is not its planned before; null before means it must not exist (Review Focus 2)', async () => {
  const texts: Record<string, string | null> = { 'a.py': 'a\n', 'b.py': null, 'c.py': 'c\n' };
  const textOf = async (p: string) => texts[p] ?? null;
  const files = [{ path: 'a.py', before: 'a\n', after: 'A\n' }, { path: 'b.py', before: null, after: 'B\n' }];
  assert.equal(await firstStale(files, textOf), undefined);
  texts['a.py'] = 'a\ntyped\n';
  assert.equal(await firstStale(files, textOf), 'a.py');
  texts['a.py'] = 'a\n';
  texts['b.py'] = 'appeared\n';
  assert.equal(await firstStale(files, textOf), 'b.py');
  assert.equal(staleMessage('b.py'), 'b.py changed since planning; nothing was applied — plan again');
});

test('landedMessage: the name and the count; files left unsaved named', () => {
  assert.equal(landedMessage('Command', 2, []), 'Applied Command: 2 files');
  assert.equal(landedMessage('Command', 1, []), 'Applied Command: 1 file');
  assert.equal(landedMessage('Command', 2, ['b.py']), 'Applied Command: 2 files (unsaved: b.py)');
});
