import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holeNote, reviewModel } from '../../src/generate/review';
import { plan } from '../fixtures';

test('holeNote: filled (first line of the fill), skipped, else left with why', () => {
  assert.equal(holeNote({ name: 'body', status: 'filled', model: 'claude', fill: 'return 1\nmore' }), 'body filled by claude: return 1 …');
  assert.equal(holeNote({ name: 'body', status: 'skipped' }), 'body left as a placeholder (--no-fill)');
  assert.equal(holeNote({ name: 'body', status: 'unfilled', why: 'no model' }), 'body left as a placeholder: no model');
});

test('reviewModel: unparseable code first (a jump target), then holes, other warnings, conflicts', () => {
  const m = reviewModel(plan({
    warnings: ['a note', 'src/a.py:12 does not parse: unexpected indent'],
    holes: [{ name: 'body', status: 'unfilled', why: 'no model' }],
    conflicts: [{ code: 'exists', message: 'src/b.py exists' }],
  }));
  assert.deepEqual(m.notes, [
    { text: '⚠ src/a.py:12 does not parse: unexpected indent', jump: { path: 'src/a.py', line: 12 } },
    { text: 'body left as a placeholder: no model' },
    { text: '⚠ a note' },
    { text: '✗ src/b.py exists' },
  ]);
  assert.equal(m.canApply, false);
});

test('reviewModel: files marked + (new) or ~ with both sides', () => {
  const m = reviewModel(plan({ files: [{ path: 'n.py', before: null, after: 'x\n' }, { path: 'c.py', before: 'a\n', after: 'b\n' }] }));
  assert.deepEqual(m.files, [
    { path: 'n.py', mark: '+', before: '', after: 'x\n' },
    { path: 'c.py', mark: '~', before: 'a\n', after: 'b\n' },
  ]);
  assert.equal(m.canApply, true);
});
