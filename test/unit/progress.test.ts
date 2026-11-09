import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressClaims } from '../../src/pause/progress';

test('a claim owns the next begin with its title, and hears its words until the end (nvim lsp.claim)', () => {
  const c = new ProgressClaims();
  const heard: string[] = [];
  c.hear('t0', { kind: 'begin', title: 'conjuring', message: 'before the claim' });
  c.claim('conjuring', m => heard.push(m));
  c.hear('t1', { kind: 'begin', title: 'testing', message: 'not ours' });
  c.hear('t2', { kind: 'begin', title: 'conjuring', message: 'starting' });
  c.hear('t1', { kind: 'report', message: 'still not ours' });
  c.hear('t2', { kind: 'report', message: 'round 4 of 9 · asking local…' });
  c.hear('t2', { kind: 'report' });
  c.hear('t2', { kind: 'end' });
  c.hear('t2', { kind: 'report', message: 'after the end' });
  assert.deepEqual(heard, ['starting', 'round 4 of 9 · asking local…']);
});

test('first come: two claims own two begins in order; a released claim owns nothing', () => {
  const c = new ProgressClaims();
  const a: string[] = [];
  const b: string[] = [];
  const gone = c.claim('conjuring', m => a.push(`gone ${m}`));
  gone.release();
  c.claim('conjuring', m => a.push(m));
  c.claim('conjuring', m => b.push(m));
  c.hear(1, { kind: 'begin', title: 'conjuring' });
  c.hear(2, { kind: 'begin', title: 'conjuring' });
  c.hear(2, { kind: 'report', message: 'two' });
  c.hear(1, { kind: 'report', message: 'one' });
  assert.deepEqual(a, ['one']);
  assert.deepEqual(b, ['two']);
});

test('release stops the words; a new begin on a token clears its owner; clear forgets all', () => {
  const c = new ProgressClaims();
  const heard: string[] = [];
  const claim = c.claim('conjuring', m => heard.push(m));
  c.hear('t', { kind: 'begin', title: 'conjuring' });
  c.hear('t', { kind: 'report', message: 'one' });
  claim.release();
  c.hear('t', { kind: 'report', message: 'two' });
  c.claim('conjuring', m => heard.push(`next ${m}`));
  c.hear('t', { kind: 'begin', title: 'mutating' });
  c.hear('t', { kind: 'report', message: 'three' });
  c.clear();
  c.hear('u', { kind: 'begin', title: 'conjuring', message: 'four' });
  assert.deepEqual(heard, ['one']);
});
