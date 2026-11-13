import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordLabel, initOptions, settingsFrom } from '../../src/settings';
import { KEYS } from '../../src/commandTable';

const getter = (values: Record<string, unknown>) => (key: string, fallback: unknown) => key in values ? values[key] : fallback;

test('settings: defaults, and a bad debounce falls back to 300', () => {
  assert.deepEqual(settingsFrom(getter({})), { debounceMs: 300, model: '', fills: '' });
  assert.deepEqual(settingsFrom(getter({ debounceMs: 120.4, model: ' qwen ', fills: '/f.toml' })),
    { debounceMs: 120, model: 'qwen', fills: '/f.toml' });
  for (const bad of [-1, Number.NaN, '300', null]) assert.equal(settingsFrom(getter({ debounceMs: bad })).debounceMs, 300);
  assert.equal(settingsFrom(getter({ model: 3 })).model, '');
});

test('the chord label follows the platform, and names the review chord of KEYS', () => {
  assert.equal(chordLabel('darwin', 'P R'), 'Ctrl+Alt+D P R');
  assert.equal(chordLabel('linux', 'P R'), 'Ctrl+Alt+D P R');
  assert.equal(chordLabel('win32', 'P R'), 'Ctrl+Alt+D P R');
  assert.equal(KEYS.find(k => k.command === 'durandal.plan.review')?.keys, 'p r');
});

test('initializationOptions: debug off, the review key, the debounce; model and fills only when set', () => {
  assert.deepEqual(initOptions({ debounceMs: 300, model: '', fills: '' }, 'linux', {}),
    { debug: false, keys: { plan_review: 'Ctrl+Alt+D P R' }, debounce_ms: 300 });
  assert.deepEqual(initOptions({ debounceMs: 50, model: 'qwen', fills: '/f.toml' }, 'darwin', {}),
    { debug: false, keys: { plan_review: 'Ctrl+Alt+D P R' }, debounce_ms: 50, model: 'qwen', fills: '/f.toml' });
});

test('check_answers passes olifant\'s test hook through from the environment, only when set', () => {
  const s = settingsFrom(getter({}));
  assert.equal(initOptions(s, 'linux', {}).check_answers, undefined);
  assert.equal(initOptions(s, 'linux', { DURANDAL_CHECK_ANSWERS: '/tmp/checks.json' }).check_answers, '/tmp/checks.json');
});
