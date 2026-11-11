import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doWord, fileItem, landedWord, nothingBack, PENDING, promptWord, testsWord } from '../../src/plans/words';

test('the do and landing notices, verbatim from durandal.nvim (plans.lua landed)', () => {
  assert.equal(doWord({ changed: ['/p/a.py'], seconds: 42 }), 'do: 1 file changed · to review · 42 s');
  assert.equal(doWord({ changed: ['a', 'b'], seconds: 9.1, cost: 0.5 }), 'do: 2 files changed · to review · 9.1 s · $0.5');
  assert.equal(doWord({}), 'do: 0 files changed · to review · 0 s');
  assert.equal(landedWord('ask', 2, { dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123 }), 'ask: 2 lines · 1 not found · 9.1 s · $0.0123');
  assert.equal(landedWord('validate', 1, { dropped: 0, unresolved: 2, seconds: 1, cost: null }), 'validate: 1 lines · 2 not found · 1 s');
  assert.equal(nothingBack('do'), 'do: nothing came back');
  assert.deepEqual(PENDING, { ask: ' ⋯ asking', validate: ' ⋯ validating', do: ' ⋯ doing' });
});

test('the prompt, the tests notice and a files item', () => {
  assert.equal(promptWord('validate', 3, 2), 'validate: 3 lines in 2 blocks');
  assert.equal(testsWord({ passed: 2, failed: 1, seconds: 0.5 }), 'tests: 2 passed · 1 failed · 0.5 s');
  assert.equal(testsWord({}), 'tests: 0 passed · 0 failed · 0 s');
  assert.deepEqual(fileItem({ section: 'T', row: 1, text: '- a', file: null, line: null }), { label: 'T · - a', detail: 'line 2' });
  assert.deepEqual(fileItem({ section: 'Next', row: 8, text: '- [ ] step', file: '/p/src/a.py', line: 12 }), { label: 'Next · - [ ] step', detail: '/p/src/a.py:12' });
  assert.deepEqual(fileItem({ section: 'Next', row: 8, text: 's', file: '/p/src/a.py' }), { label: 'Next · s', detail: '/p/src/a.py:1' });
});
