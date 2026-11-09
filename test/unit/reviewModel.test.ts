import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DoReview, ReconcileReview, ReviewListItem } from '../../src/protocol';
import { plain, type Line, type View } from '../../src/pause/viewModel';
import { helpLines, layout, rowLines, SCROLL_WORDS } from '../../src/pause/model';
import {
  busyWords, DO_KEYS, entryIndex, ERRAND_KEYS, NOT_OFFERED, notOffered, oneCommand, pickAtCursor, READING_KEYS,
  reviewRows, reviewTitle, reviewView,
} from '../../src/pause/reviewModel';
import { reviewFixture } from '../pauseFixtures';

// Ported from durandal.nvim tests/review_spec.lua. nvim draws at a left pane of 80 cells; the
// panel's widest text pane is 74 (layout(200)), which every assertion here fits.
const WIDE = 200;
const NARROW = 100;
const DONE = 'done|src/a.py|Table.label|abc1234';
const SPARE = 'unplaced|src/a.py|spare|def5678';

const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: Line[], s: string): boolean => texts(ls).some(l => l.includes(s));
const view = (r: DoReview | ReconcileReview, o: Partial<Parameters<typeof reviewView>[1]> = {}): View =>
  reviewView(r, { cols: WIDE, selected: 0, flipped: false, help: false, ...o });
const doReview = (o: Partial<DoReview> = {}): DoReview => ({ ...reviewFixture('do'), ...o });
// readings(which): the reconcile with only those entries (1-based, as the Lua builder)
const readings = (which: number[] = [1, 2]): ReconcileReview => {
  const r = reviewFixture('reconcile');
  const entries = which.map(i => r.entries[i - 1]);
  return { ...r, entries, title: { verb: 'reconcile', count: entries.length }, summary: `${entries.length} readings to review` };
};
const SCROLL = SCROLL_WORDS;

test('do: the step, what it said, the tests, the denials in words and the files beside the diff', () => {
  const v = view(reviewFixture('do'));
  assert.equal(plain(v.title), 'do · step 1 · Table.label · ◆ answered · sonnet · 42 s · $0.06');
  assert.equal(plain(v.lines[0]), 'The do changed 2 files.');
  assert.ok(has(v.lines, 'step    - [ ] add a label @src/a.py:Table.label'));
  assert.ok(has(v.lines, 'said    changed @src/a.py:Table.label'));
  assert.ok(has(v.lines, 'tests   ● 1 passed'));
  assert.ok(has(v.lines, 'denied  tried `python -m pytest t.py` 3 times; not allowed.'));
  assert.ok(has(v.lines, 'Allowed: `uv run …`.'));
  assert.ok(has(v.lines, '> M src/a.py'));
  assert.ok(has(v.lines, '  A src/b.py'));
  const DIFF = reviewFixture('do').landing.diff;
  assert.deepEqual([...texts(v.diff.lines), ''], DIFF.split('\n'));
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`),
    ['a keep the change', 'r revert the change', "t run the step's tests now", 'p allow `Bash(python -m pytest*)`']);
  // no hashes, no session, no also lines on screen
  for (const l of texts(v.lines)) assert.ok(!l.includes('also'), l);
});

test('do: the parts in their colours (the badge, the summary, the labels, the tests, the denial)', () => {
  const v = view(reviewFixture('do'));
  assert.deepEqual(v.title.find(s => s.text === '◆ answered'), { text: '◆ answered', kind: 'proposal' });
  assert.equal(v.title.find(s => s.text.includes('sonnet'))?.kind, 'dim');
  assert.equal(v.lines[0][0].kind, 'strong');
  const at = (s: string) => v.lines.find(l => plain(l).includes(s))!;
  assert.deepEqual(at('step    -')[0], { text: 'step', kind: 'section' });
  assert.equal(at('● 1 passed').find(s => s.text === '● 1 passed')?.kind, 'green');
  assert.equal(at('denied').find(s => s.text.startsWith('tried'))?.kind, 'red');
  assert.equal(at('Allowed:').find(s => s.text.startsWith('Allowed'))?.kind, undefined);
  assert.equal(at('> M src/a.py').find(s => s.text === 'M')?.kind, 'green');
  const blocked = view(doReview({ title: { ...reviewFixture('do').title, badge: '✗ blocked' } }));
  assert.deepEqual(blocked.title.find(s => s.text === '✗ blocked'), { text: '✗ blocked', kind: 'red' });
});

test('do: the files list: its header with [ ] file on the right; each file an entry; the selected one marked', () => {
  const v = view(reviewFixture('do'));
  const header = v.lines.find(l => plain(l).startsWith('files'))!;
  assert.equal(plain(header), `files${' '.repeat(v.width - 5 - 8)}[ ] file`);
  assert.deepEqual(header.slice(-2), [{ text: '[ ]', kind: 'key' }, { text: ' file', kind: 'dim' }]);
  const a = texts(v.lines).indexOf('> M src/a.py');
  assert.deepEqual([v.entryAt[a], v.entryAt[a + 1]], [0, 1]);
  assert.equal(v.entryAt[0], -1);
  assert.equal(v.entries, 2);
  assert.equal(v.selected, 0);
  assert.equal(v.lines.length, v.entryAt.length);
  assert.equal(plain(v.diff.title), 'file 1 of 2 · src/a.py');
});

test('do: ] shows the next file: its diff, its mark; out of range is the first', () => {
  const v = view(reviewFixture('do'), { selected: 1 });
  assert.equal(plain(v.diff.title), 'file 2 of 2 · src/b.py');
  assert.ok(has(v.lines, '> A src/b.py'));
  assert.ok(has(v.lines, '  M src/a.py'));
  assert.deepEqual(texts(v.diff.lines), ['--- a/src/b.py', '+++ b/src/b.py', '@@ -0,0 +1,1 @@', '+y = 1']);
  assert.equal(view(reviewFixture('do'), { selected: 7 }).selected, 0);
});

test('do: a denied heredoc is one row, its first line and a count; long rows cap at 3 lines (d details)', () => {
  const body = Array.from({ length: 40 }, (_, i) => `print(${i + 1})`);
  const heredoc = `python3 - <<'EOF'\n${body.join('\n')}\nEOF`;
  const long = 'word '.repeat(100);
  const v = view(doReview({ said: [long, 'short'], denied: [`tried \`${heredoc}\` 2 times; not allowed.`, 'Allowed: `uv run …`.'] }));
  const ls = texts(v.lines);
  assert.ok(has(v.lines, "denied  tried `python3 - <<'EOF' …` (42 lines) 2 times; not allowed."));
  assert.ok(!has(v.lines, 'print(1)'));
  assert.ok(has(v.lines, 'Allowed: `uv run …`.'));
  const i = ls.findIndex(l => l.startsWith('said '));
  let rows = 1;
  while (ls[i + rows]?.startsWith('        word')) rows++;
  assert.match(ls[i + rows], /… \d+ more lines \(d details\)/);
  assert.equal(rows, 3);
  assert.ok(has(v.lines, '        short'));
});

test('do: a failing test is said in red with its name; no change is said so', () => {
  const v = view(doReview({ tests: { ran: true, passed: 0, failed: 1, list: [{ test: 'test_label', status: 'failed' }] }, landing: { diff: '', files: [] } }));
  assert.ok(has(v.lines, 'tests   ✗ test_label · 0 passed'));
  assert.ok(has(v.lines, 'no file changed'));
  assert.deepEqual(texts(v.diff.lines), ['the do changed no file']);
  assert.equal(v.diff.lines[0][0].kind, 'dim');
  assert.equal(plain(v.diff.title), 'no change');
  assert.equal(v.selected, -1);
  assert.equal(v.entries, 0);
});

test('do: no tests ran, nothing said: their words, dimmed', () => {
  const v = view(doReview({ tests: { ran: false, passed: 0, failed: 0, list: [] }, said: [] }));
  assert.ok(has(v.lines, "tests   none ran (t runs the step's tests)"));
  assert.ok(has(v.lines, 'said    nothing in its grammar'));
  assert.equal(v.lines.find(l => plain(l).startsWith('said'))!.at(-1)?.kind, 'dim');
  // a null tests block is none ran
  assert.ok(has(view(doReview({ tests: null })).lines, "tests   none ran (t runs the step's tests)"));
});

test('do: the offers pane: each row in its columns, as row_lines lays it out', () => {
  const v = view(reviewFixture('do'));
  assert.ok(v.rows.some(r => r.lines.some(l => plain(l).startsWith('a  keep the change'))));
  assert.deepEqual(v.rows.flatMap(r => r.lines), rowLines(reviewRows(reviewFixture('do'), 0), v.width).lines);
  assert.ok(v.rows.every(r => r.pressable));
});

test('do: the legend ends q later; narrow: Tab diff first, Tab back on the diff', () => {
  // nvim's ` (the review stays)` long form needs a wider pane than any text pane here (74 cells at most)
  const v = view(reviewFixture('do'));
  assert.equal(v.legend, `[ ] files · ${SCROLL} · d details · ? help · q later`);
  const n = view(reviewFixture('do'), { cols: NARROW });
  assert.ok(n.narrow);
  assert.equal(n.legend, `Tab diff · [ ] files · ${SCROLL} · d details · ? help · q later`);
  assert.equal(plain(n.diff.title), 'file 1 of 2 · src/a.py · Tab back');
  assert.equal(plain(view(doReview({ landing: { diff: '', files: [] } }), { cols: NARROW }).diff.title), 'no change · Tab back');
  assert.equal(n.flipped, false);
  assert.equal(view(reviewFixture('do'), { cols: NARROW, flipped: true }).flipped, true);
  assert.equal(view(reviewFixture('do'), { flipped: true }).flipped, false);
});

test('do: the title shortens to fit: the model goes first, then the seconds and the cost', () => {
  // narrow text panes: cols - 8 cells
  const full = 'do · step 1 · Table.label · ◆ answered · sonnet · 42 s · $0.06';
  const short = 'do · step 1 · Table.label · ◆ answered · 42 s · $0.06';
  const bare = 'do · step 1 · Table.label · ◆ answered';
  assert.equal(plain(view(reviewFixture('do'), { cols: full.length + 8 }).title), full);
  assert.equal(plain(view(reviewFixture('do'), { cols: full.length + 7 }).title), short);
  assert.equal(plain(view(reviewFixture('do'), { cols: short.length + 7 }).title), bare);
  assert.equal(plain(view(reviewFixture('do'), { cols: bare.length + 7 }).title), 'do · step 1 · Table.label · ◆ answer…');
  assert.equal(plain(view(reviewFixture('do')).short), bare);
});

test('busy: the state says so and the busy words replace the legend', () => {
  const v = view(reviewFixture('do'), { busy: 'keep' });
  assert.equal(v.state, 'busy');
  assert.equal(v.legend, 'keeping…');
  assert.equal(view(reviewFixture('do')).state, 'review');
  assert.equal(busyWords('keep'), 'keeping…');
  assert.equal(busyWords('revert'), 'reverting…');
  assert.equal(busyWords('test'), "running the step's tests…");
  assert.equal(busyWords('allow'), 'allowing…');
  assert.equal(busyWords('apply'), '…');
});

test('help: the diff pane holds the source\'s key table', () => {
  const geo = layout(WIDE);
  assert.equal(view(reviewFixture('do')).help, undefined);
  assert.deepEqual(view(reviewFixture('do'), { help: true }).help, helpLines(geo.right - 4, DO_KEYS));
  assert.deepEqual(view(reviewFixture('errand'), { help: true }).help, helpLines(geo.right - 4, ERRAND_KEYS));
  assert.deepEqual(view(readings(), { help: true }).help, helpLines(geo.right - 4, READING_KEYS));
  assert.deepEqual(view(reviewFixture('do'), { help: true, cols: NARROW }).help, helpLines(layout(NARROW).text, DO_KEYS));
});

test('key tables: nvim\'s order; scroll, Tab and ? are the conjure table\'s', () => {
  const names = (ks: { keys: string[] }[]) => ks.map(k => k.keys.join(' '));
  assert.deepEqual(names(DO_KEYS).slice(0, 6), ['a', 'r', 'o', 't', 'p', '[ ]']);
  assert.deepEqual(names(DO_KEYS).slice(-3), ['d', 'q Escape', '?']);
  assert.deepEqual(names(ERRAND_KEYS).slice(0, 2), ['o', '[ ]']);
  assert.deepEqual(names(READING_KEYS).slice(0, 6), ['a', 'r', '1-9', 'n', 'i', '[ ]']);
  assert.equal(DO_KEYS[11].help, 'this help; any key closes it');
  assert.equal(READING_KEYS[10].help, 'later: the window closes; the readings stay, their lenses reopen them');
});

test('not offered: a do\'s letters and a reading\'s say why', () => {
  const only = doReview({ offers: [{ choice: 'keep', key: 'a', label: 'keep the change', detail: '' }] });
  assert.equal(notOffered(only, 'p'), 'nothing was refused');
  assert.equal(notOffered(only, 'r'), 'nothing to revert');
  assert.equal(notOffered(only, 'o'), 'this do has no thread to reopen');
  assert.equal(notOffered(only, 't'), 'no tests to run');
  assert.equal(NOT_OFFERED.do.a, 'nothing to keep');
  assert.equal(notOffered(readings(), 'r'), 'a unit in no step is not left: i ignores it');
  assert.equal(notOffered(readings(), 'i'), 'only a unit in no step is ignored');
  assert.equal(notOffered(readings(), 'n'), 'only a unit in no step becomes a new step');
  assert.equal(notOffered(readings(), 'a'), 'nothing to apply');
  assert.equal(notOffered(readings(), '5'), 'no step 5 to place it under');
  assert.equal(notOffered(readings([]), 'a'), 'nothing to review');
});

test('oneCommand: one line stays; a heredoc is its first line, a count and the tail', () => {
  assert.equal(oneCommand('tried `ls` 2 times'), 'tried `ls` 2 times');
  assert.equal(oneCommand('tried `cat <<EOF\na\nEOF` 2 times; not allowed.'), 'tried `cat <<EOF …` (3 lines) 2 times; not allowed.');
  assert.equal(oneCommand('a\nb'), 'a …` (2 lines)');
});

test('errand: a past do read-only: its badge, its one offer, its diff', () => {
  const v = view(reviewFixture('errand'));
  assert.ok(plain(v.title).includes('◆ answered · kept'));
  assert.ok(v.rows.some(r => r.lines.some(l => plain(l).startsWith('o  reopen: ask for more in the same thread'))));
  assert.ok(has(v.diff.lines, '+    def label(self) -> str: return self.id'));
  assert.deepEqual(reviewRows(reviewFixture('errand'), 0).map(r => r.choice), ['reopen']);
});

test('reviewTitle: the tab\'s words', () => {
  assert.equal(reviewTitle(reviewFixture('do')), 'do · step 1 · Table.label');
  assert.equal(reviewTitle(doReview({ title: { verb: 'do', step: null, unit: null } })), 'do');
  assert.equal(reviewTitle(reviewFixture('errand')), 'do · past');
  assert.equal(reviewTitle(readings()), 'reconcile · 2 to review');
});

test('reconcile: one line per reading, the selected one\'s plan edit over its unit\'s diff, and its offers', () => {
  const v = view(readings());
  assert.equal(plain(v.title), 'reconcile · 2 to review');
  assert.equal(v.tab, 'reconcile · 2 to review');
  assert.equal(plain(v.lines[0]), '2 readings to review');
  assert.ok(has(v.lines, '> Step 1 looks done'));
  assert.ok(has(v.lines, '  Not in any step: `spare` in a.py'));
  assert.ok(has(v.diff.lines, '+- [x] add a label @src/a.py:Table.label ✓ abc1234'));
  assert.ok(has(v.diff.lines, '+    def label(self) -> str: return self.id'));
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`), ['a tick it', 'r leave it']);
  const header = v.lines.find(l => plain(l).startsWith('readings'))!;
  assert.equal(plain(header), `readings${' '.repeat(v.width - 8 - 11)}[ ] reading`);
  assert.equal(v.entries, 2);
  assert.equal(v.entryAt[texts(v.lines).indexOf('> Step 1 looks done')], 0);
  assert.equal(plain(v.diff.title), 'reading 1 of 2 · Step 1 looks done');
  assert.ok(v.legend.startsWith(`[ ] readings · ${SCROLL} · d details · ? help · q later`));
});

test('reconcile: ] goes to the next reading; its keys are its offers', () => {
  const v = view(readings(), { selected: 1 });
  assert.equal(plain(v.diff.title), 'reading 2 of 2 · Not in any step: `spare` in a.py');
  const off = v.rows.flatMap(r => texts(r.lines));
  assert.ok(off.some(l => l.startsWith('1  under Step 1')));
  assert.ok(off.some(l => l.startsWith('i  not work: ignore it')));
  assert.ok(has(v.lines, '> Not in any step: `spare` in a.py'));
});

test('reconcile: rows carry the entry and, for a digit, the offer\'s step (not the digit)', () => {
  assert.deepEqual(reviewRows(readings([2]), 0).find(r => r.key === '2'),
    { key: '2', label: 'under Step 2', detail: '- [ ] next', choice: 'place', entry: SPARE, step: 3 });
  assert.deepEqual(reviewRows(readings(), 0)[0], { key: 'a', label: 'tick it', detail: "the step's line ticked", choice: 'apply', entry: DONE });
  assert.deepEqual(reviewRows(readings([]), 0), []);
});

test('reconcile: what is left after an answer; nothing left; no change to the plan', () => {
  assert.equal(plain(view(readings([2])).lines[0]), '1 readings to review');
  const none = view(readings([]));
  assert.ok(has(none.lines, 'nothing left to review'));
  assert.equal(plain(none.diff.title), 'nothing to review');
  assert.deepEqual(texts(none.diff.lines), ['no change to the plan']);
  assert.deepEqual(none.rows, []);
  assert.equal(none.selected, -1);
  const r = readings([1]);
  r.entries[0].landing.diff = '';
  assert.deepEqual(texts(view(r).diff.lines), ['no change to the plan']);
  assert.equal(plain(view(readings(), { cols: NARROW }).diff.title), 'reading 1 of 2 · Step 1 looks done · Tab back');
});

test('entryIndex: a reading\'s id to its index; else 0', () => {
  assert.equal(entryIndex(readings(), SPARE), 1);
  assert.equal(entryIndex(readings(), DONE), 0);
  assert.equal(entryIndex(readings(), 'gone'), 0);
  assert.equal(entryIndex(readings(), undefined), 0);
  assert.equal(entryIndex(reviewFixture('do'), SPARE), 0);
  assert.ok(has(view(readings(), { selected: entryIndex(readings(), SPARE) }).lines, '> Not in any step: `spare` in a.py'));
});

test('pickAtCursor: the review on the line; else a reading on it; a do on the line wins; else the first; none', () => {
  const list: ReviewListItem[] = [
    { id: 'R1', kind: 'do', row: 3, step: '- [ ] next', status: 'answered' },
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: SPARE, kind: 'unplaced', row: null }, { id: DONE, kind: 'done', row: 2 }] },
  ];
  assert.deepEqual(pickAtCursor(list, 2), { id: 'reconcile', entry: DONE });
  assert.deepEqual(pickAtCursor(list, 3), { id: 'R1' });
  assert.deepEqual(pickAtCursor(list, 9), { id: 'R1' });
  assert.equal(pickAtCursor([], 2), undefined);
  // a do and a reading on one line: the do, whichever comes first
  const both: ReviewListItem[] = [
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: DONE, kind: 'done', row: 3 }] },
    { id: 'R1', kind: 'do', row: 3 },
  ];
  assert.deepEqual(pickAtCursor(both, 3), { id: 'R1' });
  assert.deepEqual(pickAtCursor([...both].reverse(), 3), { id: 'R1' });
});
