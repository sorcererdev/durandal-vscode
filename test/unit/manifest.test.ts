import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';
import { BUILT, FORM_KEYS, KEYS, NOT_YET, PREFIX, SERVER_NAMED, SUGGEST_KEYS, TDD_WHEN } from '../../src/commandTable';

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

test('enablement: the form keys\' commands while the form is open, the suggestion\'s while one is shown', () => {
  const byId = new Map(pkg.contributes.commands.map(c => [c.command, c as { enablement?: string }]));
  for (const k of FORM_KEYS) assert.equal(byId.get(k.command)?.enablement, 'durandal.formOpen', k.command);
  for (const [id, b] of Object.entries(BUILT)) assert.equal(byId.get(id)?.enablement, b.enablement, id);
  assert.equal(BUILT['durandal.suggest.dismiss'].enablement, 'durandal.ghostVisible');
  const enabled = pkg.contributes.commands.filter(c => (c as { enablement?: string }).enablement !== undefined).map(c => c.command).sort();
  assert.deepEqual(enabled, Object.entries(BUILT).filter(([, b]) => b.enablement).map(([id]) => id).sort());
});

test('the keybindings are KEYS under the chord prefix, the form keys, then the suggestion keys, without clashes', () => {
  const want = [
    ...KEYS.map(k => ({ command: k.command, key: `${PREFIX.key} ${k.keys}`, mac: `${PREFIX.mac} ${k.keys}`, when: k.when })),
    ...FORM_KEYS,
    ...SUGGEST_KEYS,
  ];
  assert.deepEqual(pkg.contributes.keybindings, want);
  const byWhen = new Map<string, string[]>();
  for (const k of KEYS) byWhen.set(k.when, [...(byWhen.get(k.when) ?? []), k.keys]);
  for (const [when, keys] of byWhen) assert.equal(new Set(keys).size, keys.length, `a clash under ${when}`);
  // the project and TDD contexts overlap: their chords must not clash with each other either
  const project = KEYS.filter(k => !k.keys.startsWith('p ')).map(k => k.keys);
  assert.equal(new Set(project).size, project.length, 'a clash among the project chords');
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  const tdd = ['durandal.test.here', 'durandal.test.file', 'durandal.stub'];
  assert.ok(KEYS.filter(k => !k.keys.startsWith('p ') && !tdd.includes(k.command)).every(k => k.when === 'durandal.inProject'));
  assert.ok(FORM_KEYS.every(k => k.when === 'durandal.formOpen && inQuickOpen'));
});

test('Esc dismisses the snippet ghost only while it is ours and visible (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.dismiss' && k.when.startsWith('inlineSuggestionVisible')), {
    command: 'durandal.suggest.dismiss', key: 'escape',
    when: "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'",
  });
});

test('the settings and the activation', () => {
  assert.deepEqual(Object.keys(pkg.contributes.configuration.properties).sort(),
    ['durandal.actionLog', 'durandal.debounceMs', 'durandal.fills', 'durandal.ghosts', 'durandal.hints', 'durandal.model', 'durandal.path', 'durandal.trace.server']);
  // after startup too (issue #1): a project file opened in a window with no project folder
  assert.deepEqual(pkg.activationEvents, ['workspaceContains:**/.olifant/config.toml', 'onStartupFinished']);
  const log = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.actionLog'];
  assert.equal(log.type, 'boolean');
  assert.equal(log.default, true);
  const hints = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.hints'];
  assert.equal(hints.type, 'boolean');
  assert.equal(hints.default, true);
  const ghosts = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.ghosts'];
  assert.equal(ghosts.type, 'boolean');
  assert.equal(ghosts.default, true);
});

test('Esc dismisses a decoration suggestion only where Esc means nothing else (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.dismiss' && k.when.startsWith('durandal.ghostVisible')), {
    command: 'durandal.suggest.dismiss', key: 'escape',
    when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible",
  });
});

test('Tab accepts a decoration suggestion only when nothing else has Tab (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.accept'), {
    command: 'durandal.suggest.accept', key: 'tab',
    when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !inSnippetMode && !editorReadonly",
  });
  assert.equal(BUILT['durandal.suggest.accept'].enablement, 'durandal.ghostVisible');
});

test('t, shift+t and s also work from the results document and the untitled test file (final-review ruling)', () => {
  const when = 'durandal.inProject || resourceScheme == durandal-doc || resourceScheme == untitled';
  assert.equal(TDD_WHEN, when);
  for (const id of ['durandal.test.here', 'durandal.test.file', 'durandal.stub']) {
    assert.equal(KEYS.find(k => k.command === id)?.when, when, id);
    assert.equal(pkg.contributes.keybindings.find((k: { command: string }) => k.command === id)?.when, when, id);
  }
  for (const id of ['durandal.conjure', 'durandal.mutate', 'durandal.jump']) assert.equal(KEYS.find(k => k.command === id)?.when, 'durandal.inProject', id);
});

test('the TDD chords match durandal.nvim: t here, shift+t the file, Test All palette only (spec ruling 2)', () => {
  const keys = (id: string) => KEYS.filter(k => k.command === id).map(k => k.keys);
  assert.deepEqual(keys('durandal.test.here'), ['t']);
  assert.deepEqual(keys('durandal.test.file'), ['shift+t']);
  assert.deepEqual(keys('durandal.test.all'), []);
  assert.equal(BUILT['durandal.test.here'].title, 'Run the Test Here');
  for (const id of ['durandal.test.here', 'durandal.test.file', 'durandal.test.all', 'durandal.jump']) assert.ok(id in BUILT && !(id in NOT_YET), id);
});

test('the webview: a second bundle and the stylesheet, both packaged; lint checks the page too (spec §2)', () => {
  const build = pkg.scripts.build;
  assert.ok(build.startsWith('esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --target=node20 --sourcemap && '), build);
  assert.ok(build.includes('esbuild webview/main.ts --bundle --outfile=dist/webview.js --format=iife --platform=browser --target=es2022'), build);
  assert.ok(build.includes("require('fs').copyFileSync('webview/pause.css','dist/pause.css')"), build);
  assert.ok(pkg.scripts.lint.includes('tsc -p webview --noEmit'), pkg.scripts.lint);
  // out/test/unit → the repository root
  const ignore = readFileSync(join(__dirname, '..', '..', '..', '.vscodeignore'), 'utf8').split('\n').map(l => l.trim());
  for (const f of ['!dist/extension.js', '!dist/webview.js', '!dist/pause.css']) assert.ok(ignore.includes(f), `.vscodeignore lacks ${f}`);
});
