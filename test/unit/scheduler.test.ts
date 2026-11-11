import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scheduler } from '../../src/plans/scheduler';

const U = 'file:///p/plans/a.md';
const clock = () => { let t = 10_000; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const ok = (r: Record<string, unknown>) => ({ result: r });

test('a start sends; a second while one is in flight is remembered (plans_spec :1073)', () => {
  const c = clock();
  const s = new Scheduler(c.now);
  assert.equal(s.start(U, false, true, 1), 'send');
  assert.ok(s.inFlight(U));
  assert.equal(s.start(U, false, true, 1), 'remembered');
  const a = s.answer(U, ok({ landed: 0, readings: 0 }), 1);
  assert.equal(a.again, false);
  assert.ok(!s.inFlight(U));
});

test('a remembered forced start stays forced, even after an unforced one (plans_spec :1073)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, true, true, 1);
  s.start(U, true, true, 1);
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({}), 1).again, true);
});

test('no client: unforced skips silently, forced is not running', () => {
  const s = new Scheduler(clock().now);
  assert.equal(s.start(U, false, false, 1), 'skip');
  assert.equal(s.start(U, true, false, 1), 'notRunning');
  assert.ok(!s.inFlight(U));
});

test('the plan moved while the reconcile ran: one unforced rerun (plans_spec :1103)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, true, true, 4);
  assert.equal(s.answer(U, ok({}), 5).again, false);
  // unmoved: none
  s.start(U, false, true, 5);
  assert.equal(s.answer(U, ok({}), 5).again, undefined);
});

test('the server\'s own edit during the reconcile does not count as a move (lsp.lua :44-51; plans_spec :980, :994)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, false, true, 4);
  s.ownEdit(U, 5);
  assert.equal(s.answer(U, ok({ landed: 1 }), 5).again, undefined);
  // an own edit with nothing in flight changes nothing
  s.ownEdit(U, 9);
  assert.ok(!s.inFlight(U));
});

test('said when facts landed or the open readings changed; said once for the same answer (plans_spec :1130)', () => {
  const s = new Scheduler(clock().now);
  const said: (string | undefined)[] = [];
  for (const r of [{ landed: 0, readings: 1 }, { landed: 0, readings: 1 }, { landed: 0, readings: 1 }, { landed: 2, readings: 1 }, { landed: 0, readings: 0 }]) {
    s.start(U, false, true, 1);
    said.push(s.answer(U, ok(r), 1).say?.text);
  }
  assert.deepEqual(said, ['reconcile: 0 facts · 1 to review', undefined, undefined, 'reconcile: 2 facts · 1 to review', 'reconcile: 0 facts · 0 to review']);
});

test('nothing landed and nothing open, first time: nothing said (said-open starts at 0)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({ landed: 0, readings: 0 }), 1).say, undefined);
});

test('string counts are read (nvim tonumber); junk is 0', () => {
  const s = new Scheduler(clock().now);
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({ landed: '1', readings: '2' }), 1).say?.text, 'reconcile: 1 facts · 2 to review');
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({ landed: 'x', readings: null }), 1).say?.text, 'reconcile: 0 facts · 0 to review');
});

test('forced with readings opens the review; automatic never does (plans_spec :949, :970)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, true, true, 1);
  assert.equal(s.answer(U, ok({ landed: 1, readings: 2 }), 1).open, true);
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({ landed: 0, readings: 3 }), 1).open, false);
  s.start(U, true, true, 1);
  assert.equal(s.answer(U, ok({ landed: 0, readings: 0 }), 1).open, false);
});

test('a result that is not an object says nothing and opens nothing', () => {
  const s = new Scheduler(clock().now);
  s.start(U, true, true, 1);
  assert.deepEqual(s.answer(U, { result: null }, 1), { open: false, again: undefined });
});

test('an automatic reconcile\'s repeated error is said once; a forced one always; -32800 never (plans_spec :1173)', () => {
  const s = new Scheduler(clock().now);
  const err = (code?: number) => ({ error: { code, message: 'no project here' } });
  const said: (string | undefined)[] = [];
  for (const [forced, code] of [[false, -32803], [false, -32803], [true, -32803], [false, -32800], [false, -32803]] as [boolean, number][]) {
    s.start(U, forced, true, 1);
    said.push(s.answer(U, err(code), 1).say?.text);
  }
  assert.deepEqual(said, ['no project here', undefined, 'no project here', undefined, undefined]);
  // a result clears the last error: the same error is said again after it
  s.start(U, false, true, 1);
  s.answer(U, ok({}), 1);
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, err(-32803), 1).say?.level, 'error');
});

test('a remembered start runs after an error too (plan deviation 7)', () => {
  const s = new Scheduler(clock().now);
  s.start(U, false, true, 1);
  s.start(U, true, true, 1);
  assert.equal(s.answer(U, { error: { code: -32803, message: 'x' } }, 1).again, true);
});

test('entry debounce: recent for a second after a start (plans_spec :1060)', () => {
  const c = clock();
  const s = new Scheduler(c.now);
  assert.ok(!s.recent(U));
  s.start(U, false, true, 1);
  c.tick(999);
  assert.ok(s.recent(U));
  c.tick(1);
  assert.ok(!s.recent(U));
  // a skipped start (no client) does not count as a start
  const s2 = new Scheduler(c.now);
  s2.start(U, false, false, 1);
  assert.ok(!s2.recent(U));
});

test('cancel drops the one in flight and the remembered one; forget and clear drop everything', () => {
  const s = new Scheduler(clock().now);
  assert.equal(s.cancel(U), false);
  s.start(U, false, true, 1);
  s.start(U, true, true, 1);
  assert.equal(s.cancel(U), true);
  assert.ok(!s.inFlight(U));
  assert.equal(s.start(U, false, true, 1), 'send');
  s.forget(U);
  assert.ok(!s.inFlight(U) && !s.recent(U));
  s.start(U, false, true, 1);
  s.answer(U, ok({ readings: 1 }), 1);
  s.clear();
  // said-open forgotten: the same answer is said again
  s.start(U, false, true, 1);
  assert.equal(s.answer(U, ok({ readings: 1 }), 1).say?.text, 'reconcile: 0 facts · 1 to review');
});

test('per document: one plan\'s reconcile does not hold another\'s', () => {
  const s = new Scheduler(clock().now);
  s.start(U, false, true, 1);
  assert.equal(s.start('file:///p/plans/b.md', false, true, 1), 'send');
});
