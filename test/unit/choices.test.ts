import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChoicesInput, ChoicesResult, Sets } from '../../src/protocol';
import { chooseGenerator, complete, kind, nextInput } from '../../src/suggest/choices';
import { FakeUi } from '../fakeUi';

// ports durandal.nvim tests/picker_spec.lua
const inputs: ChoicesInput[] = [
  { name: 'service', optional: false, choices: ['billing', 'notifications'] },
  { name: 'command', optional: false },
  { name: 'note', optional: true },
  { name: 'message', optional: false, prompt: 'The message' },
];

test('the first required input not yet set, in declaration order', () => {
  assert.equal(nextInput(inputs, {})?.name, 'service');
  assert.equal(nextInput(inputs, { service: 'billing' })?.name, 'command');
  assert.equal(nextInput(inputs, { service: 'billing', command: 'x' })?.name, 'message');
  assert.equal(nextInput(inputs, { service: 'billing', command: 'x', message: 'm' }), undefined);
  assert.equal(nextInput([{ name: 'a', optional: false, default: 'd' }], {}), undefined, 'a default needs no asking');
});

test('the server\'s nulls are nothing: no default, no choices', () => {
  const nulls: ChoicesInput[] = [{ name: 'service', optional: false, default: null, choices: null, prompt: null, errors: null }];
  assert.equal(nextInput(nulls, {})?.name, 'service');
  assert.equal(kind(nulls[0]), 'text');
  assert.equal(kind(inputs[0]), 'menu');
});

const served = (r: (sets: Sets) => ChoicesResult | Error) => {
  const calls: { generator: string; sets: Sets }[] = [];
  return {
    calls,
    choices: async (generator: string, sets: Sets) => {
      calls.push({ generator, sets: { ...sets } });
      const v = r(sets);
      if (v instanceof Error) throw v;
      return v;
    },
  };
};

test('complete asks each missing input, narrowing after each answer, then hands back the sets', async () => {
  const ui = new FakeUi();
  ui.onPick = o => (o.title === 'service' ? 'billing' : undefined);
  const s = served(() => ({ inputs: [{ name: 'service', optional: false, choices: ['billing'] }, { name: 'message', optional: false, prompt: 'The message' }] }));
  const done = complete({ choices: s.choices, ui }, 'p/wire', { app: 'bistro' });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const t = ui.texts.at(-1)!;
  assert.equal(t.title, 'message: The message');
  t.finish('hello');
  assert.deepEqual(await done, { app: 'bistro', service: 'billing', message: 'hello' });
  assert.deepEqual(s.calls.map(c => c.sets), [{ app: 'bistro' }, { app: 'bistro', service: 'billing' }, { app: 'bistro', service: 'billing', message: 'hello' }]);
});

test('complete ends on Escape, on an input with no choices (its errors said), and on the server\'s refusal', async () => {
  const ui = new FakeUi();
  assert.equal(await complete({ choices: served(() => ({ inputs: [{ name: 'service', optional: false, choices: ['a'] }] })).choices, ui }, 'g', {}), undefined);
  assert.equal(await complete({ choices: served(() => ({ inputs: [{ name: 'service', optional: false, choices: [], errors: { billing: 'no repo' } }] })).choices, ui }, 'g', {}), undefined);
  assert.equal(ui.log.at(-1), 'error no choices for service\nno repo');
  assert.equal(await complete({ choices: served(() => new Error('unknown generator g')).choices, ui }, 'g', {}), undefined);
  assert.equal(ui.log.at(-1), 'error unknown generator g');
});

test('chooseGenerator: "Which is it?" between the two, read short', async () => {
  const ui = new FakeUi();
  ui.onPick = o => o.items[1].value;
  assert.equal(await chooseGenerator(ui, 'p/command', 'p/add-query'), 'p/add-query');
  assert.equal(ui.picks[0].title, 'Which is it?');
  assert.deepEqual(ui.picks[0].items.map(i => i.label), ['command', 'add query']);
});
