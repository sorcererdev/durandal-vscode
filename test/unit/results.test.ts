import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TestsRunResult } from '../../src/protocol';
import { isGreen, levelOf, marksOf, nameOf, render, summaryOf, worthOpening } from '../../src/tdd/results';

const T = '/p/src/a__test.py';
const run = (o: Partial<TestsRunResult> = {}): TestsRunResult => ({
  file: T, passed: ['src/a__test.py::test_one', 'src/a__test.py::test_two'], scope: 'file', test: null, failed: [], broken: null, seconds: 0.8, ...o,
});
const fail = (name: string, line: number | null, o: Record<string, unknown> = {}) => ({
  id: `src/a__test.py::${name}`, file: T, line, message: 'assert 1 == 2', output: 'E   assert 1 == 2\n> boom', ...o,
});

test('nameOf: the name after the first ::, else the id', () => {
  assert.equal(nameOf('src/a__test.py::test_f'), 'test_f');
  assert.equal(nameOf('src/a__test.py::C::test_f'), 'C::test_f');
  assert.equal(nameOf('test_f'), 'test_f');
});

test('a green run: all N passed, info, not worth opening', () => {
  const a = run();
  assert.equal(summaryOf(a), 'all 2 passed · 0.8 s');
  assert.equal(render(a).text, 'all 2 passed · 0.8 s\n');
  assert.ok(isGreen(a));
  assert.equal(levelOf(a), 'info');
  assert.equal(worthOpening(a), false);
});

test('no tests ran: a warning, nothing to open', () => {
  const a = run({ passed: [], seconds: 0 });
  assert.equal(summaryOf(a), 'no tests ran · 0.0 s');
  assert.equal(isGreen(a), false);
  assert.equal(levelOf(a), 'warn');
  assert.equal(worthOpening(a), false);
});

test('a red run: summary, then per failure a blank line, ✗ name (file:line), message, output', () => {
  const a = run({ passed: ['src/a__test.py::test_one'], failed: [fail('test_two', 6)], seconds: 1.3 });
  assert.equal(summaryOf(a), '1 passed · 1 failed · 1.3 s');
  const r = render(a);
  assert.equal(r.text, [
    '1 passed · 1 failed · 1.3 s',
    '',
    '✗ test_two  (a__test.py:6)',
    '  assert 1 == 2',
    '    E   assert 1 == 2',
    '    > boom',
    '',
  ].join('\n'));
  assert.deepEqual(r.links, [{ line: 2, file: T, target: 6 }]);
  assert.equal(levelOf(a), 'warn');
  assert.ok(worthOpening(a));
});

test('a failure with no line: no location, no link', () => {
  const a = run({ failed: [fail('test_two', null, { file: '' })] });
  const r = render(a);
  assert.ok(r.text.includes('\n✗ test_two\n'));
  assert.deepEqual(r.links, []);
});

test('a failure with no file: its location and link fall back to the answer\'s file', () => {
  const a = run({ failed: [fail('test_two', 4, { file: '' })] });
  const r = render(a);
  assert.ok(r.text.includes('\n✗ test_two  (a__test.py:4)\n'));
  assert.deepEqual(r.links, [{ line: 2, file: T, target: 4 }]);
});

test('blank lines inside a message stay; those around it go; colour codes go', () => {
  const esc = String.fromCharCode(27);
  const a = run({ failed: [fail('t', 3, { message: '\nfirst\n\nsecond\n', output: `${esc}[31mred${esc}[0m\n` })] });
  assert.ok(render(a).text.endsWith('✗ t  (a__test.py:3)\n  first\n  \n  second\n    red\n'));
});

test('broken: the first line in the summary, the rest indented, nothing else', () => {
  const a = run({ broken: 'ImportError: no module x\n  in a.py\nline 3', failed: [fail('t', 3)] });
  assert.equal(summaryOf(a), 'broken: ImportError: no module x');
  assert.equal(render(a).text, 'broken: ImportError: no module x\n    in a.py\n  line 3\n');
  assert.deepEqual(render(a).links, []);
  assert.equal(levelOf(a), 'warn');
  assert.ok(worthOpening(a));
});

test('marks: one per failure with a line, in its own file, 0-based; none without a line', () => {
  const a = run({ failed: [fail('a', 6), fail('b', null), fail('c', 2, { file: '/p/src/b__test.py', message: '' })] });
  assert.deepEqual(marksOf(a), [
    { file: T, line: 5, message: 'assert 1 == 2' },
    { file: '/p/src/b__test.py', line: 1, message: '✗ c' },
  ]);
});

test('marks: a broken file run marks only line 0 of the answer\'s file; a broken all run marks nothing', () => {
  assert.deepEqual(marksOf(run({ broken: 'could not run: x' })), [{ file: T, line: 0, message: 'could not run: x' }]);
  assert.deepEqual(marksOf(run({ broken: 'could not run: x', failed: [fail('t', 3)] })), [{ file: T, line: 0, message: 'could not run: x' }]);
  assert.deepEqual(marksOf(run({ broken: 'could not run: x', scope: 'all' })), []);
});
