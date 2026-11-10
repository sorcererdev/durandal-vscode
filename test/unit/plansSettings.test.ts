import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GLYPHS, GLYPH_NAMES } from '../../src/plans/glyphs';
import { plansOptionsFrom } from '../../src/plans/settings';

const from = (values: Record<string, unknown>) => plansOptionsFrom((k, fallback) => (k in values ? values[k] : fallback));

test('the defaults mirror durandal.nvim: dir plans, conceal off, folds of done work closed, nvim\'s glyphs', () => {
  assert.deepEqual(from({}), { dir: 'plans', conceal: false, glyphs: DEFAULT_GLYPHS, foldDone: true });
  assert.deepEqual([...GLYPH_NAMES], ['todo', 'done', 'question', 'test', 'also', 'dash', 'path', 'hex', 'queued', 'checking', 'right', 'wrong', 'unsure']);
  assert.deepEqual(DEFAULT_GLYPHS, {
    todo: '☐', done: '☑', question: '?', test: '·', also: '+', dash: '', path: '', hex: '',
    queued: '○', checking: '…', right: '✓', wrong: '✗', unsure: '?',
  });
});

test('glyphs override by name; unknown names and non-strings are ignored; an empty string stands', () => {
  const o = from({ glyphs: { todo: '[ ]', hex: '#', bogus: 'x', done: 3, question: '' } });
  assert.equal(o.glyphs.todo, '[ ]');
  assert.equal(o.glyphs.hex, '#');
  assert.equal(o.glyphs.done, '☑');
  assert.equal(o.glyphs.question, '');
  assert.ok(!('bogus' in o.glyphs));
});

test('dir is trimmed of spaces and slashes, backslashes become slashes; empty or not a string is plans', () => {
  assert.equal(from({ dir: ' /docs/plans/ ' }).dir, 'docs/plans');
  assert.equal(from({ dir: 'docs\\plans' }).dir, 'docs/plans');
  assert.equal(from({ dir: '' }).dir, 'plans');
  assert.equal(from({ dir: '/' }).dir, 'plans');
  assert.equal(from({ dir: 7 }).dir, 'plans');
});

test('conceal and foldDone take booleans only', () => {
  assert.equal(from({ conceal: true }).conceal, true);
  assert.equal(from({ conceal: 'yes' }).conceal, false);
  assert.equal(from({ foldDone: false }).foldDone, false);
  assert.equal(from({ foldDone: 0 }).foldDone, true);
  assert.equal(from({ glyphs: null }).glyphs.todo, '☐');
});
