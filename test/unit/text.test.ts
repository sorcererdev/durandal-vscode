import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cut, given, pad, plain, shortTest, width, wrap } from '../../src/pause/text';

test('given: null and missing are the same', () => {
  assert.equal(given(null), false);
  assert.equal(given(undefined), false);
  assert.equal(given(0), true);
  assert.equal(given(''), true);
  assert.equal(given(false), true);
});

test('width: display cells, as nvim_strwidth', () => {
  assert.equal(width('abc'), 3);
  assert.equal(width(''), 0);
  assert.equal(width('日本'), 4);
  assert.equal(width('⚡x'), 3);
  assert.equal(width('é'), 1);
  // the window's own glyphs are one cell each
  assert.equal(width('●◆✓✗▶→…⠋·—'), 10);
});

test('cut: fits the cells, ending in … when cut', () => {
  assert.equal(cut('abcdef', 6), 'abcdef');
  assert.equal(cut('abcdef', 4), 'abc…');
  assert.equal(cut('日本語', 4), '日…');
  assert.equal(cut('abc', 1), '…');
});

test('pad: spaces to the cells, never a cut', () => {
  assert.equal(pad('ab', 4), 'ab  ');
  assert.equal(pad('日', 4), '日  ');
  assert.equal(pad('abcdef', 4), 'abcdef');
});

test('wrap: at spaces, long words broken, continuation prefix, leading spaces kept (pause.lua :19-44)', () => {
  assert.deepEqual(wrap('one two three four', 10), ['one two', 'three four']);
  assert.deepEqual(wrap('aaaaaaaaaaaaaaa', 10), ['aaaaaaaaaa', 'aaaaa']);
  assert.deepEqual(wrap('one two three four five six', 18, '    '), ['one two three four', '    five six']);
  assert.deepEqual(wrap('  indented words here', 12), ['  indented', 'words here']);
  assert.deepEqual(wrap('first\nsecond', 20), ['first', 'second']);
  assert.deepEqual(wrap('', 10), ['']);
  // the width never drops below the continuation plus ten cells
  assert.deepEqual(wrap('abcdefghijkl', 2), ['abcdefghij', 'kl']);
  assert.deepEqual(wrap('日本語日本語日本語', 10), ['日本語日本', '語日本語']);
});

test('shortTest: what follows the last ::', () => {
  assert.equal(shortTest('tests/a_test.py::test_x'), 'test_x');
  assert.equal(shortTest('plain'), 'plain');
});

test('plain: a line\'s text', () => {
  assert.equal(plain([{ text: 'a' }, { text: 'b', kind: 'dim' }]), 'ab');
});
