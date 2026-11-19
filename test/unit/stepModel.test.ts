import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Shown } from '../../src/protocol';
import { NO_HARDER, NO_STEP, STEP_BUSY, STEP_KEYS, stepRefusal, stepView, took } from '../../src/pause/stepModel';
import { PAGE_KEYS, plain, type Line, type View } from '../../src/pause/viewModel';
import { stepFixture } from '../stepFixtures';

// Ported from durandal.nvim tests/step_spec.lua (770834e): nvim draws at 80 cells; WIDE's text
// pane is 74, which every assertion here fits.
const WIDE = 200;
const NARROW = 100;
const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: Line[], s: string): boolean => texts(ls).some(l => l.includes(s));
const shown = (o: Partial<Shown> = {}, name: 'took' | 'nostep' | 'failing' = 'took'): Shown => ({ ...stepFixture(name), ...o });
const view = (s: Shown, o: Partial<Parameters<typeof stepView>[1]> = {}): View =>
  stepView(s, { cols: WIDE, selected: 0, flipped: false, help: false, ...o });

test('shows the goal, the writer with its seconds and cost, the tests moved and each file (step_spec 1)', () => {
  const v = view(shown());
  assert.equal(plain(v.title), 'conjure · f · fill f');
  assert.equal(plain(v.lines[0]), 'claude-haiku-5-5 · 4.2 s · $0.001');
  assert.ok(has(v.lines, 'tests   +1 passing'));
  assert.ok(has(v.lines, '> ✓ src/a.py'));
  assert.ok(has(v.lines, '  ✓ src/a__test.py'));
  assert.equal(plain(v.diff.title), 'file 1 of 2 · src/a.py');
  assert.ok(has(v.diff.lines, '+    return 1'));
  assert.deepEqual(v.rows, []);
  assert.equal(v.state, 'review');
  assert.equal(v.tab, 'conjure · f');
});

test('says newly failing, still red and a file that does not parse (step_spec 2)', () => {
  const v = view(shown({}, 'failing'));
  assert.ok(has(v.lines, 'tests   -1 newly failing · 2 still red'));
  assert.ok(has(v.lines, '> ✗ src/a.py'));
  assert.ok(has(v.lines, 'dropped: ../evil.py'));
  const tests = v.lines.find(l => plain(l).startsWith('tests'))!;
  assert.equal(tests.at(-1)!.kind, 'red');
});

test('no tests, a dropped path, and no goal stated (step_spec 3)', () => {
  const v = view(shown({ goal: null, tests: { passing: [], failing: [], stillRed: [], noTests: true }, dropped: ['../evil.py'] }));
  assert.equal(plain(v.title), 'conjure · f · (no goal stated)');
  assert.ok(has(v.lines, 'tests   no tests'));
  assert.ok(has(v.lines, 'dropped: ../evil.py'));
});

test('the second file\'s diff when it is selected (step_spec 4)', () => {
  const v = view(shown(), { selected: 1 });
  assert.equal(v.selected, 1);
  assert.equal(plain(v.diff.title), 'file 2 of 2 · src/a__test.py');
  assert.ok(has(v.diff.lines, '+x = 1'));
  assert.ok(has(v.lines, '> ✓ src/a__test.py'));
});

test('a step that took none: titled no step with its goal, says so and how the tests stand; no a in the legend (step_spec 5)', () => {
  const v = view(shown({ goal: 'fill f' }, 'nostep'));
  assert.equal(plain(v.title), 'conjure · no step · fill f');
  assert.ok(has(v.lines, 'the writer took no step: h asks the harder writer, d shows its reply'));
  assert.ok(has(v.lines, 'tests   1 still red'));
  assert.ok(!v.legend.includes('a accept'));
  assert.ok(v.legend.includes('h harder') && v.legend.includes('d details'));
  assert.equal(plain(v.diff.title), 'no change');
  assert.deepEqual(texts(v.diff.lines), ['the step changes no file']);
  assert.ok(!has(v.lines, 'files'));
});

test('a step that took none with the goal nothing: the writer saw nothing to do (step_spec 6)', () => {
  assert.equal(plain(view(shown({}, 'nostep')).title), 'conjure · no step · the writer saw nothing to do');
  assert.ok(has(view(shown({ harder: false }, 'nostep')).lines, 'the writer took no step: d shows its reply'));
});

test('a refused before any request: a step that took none (step_spec 7), no harder writer (9), an answer on its way (11)', () => {
  assert.equal(stepRefusal(shown({}, 'nostep'), 'accept', false), NO_STEP);
  assert.equal(NO_STEP, 'no step to accept: h asks the harder writer, d shows the reply');
  assert.equal(stepRefusal(shown({ harder: false }), 'harder', false), NO_HARDER);
  assert.equal(NO_HARDER, 'no harder writer: name one with [conjure] harder');
  for (const c of ['accept', 'reject', 'harder'] as const) assert.equal(stepRefusal(shown(), c, true), STEP_BUSY);
  assert.equal(STEP_BUSY, 'the last answer is still on its way');
  for (const c of ['accept', 'reject', 'harder'] as const) assert.equal(stepRefusal(shown(), c, false), undefined);
  // r is never refused for a step that took none
  assert.equal(stepRefusal(shown({}, 'nostep'), 'reject', false), undefined);
});

test('a step that took one keeps a in the legend (step_spec 8); took absent reads as took', () => {
  const v = view(shown());
  assert.equal(v.legend, 'a accept · r reject · h harder · [ ] files · d details · ? help · q later');
  const s = shown();
  delete s.took;
  assert.ok(took(s));
  assert.ok(view(s).legend.startsWith('a accept'));
  assert.equal(view(shown({ harder: false })).legend, 'a accept · r reject · [ ] files · d details · ? help · q later');
});

test('narrow: the legend starts with Tab diff, the diff title ends with Tab back, the short title drops the unit', () => {
  const v = view(shown(), { cols: NARROW });
  assert.ok(v.narrow);
  assert.ok(v.legend.startsWith('Tab diff · a accept'), v.legend);
  assert.ok(plain(v.diff.title).endsWith(' · Tab back'), plain(v.diff.title));
  assert.equal(plain(v.short), 'conjure · fill f');
  assert.equal(view(shown(), { cols: NARROW, flipped: true }).flipped, true);
  assert.equal(view(shown(), { cols: WIDE, flipped: true }).flipped, false);
});

test('busy: the legend says what is on its way; the state is busy', () => {
  const v = view(shown(), { busy: 'harder' });
  assert.equal(v.state, 'busy');
  assert.equal(v.legend, 'asking the harder writer…');
  assert.equal(view(shown(), { busy: 'accept' }).legend, 'landing…');
  assert.equal(view(shown(), { busy: 'reject' }).legend, 'rejecting…');
});

test('the facts: the writer when null, no cost when null; a took step with no file says so', () => {
  const v = view(shown({ writer: null as unknown as string, cost: null, diffs: [], parses: [] }));
  assert.equal(plain(v.lines[0]), 'the writer · 4.2 s');
  assert.ok(has(v.lines, 'the step changes no file'));
  assert.equal(v.entries, 0);
  assert.equal(v.selected, -1);
});

test('help: every step key, and every one is a key the page reports', () => {
  const v = view(shown(), { help: true });
  assert.ok(v.help && v.help.length > STEP_KEYS.length);
  const help = texts(v.help!).join('\n');
  for (const k of ['a', 'r', 'h', 'q Esc', '?']) assert.ok(help.includes(`  ${k}`), k);
  for (const k of STEP_KEYS.flatMap(x => x.keys)) assert.ok(PAGE_KEYS.includes(k), `${k} is reported by the page`);
});
