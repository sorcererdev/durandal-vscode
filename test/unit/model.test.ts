import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plain } from '../../src/pause/viewModel';
import type { Line } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { helpLines, layout, rowLines } from '../../src/pause/model';
import { STEP_KEYS } from '../../src/pause/stepModel';

// Ported from durandal.nvim tests/pause_spec.lua (the data tests): the layout every source of
// the review window shares (the rows' columns, the panel's geometry, the help).
const PORT_DETAIL = 'find_by_id(self, id: str) -> Booking | None in the port and its adapters, then round 3';

// --- the offers' lines (row_lines)

const W = 74; // the left pane's text width at 200 columns
// a row line in three columns: the key and label, then the detail from column 31
const col = (label: string, detail: string): string => label + ' '.repeat(31 - width(label)) + detail;
// a line's marked stretches: { text: kind } (the Lua spec's marked())
const marked = (l: Line): Record<string, string> => Object.fromEntries(l.filter(s => s.kind).map(s => [s.text, s.kind as string]));
// five rows as the Lua spec's wired pause offered them, round 2 selected
const WIRED = [
  { key: 'c', label: 'continue', detail: '6 more rounds with local, from round 3' },
  { key: 'h', label: 'continue with a hint…', detail: 'your sentence goes to local with round 3' },
  { key: 't', label: 'fix the test: not_found', detail: 'hand repository to command(bookings=repository); you see the diff' },
  { key: 's', label: 'stop', detail: 'nothing lands, not the wire either; your text stands' },
  { key: 'a', label: 'keep round 2', detail: 'lands the diff on the right, red (saved; u undoes it)' },
];

test('§10.1: rows in three columns: the key, the label in 28 cells, the detail wrapped under itself', () => {
  const { lines, starts } = rowLines(WIRED, W);
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
  const rs = WIRED;
  const { lines, starts } = rowLines(rs, W);
  rs.forEach((r, i) => assert.deepEqual(lines[starts[i]][0], { text: r.key, kind: 'key' }));
  const narrow = rowLines(rs, 58);
  rs.forEach((r, i) => assert.deepEqual(narrow.lines[narrow.starts[i]][0], { text: r.key, kind: 'key' }));
});

test('§6.1: the rows in columns, the p row whole; keys key, labels plain, details dimmed', () => {
  const { lines, starts } = rowLines([WIRED[0], { key: 'p', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL }], W);
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
  const prow = [{ key: 'p', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL.replace('round 3', 'round 2') }];
  const text = rowLines(prow, W).lines.map(plain);
  assert.deepEqual(text, [
    'p  add find_by_id to BookingRepository',
    col('', 'find_by_id(self, id: str) -> Booking | None'),
    col('', 'in the port and its adapters, then round 2'),
  ]);
});

test('narrower than 70: label — detail wrapped under the label, the detail dimmed from its dash', () => {
  const { lines, starts } = rowLines(WIRED, 58);
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

// --- the panel's geometry

const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: string[], text: string): boolean => ls.some(l => l.includes(text));

test('layout: two panes from 110 columns, the left 52 % (at least 60), a cell of margin each side of the text', () => {
  assert.deepEqual(layout(200), { narrow: false, text: 74, right: 72 });
  assert.deepEqual(layout(124), { narrow: false, text: 58, right: 58 });
  assert.deepEqual(layout(110), { narrow: false, text: 56, right: 46 });
  assert.deepEqual(layout(98), { narrow: true, text: 90, right: 94 });
  assert.deepEqual(layout(400), { narrow: false, text: 74, right: 72 });
});

// --- the help (?)

test('§10.6: ? lists every key, one a line, its words wrapped under themselves', () => {
  const h = texts(helpLines(68, STEP_KEYS));
  assert.equal(h[0], 'keys');
  for (const k of ['a ', 'r ', 'h ', '[ ]', 'Tab', 'd ', 'j k', 'PgDn PgUp', 'q Esc', '? ']) {
    assert.ok(has(h, `  ${k}`), k);
  }
  assert.ok(has(h, 'scroll the diff'));
  for (const l of h) assert.ok(width(l) <= 68, l);
  assert.deepEqual(h.slice(3, 5), [
    '  h         harder: the same step again from [conjure] harder,',
    '            replacing this one',
  ]);
  const narrow = texts(helpLines(36, STEP_KEYS));
  narrow.forEach((l, i) => {
    assert.ok(width(l) <= 36, l);
    if (i > 0) assert.ok(/^ {2}\S/.test(l) || /^ {12}\S/.test(l), l);
  });
  assert.ok(narrow.length > h.length);
});

test('? is built from the one keys table: its section word, its key column', () => {
  const h = helpLines(68, STEP_KEYS);
  assert.deepEqual(marked(h[0]), { keys: 'section' });
  assert.deepEqual(marked(h[1]), { a: 'key' });
  assert.deepEqual(marked(h[texts(h).findIndex(l => l.startsWith('  q Esc'))]), { 'q Esc': 'key' });
  // h, d and q take two lines at 68
  assert.equal(h.length, 1 + STEP_KEYS.length + 3);
});
