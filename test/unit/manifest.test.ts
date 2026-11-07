import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../package.json';
import { KEYS, NOT_YET, PREFIX, SERVER_NAMED } from '../../src/commandTable';

test('the contributed commands: Health, Restart, and every not-yet command, each in the Durandal category', () => {
  const ids = pkg.contributes.commands.map(c => c.command).sort();
  assert.deepEqual(ids, ['durandal.restartServer', 'durandal.showHealth', ...Object.keys(NOT_YET)].sort());
  assert.ok(pkg.contributes.commands.every(c => c.category === 'Durandal'));
  for (const c of pkg.contributes.commands) {
    if (NOT_YET[c.command]) assert.equal(c.title, NOT_YET[c.command].title, c.command);
  }
  for (const id of Object.keys(SERVER_NAMED)) assert.ok(!ids.includes(id), `${id} is registered, not contributed`);
});

test('the keybindings are KEYS under the chord prefix, without clashes', () => {
  const want = KEYS.map(k => ({ command: k.command, key: `${PREFIX.key} ${k.keys}`, mac: `${PREFIX.mac} ${k.keys}`, when: k.when }));
  assert.deepEqual(pkg.contributes.keybindings, want);
  const byWhen = new Map<string, string[]>();
  for (const k of KEYS) byWhen.set(k.when, [...(byWhen.get(k.when) ?? []), k.keys]);
  for (const [when, keys] of byWhen) assert.equal(new Set(keys).size, keys.length, `a clash under ${when}`);
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  assert.ok(KEYS.filter(k => !k.keys.startsWith('p ')).every(k => k.when === 'durandal.inProject'));
});

test('the settings and the activation', () => {
  assert.deepEqual(Object.keys(pkg.contributes.configuration.properties).sort(),
    ['durandal.actionLog', 'durandal.debounceMs', 'durandal.fills', 'durandal.model', 'durandal.path', 'durandal.trace.server']);
  // after startup too (issue #1): a project file opened in a window with no project folder
  assert.deepEqual(pkg.activationEvents, ['workspaceContains:**/.olifant/config.toml', 'onStartupFinished']);
  const log = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.actionLog'];
  assert.equal(log.type, 'boolean');
  assert.equal(log.default, true);
});
