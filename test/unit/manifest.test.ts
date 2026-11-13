import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';
import { GLYPH_NAMES } from '../../src/plans/glyphs';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES } from '../../src/protocol';
import { BUILT, FORM_KEYS, KEYS, PREFIX, SERVER_NAMED, SUGGEST_KEYS, TDD_HERE_WHEN, TDD_WHEN } from '../../src/commandTable';

test('the contributed commands: Health, Restart and the built ones, each in the Durandal category', () => {
  const ids = pkg.contributes.commands.map(c => c.command).sort();
  assert.deepEqual(ids, ['durandal.restartServer', 'durandal.showHealth', ...Object.keys(BUILT)].sort());
  assert.ok(pkg.contributes.commands.every(c => c.category === 'Durandal'));
  for (const c of pkg.contributes.commands) {
    const want = BUILT[c.command];
    if (want) assert.equal(c.title, want.title, c.command);
  }
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
  // s and t: the TDD chord outside a plan, the plan's inside one (their whens exclude each other)
  const project = KEYS.filter(k => !k.keys.startsWith('p '));
  for (const keys of new Set(project.map(k => k.keys))) {
    const ks = project.filter(k => k.keys === keys);
    if (ks.length === 1) continue;
    assert.deepEqual(ks.map(k => k.when).sort(), [TDD_HERE_WHEN, 'durandal.isPlan'].sort(), `a clash on ${keys}`);
  }
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  const tdd = ['durandal.test.here', 'durandal.test.file', 'durandal.stub', 'durandal.plan.stub', 'durandal.plan.test'];
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
    ['durandal.actionLog', 'durandal.debounceMs', 'durandal.fills', 'durandal.ghosts', 'durandal.hints', 'durandal.model', 'durandal.path',
      'durandal.plans.conceal', 'durandal.plans.dir', 'durandal.plans.foldDone', 'durandal.plans.glyphs', 'durandal.plans.reconcile', 'durandal.plans.reviewAnswers', 'durandal.trace.server']);
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

test('t, shift+t and s also work from the results document and the untitled test file; t and s are the plan\'s in a plan', () => {
  const when = 'durandal.inProject || resourceScheme == durandal-doc || resourceScheme == untitled';
  assert.equal(TDD_WHEN, when);
  assert.equal(TDD_HERE_WHEN, `(${when}) && !durandal.isPlan`);
  const bound = (id: string) => pkg.contributes.keybindings.find((k: { command: string }) => k.command === id)?.when;
  for (const id of ['durandal.test.here', 'durandal.stub']) {
    assert.equal(KEYS.find(k => k.command === id)?.when, TDD_HERE_WHEN, id);
    assert.equal(bound(id), TDD_HERE_WHEN, id);
  }
  assert.equal(KEYS.find(k => k.command === 'durandal.test.file')?.when, when);
  for (const id of ['durandal.conjure', 'durandal.mutate', 'durandal.jump']) assert.equal(KEYS.find(k => k.command === id)?.when, 'durandal.inProject', id);
});

test('M6b: files, stub and test on a step are built; p s, p t, and s and t in a plan', () => {
  for (const id of ['durandal.plan.files', 'durandal.plan.stub', 'durandal.plan.test']) assert.ok(id in BUILT, id);
  const keys = (id: string) => KEYS.filter(k => k.command === id).map(k => `${k.keys}|${k.when}`);
  assert.deepEqual(keys('durandal.plan.stub'), ['p s|durandal.isPlan', 's|durandal.isPlan']);
  assert.deepEqual(keys('durandal.plan.test'), ['p t|durandal.isPlan', 't|durandal.isPlan']);
  assert.equal(BUILT['durandal.plan.reconcile'].title, 'Plan: Reconcile');
});

test('the TDD chords match durandal.nvim: t here, shift+t the file, Test All palette only (spec ruling 2)', () => {
  const keys = (id: string) => KEYS.filter(k => k.command === id).map(k => k.keys);
  assert.deepEqual(keys('durandal.test.here'), ['t']);
  assert.deepEqual(keys('durandal.test.file'), ['shift+t']);
  assert.deepEqual(keys('durandal.test.all'), []);
  assert.equal(BUILT['durandal.test.here'].title, 'Run the Test Here');
  for (const id of ['durandal.test.here', 'durandal.test.file', 'durandal.test.all', 'durandal.jump']) assert.ok(id in BUILT, id);
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

test('M5: Plan: Review is built; the lens command is registered by its own handler', () => {
  assert.equal(BUILT['durandal.plan.review'].title, 'Plan: Review');
  assert.ok(!('olifant.plans.review' in SERVER_NAMED));
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.review'), { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' });
});

// the context keys the extension sets (spec §8); pauseOpen is informational, nothing binds it
const KNOWN_KEYS = ['inProject', 'isPlan', 'pauseOpen', 'formOpen', 'ghostVisible', 'ghostKind', 'ghostBand', 'planGhostRow', 'ghostInline'];

test('M5: the when keys: each one the manifest reads is known and set; isPlan and pauseOpen among them (spec §8)', () => {
  const clauses = [
    ...pkg.contributes.keybindings.map(k => (k as { when?: string }).when ?? ''),
    ...pkg.contributes.commands.map(c => (c as { enablement?: string }).enablement ?? ''),
  ];
  const read = new Set(clauses.flatMap(c => [...c.matchAll(/durandal\.([A-Za-z]+)/g)].map(m => m[1])));
  for (const k of read) assert.ok(KNOWN_KEYS.includes(k), `durandal.${k} is read but not known`);
  for (const k of ['isPlan', 'pauseOpen']) assert.ok(KNOWN_KEYS.includes(k), k);
  // out/test/unit → the repository's src: every known key is set by a setContext there
  const src = join(__dirname, '..', '..', '..', 'src');
  const files = (readdirSync(src, { recursive: true }) as string[]).filter(f => f.endsWith('.ts'));
  const text = files.map(f => readFileSync(join(src, f), 'utf8')).join('\n');
  for (const k of KNOWN_KEYS) assert.ok(text.includes(`'setContext', 'durandal.${k}'`), `durandal.${k} is never set`);
});

test('M7: Esc on a plan ghost row hides the ghost until the cursor leaves the row; the command is registered, not contributed', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.plan.ghostEscape'), {
    command: 'durandal.plan.ghostEscape', key: 'escape',
    when: 'inlineSuggestionVisible && durandal.planGhostRow && editorTextFocus && !suggestWidgetVisible',
  });
  for (const id of ['durandal.plan.ghostEscape', 'durandal.plan.ghostAccepted']) {
    assert.ok(!pkg.contributes.commands.some(c => c.command === id), `${id} is registered, not contributed`);
  }
});

test('M6a: the plan settings and their defaults (spec §3.1, §0.7)', () => {
  const props = pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown; properties?: Record<string, { type: string }>; additionalProperties?: boolean }>;
  assert.deepEqual([props['durandal.plans.dir'].type, props['durandal.plans.dir'].default], ['string', 'plans']);
  assert.deepEqual([props['durandal.plans.conceal'].type, props['durandal.plans.conceal'].default], ['boolean', false]);
  assert.deepEqual([props['durandal.plans.foldDone'].type, props['durandal.plans.foldDone'].default], ['boolean', true]);
  const g = props['durandal.plans.glyphs'];
  assert.deepEqual([g.type, g.default, g.additionalProperties], ['object', {}, false]);
  assert.deepEqual(Object.keys(g.properties!), [...GLYPH_NAMES]);
  assert.ok(Object.values(g.properties!).every(p => p.type === 'string'));
});

// spec §3.3: superTypes mirror nvim's links, so every theme colours the plan
const SUPER: Record<string, string> = {
  planMarker: 'string', planStep: 'string', planStepDone: 'string', planQuestion: 'class', planEvidence: 'comment',
  planClaim: 'string', planTest: 'string', planAlso: 'comment', planJournal: 'comment', planAnchorPath: 'number',
  planAnchorUnit: 'variable', planVerdict: 'number', planFingerprint: 'number',
};

test('M6a: the 13 token types with their superTypes, the 6 modifiers, a scope for each type and stale', () => {
  const c = pkg.contributes as unknown as {
    semanticTokenTypes: { id: string; superType: string; description: string }[];
    semanticTokenModifiers: { id: string; description: string }[];
    semanticTokenScopes: { language?: string; scopes: Record<string, string[]> }[];
  };
  assert.deepEqual(c.semanticTokenTypes.map(t => t.id), [...PLAN_TOKEN_TYPES]);
  for (const t of c.semanticTokenTypes) {
    assert.equal(t.superType, SUPER[t.id], t.id);
    assert.ok(t.description.length > 0, t.id);
  }
  assert.deepEqual(c.semanticTokenModifiers.map(m => m.id), [...PLAN_TOKEN_MODIFIERS]);
  assert.ok(c.semanticTokenModifiers.every(m => m.description.length > 0));
  assert.equal(c.semanticTokenScopes.length, 1);
  const scopes = c.semanticTokenScopes[0].scopes;
  assert.deepEqual(Object.keys(scopes).sort(), [...PLAN_TOKEN_TYPES, '*.stale'].sort());
  assert.deepEqual(scopes['*.stale'], ['comment']);
  assert.ok(!Object.keys(scopes).some(k => k.includes('.done')), 'done maps to nothing: the folding does the work');
});

test('M6b: reviewAnswers is a boolean, false; M7: Plan: Accept Ghost and Plan: Reject Ghost are built on p y and p n', () => {
  const props = pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown; enum?: string[] }>;
  assert.deepEqual([props['durandal.plans.reviewAnswers'].type, props['durandal.plans.reviewAnswers'].default], ['boolean', false]);
  assert.deepEqual([props['durandal.plans.reconcile'].type, props['durandal.plans.reconcile'].default, props['durandal.plans.reconcile'].enum],
    ['string', 'auto', ['auto', 'key']]);
  assert.equal(BUILT['durandal.plan.accept'].title, 'Plan: Accept Ghost');
  assert.equal(BUILT['durandal.plan.reject'].title, 'Plan: Reject Ghost');
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.accept'), { command: 'durandal.plan.accept', keys: 'p y', when: 'durandal.isPlan' });
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.reject'), { command: 'durandal.plan.reject', keys: 'p n', when: 'durandal.isPlan' });
});

test('M6b: ask, validate, do and cancel are built; Plan: Cancel is palette-only', () => {
  for (const id of ['durandal.plan.ask', 'durandal.plan.validate', 'durandal.plan.do', 'durandal.plan.cancel']) {
    assert.ok(id in BUILT, id);
  }
  assert.equal(BUILT['durandal.plan.cancel'].title, 'Plan: Cancel');
  assert.ok(!KEYS.some(k => k.command === 'durandal.plan.cancel'));
});

test('M6b: new step (p enter), excerpt and toggle are built; toggle is Plan: Toggle Step', () => {
  for (const id of ['durandal.plan.newStep', 'durandal.plan.excerpt', 'durandal.plan.toggle']) assert.ok(id in BUILT, id);
  assert.equal(BUILT['durandal.plan.newStep'].title, 'Plan: New Step');
  assert.equal(BUILT['durandal.plan.toggle'].title, 'Plan: Toggle Step');
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.newStep'), { command: 'durandal.plan.newStep', keys: 'p enter', when: 'durandal.isPlan' });
});

test('Plan: Open Past Do is built on p o in a plan; no server-named command is left unbuilt', () => {
  assert.equal(BUILT['durandal.plan.errand'].title, 'Plan: Open Past Do');
  assert.ok(KEYS.some(k => k.command === 'durandal.plan.errand' && k.keys === 'p o' && k.when === 'durandal.isPlan'));
  assert.deepEqual(Object.keys(SERVER_NAMED), []);
});

test('M7: Tab and Esc on a suggestion\'s ghost lines are ours only while they are shown (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.filter(k => k.when.includes('durandal.ghostInline')), [
    { command: 'durandal.suggest.accept', key: 'tab',
      when: 'inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode' },
    { command: 'durandal.suggest.dismiss', key: 'escape',
      when: 'inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !renameInputVisible' },
  ]);
  // the decoration's Tab and Esc stay where no inline suggestion is shown
  for (const k of SUGGEST_KEYS.filter(k => k.when.startsWith('durandal.ghostVisible'))) assert.ok(k.when.includes('!inlineSuggestionVisible'), k.when);
});
