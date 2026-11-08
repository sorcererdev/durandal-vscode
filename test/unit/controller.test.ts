import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActionEvent } from '../../src/actionLog';
import { Controller } from '../../src/suggest/controller';
import type { Shown } from '../../src/suggest/types';

function setup() {
  const keys: { visible: boolean; kind?: string; band?: string }[] = [];
  const logged: ActionEvent[] = [];
  const c = new Controller({ view: { keys: k => keys.push(k) }, log: e => logged.push(e) });
  return { c, keys, logged, lastKeys: () => keys[keys.length - 1] };
}

const snippet = (o: Partial<Shown> = {}): Shown => ({
  kind: 'snippet', uri: 'file:///p/a.py', line: 4, lineText: '', version: 3, key: 'k1', generator: 'p/failure', name: 'p/failure', sets: {}, ...o,
});

test('an inline ghost is recorded and logged once per key; the keys follow', () => {
  const { c, logged, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.inline(snippet());
  assert.equal(c.state('file:///p/a.py')?.kind, 'snippet');
  assert.deepEqual(logged, [{ event: 'snippet-shown', generator: 'p/failure', band: undefined, score: undefined }]);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
});

test('moving off the line, or editing it, clears it at once', () => {
  const { c, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.moved('file:///p/a.py', 4, '');
  assert.ok(c.state('file:///p/a.py'));
  c.moved('file:///p/a.py', 4, 'c');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.deepEqual(lastKeys(), { visible: false });
  c.inline(snippet());
  c.moved('file:///p/a.py', 5, '');
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('dismiss remembers the key, logs it and clears', () => {
  const { c, logged } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.ok(c.isDismissed('file:///p/a.py', 'k1'));
  assert.ok(!c.isDismissed('file:///p/b.py', 'k1'));
  assert.deepEqual(logged.at(-1), { event: 'snippet-dismissed', generator: 'p/failure', band: undefined, score: undefined });
});

test('closed forgets the state and the dismissals', () => {
  const { c } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  c.inline(snippet({ key: 'k2' }));
  c.closed('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.ok(!c.isDismissed('file:///p/a.py', 'k1'));
});

test('the keys follow the active editor', () => {
  const { c, lastKeys } = setup();
  c.inline(snippet());
  c.focus('file:///p/b.py');
  assert.deepEqual(lastKeys(), { visible: false });
  c.focus('file:///p/a.py');
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
  c.focus(undefined);
  assert.deepEqual(lastKeys(), { visible: false });
});

test('off clears every document; clearSnippet only a snippet; nonInline is a decoration kind on the line', () => {
  const { c } = setup();
  c.inline(snippet());
  c.inline(snippet({ uri: 'file:///p/b.py' }));
  assert.equal(c.nonInline('file:///p/a.py', 4), false);
  c.inline(snippet({ uri: 'file:///p/c.py', kind: 'followup' }));
  assert.equal(c.nonInline('file:///p/c.py', 4), true);
  assert.equal(c.nonInline('file:///p/c.py', 5), false);
  c.clearSnippet('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  c.off();
  assert.equal(c.state('file:///p/b.py'), undefined);
});
