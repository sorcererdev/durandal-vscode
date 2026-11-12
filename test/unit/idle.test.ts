import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { Idle, IDLE_MS } from '../../src/plans/idle';

// fakeTimers: timers the test fires by hand
function fakeTimers() {
  const all: { fn: () => void; ms: number; cleared: boolean }[] = [];
  return {
    all,
    t: {
      set: (fn: () => void, ms: number) => { const h = { fn, ms, cleared: false }; all.push(h); return h; },
      clear: (h: unknown) => { (h as { cleared: boolean }).cleared = true; },
    },
    // fire: every live timer, as if its time came
    fire: () => { for (const h of all.filter(x => !x.cleared)) { h.cleared = true; h.fn(); } },
  };
}
const U = 'file:///p/plans/a.md';

test('a change arms a second\'s timer; it fires once (plans.lua idle_ms 1000; plans_spec :1316)', () => {
  const f = fakeTimers();
  const fired: string[] = [];
  const idle = new Idle(f.t, u => fired.push(u), () => 3);
  idle.changed(U, 3);
  assert.equal(f.all[0].ms, IDLE_MS);
  assert.equal(IDLE_MS, 1000);
  assert.ok(idle.armed(U));
  f.fire();
  assert.deepEqual(fired, [U]);
  assert.ok(!idle.armed(U));
});

test('each change re-arms: typing that never pauses sends nothing, then one (plans_spec :1350)', () => {
  const f = fakeTimers();
  const fired: string[] = [];
  let v = 1;
  const idle = new Idle(f.t, u => fired.push(u), () => v);
  for (; v < 5; v++) idle.changed(U, v);
  v = 4;
  assert.equal(f.all.filter(h => !h.cleared).length, 1);
  f.fire();
  assert.deepEqual(fired, [U]);
});

test('the version moved without a change heard: nothing sent', () => {
  const f = fakeTimers();
  const fired: string[] = [];
  const idle = new Idle(f.t, u => fired.push(u), () => 8);
  idle.changed(U, 7);
  f.fire();
  assert.deepEqual(fired, []);
});

test('forget (the plan closed) and clear (the server stopped) disarm', () => {
  const f = fakeTimers();
  const fired: string[] = [];
  const idle = new Idle(f.t, u => fired.push(u), () => 1);
  idle.changed(U, 1);
  idle.forget(U);
  idle.changed('file:///p/plans/b.md', 1);
  idle.clear();
  f.fire();
  assert.deepEqual(fired, []);
  assert.ok(!idle.armed(U));
});

test('plans are timed apart', () => {
  const f = fakeTimers();
  const fired: string[] = [];
  const idle = new Idle(f.t, u => fired.push(u), () => 1);
  idle.changed(U, 1);
  idle.changed('file:///p/plans/b.md', 1);
  f.fire();
  assert.deepEqual(fired.sort(), ['file:///p/plans/a.md', 'file:///p/plans/b.md']);
});
