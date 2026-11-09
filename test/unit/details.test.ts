import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused } from '../../src/protocol';
import { conjureDetails, reviewDetails, shortPath } from '../../src/pause/details';
import { fixture } from '../pauseFixtures';

// ported from durandal.nvim tests/details_spec.lua: the data assertions (section order, the
// check's wall, place rows, the landing's dedup, path shortening, verdicts as words, fence
// languages), as markdown lines instead of buffer rows and highlight groups

const ROOT = '/demo';
const md = (p: Paused, o: { lang?: string; root?: string } = {}): string[] =>
  conjureDetails(p, { root: ROOT, lang: 'python', ...o }).split('\n');
// the lines of section NAME: after its `## name` heading, up to the next `## ` or the footer rule
function section(ls: string[], name: string): string[] {
  const from = ls.indexOf(`## ${name}`);
  assert.ok(from >= 0, `no ## ${name} in:\n${ls.join('\n')}`);
  let to = from + 1;
  while (to < ls.length && !ls[to].startsWith('## ') && ls[to] !== '---') to++;
  return ls.slice(from + 1, to);
}
const headings = (ls: string[], level: string): string[] =>
  ls.filter(l => l.startsWith(`${level} `)).map(l => l.slice(level.length + 1));
const copy = (p: Paused): Paused => JSON.parse(JSON.stringify(p)) as Paused;

test('sections in a fixed order: situation, rounds, tests, unit, steps, diffs; a blank line around each heading', () => {
  const ls = md(fixture('steps'));
  assert.equal(ls[0], '# conjure · CancelBooking.handle');
  assert.deepEqual(headings(ls, '##'), ['situation', 'rounds', 'tests', 'unit', 'steps', 'diffs']);
  for (const h of headings(ls, '##')) {
    const at = ls.indexOf(`## ${h}`);
    assert.equal(ls[at - 1], '');
    assert.equal(ls[at + 1], '');
  }
});

test('the footer: a rule, then the token and its expiry; the text ends in a newline', () => {
  const text = conjureDetails(fixture('steps'), { root: ROOT, lang: 'python' });
  assert.ok(text.endsWith('\n\n---\n\ntoken conjure-3 · expires in 600 s\n'), text.slice(-80));
});

test('a thin pause: the title, an empty situation and the footer, nothing else', () => {
  const thin = { token: 'conjure-1', lines: { first: 3, last: 4 }, offers: [] } as Paused;
  assert.equal(conjureDetails(thin, { lang: '' }), '# conjure\n\n## situation\n\n---\n\ntoken conjure-1 · expires in ? s\n');
});

test('the title names the unit; without one, the file\'s name', () => {
  const p = copy(fixture('plain'));
  p.title = null as unknown as Paused['title'];
  assert.equal(md(p)[0], '# conjure · cancel_booking.py');
});

test('situation: the first diagnosis sentence bold, the rest plain, the trigger', () => {
  const s = section(md(fixture('check')), 'situation');
  assert.deepEqual(s.slice(0, 6), [
    '',
    '**BookingRepository has no find_by_id: pyright refuses round 1\'s body before the tests run (cancel_booking.py:30).**',
    '',
    'No body can pass not_found: it builds repository = Mock() and never hands it to command(), so handle never sees it. CancelBooking takes bookings: BookingRepository since the wire; the test should pass its fake as command(bookings=…).',
    '',
    'trigger: a port lacks a method: BookingRepository.find_by_id',
  ]);
});

test('situation: the outcome first; why stands in for an empty diagnosis', () => {
  const p = copy(fixture('plain'));
  p.outcome = 'the re-conjure of succeeds was refused';
  p.diagnosis = [];
  assert.deepEqual(section(md(p), 'situation'), [
    '',
    'the re-conjure of succeeds was refused',
    '',
    '**local wrote the same body in rounds 2 and 3.**',
    '',
    'trigger: repeat',
    '',
  ]);
});

test('a check\'s wall: the round and the tool, then each problem as `- place  message`', () => {
  const ls = md(fixture('check'));
  const wall = ls.indexOf('round 1: pyright refused it before the tests ran');
  assert.ok(wall > 0, ls.join('\n'));
  assert.deepEqual(ls.slice(wall + 1, wall + 5), [
    '',
    '- cancel_booking.py:30  Cannot access attribute "find_by_id" for class "BookingRepository"',
    '- cancel_booking.py:30  Type of "booking" is unknown',
    '- cancel_booking.py:30  Type of "find_by_id" is unknown',
  ]);
  // a problem without a line: the place alone; elsewhere in the project: its relative path
  const p = copy(fixture('check'));
  p.failure = { round: 1, kind: 'check', tool: 'pyright', problems: [{ file: '/demo/src/bistro/main.py', line: null, message: 'boom' }] };
  assert.ok(md(p).includes('- src/bistro/main.py  boom'));
  // a tests failure has no wall
  assert.ok(!md(fixture('steps')).some(l => l.includes('refused it before the tests ran')));
});

test('hints: the hint steps in the situation as said (the server\'s text reads hint: …), and in the steps', () => {
  const p = copy(fixture('steps'));
  p.steps = [...(p.steps ?? []), { after: 3, kind: 'hint', text: 'hint: use the repository', files: [] }, { after: 3, kind: 'hint', text: 'mind the id', files: [] }];
  const ls = md(p);
  const s = section(ls, 'situation');
  assert.deepEqual(s.slice(-3), ['hint: use the repository', 'hint: mind the id', '']);
  assert.ok(section(ls, 'steps').includes('- ✓ after round 3 · hint: use the repository'));
  assert.ok(!section(md(fixture('steps')), 'situation').some(l => l.startsWith('hint:')));
});

test('rounds: a heading per round with its verdict as a word, the body fenced in the file\'s language', () => {
  const ls = md(fixture('steps'));
  const r = section(ls, 'rounds');
  assert.deepEqual(headings(r, '###'), ['round 1 · local · red', 'round 2 · local · red', 'round 3 · local · red']);
  const at = r.indexOf('### round 3 · local · red');
  assert.deepEqual(r.slice(at + 1, at + 8), [
    '',
    '```python',
    'booking = self.bookings.find_by_id(input.id)',
    'if booking is None:',
    '    return NotFound("Booking not found")',
    'return Ok(None)',
    '```',
  ]);
});

test('rounds: the runner\'s output in a plain fence, its paths shortened', () => {
  const r = section(md(fixture('steps')), 'rounds');
  const at = r.indexOf('### round 3 · local · red');
  assert.deepEqual(r.slice(at + 8, at + 15), [
    '',
    '```',
    'cancel_booking__test.py:24: in test_cancel_booking_succeeds',
    '    assert result == Ok(None)',
    'E   AssertionError: assert NotFound(reason=\'Booking not found\') == Ok(value=None)',
    'E    +  where Ok(value=None) = Ok(None)',
    '```',
  ]);
});

test('rounds: the decider\'s choice and confidence; Jev highest first, then by name, no leading zero', () => {
  const plain = section(md(fixture('plain')), 'rounds');
  assert.ok(plain.includes('decide: again 0.21'));
  assert.ok(plain.includes('decide: ask 0.19'));
  assert.equal(plain.filter(l => l.startsWith('decide:')).length, 2);   // round 3 has no decide
  assert.ok(!plain.some(l => l.startsWith('Jev:')));                      // its probabilities are {}
  const p = copy(fixture('plain'));
  p.rounds![0].decide = { choice: 'ask', confidence: 0.68, probabilities: { again: 0.29, port: 0.02, ask: 0.68, zed: 0.29, all: 1 } };
  assert.ok(md(p).includes('Jev: all 1.00 · ask .68 · again .29 · zed .29 · port .02'));
});

test('round bodies, test sources and the unit header fence in LANG; plain fences when LANG is empty; diffs fence as diff', () => {
  const count = (ls: string[], f: string) => ls.filter(l => l === f).length;
  const ls = md(fixture('steps'));
  // three bodies, two test sources, the unit's header
  assert.equal(count(ls, '```python'), 6);
  assert.equal(count(ls, '```diff'), 10);
  const bare = md(fixture('steps'), { lang: '' });
  assert.equal(count(bare, '```python'), 0);
  // the six code blocks and round 3's output open and close plain; the ten diffs close
  assert.equal(count(bare, '```'), 7 * 2 + 10);
});

test('a fence is longer than any backtick run inside it', () => {
  const p = copy(fixture('plain'));
  p.rounds![0].attempt = 'doc = """\n```\nx\n```\n"""';
  p.rounds![1].attempt = 'a = "````"';
  const r = section(md(p), 'rounds');
  const one = r.indexOf('````python');
  assert.deepEqual(r.slice(one, one + 7), ['````python', 'doc = """', '```', 'x', '```', '"""', '````']);
  assert.ok(r.includes('`````python'));
});

test('tests: place::name · status, the note, the source fenced', () => {
  const t = section(md(fixture('plain')), 'tests');
  assert.deepEqual(headings(t, '###'), [
    'cancel_booking__test.py::test_cancel_booking_succeeds · failing',
    'cancel_booking__test.py::test_cancel_booking_not_found · passing',
  ]);
  const at = t.indexOf('### cancel_booking__test.py::test_cancel_booking_not_found · passing');
  assert.deepEqual(t.slice(at + 1, at + 6), [
    '',
    'builds repository = Mock() and never hands it to command(); CancelBooking() takes no ports',
    '',
    '```python',
    'def test_cancel_booking_not_found() -> None:',
  ]);
});

test('unit: the header fenced, then its ports (none when it has none)', () => {
  assert.deepEqual(section(md(fixture('check')), 'unit'), [
    '',
    '```python',
    'class CancelBooking:',
    '    def __init__(self, bookings: BookingRepository) -> None:',
    '```',
    '',
    'ports: bookings: BookingRepository',
    '',
  ]);
  assert.ok(section(md(fixture('plain')), 'unit').includes('ports: none'));
});

test('steps: each in force from the next round on; the accepted steps, then the wired ports and their files', () => {
  assert.deepEqual(section(md(fixture('steps')), 'steps'), [
    '',
    'each in force from the next round on',
    '',
    '- ✓ before round 1 · wire bookings: BookingRepository',
    '- ✓ after round 1 · test fixed: not_found (command(bookings=repository))',
    '- ✓ after round 2 · port method: BookingRepository.find_by_id(id: str) -> Booking | None',
    '- wired bookings: BookingRepository · cancel_booking.py, cancel_booking__test.py',
    '',
  ]);
  // wired without steps: no in-force line; no steps and nothing wired: no section
  assert.deepEqual(section(md(fixture('wired')), 'steps'), ['', '- wired bookings: BookingRepository · cancel_booking.py, cancel_booking__test.py', '']);
  assert.ok(!md(fixture('plain')).includes('## steps'));
});

test('diffs: rounds, then step files, wired files only when no wire step listed them; keep\'s landing said on the kept round, not repeated', () => {
  const steps = fixture('steps');
  assert.equal(steps.landing!.diff, steps.rounds![2].diff);
  assert.deepEqual(headings(section(md(steps), 'diffs'), '###'), [
    'round 1',
    'round 2',
    'round 3 · what keep round 3 lands',
    'wire bookings: BookingRepository · cancel_booking.py',
    'wire bookings: BookingRepository · cancel_booking__test.py',
    'test fixed: not_found (command(bookings=repository)) · cancel_booking__test.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/booking_repository.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/booking_repository__test.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/in_memory_booking_repository.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/sqlite_booking_repository.py',
  ]);
  assert.deepEqual(headings(section(md(fixture('wired')), 'diffs'), '###'), [
    'round 1',
    'round 2 · what keep round 2 lands',
    'wire bookings · cancel_booking.py',
    'wire bookings · cancel_booking__test.py',
  ]);
});

test('diffs: a landing that is not the kept round\'s diff comes last; a round diff of \'\' says the body is your text', () => {
  const p = copy(fixture('steps'));
  p.landing = { diff: '--- a/x.py\n+++ b/x.py\n@@ -1 +1 @@\n-a\n+b\n' };
  const d = section(md(p), 'diffs');
  assert.equal(headings(d, '###')[2], 'round 3');
  assert.equal(headings(d, '###').at(-1), 'keep round 3 would land');
  assert.deepEqual(d.slice(-10, -1), ['### keep round 3 would land', '', '```diff', '--- a/x.py', '+++ b/x.py', '@@ -1 +1 @@', '-a', '+b', '```']);
  const plain = section(md(fixture('plain')), 'diffs');
  assert.deepEqual(headings(plain, '###'), ['round 1', 'round 2', 'round 3 · what keep round 3 lands']);
  assert.deepEqual(plain.slice(1, 4), ['### round 1', '', '(none: the body is your text)']);
});

test('paths relative to the project, a file beside the unit by its name; no line holds the root', () => {
  for (const name of ['plain', 'wired', 'steps', 'check'] as const) {
    for (const l of md(fixture(name))) assert.ok(!l.includes('/demo'), `${name}: ${l}`);
  }
  // absolute paths inside the runner's output shorten too
  const p = copy(fixture('steps'));
  p.rounds![2].failed[0].output = '/demo/src/bistro/booking/commands/cancel_booking__test.py:24: in x\n/demo/lib/other.py:3: in y\n';
  const r = section(md(p), 'rounds');
  assert.ok(r.includes('cancel_booking__test.py:24: in x'));
  assert.ok(r.includes('lib/other.py:3: in y'));
});

test('shortPath: relative to the root, bare beside the unit, untouched outside the project', () => {
  const unit = '/demo/src/a/c.py';
  assert.equal(shortPath('/demo/src/a/b.py', unit, ROOT), 'b.py');
  assert.equal(shortPath('src/a/b.py', unit, ROOT), 'b.py');
  assert.equal(shortPath('/demo/src/a/sub/b.py', unit, ROOT), 'src/a/sub/b.py');
  assert.equal(shortPath('/demo/lib/x.py', unit, ROOT), 'lib/x.py');
  assert.equal(shortPath('/elsewhere/x.py', unit, ROOT), '/elsewhere/x.py');
  assert.equal(shortPath('/demo/src/a/b.py', unit, '/demo/'), 'b.py');
  // no root: beside the unit still bare; no unit file: relative only
  assert.equal(shortPath('/demo/src/a/b.py', unit, undefined), 'b.py');
  assert.equal(shortPath('src/a/b.py', unit, undefined), 'src/a/b.py');
  assert.equal(shortPath('/demo/src/a/b.py', undefined, ROOT), 'src/a/b.py');
});

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
