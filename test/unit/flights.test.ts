import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANCELLED, Flights, Source, settle } from '../../src/tdd/flights';

interface Tok { cancelled: boolean; disposed: boolean }
const make = (): Source<Tok> => {
  const token: Tok = { cancelled: false, disposed: false };
  return { token, cancel: () => { token.cancelled = true; }, dispose: () => { token.disposed = true; } };
};

test('a superseding start cancels the older flights of its kind only', () => {
  const fs = new Flights(make);
  const a = fs.start('test', true);
  const m = fs.start('mutate', true);
  const b = fs.start('test', true);
  assert.equal(a.why, 'superseded');
  assert.equal(a.token.cancelled, true);
  assert.equal(b.why, undefined);
  assert.equal(m.why, undefined);
});

test('a start without supersede leaves the others in the air', () => {
  const fs = new Flights(make);
  const a = fs.start('conjure');
  fs.start('conjure');
  assert.equal(a.why, undefined);
  assert.equal(fs.count('conjure'), 2);
});

test('cancelAll gives every flight the reason; the first reason stays', () => {
  const fs = new Flights(make);
  const a = fs.start('test');
  const b = fs.start('conjure');
  a.cancel('user');
  fs.cancelAll('stopped');
  assert.equal(a.why, 'user');
  assert.equal(b.why, 'stopped');
  assert.equal(b.token.cancelled, true);
});

test('settle: the answer; the flight leaves the air and its source is disposed', async () => {
  const fs = new Flights(make);
  const f = fs.start('test');
  assert.deepEqual(await settle(f, Promise.resolve({ n: 1 }), 'olifant/tests/run'), { kind: 'answer', value: { n: 1 } });
  assert.equal(fs.count('test'), 0);
  assert.equal(f.token.disposed, true);
});

test('settle: no answer is an error naming the method', async () => {
  const f = new Flights(make).start('test');
  assert.deepEqual(await settle(f, Promise.resolve(null), 'olifant/tests/run'), { kind: 'error', message: 'olifant/tests/run answered nothing' });
});

test('settle: the server\'s refusal, verbatim', async () => {
  const f = new Flights(make).start('test');
  const err = Object.assign(new Error('no test file for this module yet: a__test.py'), { code: -32803 });
  assert.deepEqual(await settle(f, Promise.reject(err), 'm'), { kind: 'error', message: 'no test file for this module yet: a__test.py' });
});

test('settle: -32800 with no reason of ours is the server\'s cancel', async () => {
  const f = new Flights(make).start('conjure');
  const err = Object.assign(new Error('cancelled'), { code: CANCELLED });
  assert.deepEqual(await settle(f, Promise.reject(err), 'm'), { kind: 'cancelled', why: 'server' });
});

test('settle: a cancelled flight drops whatever comes (a late answer, the -32800, a dead connection)', async () => {
  const fs = new Flights(make);
  const a = fs.start('test', true);
  const late = settle(a, new Promise<{ n: number }>(r => setTimeout(() => r({ n: 1 }), 5)), 'm');
  fs.start('test', true);
  assert.deepEqual(await late, { kind: 'cancelled', why: 'superseded' });
  const b = fs.start('mutate');
  const dead = settle(b, new Promise((_, rej) => setTimeout(() => rej(new Error('Connection got disposed.')), 5)), 'm');
  fs.cancelAll('stopped');
  assert.deepEqual(await dead, { kind: 'cancelled', why: 'stopped' });
});
