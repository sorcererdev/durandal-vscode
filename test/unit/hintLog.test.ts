import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FileAction } from '../../src/protocol';
import { generatorAt, Seen } from '../../src/hintLog';

const a = (generator: string, from: number, to: number, snippet = false): FileAction =>
  ({ generator, name: generator, label: generator, range: { start: [from, 1], end: [to, 1] }, sets: {}, missing: [], snippet });

test('generatorAt: the first action covering the line that is not a snippet', () => {
  const fa = { actions: [a('snip', 3, 3, true), a('wide', 1, 10), a('narrow', 3, 3)], nearby: [] };
  assert.equal(generatorAt(fa, 3), 'wide');
  assert.equal(generatorAt(fa, 11), undefined);
  assert.equal(generatorAt({ actions: [{ ...a('whole', 1, 1), range: null }], nearby: [] }, 1), undefined);
  assert.equal(generatorAt(null, 1), undefined);
});

test('Seen: each uri:line once per session', () => {
  const s = new Seen();
  assert.deepEqual(s.fresh('file:///a', [0, 3]), [0, 3]);
  assert.deepEqual(s.fresh('file:///a', [3, 4]), [4]);
  assert.deepEqual(s.fresh('file:///b', [3]), [3]);
});
