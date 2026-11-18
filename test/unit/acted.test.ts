import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acted } from '../../src/pause/acted';

test('acted: a throw or a rejection is the footer notice, a result passes through', async () => {
  assert.equal(await acted(() => true, 'd'), true);
  assert.equal(await acted(async () => 'nothing to do here', 'd'), 'nothing to do here');
  assert.equal(await acted(() => { throw new Error('no root'); }, 'd'), 'd: no root');
  assert.equal(await acted(() => Promise.reject(new Error('cannot open')), 'd'), 'd: cannot open');
});
