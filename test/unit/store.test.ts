import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Suggestion } from '../../src/protocol';
import { Store } from '../../src/suggest/store';

const push = (o: Partial<Suggestion> = {}): Suggestion => ({
  uri: 'file:///p/a.py', version: 4, kind: 'followup', label: 'p/arms', summary: '2 files', line: 7, lines: null, at: 7, planId: 3,
  generator: null, sets: {}, ...o,
});

test('a push is current for its version and its line (at is 1-based, the cursor 0-based)', () => {
  const s = new Store();
  s.receive(push());
  assert.ok(s.current('file:///p/a.py', 4, 6));
  assert.equal(s.current('file:///p/a.py', 5, 6), undefined);
  assert.equal(s.current('file:///p/a.py', 4, 7), undefined);
  assert.equal(s.current('file:///p/b.py', 4, 6), undefined);
});

test('the latest push replaces the one before, asked afresh; forget drops it', () => {
  const s = new Store();
  s.receive(push());
  s.current('file:///p/a.py', 4, 6)!.asked = true;
  s.receive(push({ version: 5, planId: 4 }));
  const p = s.current('file:///p/a.py', 5, 6)!;
  assert.equal(p.asked, false);
  assert.equal(p.s.planId, 4);
  s.forget('file:///p/a.py');
  assert.equal(s.current('file:///p/a.py', 5, 6), undefined);
});
