import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import type { Line, View } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { conjureKeys, conjureLegend, conjureView, defaultSelected, entries, helpLines, layout, NO_ROW, noRow, rowLines, rows, shortName } from '../../src/pause/model';
import type { PauseRow, Running } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';

// Ported from durandal.nvim tests/pause_spec.lua (the data tests). The builders below are the
// Lua spec's proposed(), refused(), wall() and the in-test variants, on the same fixtures.
const NOT_FOUND = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_not_found';
const SUCCEEDS = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_succeeds';
const TEST_FIX_DIFF = '--- a/src/bistro/booking/commands/cancel_booking__test.py\n+++ b/src/bistro/booking/commands/cancel_booking__test.py\n@@ -27,1 +27,1 @@\n-    cancel_booking = command()\n+    cancel_booking = command(bookings=repository)\n';
const PORT_DETAIL = 'find_by_id(self, id: str) -> Booking | None in the port and its adapters, then round 3';

const keyed = (rs: PauseRow[]): string[] => rs.map(r => `${r.key ?? ' '} ${r.label}`);
const offer = (o: Partial<PausedOffer> & { choice: string }): PausedOffer => ({ label: o.choice, detail: '', ...o });

// the wired pause as it is after `t`: the proposal waiting
function proposed(): Paused {
  const p = fixture('wired');
  p.proposal = {
    file: 'src/bistro/booking/commands/cancel_booking__test.py', test: NOT_FOUND, before: '', after: '', refused: null,
    diff: [
      '--- a/src/bistro/booking/commands/cancel_booking__test.py',
      '+++ b/src/bistro/booking/commands/cancel_booking__test.py',
      '@@ -27,6 +27,6 @@',
      ' def test_cancel_booking_not_found() -> None:',
      '     repository = Mock()',
      '-    cancel_booking = command()',
      '+    cancel_booking = command(bookings=repository)',
    ].join('\n'),
  };
  p.offers = [
    { choice: 'accept', label: 'accept', detail: 'the test lands with the conjure; round 3 runs against it' },
    { choice: 'reject', label: 'reject', detail: 'back to the rows; the test stands as it was' },
  ];
  return p;
}

// the wired pause after a refused re-conjure
function refused(): Paused {
  const p = proposed();
  p.proposal!.refused = 'it adds `"BAD" is not defined` at line 23';
  p.outcome = 'Your re-conjure of not_found was refused: it adds `"BAD" is not defined` at line 23.';
  p.offers = fixture('wired').offers;
  p.offers.splice(2, 0, { choice: 'proposal', label: 'see the refused proposal', detail: '…' });
  p.offers[3] = { choice: 'reconjure', arg: NOT_FOUND, label: 'fix the test: not_found, again', detail: 're-conjure it once more; you see its diff' };
  return p;
}

// the screenshot-10 pause: round 2 refused by pyright at the port's wall, the test fixed
// after round 1, p offered
function wall(): Paused {
  const p = fixture('wired');
  const w = fixture('wired');
  const msg = 'Cannot access attribute "find_by_id" for class "BookingRepository"';
  for (const r of p.rounds!) {
    r.failed = []; r.failing = []; r.passed = [];
    r.line = 'booking = self.bookings.find_by_id(input.id)';
    r.check = `src/bistro/booking/commands/cancel_booking.py: ${msg}`;
  }
  p.steps = [{ after: 1, kind: 'test', test: NOT_FOUND, text: 'test fixed: not_found (command(bookings=repository))',
    files: [{ file: 'src/bistro/booking/commands/cancel_booking__test.py', diff: TEST_FIX_DIFF }] }];
  const here = 'src/bistro/booking/commands/cancel_booking.py';
  p.failure = { round: 2, kind: 'check', tool: 'pyright', problems: [
    { file: here, line: 30, message: msg },
    { file: here, line: 30, message: 'Type of "booking" is unknown' },
    { file: here, line: 30, message: 'Type of "find_by_id" is unknown' },
  ] };
  p.checker = 'pyright';
  p.diagnosis = ["BookingRepository has no find_by_id: pyright refuses round 2's body before the tests run (cancel_booking.py:30)."];
  p.why = p.diagnosis[0];
  p.title!.seconds = 31;
  p.tests = [w.tests![0], { test: SUCCEEDS, status: 'passing', flipped: null, assertion: 'assert isinstance(result, Ok)', note: null, source: '' }];
  p.offers = [w.offers[0], w.offers[1],
    { choice: 'port', arg: 'BookingRepository.find_by_id', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL },
    w.offers[3], w.offers[4]];
  return p;
}

// the wired pause with a port-method proposal waiting (`p`'s answer)
function portProposal(): Paused {
  const q = fixture('wired');
  q.proposal = {
    kind: 'port', file: 'src/bistro/booking/ports/booking_repository/booking_repository.py', test: 'BookingRepository.find_by_id',
    step: 'port method: BookingRepository.find_by_id(id: str) -> Booking | None', refused: null,
    files: ['src/bistro/booking/ports/booking_repository/booking_repository.py', 'src/bistro/booking/adapters/a.py', 'src/bistro/booking/adapters/b.py'],
    diff: '--- a/src/bistro/booking/ports/booking_repository/booking_repository.py\n+++ b/src/bistro/booking/ports/booking_repository/booking_repository.py\n@@ -30,1 +30,3 @@\n     def save(self, booking: Booking) -> None: ...\n+\n+    def find_by_id(self, id: str) -> Booking | None: ...\n',
  };
  q.offers = [{ choice: 'accept', label: 'accept', detail: '…' }, { choice: 'reject', label: 'reject', detail: '…' }];
  return q;
}

// wired with a third round and the test's fix accepted after round 2 (the wire step skipped)
function withStep(): Paused {
  const p = fixture('wired');
  const r3 = structuredClone(p.rounds![1]);
  r3.round = 3;
  r3.line = 'booking = self.bookings.find_by_id(input.id)';
  p.rounds!.push(r3);
  p.steps = [
    { after: 0, kind: 'wire', text: 'wire bookings: BookingRepository', files: [] },
    { after: 2, kind: 'test', test: NOT_FOUND, text: 'test fixed: not_found (command(bookings=repository))',
      files: [{ file: 'src/bistro/booking/commands/cancel_booking__test.py', diff: TEST_FIX_DIFF }] },
  ];
  return p;
}

// wired with rounds 3..14: more than nine entries
function many(): Paused {
  const p = fixture('wired');
  for (let n = 3; n <= 14; n++) {
    const r = structuredClone(p.rounds![0]);
    r.round = n;
    r.line = `return ${n}`;
    p.rounds!.push(r);
  }
  return p;
}

const thin = (): Paused => ({ token: 't', lines: { first: 1, last: 1 }, offers: [] });

test('entries: the wire is 0, then the rounds; the default is the last round', () => {
  const es = entries(fixture('wired'));
  assert.deepEqual(es.map(e => [e.kind, e.n, e.label]), [['wire', 0, 'wire'], ['round', 1, 'red'], ['round', 2, 'red']]);
  assert.equal(es[0].body, 'bookings: BookingRepository → __init__, command()');
  assert.equal(es[0].text, 'wire  bookings: BookingRepository → __init__, command()');
  assert.equal(es[2].body, '(the same as round 1)');
  assert.equal(defaultSelected(es), 2);
});

test('no wire: no 0 entry; the old golden\'s rows on their keys (Review Focus 1)', () => {
  const p = fixture('plain');
  const es = entries(p);
  assert.equal(es[0].kind, 'round');
  assert.deepEqual(keyed(rows(p, es[defaultSelected(es)], false)),
    ['c continue', 'h continue with a hint…', 't fix the test: not_found', 'T fix the test: succeeds', 's stop', 'a keep round 3']);
});

test('§10.1: every row on its key; the keep row names the selected round', () => {
  const p = fixture('wired');
  const es = entries(p);
  assert.deepEqual(keyed(rows(p, es[2], false)), ['c continue', 'h continue with a hint…', 't fix the test: not_found', 's stop', 'a keep round 2']);
});

test('§10.2: round 1 selected, then the wire: the a row follows', () => {
  const p = fixture('wired');
  const es = entries(p);
  const one = rows(p, es[1], false);
  const a1 = one[one.length - 1];
  assert.deepEqual([a1.key, a1.label, a1.arg], ['a', 'keep round 1', '1']);
  const w = rows(p, es[0], false);
  const a = w[w.length - 1];
  assert.deepEqual([a.key, a.label, a.detail, a.choice, a.land, a.arg],
    ['a', 'keep nothing but the wire', "lands the wire's files alone, your body stands", 'stop', true, '0']);
});

test('the rows carry what a resume needs: arg only when given, land only from the offer', () => {
  const p = fixture('wired');
  const rs = rows(p, entries(p)[2], false);
  assert.deepEqual(rs[0], { key: 'c', label: 'continue', detail: '6 more rounds with local, from round 3', choice: 'continue', pressable: true });
  assert.deepEqual(rs[1], { key: 'h', label: 'continue with a hint…', detail: 'your sentence goes to local with round 3', choice: 'continue', hint: true, pressable: true });
  assert.deepEqual(rs[2], { key: 't', label: 'fix the test: not_found', detail: 'hand repository to command(bookings=repository); you see the diff', choice: 'reconjure', arg: NOT_FOUND, pressable: true });
  assert.deepEqual(rs[3], { key: 's', label: 'stop', detail: 'nothing lands, not the wire either; your text stands', choice: 'stop', land: false, pressable: true });
  assert.deepEqual(rs[4], { key: 'a', label: 'keep round 2', detail: 'lands the diff on the right, red (saved; u undoes it)', choice: 'stop', land: true, arg: '2', pressable: true });
});

test('§10.3: a proposal is the default entry, a and r its rows', () => {
  const p = proposed();
  const es = entries(p);
  assert.equal(defaultSelected(es), 3);
  assert.deepEqual([es[3].kind, es[3].label, es[3].body, es[3].text], ['proposal', 'proposal', 'fix the test: not_found', 'proposal for not_found']);
  assert.deepEqual(keyed(rows(p, es[3], false)), ['a accept', 'r reject']);
});

test('a refused proposal leads: ✗ entry selected, the proposal offer skipped, a accepts it anyway, t again', () => {
  const p = refused();
  const es = entries(p);
  const sel = defaultSelected(es);
  assert.equal(es[sel].kind, 'refused');
  assert.equal(es[sel].body, 'fix the test: not_found · it adds `"BAD" is not defined` at line 23');
  const rs = rows(p, es[sel], false);
  assert.deepEqual(keyed(rs), ['c continue', 'h continue with a hint…', 't fix the test: not_found, again', 's stop', 'a accept it anyway']);
  assert.equal(rs[4].choice, 'accept');
  assert.ok(!rs.some(r => r.choice === 'proposal'));
});

test('a refusal of several lines is one entry line', () => {
  const p = refused();
  p.proposal!.refused = 'it adds `x`\n  Type "A" is not assignable\n    "size" is not present` at line 26';
  const e = entries(p).find(x => x.kind === 'refused')!;
  assert.equal(e.body, 'fix the test: not_found · it adds `x` Type "A" is not assignable "size" is not present` at line 26');
  assert.ok(!e.text.includes('\n'));
});

test('keys: C climbs, w W wire the candidates, t T the first two tests; a third test row has no key and is not pressable', () => {
  const p = fixture('plain');
  p.offers = [
    offer({ choice: 'continue', label: 'continue' }), offer({ choice: 'climb', label: 'climb to claude' }),
    offer({ choice: 'wire', arg: 'bookings: BookingRepository', label: 'wire bookings: BookingRepository' }),
    offer({ choice: 'wire', arg: 'ids: IdGenerator', label: 'wire ids: IdGenerator' }),
    offer({ choice: 'reconjure', arg: NOT_FOUND, label: 'fix the test: not_found' }),
    offer({ choice: 'reconjure', arg: SUCCEEDS, label: 'fix the test: succeeds' }),
    offer({ choice: 'reconjure', arg: 'x::test_x', label: 'fix the test: x' }),
    offer({ choice: 'stop', land: false, label: 'stop' }), offer({ choice: 'stop', land: true, arg: '3', label: 'keep round 3' }),
  ];
  const es = entries(p);
  const rs = rows(p, es[defaultSelected(es)], false);
  assert.deepEqual(keyed(rs), ['c continue', 'C climb to claude', 'w wire bookings: BookingRepository', 'W wire ids: IdGenerator',
    't fix the test: not_found', 'T fix the test: succeeds', '  fix the test: x', 's stop', 'a keep round 3']);
  assert.equal(rs[6].pressable, false);
  assert.equal(rs[6].key, undefined);
});

test('a third wire and a third port get no key; an unknown choice is a row without a key', () => {
  const p = fixture('wired');
  p.offers = [
    offer({ choice: 'wire', label: 'w1' }), offer({ choice: 'wire', label: 'w2' }), offer({ choice: 'wire', label: 'w3' }),
    offer({ choice: 'port', label: 'p1' }), offer({ choice: 'port', label: 'p2' }), offer({ choice: 'port', label: 'p3' }),
    offer({ choice: 'teleport', label: 'teleport', detail: 'a choice this client does not know' }),
  ];
  const rs = rows(p, entries(p)[1], false);
  assert.deepEqual(keyed(rs), ['w w1', 'W w2', '  w3', 'p p1', 'P p2', '  p3', '  teleport']);
  assert.deepEqual(rs.map(r => r.pressable), [true, true, false, true, true, false, false]);
  assert.equal(rs[6].choice, 'teleport');
  assert.equal(rs[6].detail, 'a choice this client does not know');
});

test('a bare string offer is its own label and choice', () => {
  const p = fixture('wired');
  (p as { offers: unknown[] }).offers = ['continue', 'stop'];
  assert.deepEqual(keyed(rows(p, entries(p)[1], false)), ['c continue', 's stop']);
});

test('the next wall gets a step: p adds the method a port lacks, in the server\'s order', () => {
  const p = fixture('wired');
  p.offers.splice(2, 0, { choice: 'port', arg: 'BookingRepository.find_by_id', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL });
  const es = entries(p);
  assert.deepEqual(keyed(rows(p, es[2], false)),
    ['c continue', 'h continue with a hint…', 'p add find_by_id to BookingRepository', 't fix the test: not_found', 's stop', 'a keep round 2']);
  const q = portProposal();
  const e = entries(q)[3];
  assert.deepEqual([e.kind, e.body, e.text], ['proposal', 'add find_by_id to BookingRepository → port, 2 adapters', 'proposal: add find_by_id to BookingRepository']);
});

test('steps are entries: an accepted fix sits between the rounds it divides; no keep row on it', () => {
  const p = withStep();
  const es = entries(p);
  assert.deepEqual(es.map(e => e.kind), ['wire', 'round', 'round', 'step', 'round']);
  assert.deepEqual([es[3].label, es[3].body], ['test fixed', 'not_found → command(bookings=repository)']);
  assert.equal(defaultSelected(es), 4);
  const rs = rows(p, es[3], false);
  assert.ok(rs.every(r => r.key !== 'a'));
  assert.equal(noRow(rs, 'a'), 'nothing to keep on this entry');
});

test('the steps fixture: the wire step is entry 0 once, the test fix and the port method after their rounds', () => {
  const es = entries(fixture('steps'));
  assert.deepEqual(es.map(e => `${e.kind}:${e.label}:${e.body}`), [
    'wire:wire:bookings: BookingRepository → __init__, command()',
    'round:red:booking = self.bookings.find_by_id(input.id)',
    'step:test fixed:not_found → command(bookings=repository)',
    'round:red:booking = self.bookings.find_by_id(input.id)',
    'step:port method:find_by_id → BookingRepository, 3 adapters',
    'round:red:booking = self.bookings.find_by_id(input.id)',
  ]);
});

test('a round without a diff has no keep row', () => {
  const p = fixture('wired');
  p.rounds![1].diff = null;
  const rs = rows(p, entries(p)[2], false);
  assert.ok(rs.every(r => r.key !== 'a'));
  assert.equal(noRow(rs, 'a'), 'nothing to keep on this entry');
});

test('a round whose diff is empty text still keeps', () => {
  const p = fixture('wired');
  p.rounds![1].diff = '';
  const rs = rows(p, entries(p)[2], false);
  assert.equal(rs[rs.length - 1].label, 'keep round 2');
});

test('narrow: the keep row says Tab shows the diff', () => {
  const p = fixture('wired');
  const rs = rows(p, entries(p)[2], true);
  assert.equal(rs[rs.length - 1].detail, 'lands the diff (Tab shows it), red (saved; u undoes it)');
});

test('a thin answer: no entries, nothing selected, no rows', () => {
  const es = entries(thin());
  assert.deepEqual(es, []);
  assert.equal(defaultSelected(es), -1);
  assert.deepEqual(rows(thin(), undefined, false), []);
});

test('why a key has no row: the letters, the proposal first, else nothing to do', () => {
  assert.equal(NO_ROW.c, 'no more rounds to run');
  assert.equal(NO_ROW.C, 'no stronger model to climb to');
  assert.equal(NO_ROW.W, 'no second port to wire');
  assert.equal(NO_ROW.P, 'no second port method to add');
  const p = proposed();
  const rs = rows(p, entries(p)[3], false);
  assert.equal(noRow(rs, 'c'), 'answer the proposal first: a accepts, r rejects');
  const w = fixture('wired');
  const ws = rows(w, entries(w)[2], false);
  assert.equal(noRow(ws, 'r'), 'no proposal to reject');
  assert.equal(noRow(ws, 'W'), 'no second port to wire');
  assert.equal(noRow(ws, 'z'), 'nothing to do here');
});

test('shortName drops test_ and the paused file\'s stem, whatever the language', () => {
  assert.equal(shortName({ ...thin(), file: 'src/x/cancel_booking.py' }, 'src/x/cancel_booking__test.py::test_cancel_booking_not_found'), 'not_found');
  assert.equal(shortName({ ...thin(), file: 'src/x/cancel_booking.rs' }, 'src/x/cancel_booking.rs::tests::test_cancel_booking_not_found'), 'not_found');
  assert.equal(shortName(thin(), 'a__test.py::test_other'), 'other');
});

// --- the offers' lines (row_lines)

const W = 74; // the left pane's text width at 200 columns
// a row line in three columns: the key and label, then the detail from column 31
const col = (label: string, detail: string): string => label + ' '.repeat(31 - width(label)) + detail;
// a line's marked stretches: { text: kind } (the Lua spec's marked())
const marked = (l: Line): Record<string, string> => Object.fromEntries(l.filter(s => s.kind).map(s => [s.text, s.kind as string]));
const wiredRows = (): PauseRow[] => { const p = fixture('wired'); return rows(p, entries(p)[2], false); };

test('§10.1: rows in three columns: the key, the label in 28 cells, the detail wrapped under itself', () => {
  const { lines, starts } = rowLines(wiredRows(), W);
  const text = lines.map(plain);
  assert.equal(text[0], col('c  continue', '6 more rounds with local, from round 3'));
  assert.equal(text[1], col('h  continue with a hint…', 'your sentence goes to local with round 3'));
  // the scan knows the test's fix: the row says the edit
  assert.equal(text[2], col('t  fix the test: not_found', 'hand repository to'));
  assert.equal(text[3], col('', 'command(bookings=repository); you see the'));
  assert.equal(text[4], col('', 'diff'));
  assert.equal(text[text.length - 2], col('a  keep round 2', 'lands the diff on the right, red (saved; u'));
  assert.equal(text[text.length - 1], col('', 'undoes it)'));
  assert.deepEqual(starts, [0, 1, 2, 5, 7]);
  for (const l of text) assert.ok(width(l) <= W, l);
});

test('each row\'s first line starts with its key as a span of its own (the page\'s badge)', () => {
  const rs = wiredRows();
  const { lines, starts } = rowLines(rs, W);
  rs.forEach((r, i) => assert.deepEqual(lines[starts[i]][0], { text: r.key, kind: 'key' }));
  const narrow = rowLines(rs, 58);
  rs.forEach((r, i) => assert.deepEqual(narrow.lines[narrow.starts[i]][0], { text: r.key, kind: 'key' }));
});

test('§6.1: the rows in columns, the p row whole; keys key, labels plain, details dimmed', () => {
  const p = wall();
  const { lines, starts } = rowLines(rows(p, entries(p)[4], false), W);
  const text = lines.map(plain);
  const at = text.findIndex(l => l.startsWith('p  '));
  assert.equal(text[at], 'p  add find_by_id to BookingRepository');
  assert.equal(text[at + 1], col('', 'find_by_id(self, id: str) -> Booking | None'));
  assert.equal(text[at + 2], col('', 'in the port and its adapters, then round 3'));
  assert.ok(starts.includes(at));
  assert.deepEqual(marked(lines[at]), { p: 'key' });
  assert.deepEqual(marked(lines[at + 1]), { 'find_by_id(self, id: str) -> Booking | None': 'dim' });
  assert.deepEqual(marked(lines[0]), { c: 'key', '6 more rounds with local, from round 3': 'dim' });
  for (const l of text) assert.ok(!l.endsWith('…'), l);
});

test('the p row is whole in two lines at 74', () => {
  const p = fixture('check');
  const prow = rows(p, entries(p)[1], false).filter(r => r.key === 'p');
  const text = rowLines(prow, W).lines.map(plain);
  assert.deepEqual(text, [
    'p  add find_by_id to BookingRepository',
    col('', 'find_by_id(self, id: str) -> Booking | None'),
    col('', 'in the port and its adapters, then round 2'),
  ]);
});

test('narrower than 70: label — detail wrapped under the label, the detail dimmed from its dash', () => {
  const { lines, starts } = rowLines(wiredRows(), 58);
  assert.deepEqual(lines.map(plain), [
    'c  continue — 6 more rounds with local, from round 3',
    'h  continue with a hint… — your sentence goes to local',
    '   with round 3',
    't  fix the test: not_found — hand repository to',
    '   command(bookings=repository); you see the diff',
    's  stop — nothing lands, not the wire either; your text',
    '   stands',
    'a  keep round 2 — lands the diff on the right, red (saved;',
    '   u undoes it)',
  ]);
  assert.deepEqual(starts, [0, 1, 3, 5, 7]);
  assert.deepEqual(marked(lines[1]), { h: 'key', '— your sentence goes to local': 'dim' });
  assert.deepEqual(marked(lines[2]), { 'with round 3': 'dim' });
});

test('a detail too long for three lines ends its third with …; an unkeyed row has a blank key column', () => {
  const long = rowLines([{ key: 'c', label: 'continue', detail: 'word '.repeat(40) }], 40);
  assert.equal(long.lines.length, 3);
  assert.ok(plain(long.lines[2]).endsWith('…'), plain(long.lines[2]));
  const bare = rowLines([{ label: 'fix the test: x', detail: '' }], W);
  assert.deepEqual(bare.lines.map(plain), ['   fix the test: x']);
  assert.deepEqual(marked(bare.lines[0]), {});
});

test('a label too long for its column has the line to itself', () => {
  const { lines } = rowLines([{ key: 't', label: 'fix the test: a_very_long_test_name_indeed', detail: 'then the rounds go on' }], W);
  assert.deepEqual(lines.map(plain), ['t  fix the test: a_very_long_test_name_indeed', col('', 'then the rounds go on')]);
});

// --- the situation pane (situation)

const CHORD = 'Cmd+Alt+D C';
// the view at 200 columns (the situation 74 cells wide) unless O says otherwise
const view = (p: Paused, o: Partial<Parameters<typeof conjureView>[1]> = {}): View =>
  conjureView(p, { cols: 200, selected: -1, flipped: false, help: false, chord: CHORD, ...o });
const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: string[], text: string): boolean => ls.some(l => l.includes(text));
const lineOf = (ls: string[], re: RegExp): number => ls.findIndex(l => re.test(l));

test('layout: two panes from 110 columns, the left 52 % (at least 60), a cell of margin each side of the text', () => {
  assert.deepEqual(layout(200), { narrow: false, text: 74, right: 72 });
  assert.deepEqual(layout(124), { narrow: false, text: 58, right: 58 });
  assert.deepEqual(layout(110), { narrow: false, text: 56, right: 46 });
  assert.deepEqual(layout(98), { narrow: true, text: 90, right: 94 });
  assert.deepEqual(layout(400), { narrow: false, text: 74, right: 72 });
});

test('§10.1: the first pause after the wire — the situation, the rounds with the wire as 0', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  assert.equal(v.width, W);
  assert.equal(v.state, 'paused');
  // the title is not a line of the pane: the page draws it
  assert.equal(L[0], 'local wrote the same body in rounds 1 and 2.');
  assert.equal(L[1], '');
  assert.ok(L[2].startsWith('No body can pass not_found: it builds repository = Mock()'), L[2]);
  for (const want of [
    `rounds${' '.repeat(W - 6 - 19)}[ ] page · 0-9 jump`,
    '  0  wire         bookings: BookingRepository → __init__, command()',
    'failing  test_cancel_booking_not_found            failed before round 1',
    '    assert isinstance(result, NotFound)',
    '    got       Ok(value=None)',
    '    expected  NotFound',
  ]) assert.ok(L.includes(want), want);
  // verdict first, in its column; the body whole; the failing names right-aligned
  assert.ok(has(L, '  1  red          booking = self.bookings.find_by_id(input.id)'));
  assert.ok(has(L, '> 2  red          (the same as round 1)'));
  for (const l of L) {
    if (l.includes('(the same as round 1)')) {
      assert.ok(l.endsWith('  not_found'), l);
      assert.equal(width(l), W, l);
    }
    assert.ok(width(l) <= W, l);
  }
  assert.deepEqual(L.slice(7, 11), [
    'rounds                                                 [ ] page · 0-9 jump',
    '  0  wire         bookings: BookingRepository → __init__, command()',
    '  1  red          booking = self.bookings.find_by_id(input.id)   not_found',
    '> 2  red          (the same as round 1)                          not_found',
  ]);
});

test('the title: the model goes first, then the seconds, to fit the pane; short drops the model', () => {
  const v = view(fixture('wired'));
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local');
  assert.equal(plain(v.short), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local · 16 s');
  assert.deepEqual(v.title, [
    { text: 'conjure · CancelBooking.handle · ', kind: 'title' },
    { text: '● paused', kind: 'paused' },
    { text: ' after round 2 of 6 · local', kind: 'dim' },
  ]);
  // wide enough for the model: the whole title (the pane is never wider than 74 cells)
  const thinTitle = view(thin());
  assert.equal(plain(thinTitle.title), 'conjure · ● paused');
});

test('§10.5: narrow — no model in the title; flipped only when narrow', () => {
  const v = view(fixture('wired'), { cols: 98, flipped: true });
  assert.equal(v.narrow, true);
  assert.equal(v.flipped, true);
  assert.equal(v.width, 90);
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local · 16 s');
  assert.equal(v.tab, 'conjure · CancelBooking.handle');
  assert.equal(view(fixture('wired'), { flipped: true }).flipped, false);
});

test('the selected entry: its line marked >, entryAt names it; other lines -1 or their entry', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  assert.equal(v.entries, 3);
  assert.equal(v.selected, 2);
  const at = lineOf(L, /^> 2 /);
  assert.equal(v.entryAt[at], 2);
  assert.equal(v.entryAt[lineOf(L, /^ {2}0 {2}wire/)], 0);
  assert.equal(v.entryAt[0], -1);
  assert.equal(v.entryAt.length, v.lines.length);
  assert.ok(v.entryAt.filter(i => i >= 0).length === 3);
});

test('§10.2: round 1 selected, then the wire', () => {
  assert.ok(has(texts(view(fixture('wired'), { selected: 1 }).lines), '> 1  red          booking = self.bookings.find_by_id(input.id)'));
  assert.ok(texts(view(fixture('wired'), { selected: 0 }).lines).includes('> 0  wire         bookings: BookingRepository → __init__, command()'));
  // out of range: the default
  assert.equal(view(fixture('wired'), { selected: 9 }).selected, 2);
});

test('§10.3: a proposal is the selected entry; the badge says proposal', () => {
  const v = view(proposed());
  const L = texts(v.lines);
  assert.ok(L.includes('> ◆  proposal     fix the test: not_found'), L.join('\n'));
  assert.ok(has(L, '  2  red          (the same as round 1)'));
  assert.ok(plain(v.short).startsWith('conjure · CancelBooking.handle · ◆ proposal after round 2 of 6'), plain(v.short));
  assert.equal(v.state, 'proposal');
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`), ['a accept', 'r reject']);
});

test('a refused proposal leads the pause: the outcome first, the ✗ entry selected', () => {
  const v = view(refused());
  const L = texts(v.lines);
  assert.ok(L[0].startsWith('Your re-conjure of not_found was refused: it adds `"BAD" is not defined`'), L[0]);
  assert.ok(has(L, '> ✗  refused      fix the test: not_found · it adds'), L.join('\n'));
  assert.equal(v.state, 'paused');
});

test('no wire: no wire line', () => {
  assert.ok(!has(texts(view(fixture('plain')).lines), 'wire'));
});

test('the rows in the view: their columns at the pane\'s width, pressable when keyed', () => {
  const v = view(fixture('wired'));
  assert.equal(v.rows.length, 5);
  assert.deepEqual(texts(v.rows[0].lines), [col('c  continue', '6 more rounds with local, from round 3')]);
  assert.deepEqual(texts(v.rows[2].lines), [col('t  fix the test: not_found', 'hand repository to'), col('', 'command(bookings=repository); you see the'), col('', 'diff')]);
  assert.deepEqual([v.rows[4].key, v.rows[4].label, v.rows[4].pressable], ['a', 'keep round 2', true]);
  const odd = fixture('wired');
  odd.offers = [offer({ choice: 'teleport', label: 'teleport' })];
  const r = view(odd).rows[0];
  assert.equal(r.pressable, false);
  assert.ok(!('key' in r));
});

test('steps are entries: an accepted fix sits between the rounds it divides', () => {
  const L = texts(view(withStep()).lines);
  const at2 = lineOf(L, /^ {2}2 {2}/);
  const atStep = L.indexOf('  ✓  test fixed   not_found → command(bookings=repository)');
  const at3 = lineOf(L, /^> 3 {2}/);
  assert.ok(at2 >= 0 && atStep >= 0 && at3 >= 0, L.join('\n'));
  assert.ok(at2 < atStep && atStep < at3);
});

test('the steps fixture: the wire, the fix and the port method among the rounds; the checker on the refused rounds', () => {
  const L = texts(view(fixture('steps')).lines);
  assert.deepEqual(L.slice(5, 12), [
    'rounds                                                 [ ] page · 0-9 jump',
    '  0  wire         bookings: BookingRepository → __init__, command()',
    '  1  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '  ✓  test fixed   not_found → command(bookings=repository)',
    '  2  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '  ✓  port method  find_by_id → BookingRepository, 3 adapters',
    '> 3  red          booking = self.bookings.find_by_id(input.id)    succeeds',
  ]);
  assert.equal(L[13], 'failing  test_cancel_booking_succeeds             passed before round 1');
  assert.equal(L[18], 'passing  test_cancel_booking_not_found            failed before round 1');
});

test('the failing section is the latest round\'s real failure: the check\'s refusal; the tests as they last ran', () => {
  const p = fixture('wired');
  const msg = 'Cannot access attribute "find_by_id" for class "BookingRepository"';
  for (const r of p.rounds!) {
    r.failed = []; r.failing = []; r.passed = [];
    r.check = `src/bistro/booking/commands/cancel_booking.py: ${msg}`;
  }
  p.failure = { round: 2, kind: 'check', tool: 'pyright', problems: [
    { file: 'src/bistro/booking/commands/cancel_booking.py', line: 30, message: msg },
    { file: 'src/bistro/booking/commands/cancel_booking.py', line: 30, message: 'Type of "booking" is unknown' },
  ] };
  const L = texts(view(p).lines);
  assert.ok(L.includes('failing  round 2 · pyright refused it before the tests ran'), L.join('\n'));
  assert.ok(has(L, '    cancel_booking.py:30  Cannot access attribute "find_by_id"'));
  assert.ok(L.includes('    cancel_booking.py:30  Type of "booking" is unknown'));
  // the tests did not run in the latest round: one dimmed line, their last state
  assert.ok(L.includes('tests    not run in round 2 · before round 1: not_found failing'), L.join('\n'));
  assert.ok(L.includes('         (d details)'));
  assert.ok(!has(L, '    assert isinstance(result, NotFound)'));
  // the rounds say what refused them, on the right
  const refusedBy = (ls: string[]): boolean => ls.some(l => /^ {2}1 {2}red {2}.+ {2}pyright$/.test(l));
  assert.ok(refusedBy(L), L.join('\n'));
  // the before-run's got/expected are no round's failure
  assert.ok(!has(L, '    got       Ok(value=None)'));
  // a later pause whose last round ran its tests still names the checker that refused the earlier rounds
  p.failure = { round: 3, kind: 'tests', tests: [] };
  p.checker = 'pyright';
  assert.ok(refusedBy(texts(view(p).lines)));
});

test('the check fixture: the wall\'s three problems at their place, the stale tests one line', () => {
  const L = texts(view(fixture('check')).lines);
  assert.deepEqual(L.slice(10, 20), [
    '> 1  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '',
    'failing  round 1 · pyright refused it before the tests ran',
    '    cancel_booking.py:30  Cannot access attribute "find_by_id" for class',
    '                          "BookingRepository"',
    '    cancel_booking.py:30  Type of "booking" is unknown',
    '    cancel_booking.py:30  Type of "find_by_id" is unknown',
    '',
    'tests    not run in round 1 · before round 1: not_found failing',
    '         (d details)',
  ]);
});

test('more than three problems: the rest under d', () => {
  const p = fixture('check');
  const f = p.failure as { problems: { file: string; line: number; message: string }[] };
  f.problems.push({ file: 'src/a.py', line: 1, message: 'four' }, { file: 'src/a.py', line: 2, message: 'five' });
  const v = view(p);
  const L = texts(v.lines);
  const at = L.indexOf('    … 2 more (d details)');
  assert.ok(at >= 0, L.join('\n'));
  assert.deepEqual(marked(v.lines[at]), { '… 2 more (': 'dim', d: 'key', ' details)': 'dim' });
});

test('§6.1: the cause bold, the verdicts red, the checker check, the step green, the places place, the stale tests one dimmed line', () => {
  const v = view(wall());
  const L = texts(v.lines);
  const M = v.lines;
  assert.equal(L[0], "BookingRepository has no find_by_id: pyright refuses round 2's body before");
  assert.equal(L[1], 'the tests run (cancel_booking.py:30).');
  assert.deepEqual(marked(M[0]), { [L[0]]: 'strong' });
  assert.deepEqual(marked(M[1]), { [L[1]]: 'strong' });
  const r = lineOf(L, /^rounds/);
  assert.deepEqual(marked(M[r]), { rounds: 'section', '[ ]': 'key', '0-9': 'key', ' page · ': 'dim', ' jump': 'dim' });
  assert.equal(L[r + 1], '  0  wire         bookings: BookingRepository → __init__, command()');
  assert.deepEqual(marked(M[r + 1]), { 0: 'key', wire: 'strong' });
  assert.equal(L[r + 2], '  1  red          booking = self.bookings.find_by_id(input.id)     pyright');
  assert.deepEqual(marked(M[r + 2]), { 1: 'key', red: 'red', pyright: 'check' });
  assert.equal(L[r + 3], '  ✓  test fixed   not_found → command(bookings=repository)');
  assert.deepEqual(marked(M[r + 3]), { '✓': 'green', 'test fixed': 'strong' });
  assert.equal(L[r + 4], '> 2  red          booking = self.bookings.find_by_id(input.id)     pyright');
  assert.deepEqual(marked(M[r + 4]), { 2: 'key', red: 'red', pyright: 'check' });
  assert.equal(v.entryAt[r + 4], v.selected);
  const f = lineOf(L, /^failing/);
  assert.equal(L[f], 'failing  round 2 · pyright refused it before the tests ran');
  assert.deepEqual(marked(M[f]), { failing: 'red', pyright: 'check' });
  assert.equal(L[f + 1], '    cancel_booking.py:30  Cannot access attribute "find_by_id" for class');
  assert.equal(L[f + 2], '                          "BookingRepository"');
  assert.deepEqual(marked(M[f + 1]), { 'cancel_booking.py:30': 'place' });
  const t = lineOf(L, /^tests /);
  assert.equal(L[t], 'tests    not run in round 2 · before round 1: not_found failing, succeeds');
  assert.equal(L[t + 1], '         passing (d details)');
  assert.equal(marked(M[t]).tests, 'section');
  assert.equal(marked(M[t])['not run in round 2 · before round 1: not_found failing, succeeds'], 'dim');
  assert.deepEqual(marked(M[t + 1]), { 'passing (': 'dim', d: 'key', ' details)': 'dim' });
  for (const l of L) assert.ok(width(l) <= W, l);
});

test('the tests that ran: the status words red and green, got red, expected green, their labels dimmed', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  const f = lineOf(L, /^failing {2}test_/);
  assert.equal(marked(v.lines[f]).failing, 'red');
  assert.equal(marked(v.lines[f])['failed before round 1'], 'dim');
  const got = lineOf(L, /^ {4}got /);
  assert.deepEqual(marked(v.lines[got]), { got: 'dim', 'Ok(value=None)': 'red' });
  assert.deepEqual(marked(v.lines[got + 1]), { expected: 'dim', NotFound: 'green' });
  const pass = lineOf(texts(view(fixture('plain')).lines), /^passing/);
  assert.equal(marked(view(fixture('plain')).lines[pass]).passing, 'green');
});

test('a failure without got/expected: error, its summary, the line', () => {
  const p = fixture('wired');
  const f = p.rounds![1].failed[0];
  f.got = null; f.expected = null; f.message = 'TypeError: boom'; f.summary = 'boom'; f.at = 26;
  const v = view(p);
  const at = texts(v.lines).indexOf('    error     boom · line 26');
  assert.ok(at >= 0, texts(v.lines).join('\n'));
  assert.deepEqual(marked(v.lines[at]), { error: 'dim', boom: 'red', ' · line 26': 'dim' });
});

test('more than three failing tests: the rest under d', () => {
  const p = fixture('wired');
  const t = p.tests![0];
  p.tests = [1, 2, 3, 4, 5].map(i => ({ ...t, test: `x__test.py::test_${i}`, note: null, assertion: null }));
  const L = texts(view(p).lines);
  assert.ok(L.includes('  … and 2 more (d details)'), L.join('\n'));
  assert.ok(!has(L, 'test_4'));
});

test('a test\'s lines past six end in … (d details)', () => {
  const p = fixture('wired');
  p.rounds![1].failed[0].got = null;
  p.rounds![1].failed[0].message = ['assert False', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7'].join('\n');
  const L = texts(view(p).lines);
  const at = L.indexOf('    assert False');
  assert.ok(at >= 0, L.join('\n'));
  // six lines: the assertion, then the message's first five
  assert.equal(L[at - 1], '    assert isinstance(result, NotFound)');
  assert.deepEqual(L.slice(at, at + 6), ['    assert False', '    line 2', '    line 3', '    line 4', '    line 5', '    … (d details)']);
});

test('more than nine entries: nine around the selection, the rest paged (Review Focus 2)', () => {
  const v = view(many());
  const L = texts(v.lines);
  assert.ok(L.includes('  … 6 earlier ([ pages)'), L.join('\n'));
  assert.ok(has(L, '> 14  red          return 14'), L.join('\n'));
  assert.deepEqual(marked(v.lines[L.indexOf('  … 6 earlier ([ pages)')]), { '  … 6 earlier (': 'dim', '[': 'key', ' pages)': 'dim' });
  // a number past 9 is no jump key: dimmed
  assert.equal(marked(v.lines[lineOf(L, /^> 14/)])['14'], 'dim');
  const mid = texts(view(many(), { selected: 3 }).lines);
  assert.ok(mid.includes('  … 6 later (] pages)'), mid.join('\n'));
  assert.ok(has(mid, '  0  wire'), mid.join('\n'));
  assert.equal(view(many()).entries, 15);
});

test('a thin answer renders: no lines, no rows, every line in a 58-cell pane (Review Focus 3)', () => {
  const v = view(thin(), { cols: 124 });
  assert.equal(plain(v.title), 'conjure · ● paused');
  assert.equal(v.tab, 'conjure');
  assert.deepEqual(v.lines, []);
  assert.deepEqual(v.rows, []);
  assert.equal(v.selected, -1);
  assert.equal(v.entries, 0);
  const n = view(fixture('wired'), { cols: 124 });
  assert.equal(n.width, 58);
  for (const l of texts(n.lines)) assert.ok(width(l) <= 58, l);
  for (const r of n.rows) for (const l of texts(r.lines)) assert.ok(width(l) <= 58, l);
  for (const name of ['plain', 'steps', 'check'] as const) {
    for (const l of texts(view(fixture(name), { cols: 124 }).lines)) assert.ok(width(l) <= 58, `${name}: ${l}`);
  }
});

test('§6.2: the proposal waits: its badge, its entry', () => {
  const q = wall();
  q.proposal = { kind: 'port', file: 'src/bistro/booking/ports/booking_repository/booking_repository.py', test: 'BookingRepository.find_by_id', refused: null,
    files: ['src/bistro/booking/ports/booking_repository/booking_repository.py', 'a.py', 'b.py'],
    diff: '--- a/x.py\n+++ b/x.py\n@@ -30,1 +30,3 @@\n     def save(self, booking: Booking) -> None: ...\n+\n+    def find_by_id(self, id: str) -> Booking | None: ...\n' };
  q.offers = [{ choice: 'accept', label: 'accept', detail: 'the method lands with the conjure; round 3 runs against it' }, { choice: 'reject', label: 'reject', detail: 'back to the rows; the port stands as it was' }];
  const v = view(q);
  assert.deepEqual(v.short, [
    { text: 'conjure · CancelBooking.handle · ', kind: 'title' },
    { text: '◆ proposal', kind: 'proposal' },
    { text: ' after round 2 of 6 · local · 31 s', kind: 'dim' },
  ]);
  const L = texts(v.lines);
  const e = lineOf(L, /^> ◆/);
  assert.equal(L[e], '> ◆  proposal     add find_by_id to BookingRepository → port, 2 adapters');
  assert.deepEqual(marked(v.lines[e]), { '◆': 'proposal', proposal: 'strong' });
  assert.equal(v.entryAt[e], v.selected);
});

// --- the diff pane, the reason, the legend and the help

test('§10.1: the right pane: round 2\'s change, every file it lands; the legend', () => {
  const v = view(fixture('wired'));
  const D = texts(v.diff.lines);
  assert.equal(plain(v.diff.title), 'round 2 · a keeps this · cancel_booking.py, cancel_booking__test.py');
  assert.equal(D[0], '(the same body as round 1: the diff is the same)');
  assert.equal(D[1], '--- a/src/bistro/booking/commands/cancel_booking.py');
  assert.ok(D.includes('+        booking = self.bookings.find_by_id(input.id)'));
  assert.ok(D.includes('--- a/src/bistro/booking/commands/cancel_booking__test.py'));
  // the whole legend is wider than the 74-cell pane: its short form (the page wraps it)
  assert.equal(v.legend, '[ ] rounds · 0-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('the diff title\'s keys in the key colour', () => {
  assert.deepEqual(view(fixture('wired')).diff.title, [
    { text: 'round 2 · ', kind: 'title' },
    { text: 'a', kind: 'key' },
    { text: ' keeps this · cancel_booking.py, cancel_booking__test.py', kind: 'title' },
  ]);
});

test('§10.2: round 1, then the wire: the diff follows the selection', () => {
  const g = view(fixture('wired'), { selected: 1 });
  assert.equal(plain(g.diff.title), 'round 1 · a keeps this · cancel_booking.py, cancel_booking__test.py');
  assert.equal(plain(g.diff.lines[0]), '(the same body as round 2: the diff is the same)');
  const w = view(fixture('wired'), { selected: 0 });
  // the wire's title is wider than the 72-cell diff pane: cut with …
  assert.equal(plain(w.diff.title), 'before round 1 · the wire · cancel_booking.py (+import, +bookings i…');
  const D = texts(w.diff.lines);
  assert.equal(D[0], '--- a/src/bistro/booking/commands/cancel_booking.py');
  assert.ok(!D.includes('+        booking = self.bookings.find_by_id(input.id)'));
  assert.ok(D.includes('--- a/src/bistro/booking/commands/cancel_booking__test.py'));
});

test('narrow: the diff pane takes the panel\'s width, its title cut there', () => {
  const w = view(fixture('wired'), { selected: 0, cols: 109 });
  assert.equal(plain(w.diff.title), 'before round 1 · the wire · cancel_booking.py (+import, +bookings in __init__), cancel_booking__test.py (+import, command takes bookings) · Tab back'.slice(0, 100) + '…');
});

test('§10.3: a proposal\'s diff on the right, its reason above its rows; no jump in the legend', () => {
  const v = view(proposed());
  assert.equal(plain(v.diff.title), 'proposal · fix the test: not_found · a accept · r reject');
  assert.equal(plain(v.diff.lines[5]), '-    cancel_booking = command()');
  assert.deepEqual(v.reason, [{ text: 'not_found now: cancel_booking = command(bookings=repository)', kind: 'strong' }]);
  assert.equal(conjureLegend({ narrow: false, proposal: true, running: false, wire: true }),
    '[ ] rounds · j k PgDn PgUp scroll · d details · ? help · q close (the pause stays)');
  // wider than the pane: the short form
  assert.equal(v.legend, '[ ] rounds · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('a refused proposal: the refusal first in the diff pane, red; a accepts it anyway', () => {
  const v = view(refused());
  assert.equal(plain(v.diff.title), 'proposal · fix the test: not_found, refused · a accept anyway');
  assert.deepEqual(v.diff.lines[0], [{ text: 'refused: it adds `"BAD" is not defined` at line 23', kind: 'red' }]);
  assert.deepEqual(v.diff.lines[1], []);
  assert.equal(plain(v.diff.lines[2]), '--- a/src/bistro/booking/commands/cancel_booking__test.py');
  assert.equal(v.reason, undefined);
});

test('a refusal whose reason is several lines is that many lines, all red', () => {
  const p = refused();
  const why = [
    'it adds `Argument of type "InMemoryBookingRepository" cannot be assigned to parameter "bookings"',
    '  Type "InMemoryBookingRepository" is not assignable to type "BookingRepository | None"',
    '    "size" is not present` at line 26',
  ].join('\n');
  p.proposal!.refused = why;
  const v = view(p);
  assert.deepEqual(texts(v.diff.lines.slice(0, 3)), [`refused: ${why.split('\n')[0]}`, ...why.split('\n').slice(1)]);
  assert.ok(v.diff.lines.slice(0, 3).every(l => l[0].kind === 'red'));
  for (const l of texts(v.lines)) assert.ok(!l.includes('\n'), l);
});

test('the diff pane\'s own notes: the same body dimmed', () => {
  assert.deepEqual(view(fixture('wired')).diff.lines[0], [{ text: '(the same body as round 1: the diff is the same)', kind: 'dim' }]);
  assert.deepEqual(view(fixture('wired')).diff.lines[1], [{ text: '--- a/src/bistro/booking/commands/cancel_booking.py' }]);
});

test('a round with no diff of its own shows the landing; with none at all, the body is your text (spec §7)', () => {
  // plain's round 1: its diff and its file's diff are empty text
  const p = fixture('plain');
  const v = view(p, { selected: 0 });
  assert.equal(plain(v.diff.title), 'round 1 · a keeps this · cancel_booking.py');
  assert.equal(plain(v.diff.lines[0]), '--- a/src/bistro/booking/commands/cancel_booking.py');
  delete p.landing;
  const n = view(p, { selected: 0 });
  assert.equal(plain(n.diff.title), 'round 1 · a keeps this');
  assert.deepEqual(texts(n.diff.lines), ['(none: the body is your text)']);
  assert.equal(n.rows[n.rows.length - 1].label, 'keep round 1');
});

test('steps: the step\'s files, after the round it follows; a hint step has no file', () => {
  const s = view(withStep(), { selected: 3 });
  assert.equal(plain(s.diff.title), 'after round 2 · test fixed: not_found (command(bookings=repository))');
  assert.ok(texts(s.diff.lines).includes('+    cancel_booking = command(bookings=repository)'));
  const h = withStep();
  h.steps!.push({ after: 0, kind: 'hint', text: 'hint: use the repository', files: [] });
  const hv = view(h, { selected: 1 });
  assert.ok(texts(hv.lines).includes('> ✓  hint         use the repository'), texts(hv.lines).join('\n'));
  assert.equal(plain(hv.diff.title), 'before round 1 · hint: use the repository');
  assert.deepEqual(texts(hv.diff.lines), ['(no file: it goes to the model with every round from here on)']);
});

test('a thin answer: nothing to show yet', () => {
  const v = view(thin(), { cols: 124 });
  assert.equal(plain(v.diff.title), 'nothing to show yet');
  assert.deepEqual(texts(v.diff.lines), ['nothing to show yet']);
  assert.equal(v.legend, '[ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('§10.5: narrow — Tab in the legend, the keep row and the diff title', () => {
  const v = view(fixture('wired'), { cols: 98 });
  assert.equal(v.legend, 'Tab diff · [ ] rounds · 0-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
  assert.equal(v.rows[v.rows.length - 1].detail, 'lands the diff (Tab shows it), red (saved; u undoes it)');
  assert.equal(plain(v.diff.title), 'round 2 · a keeps this · cancel_booking.py, cancel_booking__test.py · Tab back');
  assert.deepEqual(v.diff.title.slice(-2), [{ text: 'Tab', kind: 'key' }, { text: ' back', kind: 'title' }]);
  assert.equal(conjureLegend({ narrow: true, proposal: true, running: false, wire: false }),
    'Tab diff · [ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('no wire: 1-9 in the legend', () => {
  assert.equal(conjureLegend({ narrow: false, proposal: false, running: false, wire: false }),
    '[ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close (the pause stays)');
});

test('the port proposal: its title, the signature as its reason, not the Protocol\'s stub body', () => {
  const s = view(portProposal());
  assert.ok(has(texts(s.lines), '> ◆  proposal     add find_by_id to BookingRepository → port, 2 adapters'));
  assert.equal(plain(s.diff.title), 'proposal · add find_by_id to BookingRepository · a accept · r reject');
  assert.deepEqual(s.reason, [{ text: 'BookingRepository now: def find_by_id(self, id: str) -> Booking | None', kind: 'strong' }]);
});

test('§6.2: the diff title\'s keys and the proposal word in their colours', () => {
  assert.deepEqual(view(portProposal()).diff.title, [
    { text: 'proposal', kind: 'proposal' },
    { text: ' · add find_by_id to BookingRepository · ', kind: 'title' },
    { text: 'a', kind: 'key' },
    { text: ' accept · ', kind: 'title' },
    { text: 'r', kind: 'key' },
    { text: ' reject', kind: 'title' },
  ]);
});

test('§10.6: ? lists every key, one a line, its words wrapped under themselves', () => {
  const h = texts(helpLines(68, conjureKeys(CHORD)));
  assert.equal(h[0], 'keys');
  for (const k of ['c ', 'h ', 'C ', 'w W', 't T', 'p P', 's ', 'a ', 'r ', '[ ]', '0-9', 'Tab', 'd ', 'x ', 'j k', 'PgDn PgUp', 'q Esc']) {
    assert.ok(has(h, `  ${k}`), k);
  }
  assert.ok(has(h, 'scroll the diff'));
  assert.ok(has(h, 'close; the pause stays, Cmd+Alt+D C reopens it'));
  assert.ok(has(h, 'add the method a port lacks'));
  for (const l of h) assert.ok(width(l) <= 68, l);
  assert.deepEqual(h.slice(6, 8), [
    '  p P       add the method a port lacks (the first / second; the',
    "            pack's port-method), then the rounds go on",
  ]);
  const narrow = texts(helpLines(36, conjureKeys(CHORD)));
  narrow.forEach((l, i) => {
    assert.ok(width(l) <= 36, l);
    if (i > 0) assert.ok(/^ {2}\S/.test(l) || /^ {12}\S/.test(l), l);
  });
  assert.ok(narrow.length > h.length);
});

test('? is built from the one keys table: its section word, its key column', () => {
  const keys = conjureKeys(CHORD);
  const h = helpLines(68, keys);
  assert.deepEqual(marked(h[0]), { keys: 'section' });
  assert.deepEqual(marked(h[1]), { c: 'key' });
  assert.deepEqual(marked(h[texts(h).findIndex(l => l.startsWith('  q Esc'))]), { 'q Esc': 'key' });
  assert.equal(h.length, 1 + keys.length + 1); // p P takes two lines at 68
  assert.deepEqual(keys.map(k => k.keys.join(' ')), ['c', 'h', 'C', 'w W', 't T', 'p P', 's', 'a', 'r', '[ ]', '0-9', 'j k', 'PageDown PageUp', 'Tab', 'd', 'x', 'q Escape', '?']);
});

test('help: the view carries the key table at the diff pane\'s width; the diff title says any key closes it', () => {
  const v = view(fixture('wired'), { help: true });
  assert.deepEqual(v.help, helpLines(68, conjureKeys(CHORD)));
  assert.deepEqual(v.diff.title, [{ text: 'keys', kind: 'section' }, { text: ' · any key closes this', kind: 'title' }]);
  assert.equal(view(fixture('wired')).help, undefined);
  const n = view(fixture('wired'), { help: true, cols: 98 });
  assert.deepEqual(n.help, helpLines(90, conjureKeys(CHORD)));
});

// --- the running view

const run = (o: Partial<Running> = {}): Running => ({ label: 'continue', seconds: 21, accepted: false, ...o });

test('the running state: its badge and entry in the running colour, the spinner its own span', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'asking local (qwen3-coder:30b)…' }) });
  assert.equal(v.state, 'running');
  assert.deepEqual(v.short.slice(1), [
    { text: '⠋', kind: 'spinner' },
    { text: ' running', kind: 'running' },
    { text: ' · round 3 of 6 · local · 37 s', kind: 'dim' },
  ]);
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ⠋ running · round 3 of 6 · local · 37 s');
  const L = texts(v.lines);
  const e = lineOf(L, /^ {2}3 {2}⠋/);
  assert.equal(L[e], '  3  ⠋            asking local (qwen3-coder:30b)…');
  assert.deepEqual(marked(v.lines[e]), { 3: 'key', '⠋': 'spinner', 'asking local (qwen3-coder:30b)…': 'running' });
  assert.equal(v.entryAt[e], -1);
});

test('the running entry drops the round words from the message; no message is starting…', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'round 3 of 8 · asking local (q)…' }) });
  assert.ok(texts(v.lines).includes('  3  ⠋            asking local (q)…'), texts(v.lines).join('\n'));
  const s = view(fixture('wired'), { running: run({ round: 3 }) });
  assert.ok(texts(s.lines).includes('  3  ⠋            starting…'));
  // a run with no round (stop, reject, a re-conjure): no running entry, the badge after the last round
  const n = view(fixture('wired'), { running: run({ label: 'fix the test: not_found' }) });
  assert.ok(!texts(n.lines).some(l => l.includes('⠋')));
  assert.equal(plain(n.short), 'conjure · CancelBooking.handle · ⠋ running after round 2 of 6 · local · 37 s');
});

test('§6.3: an accepted proposal is a ✓ step while the round it lets run goes on', () => {
  const q = wall();
  q.proposal = { kind: 'port', file: 'x.py', test: 'BookingRepository.find_by_id', refused: null, diff: '',
    step: 'port method: BookingRepository.find_by_id(id: str) -> Booking | None', files: ['x.py', 'a.py', 'b.py'] };
  const v = view(q, { running: run({ label: 'accept', round: 3, accepted: true, seconds: 0 }) });
  // still selected: the diff pane keeps it until the round's own diff comes
  const L = texts(v.lines);
  const e = lineOf(L, /^> ✓ {2}port method/);
  assert.equal(L[e], '> ✓  port method  find_by_id → BookingRepository, 2 adapters');
  assert.equal(L[e + 1], '  3  ⠋            starting…');
  assert.equal(lineOf(L, /◆/), -1);
  assert.equal(v.entryAt[e], v.selected);
});

test('the status line replaces the rows: ▶ the label — what it does · seconds · x cancels', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'round 3 of 8 · asking local (q)…' }) });
  assert.deepEqual(v.rows, []);
  assert.equal(v.reason, undefined);
  assert.deepEqual(v.status, [
    { text: '▶', kind: 'running' },
    { text: ' ' },
    { text: 'continue', kind: 'strong' },
    { text: ' — asking local (q)…' },
    { text: ' · 21 s · ', kind: 'dim' },
    { text: 'x', kind: 'key' },
    { text: ' cancels', kind: 'dim' },
  ]);
  assert.equal(v.legend, 'x cancel · q hide (it goes on) · ? help');
  assert.equal(conjureLegend({ narrow: true, proposal: false, running: true, wire: true }), 'x cancel · q hide (it goes on) · ? help');
  assert.equal(view(fixture('wired')).status, undefined);
});

test('the status line: the label\'s own prefix goes, starting… before any word; a long message is cut first', () => {
  const v = view(fixture('wired'), { running: run({ label: 'stop', message: 'stop · landing nothing' }) });
  assert.equal(plain(v.status!), '▶ stop — landing nothing · 21 s · x cancels');
  assert.equal(plain(view(fixture('wired'), { running: run({ seconds: 3.7 }) }).status!), '▶ continue — starting… · 3 s · x cancels');
  const long = plain(view(fixture('wired'), { running: run({ message: 'word '.repeat(30) }) }).status!);
  assert.ok(long.endsWith('… · 21 s · x cancels'), long);
  assert.ok(width(long) <= W, long);
});
