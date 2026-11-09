import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConjureLanded, Paused, PausedOffer } from '../../src/protocol';
import type { PauseRow } from '../../src/pause/model';
import { classify, progressWords, resumeParams, runningLabel, runningRound, type Held } from '../../src/pause/resume';
import { conjureNotice } from '../../src/tdd/landing';
import { fixture } from '../pauseFixtures';

// the seven resume shapes durandal.nvim pins (pause_spec.lua :651-750, conjure_spec.lua
// :204-272), the answer's two kinds, and the running view's round and words

const NOT_FOUND = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_not_found';
const held: Held = { uri: 'file:///demo/src/bistro/booking/commands/cancel_booking.py', position: { line: 28, character: 8 }, token: 'conjure-1' };
// row: an offer as the model's row carries it, its nulls as the server sent them
const row = (o: PausedOffer): PauseRow => ({
  label: o.label, detail: o.detail, choice: o.choice, arg: o.arg as string | undefined, land: o.land as boolean | undefined,
  hint: o.hint as boolean | undefined, pressable: true,
});
const offer = (p: Paused, label: string): PauseRow => {
  const o = p.offers.find(x => x.label === label);
  assert.ok(o, `no offer ${label}`);
  return row(o);
};
const resume = (r: PauseRow, hint?: string) => resumeParams(held, r, hint).resume;

test('the whole params: the document, the opening conjure\'s position, the resume', () => {
  assert.deepEqual(resumeParams(held, offer(fixture('plain'), 'continue')), {
    textDocument: { uri: held.uri },
    position: { line: 28, character: 8 },
    resume: { token: 'conjure-1', choice: 'continue' },
  });
});

test('keep round N: stop, land true, the round as arg', () => {
  assert.deepEqual(resume(offer(fixture('check'), 'keep round 1')), { token: 'conjure-1', choice: 'stop', land: true, arg: '1' });
  // 0 then a keeps the wire alone: the model's row carries arg '0'
  assert.deepEqual(resume({ label: 'keep nothing but the wire', detail: '', choice: 'stop', arg: '0', land: true, pressable: true }),
    { token: 'conjure-1', choice: 'stop', land: true, arg: '0' });
});

test('stop: land false, no arg key (the server sent arg null)', () => {
  const r = resume(offer(fixture('plain'), 'stop'));
  assert.deepEqual(r, { token: 'conjure-1', choice: 'stop', land: false });
  assert.ok(!('arg' in r!));
  // a stop row without land (an older server) still says land false
  assert.deepEqual(resume({ label: 'stop', detail: '', choice: 'stop', pressable: true }), { token: 'conjure-1', choice: 'stop', land: false });
});

test('continue: the token and the choice alone; no land off stop, no hint unless typed', () => {
  const r = resume(offer(fixture('plain'), 'continue'));
  assert.deepEqual(r, { token: 'conjure-1', choice: 'continue' });
  assert.ok(!('arg' in r!) && !('land' in r!) && !('hint' in r!));
});

test('reconjure: the test id as arg', () => {
  assert.deepEqual(resume(offer(fixture('plain'), 'fix the test: not_found')), { token: 'conjure-1', choice: 'reconjure', arg: NOT_FOUND });
});

test('continue with a hint: the sentence as hint; an empty one sends none', () => {
  const r = offer(fixture('plain'), 'continue with a hint…');
  assert.deepEqual(resume(r, 'use the repository'), { token: 'conjure-1', choice: 'continue', hint: 'use the repository' });
  assert.deepEqual(resume(r, ''), { token: 'conjure-1', choice: 'continue' });
});

test('a proposal: reject and accept, the choice alone', () => {
  assert.deepEqual(resume({ label: 'reject', detail: '…', choice: 'reject', pressable: true }), { token: 'conjure-1', choice: 'reject' });
  assert.deepEqual(resume({ label: 'accept', detail: '…', choice: 'accept', pressable: true }), { token: 'conjure-1', choice: 'accept' });
});

test('wire and port: their arg', () => {
  assert.deepEqual(resume({ label: 'wire bookings: BookingRepository', detail: '', choice: 'wire', arg: 'bookings: BookingRepository', pressable: true }),
    { token: 'conjure-1', choice: 'wire', arg: 'bookings: BookingRepository' });
  assert.deepEqual(resume(offer(fixture('check'), 'add find_by_id to BookingRepository')),
    { token: 'conjure-1', choice: 'port', arg: 'BookingRepository.find_by_id' });
});

const landed = (o: Partial<ConjureLanded> = {}): ConjureLanded => ({
  file: '/demo/a.py', unit: 'f', edits: { documentChanges: [] }, summary: 'green', green: true,
  tests: { file: '/demo/a__test.py', passed: ['x'], scope: 'file', test: null, failed: [], broken: null, seconds: 0.4 },
  rounds: 4, rungs: ['local'], stopped: false, ...o,
});

test('classify: {paused} pauses again (a thin one too); anything else landed', () => {
  const p = fixture('steps');
  assert.deepEqual(classify({ paused: p }), { kind: 'paused', paused: p });
  const thin = { token: 'conjure-2', lines: { first: 1, last: 1 }, offers: [] } as Paused;
  assert.deepEqual(classify({ paused: thin }), { kind: 'paused', paused: thin });
  const l = landed();
  assert.deepEqual(classify(l), { kind: 'landed', landed: l });
});

test('a landing\'s words are M4\'s conjureNotice: stopped without edits, stopped with, conjured', () => {
  const words = (l: ConjureLanded, written?: string) => {
    const a = classify(l);
    assert.equal(a.kind, 'landed');
    return a.kind === 'landed' ? conjureNotice(a.landed, written).text : '';
  };
  assert.equal(words(landed({ stopped: true, edits: null })), 'stopped · nothing landed');
  assert.equal(words(landed({ stopped: true, green: false, summary: 'red: test_x' }), 'saved'), 'red: test_x · saved · undo reverts it');
  assert.equal(words(landed({ summary: 'green in round 4' }), 'saved'), 'conjured · green in round 4 · saved');
});

test('runningRound: the last round + 1 for continue, climb, wire, accept; none for the rest', () => {
  const p = fixture('plain');
  for (const c of ['continue', 'climb', 'wire', 'accept']) assert.equal(runningRound(c, p), 4, c);
  for (const c of ['stop', 'reconjure', 'reject', 'port']) assert.equal(runningRound(c, p), undefined, c);
  assert.equal(runningRound('continue', { token: 't', lines: { first: 1, last: 1 }, offers: [] }), 1);
});

test('progressWords: without the run\'s label and \'round N of M · \'; the round a message starts with', () => {
  assert.deepEqual(progressWords('round 3 of 8 · asking local (q)…', 'continue'), { text: 'asking local (q)…', round: 3 });
  assert.deepEqual(progressWords('continue · round 4 of 8 · asking', 'continue'), { text: 'asking' });
  assert.deepEqual(progressWords('asking local…', 'continue'), { text: 'asking local…' });
  // 'round N · ' alone stays: the entry line drops it, the status line keeps it
  assert.deepEqual(progressWords('round 12 · checking', 'climb to claude'), { text: 'round 12 · checking', round: 12 });
});

test('runningLabel: the row\'s label trimmed; its choice when the label is blank', () => {
  assert.equal(runningLabel({ label: '  keep round 3 ', detail: '', choice: 'stop', pressable: true }), 'keep round 3');
  assert.equal(runningLabel({ label: '  ', detail: '', choice: 'continue', pressable: true }), 'continue');
});
