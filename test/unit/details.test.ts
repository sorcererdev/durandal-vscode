import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewDetails } from '../../src/pause/details';

// ported from durandal.nvim tests/details_spec.lua: a review's sections as markdown lines

test('reviewDetails: the title, then each section under ## with its text; a diff section fenced as diff', () => {
  assert.equal(reviewDetails('do · step 3 · cancel', [
    { title: 'the step', text: 'Add a cancel command.\nIt returns NotFound.\n' },
    { title: 'diff · src/a.py', text: '--- a/src/a.py\n+++ b/src/a.py\n@@ -1 +1 @@\n-a\n+b\n', lang: 'diff' },
    { title: 'readings', text: '', lang: null },
  ]), [
    '# do · step 3 · cancel',
    '',
    '## the step',
    '',
    'Add a cancel command.',
    'It returns NotFound.',
    '',
    '## diff · src/a.py',
    '',
    '```diff',
    '--- a/src/a.py',
    '+++ b/src/a.py',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    '```',
    '',
    '## readings',
    '',
  ].join('\n'));
  assert.equal(reviewDetails('reconcile · 2 to review', []), '# reconcile · 2 to review\n');
});
