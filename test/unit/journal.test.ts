import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { errandLabel, isJournal } from '../../src/plans/journal';

// durandal.nvim plans.lua is_journal :1068: ^%s*%- %d%d? %a%a%a %d%d:%d%d ·
test('a journal line: a dash, day, month, time and the dot', () => {
  assert.ok(isJournal('  - 25 Oct 21:31 · do (sonnet) · answered: x'));
  assert.ok(isJournal('- 5 Nov 09:02 · ask'));
  assert.ok(isJournal('\t- 05 nov 09:02 · '));
});

test('not a journal line', () => {
  for (const s of ['- [ ] step', '- 25 Oct 21:31 do', '- 125 Oct 21:31 · x', '- 25 October 21:31 · x', '25 Oct 21:31 · x', '- 25 Oct 2:31 · x', '']) {
    assert.ok(!isJournal(s), s);
  }
});

// review.lua :512-531: at's first 16 characters with T as a space, then status, choice, words
test('a past do\'s label in the pick', () => {
  assert.equal(errandLabel({ id: 'E1', at: '2026-10-25T21:31:00Z', status: 'answered', choice: 'kept', words: 'it is done', model: 'sonnet' }),
    '2026-10-25 21:31 · answered · kept · it is done');
  // no choice yet: nvim's tostring(nil)
  assert.equal(errandLabel({ id: 'E2', at: '2026-10-25T21:31:00.5Z', status: 'blocked', choice: null, words: 'blocked' }),
    '2026-10-25 21:31 · blocked · nil · blocked');
});
