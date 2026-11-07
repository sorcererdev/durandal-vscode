import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../package.json';
import { BUILT, FORM_KEYS, KEYS, NOT_YET, PREFIX, SERVER_NAMED } from '../../src/commandTable';

test('the contributed commands: Health, Restart, the built ones and the not-yet ones, each in the Durandal category', () => {
  const ids = pkg.contributes.commands.map(c => c.command).sort();
  assert.deepEqual(ids, ['durandal.restartServer', 'durandal.showHealth', ...Object.keys(BUILT), ...Object.keys(NOT_YET)].sort());
  assert.ok(pkg.contributes.commands.every(c => c.category === 'Durandal'));
  for (const c of pkg.contributes.commands) {
    const want = NOT_YET[c.command] ?? BUILT[c.command];
    if (want) assert.equal(c.title, want.title, c.command);
  }
  assert.ok(!Object.keys(BUILT).some(id => id in NOT_YET), 'a built command is not also not-yet');
  for (const id of Object.keys(SERVER_NAMED)) assert.ok(!ids.includes(id), `${id} is registered, not contributed`);
});

test('the form keys\' commands are contributed, enabled only while the form is open (spec §9)', () => {
  const byId = new Map(pkg.contributes.commands.map(c => [c.command, c as { enablement?: string }]));
  for (const k of FORM_KEYS) assert.equal(byId.get(k.command)?.enablement, 'durandal.formOpen', k.command);
  const enabled = pkg.contributes.commands.filter(c => (c as { enablement?: string }).enablement !== undefined).map(c => c.command).sort();
  assert.deepEqual(enabled, FORM_KEYS.map(k => k.command).sort());
});

test('the keybindings are KEYS under the chord prefix, then the form keys, without clashes', () => {
  const want = [
    ...KEYS.map(k => ({ command: k.command, key: `${PREFIX.key} ${k.keys}`, mac: `${PREFIX.mac} ${k.keys}`, when: k.when })),
    ...FORM_KEYS,
  ];
  assert.deepEqual(pkg.contributes.keybindings, want);
  const byWhen = new Map<string, string[]>();
  for (const k of KEYS) byWhen.set(k.when, [...(byWhen.get(k.when) ?? []), k.keys]);
  for (const [when, keys] of byWhen) assert.equal(new Set(keys).size, keys.length, `a clash under ${when}`);
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  assert.ok(KEYS.filter(k => !k.keys.startsWith('p ')).every(k => k.when === 'durandal.inProject'));
  assert.ok(FORM_KEYS.every(k => k.when === 'durandal.formOpen && inQuickOpen'));
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
