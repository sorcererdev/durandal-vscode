import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrationLines } from '../../src/migration';

const mig = { line: '+1 extracted (close-table), legacy 4 → 3 functions; switches: 1 on, 1 off', switches: [{ name: 'close-table', on: true }, { name: 'x', on: false }], added_legacy: [], unregistered: [] };

test('the PR line, then each switch aligned, on or off', () => {
  assert.deepEqual(migrationLines(mig), [mig.line, '', 'switches', '  close-table  on', '  x            off']);
});

test('no switches yet; what the branch added to legacy code; switches the registry lacks', () => {
  assert.deepEqual(migrationLines({ ...mig, switches: [], added_legacy: ['a', 'b'], unregistered: ['s'] }), [
    mig.line, '', 'no switches yet',
    '', 'legacy functions this branch added: a, b',
    '', 'switches not in the registry: s',
  ]);
});
