import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorEnd, fingerprintable, landing, locate, placeBlocks, replaces, sectionRange, stamp, throughEdits,
} from '../../src/plans/blocks';
import { applyLineEdits, factEdits } from '../../src/plans/facts';

// durandal.nvim plans_spec.lua :557 (the errands' plan)
const A = ['# T', '- a', '- b', '- c', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo'];

test('sectionRange: from the heading at or above the row to the row before the next heading', () => {
  assert.deepEqual(sectionRange(A, 3), { start: 0, end: 6 });
  assert.deepEqual(sectionRange(A, 7), { start: 7, end: 8 });
  assert.deepEqual(sectionRange(A, 8), { start: 7, end: 8 });
  assert.deepEqual(sectionRange(['- a', '- b'], 1), { start: 0, end: 1 });
  assert.deepEqual(sectionRange(['#nospace', '- a'], 1), { start: 0, end: 1 });
});

test('locate: exact after trimming, then a prefix, then a substring longer than 8; else the section\'s last row', () => {
  assert.equal(locate(A, 0, 6, '  - e target line '), 5);
  assert.equal(locate(A, 0, 6, '- e target'), 5);
  assert.equal(locate(A, 0, 6, 'target line'), 5);
  assert.equal(locate(A, 0, 6, 'target'), 6);
  assert.equal(locate(A, 0, 6, 'nowhere at all'), 6);
  assert.equal(locate(A, 0, 6, '- step'), 6, 'only inside the section');
  assert.equal(locate(['- x', '- x'], 0, 1, '- x'), 0, 'the first match');
});

test('anchorEnd: the end of the last @path:Unit not preceded by a word character', () => {
  assert.equal(anchorEnd('  - a @src/a.py:F'), 17);
  assert.equal(anchorEnd('  - a @src/a.py:F and @src/b.py:G here'), 33);
  assert.equal(anchorEnd('mail me@src/a.py:F'), undefined);
  assert.equal(anchorEnd('  - see @src/a.py:F.'), 20, 'the raw match, its dots kept');
  assert.equal(anchorEnd('no anchor'), undefined);
});

test('stamp: a fingerprintable line\'s last anchor gets " ✓ fp", replacing one that is there', () => {
  assert.equal(stamp('  - a @src/a.py:F', 'abc1234'), '  - a @src/a.py:F ✓ abc1234');
  assert.equal(stamp('  - a @src/a.py:F ✓ 1111111 later', 'abc1234'), '  - a @src/a.py:F ✓ abc1234 later');
  assert.equal(stamp('  - see @src/a.py:F.', 'abc1234'), '  - see @src/a.py:F. ✓ abc1234');
  for (const l of ['- [ ] x @src/a.py:F', '- [x] x @src/a.py:F', '  - test: t @t/a.py:T', '  - also @src/a.py:G', '  - ? why @src/a.py:F', 'plain @src/a.py:F']) {
    assert.equal(stamp(l, 'abc1234'), l, l);
  }
  assert.equal(stamp('  - no anchor', 'abc1234'), '  - no anchor');
  assert.equal(stamp('  - a @src/a.py:F', null), '  - a @src/a.py:F');
  assert.equal(fingerprintable('  - a claim'), true);
  assert.equal(fingerprintable('- [ ] step'), false);
});

test('replaces: block.replace, or a do\'s block whose first line opens a step', () => {
  assert.equal(replaces('do', { lines: [{ text: '  - [x] step' }] }), true);
  assert.equal(replaces('do', { lines: [{ text: '  - did it' }] }), false);
  assert.equal(replaces('validate', { lines: [{ text: '- [x] step' }] }), false);
  assert.equal(replaces('ask', { replace: true, lines: [] }), true);
  assert.equal(replaces('do', { lines: null }), false);
});

test('an ask straight in (plans_spec :575): facts first, then blocks bottom-up, two under one row in order', () => {
  const facts = factEdits(A, [{ row: 1, text: '- a fact' }]);
  const post = applyLineEdits(A, facts);
  const placed = placeBlocks(post, [
    { after: 3, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so' }] },
    { after: 3, lines: [{ text: '  - then' }] },
    { after: 1, lines: [{ text: '  - early' }] },
  ], 'ask', 3, throughEdits(facts, 3));
  assert.deepEqual(placed.map(p => [p.index, p.row, p.replace]), [[0, 3, false], [1, 3, false], [2, 1, false]]);
  const l = landing(A, facts, placed);
  assert.deepEqual(l.lines, ['# T', '- a fact', '  - early', '- b', '- c', '  - a @src/a.py:F ✓ abc1234', '  - so', '  - then', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo']);
  assert.deepEqual(l.rows, [4, 4, 1]);
});

test('a block after the request row lands under the tracked row; others under their after; clamped', () => {
  const placed = placeBlocks(A, [{ after: 3, lines: [{ text: '  - x' }] }, { after: 1, lines: [{ text: '  - y' }] }, { after: 99, lines: [{ text: '  - z' }] }], 'ask', 3, 5);
  assert.deepEqual(placed.map(p => p.row), [5, 1, 8]);
});

test('a validate block with after_text lands under the matching line of the request row\'s section (plans_spec :631)', () => {
  const placed = placeBlocks(A, [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }], 'validate', 2, 2);
  assert.deepEqual(placed, [{ index: 0, row: 5, replace: false, lines: ['  - ok'] }]);
  const none = placeBlocks(A, [{ after: 0, after_text: 'not here', lines: [{ text: '  - ok' }] }], 'validate', 2, 2);
  assert.equal(none[0].row, 6, 'the section\'s last row');
});

test('a do\'s step block replaces its row (plans_spec :641)', () => {
  const placed = placeBlocks(A, [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }], 'do', 8, 8);
  assert.equal(placed[0].replace, true);
  assert.deepEqual(landing(A, [], placed).lines.slice(7), ['## Next', '- [x] step @src/a.py:Foo', '  - did it']);
});

test('null or malformed blocks and lines land nothing and break nothing (plans_spec :1055)', () => {
  assert.deepEqual(placeBlocks(A, null, 'ask', 1, 1), []);
  assert.deepEqual(placeBlocks(A, 'x', 'ask', 1, 1), []);
  const p = placeBlocks(A, [null, { after: 1, after_text: null, lines: null }, { after: 2, lines: [{ text: 7 }, { text: '  - ok' }] }], 'ask', 1, 1);
  assert.deepEqual(p, [{ index: 1, row: 1, replace: false, lines: [] }, { index: 2, row: 2, replace: false, lines: ['  - ok'] }]);
  assert.deepEqual(landing(A, [], p).lines, [...A.slice(0, 3), '  - ok', ...A.slice(3)]);
});

test('throughEdits: a row moved by the facts above it; a replaced row is its edit\'s first', () => {
  const facts = factEdits(A, [{ after: 0, lines: ['x', 'y'] }, { row: 5, text: 'E' }, { from: 6, to: 7, lines: ['F'] }]);
  assert.equal(throughEdits(facts, 0), 0);
  assert.equal(throughEdits(facts, 3), 5);
  assert.equal(throughEdits(facts, 5), 7);
  assert.equal(throughEdits(facts, 7), 8);
  assert.equal(throughEdits(facts, 8), 9);
});
