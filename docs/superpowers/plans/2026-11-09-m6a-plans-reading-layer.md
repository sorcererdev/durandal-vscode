# durandal-vscode M6a: the plans reading layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plan file in VS Code reads as it does in durandal.nvim. Tokens are coloured by the theme. With `durandal.plans.conceal` on, markers, anchor paths and fingerprints show as glyphs on every line but the cursor's. Claim verdicts sit at the start of their line. Done steps, answered questions and excerpts close when the plan is first shown, and a closed one shows its conclusion at the end of the line. Enter continues a step, and typing inside a live excerpt warns once. The extension targets olifant `48f38ab`.

**Architecture:** Spec §0.4's approach A: the library keeps registering the server's semantic tokens, folding ranges and code lenses, and three middleware taps copy each answer into a per-document reading model. Every decoration is a pure function of that model plus editor state, and no request is added. The rules sit in pure modules with no `vscode` import, unit-tested with `node --test`:
- `plans/settings.ts`: `durandal.plans.*` values read and checked.
- `plans/glyphs.ts`: the glyph names and defaults, and `concealOf`.
- `plans/legend.ts`: a semantic tokens array decoded with the server's legend; token edits applied.
- `plans/reading.ts`: `Readings`, the per-document model (tokens, folds, lenses, each with its version); `lineTokens`; the live excerpts of a lens list.
- `plans/verdicts.ts`: the verdict rank table and `worstPerLine`.
- `plans/foldText.ts`: `foldLabel`, `entryTargets`, `collapsedStarts`.

The VS Code glue is thin and covered by the fake-lsp e2e (`fake.14-reading`) and one real e2e (`real.9-plans`):
- `plans/options.ts`: read `durandal.plans.*`, hear changes.
- `plans/planDocs.ts`: the cached "is this document a plan" answer, shared by detection, taps and decorations.
- `plans/taps.ts`: the middleware functions that feed `Readings`.
- `plans/decorate.ts`: the decoration types and `paint(editor, input)`.
- `plans/folds.ts`: close on entry.
- `plans/enterRule.ts`: the markdown Enter rule while a plan is active.
- `plans/layer.ts`: `PlanLayer`, the one object that owns the readings, hears the events, computes each editor's paint input and exposes the test seam.

`server.ts` spreads the taps into its middleware and gains `ClientHooks.reading`. `trackIsPlan.ts` uses `PlanDocs` and hears more events. `extension.ts` builds the layer and exposes `Api.planView`.

**Tech Stack:** as M1 to M5: TypeScript 5.9 (`module: node16`), `vscode-languageclient` 11.0.0, `vscode-languageserver-protocol` 3.18.5, esbuild 0.28, `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp. olifant at `48f38abd7e9e7ed02b341598a4744e942392e7c4`.

**Spec:** `docs/superpowers/specs/2026-11-09-m6-plans-design.md` (this repository, at `d42574c`), §0, §1, §2, §3, §6, §7, §8 (the M6a parts). Facts: `~/projects/notes/vscode-port/m6/plans-surface.md`; plan-time checks: `~/projects/notes/vscode-port/m6/m6a-plan-checks.md` (VS Code 1.145.2 bundle) and `~/projects/notes/vscode-port/m6/m6a-olifant-head.md` (olifant at the new pin). Read the spec section a task names before starting it.

**Reference code (read, do not depend on):**
- durandal.nvim at `~/projects/durandal.nvim` (`2a7c954`): `lua/durandal/plans.lua` `conceal_of` :85-96, the marker end column :116-118, `place_claim_signs` :160-205, `line_tokens` :747-764, `foldtext` :780-815, `entry_targets` :819-829, `close_on_entry` :891-927, `typed` :726-743, the comments option :1051-1053. Specs: `tests/plans_spec.lua` :416-523 (reading layer, verdicts), :548-621 (folds), :195 (typed guard), :315 (Enter).
- olifant at `~/projects/olifant` (`48f38ab`): `src/Olifant/Server/Plans.hs` (legend :223-226, `excerptSpans` :208, `planFolds` :324), `src/Olifant/Lsp.hs` (capabilities :158-169, folding :822-831).
- vscode-languageclient 11.0.0: the middleware hooks in `lib/common/semanticTokens.d.ts:19-20`, `foldingRange.d.ts:8`, `codeLens.d.ts:11`; `client.d.ts:366` `initializeResult`.

**Branch, PR and models:** this plan is committed to `main` first ([[everything-on-main]] in the user's memory). Execution is one PR, M6a, on branch `m6a-reading` from `main`. M6b (verbs) and M6c (the loop) get their own plans after it merges. Suggested implementer models (the user's policy):
- Sonnet: Tasks 1, 2, 3, 6, 9.
- Opus: Tasks 4, 5, 7, 8 (the middleware taps, the decoration layer, close on entry, the Enter rule and its merge).
- A final whole-branch review on Fable.

**Deviations from the spec, decided here** (say each in the PR body):
- `Api.plans` already exists: it is the generator plans' `Plans` (`src/land.ts`). The spec §8 seam is `Api.planView` instead.
- M6a contributes only the settings it reads: `dir`, `conceal`, `glyphs`, `foldDone`. `reviewAnswers` comes with M6b's verbs and `reconcile` with M6c's loop, so no setting ships doing nothing.
- `planDocs.ts` and `layer.ts` are new files the spec's table does not list. `PlanDocs` is the one cached plan check that detection, taps and decorations share; `PlanLayer` is the event wiring the spec gives to `decorate.ts`, kept apart so `decorate.ts` only paints.
- The library registers no range semantic tokens provider (the server advertises `full` only), so there is no `provideDocumentRangeSemanticTokens` tap. A range answer would cover part of a document and could not replace a reading anyway.
- Glyphs use one decoration type with per-instance `before.contentText`, not one type per glyph name. A glyph setting change repaints; nothing is rebuilt.
- A `claim-wrong` diagnostic is Warning severity, so VS Code already draws its wavy warning underline over the range. M6a adds no second underline.
- A language-mode change reaches an extension as `workspace.onDidOpenTextDocument` (the document is closed and reopened with the new id), not as `onDidChangeTextDocument`. `trackIsPlan` hears that event.
- `real.9-plans` in M6a checks the legend and the folds. Its toggle, reconcile and files checks come with M6b and M6c, which build those verbs. The verdict check needs `olifant.checkSentence` with the `check_answers` hook: with `[plans] pass_cost = 0` no automatic pass checks anything (olifant `Loop.hs:635`, `:682`), so it moves to M6c with the claim-pass actions.

## Global Constraints

- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency. Every API used must exist in 1.91 (CI runs a 1.91.0 cell).
- `.olifant-ref` is `48f38abd7e9e7ed02b341598a4744e942392e7c4` from Task 1 on.
- No file outside `src/protocol.ts` spells an `olifant/*` method string or an `olifant.*` server command.
- Modules listed as pure import nothing from `vscode` (the unit tests run in plain Node).
- Lines are 0-based everywhere in M6a: tokens, folds, lens rows and VS Code positions all are.
- Token columns and lengths are UTF-16 code units, as the server sends them and as VS Code's `Position.character` counts.
- Every reader of a reading checks its version against the document's (spec §3.2). A stale reading draws nothing new; what is drawn stays until a fresh one arrives.
- Decorations carry no colour of their own except the verdict margin (spec §3.3), and those colours are `ThemeColor`s.
- Message strings are durandal.nvim's, verbatim. The only one in M6a: `excerpt: live and read-only, the next reconcile replaces what you type here`.
- No new action-log events. No new context keys (the manifest test's known list stays as it is).
- Defaults mirror nvim: `conceal` false, `foldDone` true, `dir` `"plans"`, `glyphs` `{}`.
- A hook into the library's middleware never throws into the library: a failure is caught and written to the output channel as a warning.
- The working hours rule applies to execution: no agent or background work 9am–5pm America/New_York, Monday to Friday.

## Review Focus

- **A theme without semantic highlighting.** VS Code asks for semantic tokens only when `editor.semanticHighlighting.enabled` resolves on for the theme. With it off, no tokens reach the tap, so no glyphs and no fold conclusions appear; folds still close and verdicts still show. The README says so (Task 9), and `fake.14-reading` sets the setting to `true` so the suite does not depend on the theme.
- **Typing in a plan with conceal on.** Tokens lag the text by one request. Each repaint must leave the glyphs as drawn while `tokens.version !== document.version`, never redraw old columns onto new text. Task 5's unit test pins the stale answer (`conceals` returns `undefined`), and its e2e moves the cursor right after an edit, before fresh tokens arrive, and checks the glyphs are not redrawn at old rows.
- **A plan with no folds, or folds that never come.** Close on entry must give up after 8 s without folding anything and without throwing, and switching away during the wait must leave the document not entered. Task 7's e2e covers both.
- **The diagnostics of a plan that also has other sources.** A spell checker or markdown linter writes to the same uri. The margin must use only `olifant-plan` and `olifant` diagnostics. Task 6's unit test includes a foreign source on a line.
- **A plan closed and reopened.** The reading, the entered mark and the warned set go on close, so the reopened plan closes its folds again and warns again. Task 7's e2e reopens a plan and checks its folds close again.

---

### Task 1: Pin olifant 48f38ab

**Files:**
- Modify: `.olifant-ref`
- Modify: `src/protocol.ts` (the modifiers, `plansIdle`, `SERVER_COMMANDS`)
- Modify: `test/unit/protocol.test.ts`
- Modify: `test/fake-lsp/fake-lsp` (header note, the six-modifier legend)

**Interfaces:**
- Produces: `PLAN_TOKEN_MODIFIERS` = `['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']`; `Olifant.plansIdle: NotificationType<Doc>` (`olifant/plans/idle`, M6c sends it); `SERVER_COMMANDS = { doctor: 'olifant.doctor', checkSentence: 'olifant.checkSentence', showWhy: 'olifant.showWhy', showCode: 'olifant.showCode' }` (the library registers them from the server's `executeCommandProvider`; the port registers none of them).

- [ ] **Step 1: Write the failing tests**

In `test/unit/protocol.test.ts`, add `'olifant/plans/idle'` to `PINNED` in sorted position (after `'olifant/plans/files'`). Replace the test `'the commands and the plan legend'` with:

```ts
test('the commands and the plan legend', () => {
  assert.deepEqual(SERVER_COMMANDS, {
    doctor: 'olifant.doctor', checkSentence: 'olifant.checkSentence', showWhy: 'olifant.showWhy', showCode: 'olifant.showCode',
  });
  assert.deepEqual(Object.values(CLIENT_COMMANDS).sort(),
    ['olifant.plans.errand', 'olifant.plans.excerpt', 'olifant.plans.review', 'olifant.showActions']);
  assert.equal(PLAN_TOKEN_TYPES.length, 13);
  assert.deepEqual([...PLAN_TOKEN_MODIFIERS], ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']);
  assert.equal(Olifant.plansIdle.method, 'olifant/plans/idle');
});
```

In `'the contract matches olifant\'s source'`, change the commands assertion and add the modifiers check:

```ts
  assert.deepEqual([...commands].sort(), [...Object.values(CLIENT_COMMANDS), ...Object.values(SERVER_COMMANDS)].sort());
  const plans = readFileSync(join(process.env.OLIFANT_REPO!, 'src/Olifant/Server/Plans.hs'), 'utf8');
  const types = /planTokenTypes =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(types, [...PLAN_TOKEN_TYPES]);
  const modifiers = /planTokenModifiers =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(modifiers, [...PLAN_TOKEN_MODIFIERS]);
```

Before relying on the regex, confirm the binding's name at the pin:

```bash
git -C ~/projects/olifant show 48f38ab:src/Olifant/Server/Plans.hs | grep -n 'planTokenModifiers\|planTokenTypes'
```

Expected: a `planTokenModifiers =` line listing the six. If the name differs, use the real one in the regex.

- [ ] **Step 2: Run the unit tests to see them fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL in `protocol.test` (`plansIdle` undefined, `SERVER_COMMANDS` and the modifiers differ, `PINNED` lacks `olifant/plans/idle`).

- [ ] **Step 3: Implement**

`.olifant-ref` holds exactly one line:

```
48f38abd7e9e7ed02b341598a4744e942392e7c4
```

In `src/protocol.ts`:

```ts
// The server's own commands (workspace/executeCommand); the library registers them from the
// server's executeCommandProvider. The claim pass's three (olifant 48f38ab) are code actions'
// commands: the chord-a menu runs them (milestone 6c), showWhy and showCode answer with
// window/showDocument.
export const SERVER_COMMANDS = {
  doctor: 'olifant.doctor',
  checkSentence: 'olifant.checkSentence',
  showWhy: 'olifant.showWhy',
  showCode: 'olifant.showCode',
} as const;
```

```ts
// The plan files' semantic token legend (Server/Plans.hs planTokenTypes, planTokenModifiers).
// At 48f38ab: checked and wrong mark a bare line's text by its stored check; resolved is no
// longer given and stays for older clients.
export const PLAN_TOKEN_MODIFIERS: readonly string[] = ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved'];
```

In the `Olifant` table, beside `plansOutcome`:

```ts
  // the plan is quiet: the server triages its claims (milestone 6c sends it)
  plansIdle: note<Doc>('olifant/plans/idle'),
```

In `test/fake-lsp/fake-lsp`, change the legend's `"tokenModifiers"` to `["done", "stale", "notFound", "checked", "wrong", "resolved"]`, and add to the header's list of changes: `the legend's modifiers are olifant 48f38ab's six`.

- [ ] **Step 4: Run the unit tests, with and without the olifant checkout**

```bash
git -C ~/projects/olifant rev-parse HEAD
npm run test:unit 2>&1 | tail -5
OLIFANT_REPO=~/projects/olifant npm run test:unit 2>&1 | tail -5
```

Expected: HEAD is `48f38abd7e9e7ed02b341598a4744e942392e7c4` (if not, run `git -C ~/projects/olifant worktree add ~/projects/olifant-48f38ab 48f38ab` and use that path as `OLIFANT_REPO` here and below); both unit runs PASS, the second with the contract tests not skipped. A key from the `KEYS` list missing at the pin fails here: find what the server sends now and fix `protocol.ts` and its readers (never drop the key).

- [ ] **Step 5: Build olifant at the pin and run the whole e2e against it**

```bash
(cd ~/projects/olifant && cabal build -v1 exe:olifant)
OLIFANT_BIN=$(cd ~/projects/olifant && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant npm run test:e2e 2>&1 | tail -40
```

Run it in the foreground with a 60-minute timeout. Expected: the fake, bare and real suites PASS (real.1 to real.8 against 48f38ab). The real sandboxes open no plan, so no claim pass runs. A real failure is a protocol change the scan missed: stop and report it with its output, do not paper over it.

- [ ] **Step 6: Commit**

```bash
git add .olifant-ref src/protocol.ts test/unit/protocol.test.ts test/fake-lsp/fake-lsp
git commit -m "olifant: pin 48f38ab (the claim pass); six modifiers, plans/idle, its three commands"
```

---

### Task 2: Plan detection, settings and the token contributions

**Files:**
- Create: `src/plans/glyphs.ts` (names and defaults only; `concealOf` comes in Task 5)
- Create: `src/plans/settings.ts`
- Create: `src/plans/options.ts`
- Create: `src/plans/planDocs.ts`
- Modify: `src/plans/isPlan.ts`, `src/root.ts:58-62`, `src/applyEdit.ts:59`
- Modify: `src/plans/trackIsPlan.ts`
- Modify: `package.json` (settings; `semanticTokenTypes`, `semanticTokenModifiers`, `semanticTokenScopes`)
- Test: `test/unit/isPlan.test.ts`, `test/unit/plansSettings.test.ts` (new), `test/unit/manifest.test.ts`

**Interfaces:**
- Consumes: `PLAN_TOKEN_TYPES`, `PLAN_TOKEN_MODIFIERS` (Task 1).
- Produces:
  - `glyphs.ts`: `GLYPH_NAMES` (13, readonly tuple), `type GlyphName`, `type Glyphs = Record<GlyphName, string>`, `DEFAULT_GLYPHS: Glyphs`.
  - `settings.ts`: `interface PlansOptions { dir: string; conceal: boolean; glyphs: Glyphs; foldDone: boolean }`, `plansOptionsFrom(get: (key: string, fallback: unknown) => unknown): PlansOptions`.
  - `options.ts`: `readPlansOptions(): PlansOptions`, `onPlansOptions(context: vscode.ExtensionContext, listener: (o: PlansOptions) => void): void`.
  - `isPlan.ts`: `isPlanPath(path, root, languageId, dir = PLANS_DIR): boolean`.
  - `root.ts`: `isPlanFile(path: string, dir = PLANS_DIR): Promise<boolean>`.
  - `planDocs.ts`: `class PlanDocs { constructor(dir: () => string); is(doc: vscode.TextDocument): Promise<boolean>; forget(uri: string): void; clear(): void }`.
  - `trackIsPlan.ts`: `trackIsPlan(context, docs: PlanDocs, changed?: (yes: boolean) => void): { isPlan(): boolean; refresh(): void }`.

- [ ] **Step 1: Write the failing unit tests**

Append to `test/unit/isPlan.test.ts`:

```ts
test('the plans folder is a setting: another name, or a nested path', () => {
  assert.equal(isPlanPath('/w/one/docs/x.md', '/w/one', 'markdown', 'docs'), true);
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one', 'markdown', 'docs'), false);
  assert.equal(isPlanPath('/w/one/docs/plans/x.md', '/w/one', 'markdown', 'docs/plans'), true);
  assert.equal(isPlanPath('/w/one/docs/x.md', '/w/one', 'markdown', 'docs/plans'), false);
});
```

Create `test/unit/plansSettings.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GLYPHS, GLYPH_NAMES } from '../../src/plans/glyphs';
import { plansOptionsFrom } from '../../src/plans/settings';

const from = (values: Record<string, unknown>) => plansOptionsFrom((k, fallback) => (k in values ? values[k] : fallback));

test('the defaults mirror durandal.nvim: dir plans, conceal off, folds of done work closed, nvim\'s glyphs', () => {
  assert.deepEqual(from({}), { dir: 'plans', conceal: false, glyphs: DEFAULT_GLYPHS, foldDone: true });
  assert.deepEqual([...GLYPH_NAMES], ['todo', 'done', 'question', 'test', 'also', 'dash', 'path', 'hex', 'queued', 'checking', 'right', 'wrong', 'unsure']);
  assert.deepEqual(DEFAULT_GLYPHS, {
    todo: '☐', done: '☑', question: '?', test: '·', also: '+', dash: '', path: '', hex: '',
    queued: '○', checking: '…', right: '✓', wrong: '✗', unsure: '?',
  });
});

test('glyphs override by name; unknown names and non-strings are ignored; an empty string stands', () => {
  const o = from({ glyphs: { todo: '[ ]', hex: '#', bogus: 'x', done: 3, question: '' } });
  assert.equal(o.glyphs.todo, '[ ]');
  assert.equal(o.glyphs.hex, '#');
  assert.equal(o.glyphs.done, '☑');
  assert.equal(o.glyphs.question, '');
  assert.ok(!('bogus' in o.glyphs));
});

test('dir is trimmed of spaces and slashes, backslashes become slashes; empty or not a string is plans', () => {
  assert.equal(from({ dir: ' /docs/plans/ ' }).dir, 'docs/plans');
  assert.equal(from({ dir: 'docs\\plans' }).dir, 'docs/plans');
  assert.equal(from({ dir: '' }).dir, 'plans');
  assert.equal(from({ dir: '/' }).dir, 'plans');
  assert.equal(from({ dir: 7 }).dir, 'plans');
});

test('conceal and foldDone take booleans only', () => {
  assert.equal(from({ conceal: true }).conceal, true);
  assert.equal(from({ conceal: 'yes' }).conceal, false);
  assert.equal(from({ foldDone: false }).foldDone, false);
  assert.equal(from({ foldDone: 0 }).foldDone, true);
  assert.equal(from({ glyphs: null }).glyphs.todo, '☐');
});
```

In `test/unit/manifest.test.ts`, change the settings assertion in `'the settings and the activation'` to:

```ts
  assert.deepEqual(Object.keys(pkg.contributes.configuration.properties).sort(),
    ['durandal.actionLog', 'durandal.debounceMs', 'durandal.fills', 'durandal.ghosts', 'durandal.hints', 'durandal.model', 'durandal.path',
      'durandal.plans.conceal', 'durandal.plans.dir', 'durandal.plans.foldDone', 'durandal.plans.glyphs', 'durandal.trace.server']);
```

and append:

```ts
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
```

with these imports added at the top of `manifest.test.ts`:

```ts
import { GLYPH_NAMES } from '../../src/plans/glyphs';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES } from '../../src/protocol';
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL to compile (`src/plans/glyphs`, `src/plans/settings` missing).

- [ ] **Step 3: Implement the pure modules**

`src/plans/glyphs.ts`:

```ts
// The plan glyphs (spec §3.3, §3.4; durandal.nvim plans.lua:17-19). No vscode import.

export const GLYPH_NAMES = ['todo', 'done', 'question', 'test', 'also', 'dash', 'path', 'hex', 'queued', 'checking', 'right', 'wrong', 'unsure'] as const;
export type GlyphName = typeof GLYPH_NAMES[number];
export type Glyphs = Record<GlyphName, string>;

// The markers' glyphs (an empty one hides its text and shows nothing), then the verdict margin's.
export const DEFAULT_GLYPHS: Glyphs = {
  todo: '☐', done: '☑', question: '?', test: '·', also: '+', dash: '', path: '', hex: '',
  queued: '○', checking: '…', right: '✓', wrong: '✗', unsure: '?',
};
```

`src/plans/settings.ts`:

```ts
// durandal.plans.* read and checked (spec §3.1). No vscode import: options.ts reads VS Code's
// configuration through it. reviewAnswers (M6b) and reconcile (M6c) join when they are read.
import { DEFAULT_GLYPHS, GLYPH_NAMES, Glyphs } from './glyphs';
import { PLANS_DIR } from './isPlan';

export interface PlansOptions { dir: string; conceal: boolean; glyphs: Glyphs; foldDone: boolean }

// dir: under each project, the folder whose markdown files are plans; it must match the
// server's [plans] dir. Slashes at either end and spaces are dropped; empty is the default.
function dirOf(v: unknown): string {
  if (typeof v !== 'string') return PLANS_DIR;
  const d = v.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return d === '' ? PLANS_DIR : d;
}

function glyphsOf(v: unknown): Glyphs {
  const out: Glyphs = { ...DEFAULT_GLYPHS };
  if (typeof v !== 'object' || v === null) return out;
  for (const name of GLYPH_NAMES) {
    const g = (v as Record<string, unknown>)[name];
    if (typeof g === 'string') out[name] = g;
  }
  return out;
}

export function plansOptionsFrom(get: (key: string, fallback: unknown) => unknown): PlansOptions {
  const conceal = get('conceal', false);
  const foldDone = get('foldDone', true);
  return {
    dir: dirOf(get('dir', PLANS_DIR)),
    conceal: conceal === true,
    glyphs: glyphsOf(get('glyphs', {})),
    foldDone: typeof foldDone === 'boolean' ? foldDone : true,
  };
}
```

`src/plans/isPlan.ts`: give `isPlanPath` a fourth parameter `dir = PLANS_DIR` and build `plans` from it; update the comments ("the folder is durandal.plans.dir, default plans"):

```ts
export function isPlanPath(path: string, root: string | undefined, languageId: string, dir: string = PLANS_DIR): boolean {
  if (root === undefined || root === '') return false;
  const norm = (p: string) => p.replace(/\\/g, '/');
  const file = norm(path);
  const plans = `${norm(root).replace(/\/+$/, '')}/${dir}/`;
  if (!file.startsWith(plans) || file.length === plans.length) return false;
  return languageId === 'markdown' || file.toLowerCase().endsWith('.md');
}
```

`src/root.ts`:

```ts
export async function isPlanFile(path: string, dir: string = PLANS_DIR): Promise<boolean> {
  return isPlanPath(resolve(path), await findRoot(path), '', dir);
}
```

(import `PLANS_DIR` beside `isPlanPath`).

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: `isPlan` and `plansSettings` PASS; `manifest` still FAILS (package.json not yet changed).

- [ ] **Step 5: The VS Code side: options, PlanDocs, detection, applyEdit**

`src/plans/options.ts`:

```ts
import * as vscode from 'vscode';
import { PlansOptions, plansOptionsFrom } from './settings';

// readPlansOptions: durandal.plans.* now (spec §3.1).
export function readPlansOptions(): PlansOptions {
  const c = vscode.workspace.getConfiguration('durandal.plans');
  return plansOptionsFrom((k, fallback) => c.get(k, fallback));
}

// onPlansOptions: LISTENER hears the new options after any durandal.plans.* change.
export function onPlansOptions(context: vscode.ExtensionContext, listener: (o: PlansOptions) => void): void {
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('durandal.plans')) listener(readPlansOptions());
  }));
}
```

`src/plans/planDocs.ts`:

```ts
import * as vscode from 'vscode';
import { findRoot } from '../root';
import { isPlanPath } from './isPlan';

// PlanDocs answers "is this document a plan" once per document, language and plans folder: the
// root lookup reads the disk, and the taps ask on every answer the server sends. A file:
// document only (the server serves plan features to nothing else).
export class PlanDocs {
  private readonly cache = new Map<string, Promise<boolean>>();

  constructor(private readonly dir: () => string) {}

  is(doc: vscode.TextDocument): Promise<boolean> {
    if (doc.uri.scheme !== 'file') return Promise.resolve(false);
    const dir = this.dir();
    const key = `${doc.uri.toString()}\n${doc.languageId}\n${dir}`;
    let p = this.cache.get(key);
    if (!p) {
      const path = doc.uri.fsPath;
      const languageId = doc.languageId;
      p = findRoot(path).then(root => isPlanPath(path, root, languageId, dir));
      this.cache.set(key, p);
    }
    return p;
  }

  // forget drops a document's answers (it closed: a reopened one is asked again).
  forget(uri: string): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${uri}\n`)) this.cache.delete(k);
  }

  clear(): void { this.cache.clear(); }
}
```

Replace `src/plans/trackIsPlan.ts`:

```ts
import * as vscode from 'vscode';
import type { PlanDocs } from './planDocs';

// trackIsPlan keeps durandal.isPlan: the active editor shows a plan of an Olifant project (M5
// spec §5.1, M6 spec §3.1), as projects.ts keeps durandal.inProject. The plan chords use it.
// It follows the active editor, its document reopened with another language (a language-mode
// change reaches an extension as a close and an open), its save (an untitled file saved into
// the plans folder) and refresh() (the plans folder setting changed). CHANGED hears each new
// answer (the Enter rule follows it).
export function trackIsPlan(context: vscode.ExtensionContext, docs: PlanDocs, changed: (yes: boolean) => void = () => undefined): { isPlan(): boolean; refresh(): void } {
  let isPlan = false;
  // FROM: the document an event names, when it is the active editor's (a reopened document is
  // a new object: the editor may still hold the old one while the event runs, so match by uri)
  const update = async (from?: vscode.TextDocument) => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor && from && from.uri.toString() === editor.document.uri.toString() ? from : editor?.document;
    const yes = !!doc && await docs.is(doc);
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    const was = isPlan;
    isPlan = yes;
    await vscode.commands.executeCommand('setContext', 'durandal.isPlan', yes);
    if (was !== yes) changed(yes);
  };
  const ofActive = (doc: vscode.TextDocument) => doc.uri.toString() === vscode.window.activeTextEditor?.document.uri.toString();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => void update()),
    vscode.workspace.onDidOpenTextDocument(doc => { if (ofActive(doc)) void update(doc); }),
    vscode.workspace.onDidSaveTextDocument(doc => { if (ofActive(doc)) void update(doc); }),
  );
  void update();
  return { isPlan: () => isPlan, refresh: () => void update() };
}
```


`src/applyEdit.ts:59`: pass the folder, so an edit never saves a plan under a configured folder:

```ts
    if (uri.scheme !== 'file' || await isPlanFile(uri.fsPath, readPlansOptions().dir)) continue;
```

(import `readPlansOptions` from `./plans/options`).

In `src/extension.ts`, replace `const plansTracked = trackIsPlan(context);` with:

```ts
  // plans (M6): durandal.plans.*, the one plan check, durandal.isPlan
  let plansOptions = readPlansOptions();
  const planDocs = new PlanDocs(() => plansOptions.dir);
  const plansTracked = trackIsPlan(context, planDocs);
  onPlansOptions(context, o => {
    plansOptions = o;
    plansTracked.refresh();
  });
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => planDocs.forget(d.uri.toString())));
```

Task 4 moves the close listener into `PlanLayer`; until then it lives here.

- [ ] **Step 6: The manifest: settings and token contributions**

In `package.json` `contributes.configuration.properties`, after `durandal.ghosts`:

```json
        "durandal.plans.dir": {
          "type": "string",
          "default": "plans",
          "markdownDescription": "The folder, under each Olifant project, whose markdown files are plans. It must match `[plans] dir` in `.olifant/config.toml`: the server decides which files are plans, this setting only where Durandal's plan chords and decorations apply."
        },
        "durandal.plans.conceal": {
          "type": "boolean",
          "default": false,
          "markdownDescription": "Show plan markers as glyphs (`☐ ☑ ? · +`) and hide anchor paths and fingerprints, on every line but the cursor's. Off: the raw text, coloured by the theme."
        },
        "durandal.plans.glyphs": {
          "type": "object",
          "default": {},
          "additionalProperties": false,
          "properties": {
            "todo": { "type": "string", "description": "An open step's marker `- [ ]` (default ☐)." },
            "done": { "type": "string", "description": "A ticked step's marker `- [x]` (default ☑)." },
            "question": { "type": "string", "description": "A question's marker `- ?` (default ?)." },
            "test": { "type": "string", "description": "A test child's marker `- test:` (default ·)." },
            "also": { "type": "string", "description": "An also child's marker `- also` (default +)." },
            "dash": { "type": "string", "description": "Any other line's `- ` (default: hidden)." },
            "path": { "type": "string", "description": "An anchor's `@path:` (default: hidden)." },
            "hex": { "type": "string", "description": "A fingerprint (default: hidden)." },
            "queued": { "type": "string", "description": "Margin: a claim waiting for a check (default ○)." },
            "checking": { "type": "string", "description": "Margin: a claim being checked (default …)." },
            "right": { "type": "string", "description": "Margin: a claim checked right (default ✓)." },
            "wrong": { "type": "string", "description": "Margin: a claim checked wrong (default ✗)." },
            "unsure": { "type": "string", "description": "Margin: a claim the check could not tell (default ?)." }
          },
          "markdownDescription": "Overrides of the plan glyphs, by name. An empty string hides the text and shows nothing."
        },
        "durandal.plans.foldDone": {
          "type": "boolean",
          "default": true,
          "markdownDescription": "Close done steps and answered questions, as well as code excerpts, when a plan is first shown. Off: close only the excerpts."
        },
```

In `contributes`, after `keybindings`:

```json
    "semanticTokenTypes": [
      { "id": "planMarker", "superType": "string", "description": "A plan line's marker: `- [ ]`, `- [x]`, `- ?`, `- test:`, `- also`, `- `." },
      { "id": "planStep", "superType": "string", "description": "An open step's text." },
      { "id": "planStepDone", "superType": "string", "description": "A ticked step's text." },
      { "id": "planQuestion", "superType": "class", "description": "A question's text." },
      { "id": "planEvidence", "superType": "comment", "description": "Evidence under a claim or question." },
      { "id": "planClaim", "superType": "string", "description": "A claim's text." },
      { "id": "planTest", "superType": "string", "description": "A step's test sentence." },
      { "id": "planAlso", "superType": "comment", "description": "An also child of a step." },
      { "id": "planJournal", "superType": "comment", "description": "A journal line of a past do." },
      { "id": "planAnchorPath", "superType": "number", "description": "An anchor's `@path:`." },
      { "id": "planAnchorUnit", "superType": "variable", "description": "An anchor's unit." },
      { "id": "planVerdict", "superType": "number", "description": "A verdict mark: ✓, ✗, ○, ●, `? not found`." },
      { "id": "planFingerprint", "superType": "number", "description": "A verified anchor's fingerprint." }
    ],
    "semanticTokenModifiers": [
      { "id": "done", "description": "Under a ticked step." },
      { "id": "stale", "description": "A fingerprint the unit no longer has." },
      { "id": "notFound", "description": "An anchor's unit the server cannot find." },
      { "id": "checked", "description": "A claim a check found right." },
      { "id": "wrong", "description": "A claim a check found wrong." },
      { "id": "resolved", "description": "No longer given by the server; kept for its legend." }
    ],
    "semanticTokenScopes": [
      {
        "scopes": {
          "planMarker": ["punctuation.definition.list.begin.markdown"],
          "planStep": ["string"],
          "planStepDone": ["string"],
          "planQuestion": ["markup.heading"],
          "planEvidence": ["comment"],
          "planClaim": ["string"],
          "planTest": ["string"],
          "planAlso": ["comment"],
          "planJournal": ["comment"],
          "planAnchorPath": ["constant.numeric"],
          "planAnchorUnit": ["variable"],
          "planVerdict": ["constant.numeric"],
          "planFingerprint": ["constant.numeric"],
          "*.stale": ["comment"]
        }
      }
    ],
```

The `semanticTokenScopes` entry has no `language`: only plans carry these types.

- [ ] **Step 7: Run the unit tests and lint**

Run: `npm run lint && npm run test:unit 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 8: Write the detection e2e and run it**

Create `test/e2e/fake.14-reading.e2e.ts` (later tasks add to it):

```ts
import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { api, file, open, running, settle, until, ws } from './helpers';

// The plans reading layer over the fake server (M6 spec §3, §8): detection, the reading model,
// glyphs, the verdict margin, folds and conclusions, the Enter rule, the excerpt guard.
const PLAN = 'one/plans/p.md';
const PLAN_DEFAULT = '# A plan\n\n- [ ] a step\n';
const plansConfig = () => vscode.workspace.getConfiguration('durandal.plans');

describe('the plans reading layer (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    // themes decide whether VS Code asks for semantic tokens: the suite does not depend on one
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', true, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global);
    for (const k of ['dir', 'conceal', 'glyphs', 'foldDone']) await plansConfig().update(k, undefined, vscode.ConfigurationTarget.Global);
    await settle(PLAN, PLAN_DEFAULT);
  });

  it('durandal.isPlan follows a language change and the plans folder setting (spec §3.1)', async () => {
    const a = await running();
    writeFileSync(join(ws(), 'one/plans/notes'), '- [ ] a step\n');
    const ed = await open(file('one/plans/notes'));
    assert.notEqual(ed.document.languageId, 'markdown');
    await until(() => !a.isPlan() || undefined, 'not a plan as plain text');
    await vscode.languages.setTextDocumentLanguage(ed.document, 'markdown');
    await until(() => a.isPlan(), 'a plan once markdown');
    await open(file(PLAN));
    await until(() => a.isPlan(), 'p.md is a plan');
    await plansConfig().update('dir', 'docs', vscode.ConfigurationTarget.Global);
    await until(() => !a.isPlan() || undefined, 'p.md is not a plan under dir docs');
    await plansConfig().update('dir', undefined, vscode.ConfigurationTarget.Global);
    await until(() => a.isPlan(), 'p.md is a plan again');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle('one/plans/notes', null);
  });
});
```

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30` (the bare suite then runs with nothing selected).
Expected: PASS. Then the whole fake suite, which also re-runs `fake.13`'s `durandal.isPlan` checks: `DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`, PASS.

- [ ] **Step 9: Commit**

```bash
git add src/plans/glyphs.ts src/plans/settings.ts src/plans/options.ts src/plans/planDocs.ts src/plans/isPlan.ts src/plans/trackIsPlan.ts src/root.ts src/applyEdit.ts src/extension.ts package.json test/unit/isPlan.test.ts test/unit/plansSettings.test.ts test/unit/manifest.test.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: durandal.plans.* settings, the plan check on more events, token types for themes"
```

---

### Task 3: The reading model (pure)

**Files:**
- Create: `src/plans/legend.ts`
- Create: `src/plans/reading.ts`
- Create: `test/planTokens.ts` (an encoder the unit and e2e tests share)
- Test: `test/unit/legend.test.ts`, `test/unit/reading.test.ts`

**Interfaces:**
- Consumes: `PLAN_TOKEN_TYPES`, `PLAN_TOKEN_MODIFIERS` (Task 1, tests only).
- Produces:
  - `legend.ts`: `interface Legend { tokenTypes: readonly string[]; tokenModifiers: readonly string[] }`; `interface Tok { line: number; start: number; length: number; type: string; modifiers: Set<string> }`; `decode(data: ArrayLike<number>, legend: Legend): Tok[]`; `interface TokenEdit { start: number; deleteCount: number; data?: ArrayLike<number> }`; `applyEdits(prev: readonly number[], edits: readonly TokenEdit[]): number[]`.
  - `reading.ts`: `interface Fold { start: number; end: number }`; `interface Lens { line: number; command: string; args: unknown[] }`; `interface PlanReading { tokens?: { version: number; resultId?: string; data: number[]; toks: Tok[] }; folds?: { version: number; ranges: Fold[] }; lenses?: { version: number; items: Lens[] } }`; `type Part = 'tokens' | 'folds' | 'lenses'`; `class Readings` (below); `lineTokens(toks: readonly Tok[], line: number): Tok[]`; `tokText(tok: Tok, lineText: string): string`; `interface LiveExcerpt { open: number; close: number; key: string }`; `liveExcerpts(lenses: readonly Lens[]): LiveExcerpt[]`.
  - `test/planTokens.ts`: `type TokSpec = [line: number, start: number, length: number, type: string, modifiers?: string[]]`; `encode(toks: TokSpec[]): number[]` with the plan legend; `PLAN_LEGEND: Legend`.

- [ ] **Step 1: Write the shared encoder and the failing tests**

`test/planTokens.ts`:

```ts
import type { Legend } from '../src/plans/legend';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES } from '../src/protocol';

// The plan legend as olifant 48f38ab announces it, and an encoder of absolute tokens into the
// LSP's relative 5-int data (the unit tests and the fake server's canned answers use it).
export const PLAN_LEGEND: Legend = { tokenTypes: PLAN_TOKEN_TYPES, tokenModifiers: PLAN_TOKEN_MODIFIERS };

export type TokSpec = [line: number, start: number, length: number, type: string, modifiers?: string[]];

export function encode(toks: TokSpec[]): number[] {
  const out: number[] = [];
  let line = 0;
  let start = 0;
  for (const [l, s, len, type, mods = []] of [...toks].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const ti = PLAN_TOKEN_TYPES.indexOf(type);
    if (ti < 0) throw new Error(`no token type ${type}`);
    const bits = mods.reduce((b, m) => b | (1 << PLAN_TOKEN_MODIFIERS.indexOf(m)), 0);
    out.push(l - line, l === line ? s - start : s, len, ti, bits);
    line = l;
    start = s;
  }
  return out;
}
```

`test/unit/legend.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND } from '../planTokens';

test('decode: relative rows and columns, the type by legend index, the modifier bits by legend order', () => {
  const toks = decode(encode([
    [2, 0, 6, 'planMarker'], [2, 6, 6, 'planStep'], [2, 13, 10, 'planAnchorPath'],
    [4, 2, 2, 'planMarker', ['done']], [4, 4, 9, 'planClaim', ['done', 'checked', 'resolved']],
  ]), PLAN_LEGEND);
  assert.deepEqual(toks.map(t => [t.line, t.start, t.length, t.type, [...t.modifiers]]), [
    [2, 0, 6, 'planMarker', []], [2, 6, 6, 'planStep', []], [2, 13, 10, 'planAnchorPath', []],
    [4, 2, 2, 'planMarker', ['done']], [4, 4, 9, 'planClaim', ['done', 'checked', 'resolved']],
  ]);
});

test('decode: all 13 types and all 6 modifiers round-trip', () => {
  const specs = PLAN_LEGEND.tokenTypes.map((t, i) => [i, 0, 1, t, [PLAN_LEGEND.tokenModifiers[i % 6]]] as [number, number, number, string, string[]]);
  const toks = decode(encode(specs), PLAN_LEGEND);
  assert.deepEqual(toks.map(t => t.type), [...PLAN_LEGEND.tokenTypes]);
  assert.deepEqual(toks.map(t => [...t.modifiers][0]), specs.map(s => s[4][0]));
});

test('decode: an index the legend lacks gives type "" and no modifier; a short tail is ignored; nothing throws', () => {
  const toks = decode([0, 0, 3, 99, 1 << 20, 1, 0], { tokenTypes: ['a'], tokenModifiers: ['m'] });
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, '');
  assert.equal(toks[0].modifiers.size, 0);
});

test('applyEdits: edits refer to the previous array, applied from the last start down', () => {
  assert.deepEqual(applyEdits([0, 0, 1, 0, 0, 1, 0, 1, 0, 0], [{ start: 5, deleteCount: 5, data: [2, 0, 1, 0, 0] }, { start: 0, deleteCount: 0, data: [0, 0, 2, 1, 0] }]),
    [0, 0, 2, 1, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0]);
  assert.deepEqual(applyEdits([1, 2, 3], [{ start: 1, deleteCount: 1 }]), [1, 3]);
});
```

`test/unit/reading.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTokens, liveExcerpts, Readings, tokText } from '../../src/plans/reading';
import { encode, PLAN_LEGEND } from '../planTokens';

test('Readings: each part keeps its own version; changed hears the part', () => {
  const heard: string[] = [];
  const r = new Readings((uri, part) => heard.push(`${uri} ${part}`));
  r.tokens('u', 3, encode([[0, 0, 2, 'planMarker']]), PLAN_LEGEND, 'r1');
  r.folds('u', 4, [{ start: 2, end: 5 }]);
  r.lenses('u', 4, [{ line: 1, command: 'olifant.plans.excerpt', args: [] }]);
  assert.deepEqual(heard, ['u tokens', 'u folds', 'u lenses']);
  const p = r.get('u')!;
  assert.deepEqual([p.tokens!.version, p.tokens!.resultId, p.tokens!.toks.length], [3, 'r1', 1]);
  assert.deepEqual([p.folds!.version, p.folds!.ranges], [4, [{ start: 2, end: 5 }]]);
  assert.equal(p.lenses!.version, 4);
});

test('Readings: token edits apply to the reading whose resultId they name; otherwise the tokens go', () => {
  const r = new Readings();
  r.tokens('u', 1, encode([[0, 0, 2, 'planMarker']]), PLAN_LEGEND, 'r1');
  assert.equal(r.tokenEdits('u', 2, 'r1', [{ start: 5, deleteCount: 0, data: encode([[1, 0, 2, 'planMarker']]) }], PLAN_LEGEND, 'r2'), true);
  assert.deepEqual(r.get('u')!.tokens!.toks.map(t => t.line), [0, 1]);
  assert.equal(r.get('u')!.tokens!.resultId, 'r2');
  assert.equal(r.tokenEdits('u', 3, 'other', [], PLAN_LEGEND, 'r3'), false);
  assert.equal(r.get('u')!.tokens, undefined);
});

test('Readings: drop and clear forget; uris lists what is held', () => {
  const r = new Readings();
  r.folds('a', 1, []);
  r.folds('b', 1, []);
  assert.deepEqual(r.uris().sort(), ['a', 'b']);
  r.drop('a');
  assert.equal(r.get('a'), undefined);
  r.clear();
  assert.deepEqual(r.uris(), []);
});

test('lineTokens and tokText: one row\'s tokens, in column order, and their text', () => {
  const r = new Readings();
  r.tokens('u', 1, encode([[2, 6, 6, 'planStep'], [2, 0, 6, 'planMarker'], [3, 0, 2, 'planMarker']]), PLAN_LEGEND);
  const row = lineTokens(r.get('u')!.tokens!.toks, 2);
  assert.deepEqual(row.map(t => t.type), ['planMarker', 'planStep']);
  assert.equal(tokText(row[1], '- [ ] a step @src/a.py:F'), 'a step');
});

test('liveExcerpts: the excerpt lenses whose live argument is true, keyed by anchor, else by opening row', () => {
  const ex = liveExcerpts([
    { line: 3, command: 'olifant.plans.excerpt', args: ['u', 3, 6, true, '@src/a.py:F'] },
    { line: 8, command: 'olifant.plans.excerpt', args: ['u', 8, 10, false, '@src/b.py:G'] },
    { line: 12, command: 'olifant.plans.excerpt', args: ['u', 12, 14, true] },
    { line: 1, command: 'olifant.plans.review', args: ['reconcile', 'u'] },
    { line: 20, command: 'olifant.plans.excerpt', args: ['u', '20', 22, true] },
  ]);
  assert.deepEqual(ex, [{ open: 3, close: 6, key: '@src/a.py:F' }, { open: 12, close: 14, key: '12' }]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL to compile (`src/plans/legend`, `src/plans/reading` missing).

- [ ] **Step 3: Implement**

`src/plans/legend.ts`:

```ts
// A semantic tokens answer decoded with the legend the server announced at initialize (spec
// §3.2), never protocol.ts's constants: a legend change cannot misdecode. No vscode import.

export interface Legend { tokenTypes: readonly string[]; tokenModifiers: readonly string[] }

// Tok: one token, absolute. type '' is an index the legend lacks (an older server's).
export interface Tok { line: number; start: number; length: number; type: string; modifiers: Set<string> }

export function decode(data: ArrayLike<number>, legend: Legend): Tok[] {
  const out: Tok[] = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const dLine = data[i];
    line += dLine;
    start = dLine === 0 ? start + data[i + 1] : data[i + 1];
    const modifiers = new Set<string>();
    let bits = data[i + 4] >>> 0;
    for (let b = 0; bits !== 0 && b < 32; b++, bits >>>= 1) {
      const m = legend.tokenModifiers[b];
      if ((bits & 1) === 1 && m !== undefined) modifiers.add(m);
    }
    out.push({ line, start, length: data[i + 2], type: legend.tokenTypes[data[i + 3]] ?? '', modifiers });
  }
  return out;
}

// TokenEdit: an LSP SemanticTokensEdit (vscode.SemanticTokensEdit has the same shape).
export interface TokenEdit { start: number; deleteCount: number; data?: ArrayLike<number> }

// applyEdits: the edits refer to PREV as it was; applied from the last start down, each
// leaves the earlier starts where they were.
export function applyEdits(prev: readonly number[], edits: readonly TokenEdit[]): number[] {
  const out = [...prev];
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out.splice(e.start, e.deleteCount, ...Array.from(e.data ?? []));
  return out;
}
```

`src/plans/reading.ts`:

```ts
// The reading model (spec §3.2): per plan document, what the server last answered for its
// tokens, folds and lenses, each with the document version it was computed for. Every reader
// checks that version. No vscode import.
import { CLIENT_COMMANDS } from '../protocol';
import { applyEdits, decode, Legend, Tok, TokenEdit } from './legend';

export interface Fold { start: number; end: number }
// Lens: a code lens's row and its resolved command (olifant.plans.excerpt carries
// [uri, open, close, live, anchor]).
export interface Lens { line: number; command: string; args: unknown[] }

export interface PlanReading {
  tokens?: { version: number; resultId?: string; data: number[]; toks: Tok[] };
  folds?: { version: number; ranges: Fold[] };
  lenses?: { version: number; items: Lens[] };
}

export type Part = 'tokens' | 'folds' | 'lenses';

export class Readings {
  private readonly m = new Map<string, PlanReading>();

  constructor(private readonly changed: (uri: string, part: Part) => void = () => undefined) {}

  get(uri: string): PlanReading | undefined { return this.m.get(uri); }
  uris(): string[] { return [...this.m.keys()]; }

  private of(uri: string): PlanReading {
    let r = this.m.get(uri);
    if (!r) {
      r = {};
      this.m.set(uri, r);
    }
    return r;
  }

  tokens(uri: string, version: number, data: ArrayLike<number>, legend: Legend, resultId?: string): void {
    const d = Array.from(data);
    this.of(uri).tokens = { version, resultId, data: d, toks: decode(d, legend) };
    this.changed(uri, 'tokens');
  }

  // tokenEdits: an Edits answer applies to the reading it names; false (and the tokens go)
  // when the reading held is another one.
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], legend: Legend, resultId?: string): boolean {
    const r = this.of(uri);
    if (!r.tokens || r.tokens.resultId !== previousResultId) {
      r.tokens = undefined;
      this.changed(uri, 'tokens');
      return false;
    }
    const d = applyEdits(r.tokens.data, edits);
    r.tokens = { version, resultId, data: d, toks: decode(d, legend) };
    this.changed(uri, 'tokens');
    return true;
  }

  folds(uri: string, version: number, ranges: Fold[]): void {
    this.of(uri).folds = { version, ranges: ranges.map(f => ({ start: f.start, end: f.end })) };
    this.changed(uri, 'folds');
  }

  lenses(uri: string, version: number, items: Lens[]): void {
    this.of(uri).lenses = { version, items };
    this.changed(uri, 'lenses');
  }

  drop(uri: string): void { this.m.delete(uri); }
  clear(): void { this.m.clear(); }
}

// lineTokens: row LINE's tokens, by column (durandal.nvim plans.line_tokens).
export function lineTokens(toks: readonly Tok[], line: number): Tok[] {
  return toks.filter(t => t.line === line).sort((a, b) => a.start - b.start);
}

export const tokText = (tok: Tok, lineText: string): string => lineText.slice(tok.start, tok.start + tok.length);

// LiveExcerpt: a live excerpt's fence rows and the key the typed guard warns once for.
export interface LiveExcerpt { open: number; close: number; key: string }

export function liveExcerpts(lenses: readonly Lens[]): LiveExcerpt[] {
  const out: LiveExcerpt[] = [];
  for (const l of lenses) {
    if (l.command !== CLIENT_COMMANDS.planExcerpt) continue;
    const [, open, close, live, anchor] = l.args;
    if (typeof open !== 'number' || typeof close !== 'number' || live !== true) continue;
    out.push({ open, close, key: typeof anchor === 'string' ? anchor : String(open) });
  }
  return out;
}
```

`protocol.ts` imports no `vscode`, so `reading.ts` stays pure with `CLIENT_COMMANDS` imported.

- [ ] **Step 4: Run the tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plans/legend.ts src/plans/reading.ts test/planTokens.ts test/unit/legend.test.ts test/unit/reading.test.ts
git commit -m "plans: the reading model: tokens by the server's legend, folds, lenses, each by version (pure)"
```

---

### Task 4: The middleware taps, the plan layer and its test seam

**Files:**
- Create: `src/plans/taps.ts`
- Create: `src/plans/layer.ts`
- Modify: `src/server.ts` (`ClientHooks.reading`, the taps in `middleware`)
- Modify: `src/extension.ts` (build `PlanLayer`, `Api.planView`, `hooks.reading`, `hooks.stopped`)
- Test: `test/e2e/fake.14-reading.e2e.ts`

**Interfaces:**
- Consumes: `Readings`, `Fold`, `Lens` (Task 3); `Legend` (Task 3); `PlanDocs` (Task 2); `PlansOptions`, `readPlansOptions`, `onPlansOptions` (Task 2).
- Produces:
  - `taps.ts`: `interface ReadingHooks { isPlan(doc: vscode.TextDocument): Promise<boolean>; tokens(uri: string, version: number, data: ArrayLike<number>, resultId: string | undefined, legend: Legend): void; tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], resultId: string | undefined, legend: Legend): void; folds(uri: string, version: number, ranges: Fold[]): void; lenses(uri: string, version: number, items: Lens[]): void }`; `planTaps(hooks: () => ReadingHooks | undefined, legend: () => Legend | undefined, warn: (m: string) => void): PlanTaps` where `PlanTaps = Pick<Middleware, 'provideDocumentSemanticTokens' | 'provideDocumentSemanticTokensEdits' | 'provideFoldingRanges' | 'provideCodeLenses'>`.
  - `layer.ts`: `class PlanLayer implements ReadingHooks` with `readonly readings: Readings`, `constructor(d: LayerDeps)`, `register(context)`, `stopped()`, `options(o: PlansOptions)`, `api(): PlanViewApi`; `interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say }`; `interface PlanViewApi { reading(uri: string): PlanReading | undefined; drawn(uri: string): Drawn; entered(uri: string): boolean }`; `interface Drawn { glyphs: { line: number; start: number; end: number; text: string }[]; verdicts: { line: number; kind: string; text: string }[]; conclusions: { line: number; text: string }[] }` (empty lists until Tasks 5 to 7 fill them; `entered` false until Task 7).
  - `server.ts`: `ClientHooks.reading?: ReadingHooks`.
  - `extension.ts`: `Api.planView: PlanViewApi`.

- [ ] **Step 1: Write the failing e2e**

Add to `test/e2e/fake.14-reading.e2e.ts` (imports: `reply`, `docOf` from `./helpers`; `encode` from `../planTokens`):

```ts
const PLAN_TEXT = [
  '# A plan',                                   // 0
  '',                                           // 1
  '- [ ] a step @src/a.py:F',                   // 2
  '- [x] done step @src/a.py:F ✓ abc1234',      // 3
  '  - 25 Oct 21:31 · do (sonnet) · answered',  // 4
  '- ? Why F?',                                 // 5
  '  - because @src/a.py:F ✓ abc1234',          // 6
  '  - A later note.',                          // 7
  '',
].join('\n');

const TOKENS = encode([
  [2, 0, 6, 'planMarker'], [2, 6, 6, 'planStep'], [2, 13, 10, 'planAnchorPath'], [2, 23, 1, 'planAnchorUnit'],
  [3, 0, 6, 'planMarker'], [3, 6, 9, 'planStepDone'], [3, 16, 10, 'planAnchorPath'], [3, 26, 1, 'planAnchorUnit'], [3, 28, 1, 'planVerdict'], [3, 30, 7, 'planFingerprint'],
  [4, 2, 2, 'planMarker', ['done']], [4, 4, 37, 'planJournal', ['done']],
  [5, 0, 4, 'planMarker'], [5, 4, 6, 'planQuestion'],
  [6, 2, 2, 'planMarker'], [6, 4, 7, 'planEvidence'], [6, 12, 10, 'planAnchorPath'], [6, 22, 1, 'planAnchorUnit'], [6, 24, 1, 'planVerdict'], [6, 26, 7, 'planFingerprint'],
  [7, 2, 2, 'planMarker'], [7, 4, 13, 'planClaim'],
]);
const FOLDS = [{ startLine: 3, endLine: 4, kind: 'region' }, { startLine: 5, endLine: 7, kind: 'region' }];
const uriOf = (rel: string) => file(rel).toString();

// canned: the plan's tokens, folds and lenses as the server would answer them
function canned(lenses: unknown[] = []): void {
  reply('textDocument/semanticTokens/full', { data: TOKENS });
  reply('textDocument/foldingRange', FOLDS);
  reply('textDocument/codeLens', lenses);
}

// fresh: the plan open, its reading at the document's version
async function fresh(): Promise<vscode.TextEditor> {
  const a = await running();
  const ed = await open(file(PLAN));
  const v = () => ed.document.version;
  await until(() => {
    const r = a.planView.reading(uriOf(PLAN));
    return r?.tokens?.version === v() && r.folds?.version === v();
  }, 'the plan\'s reading at its version');
  return ed;
}
```

and, inside the `describe`, a `beforeEach` and two tests:

```ts
  beforeEach(async () => {
    canned();
    await settle(PLAN, PLAN_TEXT);
  });

  it('a plan\'s tokens, folds and lenses are copied at its version; another file\'s are not (spec §3.2)', async () => {
    const a = await running();
    canned([{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }, command: { title: '1 delegation', command: 'olifant.plans.errand', arguments: [uriOf(PLAN), 2] } }]);
    await fresh();
    const r = a.planView.reading(uriOf(PLAN))!;
    assert.deepEqual(r.tokens!.toks.filter(t => t.line === 3).map(t => t.type),
      ['planMarker', 'planStepDone', 'planAnchorPath', 'planAnchorUnit', 'planVerdict', 'planFingerprint']);
    assert.deepEqual([...r.tokens!.toks.find(t => t.line === 4)!.modifiers], ['done']);
    assert.deepEqual(r.folds!.ranges, [{ start: 3, end: 4 }, { start: 5, end: 7 }]);
    await until(() => a.planView.reading(uriOf(PLAN))?.lenses, 'the lenses');
    assert.deepEqual(a.planView.reading(uriOf(PLAN))!.lenses!.items, [{ line: 2, command: 'olifant.plans.errand', args: [uriOf(PLAN), 2] }]);
    await open(file('one/main.py'));
    await sleep(500);
    assert.equal(a.planView.reading(uriOf('one/main.py')), undefined);
  });

  it('a stop forgets every reading; a close forgets the plan\'s (spec §3.2)', async () => {
    const a = await running();
    await fresh();
    await a.server.stop();
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
    await a.server.start();
    await fresh();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // VS Code closes a document some time after its last tab: wait for the close
    await until(() => !docOf(PLAN) || undefined, 'the plan closed', 60_000);
    assert.equal(a.planView.reading(uriOf(PLAN)), undefined);
  });
```

(`sleep` joins the helper imports.) If VS Code keeps the document open past the 60 s in the second test, replace the close half with a call to the layer's close path through `a.planView` only if Step 3's design gives one; do not add a seam for it otherwise, and say so in the commit message.

- [ ] **Step 2: Run it to see it fail**

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: FAIL to compile (`planView` is not on `Api`).

- [ ] **Step 3: Implement the taps**

`src/plans/taps.ts`:

```ts
import type * as vscode from 'vscode';
import type { Middleware } from 'vscode-languageclient/node';
import type { Legend, TokenEdit } from './legend';
import type { Fold, Lens } from './reading';

// The middleware taps (spec §3.2, approach A): each hook calls next, returns its answer to the
// library untouched, and for a plan copies it into the reading model with the document version
// it was asked at. The plan check is asynchronous and runs after the answer is returned: no
// latency is added, and a tap's failure never reaches the library.
export interface ReadingHooks {
  isPlan(doc: vscode.TextDocument): Promise<boolean>;
  tokens(uri: string, version: number, data: ArrayLike<number>, resultId: string | undefined, legend: Legend): void;
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], resultId: string | undefined, legend: Legend): void;
  folds(uri: string, version: number, ranges: Fold[]): void;
  lenses(uri: string, version: number, items: Lens[]): void;
}

export type PlanTaps = Pick<Middleware, 'provideDocumentSemanticTokens' | 'provideDocumentSemanticTokensEdits' | 'provideFoldingRanges' | 'provideCodeLenses'>;

export function planTaps(hooks: () => ReadingHooks | undefined, legend: () => Legend | undefined, warn: (m: string) => void): PlanTaps {
  const record = (doc: vscode.TextDocument, what: string, f: (h: ReadingHooks) => void) => {
    const h = hooks();
    if (!h) return;
    h.isPlan(doc).then(yes => { if (yes) f(h); })
      .catch((err: unknown) => warn(`plans: reading the ${what} of ${doc.uri.toString()} failed: ${err instanceof Error ? err.message : String(err)}`));
  };
  return {
    provideDocumentSemanticTokens: async (document, token, next) => {
      const version = document.version;
      const r = await next(document, token);
      const l = legend();
      if (r && l) record(document, 'tokens', h => h.tokens(document.uri.toString(), version, r.data, r.resultId, l));
      return r;
    },
    provideDocumentSemanticTokensEdits: async (document, previousResultId, token, next) => {
      const version = document.version;
      const r = await next(document, previousResultId, token);
      const l = legend();
      if (r && l) {
        record(document, 'tokens', h => ('edits' in r
          ? h.tokenEdits(document.uri.toString(), version, previousResultId, r.edits, r.resultId, l)
          : h.tokens(document.uri.toString(), version, r.data, r.resultId, l)));
      }
      return r;
    },
    provideFoldingRanges: async (document, context, token, next) => {
      const version = document.version;
      const r = await next(document, context, token);
      if (r) record(document, 'folds', h => h.folds(document.uri.toString(), version, r.map(f => ({ start: f.start, end: f.end }))));
      return r;
    },
    provideCodeLenses: async (document, token, next) => {
      const version = document.version;
      const r = await next(document, token);
      if (r) {
        record(document, 'lenses', h => h.lenses(document.uri.toString(), version,
          r.map(l => ({ line: l.range.start.line, command: l.command?.command ?? '', args: l.command?.arguments ?? [] }))));
      }
      return r;
    },
  };
}
```

`f(h)` runs inside `.then`, so a throw in a reading hook lands in `.catch` and is warned, never thrown into the library.

In `src/server.ts`: import `planTaps` and `type ReadingHooks` from `./plans/taps`; add to `ClientHooks`:

```ts
  // plans (M6 spec §3.2): the server's tokens, folds and lenses of a plan, copied as they pass
  reading?: ReadingHooks;
```

and as the first entry of `middleware` (before `workspace`):

```ts
        // the plan reading layer's taps: answers pass through untouched (M6 spec §3.2)
        ...planTaps(() => hooks.reading, () => made.lc?.initializeResult?.capabilities.semanticTokensProvider?.legend,
          m => this.output.warn(m)),
```

- [ ] **Step 4: Implement the layer**

`src/plans/layer.ts`:

```ts
import * as vscode from 'vscode';
import type { Say } from '../server';
import type { Legend, TokenEdit } from './legend';
import type { PlanDocs } from './planDocs';
import { Fold, Lens, Part, PlanReading, Readings } from './reading';
import type { PlansOptions } from './settings';
import type { ReadingHooks } from './taps';

// Drawn: what the layer last painted for a document (VS Code cannot be asked; the e2e reads it).
export interface Drawn {
  glyphs: { line: number; start: number; end: number; text: string }[];
  verdicts: { line: number; kind: string; text: string }[];
  conclusions: { line: number; text: string }[];
}

export interface PlanViewApi {
  reading(uri: string): PlanReading | undefined;
  drawn(uri: string): Drawn;
  entered(uri: string): boolean;
}

export interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say }

const empty = (): Drawn => ({ glyphs: [], verdicts: [], conclusions: [] });

// PlanLayer owns the plans reading layer (M6 spec §3): the readings the taps fill, the events
// that repaint, what each document shows. Later tasks add the glyphs (Task 5), the verdict
// margin (Task 6), folds and conclusions (Task 7), the Enter rule and the excerpt guard (Task 8).
export class PlanLayer implements ReadingHooks {
  readonly readings = new Readings((uri, part) => this.changed(uri, part));
  private opts: PlansOptions;
  private readonly drawnBy = new Map<string, Drawn>();

  constructor(private readonly d: LayerDeps) {
    this.opts = d.options;
  }

  isPlan(doc: vscode.TextDocument): Promise<boolean> { return this.d.docs.is(doc); }
  tokens(uri: string, version: number, data: ArrayLike<number>, resultId: string | undefined, legend: Legend): void {
    this.readings.tokens(uri, version, data, legend, resultId);
  }
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], resultId: string | undefined, legend: Legend): void {
    this.readings.tokenEdits(uri, version, previousResultId, edits, legend, resultId);
  }
  folds(uri: string, version: number, ranges: Fold[]): void { this.readings.folds(uri, version, ranges); }
  lenses(uri: string, version: number, items: Lens[]): void { this.readings.lenses(uri, version, items); }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())));
  }

  options(o: PlansOptions): void {
    this.opts = o;
    this.d.docs.clear();
    this.repaintAll();
  }

  // the server stopped: nothing it said stands (spec §5.7)
  stopped(): void {
    this.readings.clear();
    this.repaintAll();
  }

  api(): PlanViewApi {
    return {
      reading: uri => this.readings.get(uri),
      drawn: uri => this.drawnBy.get(uri) ?? empty(),
      entered: () => false,
    };
  }

  private closed(uri: string): void {
    this.readings.drop(uri);
    this.d.docs.forget(uri);
    this.drawnBy.delete(uri);
  }

  private changed(uri: string, _part: Part): void {
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.repaint(ed);
  }

  protected repaintAll(): void {
    for (const ed of vscode.window.visibleTextEditors) this.repaint(ed);
  }

  // repaint: Task 5 draws glyphs here; for now there is nothing to draw
  protected repaint(_editor: vscode.TextEditor): void {}
}
```

Drop the protected modifiers if lint objects to unused ones; they are there so later tasks fill `repaint` in place, not to subclass.

In `src/extension.ts`: import `PlanLayer`, `PlanViewApi`; add `planView: PlanViewApi;` to `Api` with the comment `// the plans reading layer (M6a): a plan's reading, what it shows, whether it was entered`. Replace Task 2's plans block with:

```ts
  // plans (M6): durandal.plans.*, the one plan check, durandal.isPlan, the reading layer
  let plansOptions = readPlansOptions();
  const planDocs = new PlanDocs(() => plansOptions.dir);
  const layer = new PlanLayer({ docs: planDocs, options: plansOptions, say });
  layer.register(context);
  hooks.reading = layer;
  const plansTracked = trackIsPlan(context, planDocs);
  onPlansOptions(context, o => {
    plansOptions = o;
    layer.options(o);
    plansTracked.refresh();
  });
```

(the separate `onDidCloseTextDocument` listener from Task 2 goes: the layer forgets the plan check on close). Add `layer.stopped();` to `hooks.stopped`, and `planView: layer.api()` to the returned object.

- [ ] **Step 5: Run the e2e**

Run: `npm run lint && npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS. Then `DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`: every fake suite PASSES (the taps change nothing the library returns).

- [ ] **Step 6: Commit**

```bash
git add src/plans/taps.ts src/plans/layer.ts src/server.ts src/extension.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: middleware taps copy a plan's tokens, folds and lenses into the reading model"
```

---

### Task 5: Glyphs (spec §3.3)

**Files:**
- Modify: `src/plans/glyphs.ts` (`Conceal`, `concealOf`, `conceals`)
- Create: `src/plans/decorate.ts`
- Modify: `src/plans/layer.ts` (repaint draws glyphs; selection and visible-editor events)
- Test: `test/unit/glyphs.test.ts`, `test/e2e/fake.14-reading.e2e.ts`

**Interfaces:**
- Consumes: `Tok` (Task 3), `Glyphs`, `DEFAULT_GLYPHS` (Task 2), `PlanLayer`, `Drawn` (Task 4).
- Produces:
  - `glyphs.ts`: `interface Conceal { line: number; start: number; end: number; glyph: string }`; `concealOf(tok: Tok, lineText: string, glyphs: Glyphs): Conceal | undefined`; `conceals(tokens: { version: number; toks: readonly Tok[] } | undefined, version: number, lineAt: (line: number) => string | undefined, glyphs: Glyphs, skip: ReadonlySet<number>): Conceal[] | undefined` (`undefined`: the tokens are for another version, leave what is drawn).
  - `decorate.ts`: `interface PaintInput { conceals?: Conceal[]; margin?: Mark[]; conclusions?: { line: number; text: string }[] }` (an absent field leaves that layer as drawn; `Mark` is Task 6's, add the field there); `class PlanDecorations implements vscode.Disposable { paint(editor: vscode.TextEditor, input: PaintInput): void; dispose(): void }`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/glyphs.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concealOf, conceals, DEFAULT_GLYPHS } from '../../src/plans/glyphs';
import { decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND, TokSpec } from '../planTokens';

const tok = (spec: TokSpec) => decode(encode([spec]), PLAN_LEGEND)[0];

test('concealOf: a marker by its trimmed text; the glyph keeps the marker\'s trailing space (nvim plans.lua:85-118)', () => {
  const g = DEFAULT_GLYPHS;
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [ ] a step', g), { line: 2, start: 0, end: 5, glyph: '☐' });
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [x] done', g), { line: 2, start: 0, end: 5, glyph: '☑' });
  assert.deepEqual(concealOf(tok([2, 0, 6, 'planMarker']), '- [X] done', g), { line: 2, start: 0, end: 5, glyph: '☑' });
  assert.deepEqual(concealOf(tok([2, 0, 4, 'planMarker']), '- ? Why F?', g), { line: 2, start: 0, end: 3, glyph: '?' });
  assert.deepEqual(concealOf(tok([2, 2, 8, 'planMarker']), '  - test: it works', g), { line: 2, start: 2, end: 9, glyph: '·' });
  assert.deepEqual(concealOf(tok([2, 2, 7, 'planMarker']), '  - also @a.py:F', g), { line: 2, start: 2, end: 8, glyph: '+' });
});

test('concealOf: an empty glyph hides the whole token, its space too', () => {
  const g = DEFAULT_GLYPHS;
  assert.deepEqual(concealOf(tok([4, 2, 2, 'planMarker']), '  - a claim', g), { line: 4, start: 2, end: 4, glyph: '' });
  assert.deepEqual(concealOf(tok([2, 13, 10, 'planAnchorPath']), '- [ ] a step @src/a.py:F', g), { line: 2, start: 13, end: 23, glyph: '' });
  assert.deepEqual(concealOf(tok([3, 30, 7, 'planFingerprint']), '- [x] done step @src/a.py:F ✓ abc1234', g), { line: 3, start: 30, end: 37, glyph: '' });
});

test('concealOf: overrides apply; other types and a token past its line\'s end give nothing', () => {
  const g = { ...DEFAULT_GLYPHS, todo: '[]', path: '@' };
  assert.equal(concealOf(tok([0, 0, 6, 'planMarker']), '- [ ] s', g)!.glyph, '[]');
  assert.deepEqual(concealOf(tok([0, 7, 4, 'planAnchorPath']), '- [ ] s @a.py:F', g), { line: 0, start: 7, end: 11, glyph: '@' });
  assert.equal(concealOf(tok([0, 6, 1, 'planStep']), '- [ ] s', g), undefined);
  assert.equal(concealOf(tok([0, 0, 6, 'planMarker']), '- [ ]', g), undefined);
});

test('conceals: none for a stale reading (undefined: leave what is drawn); cursor lines raw; no reading draws nothing', () => {
  const toks = decode(encode([[0, 0, 6, 'planMarker'], [1, 0, 6, 'planMarker']]), PLAN_LEGEND);
  const lines = ['- [ ] a', '- [x] b'];
  const at = (l: number) => lines[l];
  assert.equal(conceals({ version: 3, toks }, 4, at, DEFAULT_GLYPHS, new Set()), undefined);
  assert.deepEqual(conceals({ version: 4, toks }, 4, at, DEFAULT_GLYPHS, new Set([1])), [{ line: 0, start: 0, end: 5, glyph: '☐' }]);
  assert.deepEqual(conceals(undefined, 4, at, DEFAULT_GLYPHS, new Set()), []);
  assert.deepEqual(conceals({ version: 4, toks }, 4, l => (l === 0 ? lines[0] : undefined), DEFAULT_GLYPHS, new Set()), [{ line: 0, start: 0, end: 5, glyph: '☐' }]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL to compile (`concealOf`, `conceals` missing).

- [ ] **Step 3: Implement the pure part**

Append to `src/plans/glyphs.ts`:

```ts
import type { Tok } from './legend';

// Conceal: hide columns [start, end) of LINE and show GLYPH in their place ('' hides only).
export interface Conceal { line: number; start: number; end: number; glyph: string }

// concealOf (nvim conceal_of): markers by their trimmed text, anchor paths and fingerprints.
// A non-empty glyph on a marker whose last character is a space stops one column early, so the
// glyph keeps the space before the text. A token running past its line gives nothing.
export function concealOf(tok: Tok, lineText: string, glyphs: Glyphs): Conceal | undefined {
  if (tok.start + tok.length > lineText.length) return undefined;
  let name: GlyphName;
  if (tok.type === 'planAnchorPath') name = 'path';
  else if (tok.type === 'planFingerprint') name = 'hex';
  else if (tok.type === 'planMarker') {
    const t = lineText.slice(tok.start, tok.start + tok.length).trim();
    name = t === '- [ ]' ? 'todo'
      : t === '- [x]' || t === '- [X]' ? 'done'
        : t === '- ?' ? 'question'
          : t === '- test:' ? 'test'
            : t === '- also' ? 'also'
              : 'dash';
  } else return undefined;
  const glyph = glyphs[name];
  let end = tok.start + tok.length;
  if (glyph !== '' && tok.type === 'planMarker' && lineText[end - 1] === ' ') end -= 1;
  return { line: tok.line, start: tok.start, end, glyph };
}

// conceals: the marks for a document at VERSION. The tokens' own version must match: tokens
// lag an edit by one request, and old columns must not be drawn onto new text (undefined:
// leave what is drawn). SKIP holds the cursor lines, which show raw text (nvim concealcursor="").
export function conceals(tokens: { version: number; toks: readonly Tok[] } | undefined, version: number,
  lineAt: (line: number) => string | undefined, glyphs: Glyphs, skip: ReadonlySet<number>): Conceal[] | undefined {
  if (!tokens) return [];
  if (tokens.version !== version) return undefined;
  const out: Conceal[] = [];
  for (const t of tokens.toks) {
    if (skip.has(t.line)) continue;
    const text = lineAt(t.line);
    if (text === undefined) continue;
    const c = concealOf(t, text, glyphs);
    if (c) out.push(c);
  }
  return out;
}
```

(the `import type` goes at the top of the file with the other imports).

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e**

Add to `fake.14-reading.e2e.ts`:

```ts
  it('conceal on: markers become glyphs, paths and fingerprints hide; the cursor line is raw; off draws none (spec §3.3)', async () => {
    const a = await running();
    await plansConfig().update('conceal', true, vscode.ConfigurationTarget.Global);
    const ed = await fresh();
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    const glyphs = () => a.planView.drawn(uriOf(PLAN)).glyphs;
    await until(() => glyphs().some(g => g.line === 2), 'the glyphs drawn');
    assert.deepEqual(glyphs().filter(g => g.line === 2), [{ line: 2, start: 0, end: 5, text: '☐' }, { line: 2, start: 13, end: 23, text: '' }]);
    assert.deepEqual(glyphs().filter(g => g.line === 3).map(g => g.text), ['☑', '', '']);
    assert.deepEqual(glyphs().filter(g => g.line === 5), [{ line: 5, start: 0, end: 3, text: '?' }]);
    ed.selection = new vscode.Selection(2, 3, 2, 3);
    await until(() => !glyphs().some(g => g.line === 2) || undefined, 'the cursor line raw');
    assert.ok(glyphs().some(g => g.line === 0 || g.line === 3), 'other lines keep theirs');
    await plansConfig().update('glyphs', { todo: '[]' }, vscode.ConfigurationTarget.Global);
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    await until(() => glyphs().find(g => g.line === 2 && g.start === 0)?.text === '[]', 'the todo override');
    await plansConfig().update('glyphs', undefined, vscode.ConfigurationTarget.Global);
    await plansConfig().update('conceal', false, vscode.ConfigurationTarget.Global);
    await until(() => glyphs().length === 0 || undefined, 'none with conceal off');
  });

  it('a stale reading leaves the glyphs as drawn until fresh tokens come (Review Focus)', async () => {
    const a = await running();
    await plansConfig().update('conceal', true, vscode.ConfigurationTarget.Global);
    const ed = await fresh();
    ed.selection = new vscode.Selection(0, 0, 0, 0);
    const glyphs = () => a.planView.drawn(uriOf(PLAN)).glyphs;
    await until(() => glyphs().some(g => g.line === 2), 'the glyphs drawn');
    const before = JSON.stringify(glyphs());
    // the next tokens answer comes 2 s late: the edit's version has none meanwhile
    reply('textDocument/semanticTokens/full', { delay: 2, data: TOKENS });
    await ed.edit(b => b.insert(new vscode.Position(1, 0), 'x\n'));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await sleep(300);
    assert.equal(JSON.stringify(glyphs()), before, 'nothing redrawn from old tokens');
    await until(() => a.planView.reading(uriOf(PLAN))?.tokens?.version === ed.document.version, 'fresh tokens', 10_000);
    await until(() => JSON.stringify(glyphs()) !== before || undefined, 'redrawn from fresh tokens');
    await plansConfig().update('conceal', false, vscode.ConfigurationTarget.Global);
  });
```

Add to the `afterEach` (create one if Task 4 added none; it runs after every test of the file):

```ts
  afterEach(async () => {
    for (const k of ['conceal', 'glyphs', 'foldDone']) await plansConfig().update(k, undefined, vscode.ConfigurationTarget.Global);
    const d = docOf(PLAN);
    if (d?.isDirty) await revert(d);
  });
```

(`revert` joins the helper imports.) The fake's `delay` form sends the rest of the canned object, `{ data }`, after the pause.

- [ ] **Step 6: Run it to see it fail**

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: FAIL: `timed out waiting for the glyphs drawn`.

- [ ] **Step 7: Implement the decorations and the repaint**

`src/plans/decorate.ts`:

```ts
import * as vscode from 'vscode';
import type { Conceal } from './glyphs';

// PaintInput: what an editor on a plan shows. An absent field leaves that layer as drawn (its
// reading is stale); an empty one clears it.
export interface PaintInput { conceals?: Conceal[] }

// PlanDecorations: the plans reading layer's decoration types (spec §3.3); per editor, as VS
// Code's decorations are. The hide is CSS the editor writes verbatim into the inline class
// (text-decoration:none; display: none;), checked in the 1.145.2 bundle: the hidden text
// takes no width. A glyph is injected text at the hidden range's start.
export class PlanDecorations implements vscode.Disposable {
  private readonly hide = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none' });
  private readonly glyph = vscode.window.createTextEditorDecorationType({});

  paint(ed: vscode.TextEditor, input: PaintInput): void {
    if (input.conceals) {
      ed.setDecorations(this.hide, input.conceals.map(c => new vscode.Range(c.line, c.start, c.line, c.end)));
      ed.setDecorations(this.glyph, input.conceals.filter(c => c.glyph !== '').map(c => ({
        range: new vscode.Range(c.line, c.start, c.line, c.start),
        renderOptions: { before: { contentText: c.glyph } },
      })));
    }
  }

  dispose(): void {
    this.hide.dispose();
    this.glyph.dispose();
  }
}
```

In `src/plans/layer.ts`: add `private readonly deco = new PlanDecorations();`; in `register`, push `this.deco` and the listeners:

```ts
    context.subscriptions.push(
      this.deco,
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeTextEditorSelection(e => this.repaint(e.textEditor)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.repaintAll()),
    );
```

and replace `repaint`:

```ts
  // repaint: what EDITOR shows, from its document's reading and the options; no request
  protected repaint(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const r = this.readings.get(uri);
    if (!r && !this.drawnBy.has(uri)) return;
    const drawn = this.drawnBy.get(uri) ?? empty();
    const input: PaintInput = {};
    const lineAt = (l: number) => (l < doc.lineCount ? doc.lineAt(l).text : undefined);
    const cursor = new Set(ed.selections.map(s => s.active.line));
    const c = this.opts.conceal ? conceals(r?.tokens, doc.version, lineAt, this.opts.glyphs, cursor) : [];
    if (c) {
      input.conceals = c;
      drawn.glyphs = c.map(x => ({ line: x.line, start: x.start, end: x.end, text: x.glyph }));
    }
    this.deco.paint(ed, input);
    this.drawnBy.set(uri, drawn);
  }
```

`closed(uri)` and `stopped()` already repaint or forget: `stopped` clears the readings, and `repaintAll` then paints `conceals([])` for every plan with drawn glyphs (the `!r && !drawnBy.has(uri)` guard keeps non-plans untouched). Imports: `PlanDecorations`, `PaintInput` from `./decorate`; `conceals` from `./glyphs`.

- [ ] **Step 8: Run the e2e and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -5 && npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/plans/glyphs.ts src/plans/decorate.ts src/plans/layer.ts test/unit/glyphs.test.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: glyphs for markers, hidden paths and fingerprints off the cursor line (conceal)"
```

---

### Task 6: The verdict margin (spec §3.4)

**Files:**
- Create: `src/plans/verdicts.ts`
- Modify: `src/plans/decorate.ts` (four margin types), `src/plans/layer.ts` (the margin in repaint; the diagnostics event; `known`)
- Modify: `test/fake-lsp/fake-lsp` (`diagnosticProvider`; an empty report by default)
- Test: `test/unit/verdicts.test.ts`, `test/e2e/fake.14-reading.e2e.ts`

**Interfaces:**
- Consumes: `Glyphs` (Task 2), `PlanDecorations`, `PaintInput` (Task 5), `PlanLayer` (Task 4).
- Produces: `verdicts.ts`: `type Severity = 0 | 1 | 2 | 3` (VS Code's `DiagnosticSeverity` numbers: Error, Warning, Information, Hint); `interface DiagLike { line: number; source?: string; code?: string; severity: Severity }`; `type MarkKind = 'wrong' | 'unsure' | 'checking' | 'queued' | 'right' | 'E' | 'W' | 'I' | 'H'`; `interface Mark { line: number; kind: MarkKind; text: string }`; `worstPerLine(diags: readonly DiagLike[], glyphs: Glyphs): Mark[]`; `type MarkColour = 'warning' | 'error' | 'passed' | 'hint'`; `colourOf(kind: MarkKind): MarkColour`. `PaintInput.margin?: Mark[]`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/verdicts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GLYPHS } from '../../src/plans/glyphs';
import { colourOf, DiagLike, worstPerLine } from '../../src/plans/verdicts';

const d = (line: number, code: string | undefined, severity: 0 | 1 | 2 | 3, source = 'olifant-plan'): DiagLike => ({ line, code, severity, source });

test('one mark per line, the worst wins: ✗ › ? › … › ○ › ✓ (nvim plans.lua:160-205)', () => {
  assert.deepEqual(worstPerLine([d(1, 'claim-right', 3), d(1, 'claim-queued', 3), d(1, 'claim-checking', 3)], DEFAULT_GLYPHS),
    [{ line: 1, kind: 'checking', text: '…' }]);
  assert.deepEqual(worstPerLine([d(2, 'claim-unsure', 3), d(2, 'claim-wrong', 1)], DEFAULT_GLYPHS), [{ line: 2, kind: 'wrong', text: '✗' }]);
  assert.deepEqual(worstPerLine([d(3, 'claim-right', 3)], DEFAULT_GLYPHS), [{ line: 3, kind: 'right', text: '✓' }]);
});

test('any verdict outranks any other diagnostic; among the others error › warning › information › hint, as E W I H', () => {
  assert.deepEqual(worstPerLine([d(1, undefined, 0, 'olifant'), d(1, 'claim-right', 3)], DEFAULT_GLYPHS), [{ line: 1, kind: 'right', text: '✓' }]);
  assert.deepEqual(worstPerLine([d(2, undefined, 3, 'olifant'), d(2, undefined, 2, 'olifant')], DEFAULT_GLYPHS), [{ line: 2, kind: 'I', text: 'I' }]);
  assert.deepEqual(worstPerLine([d(3, undefined, 0, 'olifant')], DEFAULT_GLYPHS), [{ line: 3, kind: 'E', text: 'E' }]);
  assert.deepEqual(worstPerLine([d(4, undefined, 1, 'olifant')], DEFAULT_GLYPHS), [{ line: 4, kind: 'W', text: 'W' }]);
  assert.deepEqual(worstPerLine([d(5, undefined, 3, 'olifant')], DEFAULT_GLYPHS), [{ line: 5, kind: 'H', text: 'H' }]);
});

test('only olifant-plan and olifant diagnostics count; an unknown code is a plain diagnostic; lines in order', () => {
  assert.deepEqual(worstPerLine([d(5, 'claim-wrong', 1, 'cSpell'), d(5, undefined, 0, 'markdownlint'), d(5, 'claim-queued', 3)], DEFAULT_GLYPHS),
    [{ line: 5, kind: 'queued', text: '○' }]);
  assert.deepEqual(worstPerLine([d(6, 'toString', 3)], DEFAULT_GLYPHS), [{ line: 6, kind: 'H', text: 'H' }]);
  assert.deepEqual(worstPerLine([d(9, 'claim-right', 3), d(2, 'claim-right', 3)], DEFAULT_GLYPHS).map(m => m.line), [2, 9]);
});

test('the glyphs setting names the verdict marks; the colours: wrong and warnings, errors, right, the rest', () => {
  assert.equal(worstPerLine([d(1, 'claim-wrong', 1)], { ...DEFAULT_GLYPHS, wrong: 'X' })[0].text, 'X');
  assert.deepEqual(['wrong', 'W', 'E', 'right', 'unsure', 'checking', 'queued', 'I', 'H'].map(k => colourOf(k as never)),
    ['warning', 'warning', 'error', 'passed', 'hint', 'hint', 'hint', 'hint', 'hint']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL to compile (`src/plans/verdicts` missing).

- [ ] **Step 3: Implement**

`src/plans/verdicts.ts`:

```ts
// The verdict margin's rule (spec §3.4; nvim place_claim_signs): one mark per line from the
// olifant diagnostics, the worst wins. No vscode import.
import type { Glyphs } from './glyphs';

// VS Code's DiagnosticSeverity numbers: Error 0, Warning 1, Information 2, Hint 3.
export type Severity = 0 | 1 | 2 | 3;
export interface DiagLike { line: number; source?: string; code?: string; severity: Severity }
export type MarkKind = 'wrong' | 'unsure' | 'checking' | 'queued' | 'right' | 'E' | 'W' | 'I' | 'H';
export interface Mark { line: number; kind: MarkKind; text: string }

type Verdict = 'wrong' | 'unsure' | 'checking' | 'queued' | 'right';
const VERDICTS = new Map<string, { kind: Verdict; rank: number }>([
  ['claim-wrong', { kind: 'wrong', rank: 5 }],
  ['claim-unsure', { kind: 'unsure', rank: 4 }],
  ['claim-checking', { kind: 'checking', rank: 3 }],
  ['claim-queued', { kind: 'queued', rank: 2 }],
  ['claim-right', { kind: 'right', rank: 1 }],
]);
const SOURCES = new Set(['olifant-plan', 'olifant']);
const LETTERS = ['E', 'W', 'I', 'H'] as const;

export function worstPerLine(diags: readonly DiagLike[], glyphs: Glyphs): Mark[] {
  const best = new Map<number, { rank: number; mark: Mark }>();
  for (const d of diags) {
    if (d.source === undefined || !SOURCES.has(d.source)) continue;
    const v = d.code === undefined ? undefined : VERDICTS.get(d.code);
    // a verdict ranks above every severity (nvim: rank + 10)
    const rank = v ? v.rank + 10 : 4 - d.severity;
    const mark: Mark = v ? { line: d.line, kind: v.kind, text: glyphs[v.kind] } : { line: d.line, kind: LETTERS[d.severity], text: LETTERS[d.severity] };
    const cur = best.get(d.line);
    if (!cur || rank > cur.rank) best.set(d.line, { rank, mark });
  }
  return [...best.values()].map(b => b.mark).sort((a, b) => a.line - b.line);
}

export type MarkColour = 'warning' | 'error' | 'passed' | 'hint';

export function colourOf(kind: MarkKind): MarkColour {
  if (kind === 'wrong' || kind === 'W') return 'warning';
  if (kind === 'E') return 'error';
  if (kind === 'right') return 'passed';
  return 'hint';
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: The fake answers diagnostic pulls**

In `test/fake-lsp/fake-lsp`: add `"diagnosticProvider": {"interFileDependencies": False, "workspaceDiagnostics": False}` to the capabilities; in the canned-answer branch, right after `result = json.load(...) if ... else None`, add:

```python
        if result is None and method == "textDocument/diagnostic":
            # a pull with nothing canned: an empty full report, as olifant lsp answers a clean file
            result = {"kind": "full", "items": []}
```

Add to the header's list of changes: `a diagnosticProvider (pull), answering an empty full report unless one is canned`.

Run the whole fake suite now, before the margin, to see the pulls break nothing:

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 6: Write the failing e2e**

Add to `fake.14-reading.e2e.ts` (imports: `Olifant` from `../../src/protocol`):

```ts
// a diagnostic as the server sends it (LSP severities 1 Error .. 4 Hint)
const diag = (line: number, code: string | undefined, severity: number, source = 'olifant-plan') =>
  ({ range: { start: { line, character: 4 }, end: { line, character: 10 } }, severity, source, message: 'm', ...(code ? { code } : {}) });

// repull: the server asks the client to pull diagnostics again (workspace/diagnostic/refresh),
// sent before the answer to a request the test makes
async function repull(uri: string): Promise<void> {
  const a = await running();
  reply('olifant/plans/files', { notify: [{ method: 'workspace/diagnostic/refresh', params: null, request: true }], items: [] });
  await a.server.request(Olifant.plansFiles, { textDocument: { uri } });
}
```

```ts
  it('the margin: one mark per line, the worst wins, from olifant\'s diagnostics only (spec §3.4)', async () => {
    const a = await running();
    reply('textDocument/diagnostic', { kind: 'full', items: [
      diag(6, 'claim-right', 4), diag(6, 'claim-wrong', 2), diag(7, 'claim-queued', 4),
      diag(2, undefined, 4, 'olifant'), diag(5, 'claim-wrong', 2, 'cSpell'),
    ] });
    await fresh();
    await repull(uriOf(PLAN));
    const margin = () => a.planView.drawn(uriOf(PLAN)).verdicts;
    await until(() => margin().length === 3 || undefined, 'three marks');
    assert.deepEqual(margin(), [{ line: 2, kind: 'H', text: 'H' }, { line: 6, kind: 'wrong', text: '✗' }, { line: 7, kind: 'queued', text: '○' }]);
    await plansConfig().update('glyphs', { wrong: 'X' }, vscode.ConfigurationTarget.Global);
    await until(() => margin().find(m => m.line === 6)?.text === 'X', 'the wrong override');
    reply('textDocument/diagnostic', { kind: 'full', items: [] });
    await repull(uriOf(PLAN));
    await until(() => margin().length === 0 || undefined, 'no marks once the diagnostics go');
  });
```

and in `afterEach`: `reply('textDocument/diagnostic', null);`.

- [ ] **Step 7: Run it to see it fail**

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: FAIL: `timed out waiting for three marks`.

- [ ] **Step 8: Implement the margin**

In `src/plans/decorate.ts`: `PaintInput` gains `margin?: Mark[]`; the class gains the four margin types and paints them:

```ts
  // the verdict margin: a mark before column 0, in its colour (spec §3.4)
  private readonly margin: Record<MarkColour, vscode.TextEditorDecorationType> = {
    warning: marginType('editorWarning.foreground'),
    error: marginType('editorError.foreground'),
    passed: marginType('testing.iconPassed'),
    hint: marginType('editorHint.foreground'),
  };
```

```ts
const marginType = (colour: string) => vscode.window.createTextEditorDecorationType({
  before: { color: new vscode.ThemeColor(colour), margin: '0 0.6ch 0 0' },
});
```

in `paint`:

```ts
    if (input.margin) {
      for (const [colour, type] of Object.entries(this.margin) as [MarkColour, vscode.TextEditorDecorationType][]) {
        ed.setDecorations(type, input.margin.filter(m => m.text !== '' && colourOf(m.kind) === colour && m.line < ed.document.lineCount).map(m => ({
          range: new vscode.Range(m.line, 0, m.line, 0),
          renderOptions: { before: { contentText: m.text } },
        })));
      }
    }
```

and `dispose` disposes the four. A `claim-wrong` diagnostic is Warning severity: VS Code draws its wavy warning underline itself, so nothing is added for it (the deviation in the header).

In `src/plans/layer.ts`:

- a set of documents known to be plans, filled by the plan check the taps make:

```ts
  private readonly known = new Set<string>();

  isPlan(doc: vscode.TextDocument): Promise<boolean> {
    return this.d.docs.is(doc).then(yes => {
      if (yes) this.known.add(doc.uri.toString());
      return yes;
    });
  }
```

  `closed(uri)` and `options(o)` clear it (`this.known.delete(uri)`, `this.known.clear()`).

- the diagnostics event in `register`:

```ts
      vscode.languages.onDidChangeDiagnostics(e => {
        for (const uri of e.uris) if (this.known.has(uri.toString())) this.changed(uri.toString(), 'margin');
      }),
```

  (`changed`'s second parameter becomes `Part | 'margin'`; it only repaints.)

- in `repaint`, after the conceals, for a known plan:

```ts
    if (this.known.has(uri)) {
      const margin = worstPerLine(vscode.languages.getDiagnostics(doc.uri).map(diagLike), this.opts.glyphs);
      input.margin = margin;
      drawn.verdicts = margin.map(m => ({ line: m.line, kind: m.kind, text: m.text }));
    }
```

  and change the early return to `if (!r && !this.drawnBy.has(uri) && !this.known.has(uri)) return;`.

- the conversion, at the bottom of the file:

```ts
// diagLike: a VS Code diagnostic as the margin rule reads it (a code may be an object)
function diagLike(d: vscode.Diagnostic): DiagLike {
  const code = d.code === undefined ? undefined : typeof d.code === 'object' ? String(d.code.value) : String(d.code);
  return { line: d.range.start.line, source: d.source, code, severity: d.severity as Severity };
}
```

Imports: `worstPerLine`, `DiagLike`, `Severity` from `./verdicts`.

- [ ] **Step 9: Run the e2e, the fake suite and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -5 && npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/plans/verdicts.ts src/plans/decorate.ts src/plans/layer.ts test/fake-lsp/fake-lsp test/unit/verdicts.test.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: the verdict margin, worst mark per line from olifant's diagnostics"
```

---

### Task 7: Folds close on entry, and their conclusions (spec §3.6)

**Files:**
- Create: `src/plans/foldText.ts`
- Create: `src/plans/folds.ts`
- Modify: `src/plans/decorate.ts` (the conclusion type), `src/plans/layer.ts` (entry on activation and on fresh folds; conclusions in repaint; visible-range event; `entered`)
- Test: `test/unit/foldText.test.ts`, `test/e2e/fake.14-reading.e2e.ts`

**Interfaces:**
- Consumes: `Tok` (Task 3), `Fold`, `PlanReading`, `lineTokens`, `tokText` (Task 3), `PlanLayer` (Tasks 4 to 6).
- Produces:
  - `foldText.ts`: `interface Span { start: number; end: number }` (inclusive line ranges, as `editor.visibleRanges` give them); `foldLabel(toks: readonly Tok[], lineAt: (row: number) => string | undefined, start: number, end: number, width?: number): string`; `entryTargets(folds: readonly Fold[], lineAt: (row: number) => string | undefined, foldDone: boolean): number[]` (latest first); `collapsedStarts(folds: readonly Fold[], visible: readonly Span[], lineCount: number): Fold[]`; `stillOpen(targets: readonly number[], visible: readonly Span[]): number[]`.
  - `folds.ts`: `class FoldEntry { constructor(d: EntryDeps); entered(uri: string): boolean; forget(uri: string): void; enter(editor: vscode.TextEditor): Promise<void> }`; `interface EntryDeps { reading(uri: string): PlanReading | undefined; foldDone(): boolean; isPlan(doc: vscode.TextDocument): Promise<boolean> }`.
  - `PaintInput.conclusions?: { line: number; text: string }[]`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/foldText.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapsedStarts, entryTargets, foldLabel, stillOpen } from '../../src/plans/foldText';
import { decode } from '../../src/plans/legend';
import { encode, PLAN_LEGEND, TokSpec } from '../planTokens';

const QUESTION = ['- ? Why F?', '  - because @src/a.py:F ✓ abc1234', '  - An early note.', '    - a detail', '  - A later note.'];
const Q_TOKS: TokSpec[] = [
  [0, 0, 4, 'planMarker'], [0, 4, 6, 'planQuestion'],
  [1, 2, 2, 'planMarker'], [1, 4, 7, 'planEvidence'],
  [2, 2, 2, 'planMarker'], [2, 4, 14, 'planClaim'],
  [3, 4, 2, 'planMarker'], [3, 6, 8, 'planClaim'],
  [4, 2, 2, 'planMarker'], [4, 4, 13, 'planClaim'],
];
const toks = (specs: TokSpec[]) => decode(encode(specs), PLAN_LEGEND);
const at = (lines: string[]) => (r: number) => lines[r];

test('a question\'s label: its conclusion, the last claim at its first child\'s indent (nvim plans_spec :594)', () => {
  assert.equal(foldLabel(toks(Q_TOKS), at(QUESTION), 0, 4), ' — A later note. ▸ 4');
  // the deeper claim on row 3 is not at the child indent: the scan from row 2 finds the early note
  assert.equal(foldLabel(toks(Q_TOKS), at(QUESTION), 0, 3), ' — An early note. ▸ 3');
  assert.equal(foldLabel(toks(Q_TOKS.filter(t => t[3] !== 'planClaim')), at(QUESTION), 0, 4), ' ▸ 4');
});

test('a done step\'s label: its unit and verdict (nvim plans_spec :602)', () => {
  const line = '- [x] done step @src/a.py:F ✓ abc1234';
  const t = toks([[0, 0, 6, 'planMarker'], [0, 6, 9, 'planStepDone'], [0, 16, 10, 'planAnchorPath'], [0, 26, 1, 'planAnchorUnit'], [0, 28, 1, 'planVerdict'], [0, 30, 7, 'planFingerprint']]);
  assert.equal(foldLabel(t, at([line, '  - child']), 0, 1), '  F ✓ ▸ 1');
  assert.equal(foldLabel(toks([[0, 0, 6, 'planMarker'], [0, 6, 9, 'planStepDone']]), at(['- [x] done step', '  - c']), 0, 1), ' ▸ 1');
});

test('anything else, or no tokens yet: the count alone', () => {
  assert.equal(foldLabel([], at(['  ```python @a.py:F', '  x', '  ```']), 0, 2), ' ▸ 2');
});

test('the label is cut at the width with …, keeping ▸ N (nvim plans_spec :609)', () => {
  const long = ['- ? Why?', `  - ${'word '.repeat(30).trim()}`];
  const t = toks([[0, 0, 4, 'planMarker'], [0, 4, 4, 'planQuestion'], [1, 2, 2, 'planMarker'], [1, 4, long[1].length - 4, 'planClaim']]);
  const label = foldLabel(t, at(long), 0, 1, 30);
  assert.equal(label.length, 30);
  assert.ok(label.endsWith('… ▸ 1'), label);
  assert.ok(foldLabel(t, at(long), 0, 1).length <= 80);
});

test('entryTargets: every range that spans rows, latest first; foldDone false keeps the excerpts only', () => {
  const lines = ['- [x] a', '  - c', '- [ ] b', '  ```python @a.py:F', '  x', '  ```'];
  const folds = [{ start: 0, end: 1 }, { start: 3, end: 5 }, { start: 2, end: 2 }];
  assert.deepEqual(entryTargets(folds, at(lines), true), [3, 0]);
  assert.deepEqual(entryTargets(folds, at(lines), false), [3]);
});

test('collapsedStarts: a start shown and the row after it hidden, with something shown below it', () => {
  const folds = [{ start: 3, end: 4 }, { start: 6, end: 8 }, { start: 12, end: 15 }];
  assert.deepEqual(collapsedStarts(folds, [{ start: 0, end: 3 }, { start: 5, end: 12 }], 30), [{ start: 3, end: 4 }]);
  // 12 is the viewport's last row: its next row may just be below the screen
  assert.deepEqual(collapsedStarts([{ start: 12, end: 15 }], [{ start: 0, end: 12 }], 30), []);
  // a fold to the document's end, collapsed: nothing below it to show
  assert.deepEqual(collapsedStarts([{ start: 12, end: 15 }], [{ start: 0, end: 12 }], 16), [{ start: 12, end: 15 }]);
});

test('stillOpen: targets whose row and next row are both shown', () => {
  assert.deepEqual(stillOpen([3, 6, 12], [{ start: 0, end: 3 }, { start: 5, end: 12 }]), [6]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL to compile (`src/plans/foldText` missing).

- [ ] **Step 3: Implement the pure part**

`src/plans/foldText.ts`:

```ts
// Folds' pure rules (spec §3.6; nvim foldtext, entry_targets): the label a collapsed fold shows
// at its line's end, the rows closed on entry, which folds the viewport shows collapsed. VS
// Code has no fold-text API: the line's own text stays visible, so nvim's leading glyph and
// text are not repeated. No vscode import.
import type { Tok } from './legend';
import { Fold, lineTokens, tokText } from './reading';

// Span: an inclusive range of rows (editor.visibleRanges, as rows).
export interface Span { start: number; end: number }

const indentOf = (s: string) => s.length - s.trimStart().length;

export function foldLabel(toks: readonly Tok[], lineAt: (row: number) => string | undefined, start: number, end: number, width = 80): string {
  const suffix = ` ▸ ${end - start}`;
  const row = lineTokens(toks, start);
  let head = '';
  if (row.some(t => t.type === 'planQuestion')) {
    const child = lineAt(start + 1);
    if (child !== undefined) {
      const want = indentOf(child);
      for (let r = end; r > start; r--) {
        const text = lineAt(r);
        if (text === undefined || text.trim() === '' || indentOf(text) !== want) continue;
        const claim = lineTokens(toks, r).find(t => t.type === 'planClaim');
        if (claim) {
          head = ` — ${tokText(claim, text)}`;
          break;
        }
      }
    }
  } else if (row.some(t => t.type === 'planStepDone')) {
    const text = lineAt(start) ?? '';
    const parts = ['planAnchorUnit', 'planVerdict']
      .map(type => row.find(t => t.type === type))
      .filter((t): t is Tok => t !== undefined)
      .map(t => tokText(t, text));
    if (parts.length > 0) head = `  ${parts.join(' ')}`;
  }
  if (head.length + suffix.length > width) head = `${head.slice(0, Math.max(0, width - suffix.length - 1))}…`;
  return head + suffix;
}

// entryTargets: the starts closed when a plan is first shown, latest first (an inner fold
// before its parent). foldDone false: excerpts only (a start row opening a fence).
export function entryTargets(folds: readonly Fold[], lineAt: (row: number) => string | undefined, foldDone: boolean): number[] {
  const starts = new Set<number>();
  for (const f of folds) {
    if (f.end <= f.start) continue;
    if (!foldDone && !/^\s*```/.test(lineAt(f.start) ?? '')) continue;
    starts.add(f.start);
  }
  return [...starts].sort((a, b) => b - a);
}

const shown = (row: number, visible: readonly Span[]) => visible.some(v => v.start <= row && row <= v.end);

// collapsedStarts: folds whose start is shown and whose next row is not, and below which
// something is shown (else the next row may only be below the viewport), or which run to the
// document's end.
export function collapsedStarts(folds: readonly Fold[], visible: readonly Span[], lineCount: number): Fold[] {
  const seen = new Set<number>();
  const out: Fold[] = [];
  for (const f of folds) {
    if (f.end <= f.start || seen.has(f.start)) continue;
    if (!shown(f.start, visible) || shown(f.start + 1, visible)) continue;
    if (!visible.some(v => v.start > f.start) && f.end < lineCount - 1) continue;
    seen.add(f.start);
    out.push({ start: f.start, end: f.end });
  }
  return out;
}

// stillOpen: TARGETS the viewport shows open (the row and the next both shown). A target the
// viewport cannot tell about is not in it: folding it again could fold its parent.
export function stillOpen(targets: readonly number[], visible: readonly Span[]): number[] {
  return targets.filter(t => shown(t, visible) && shown(t + 1, visible));
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e**

Each test that needs a first entry uses a plan file of its own: a document stays open in VS Code for a while after its last tab closes, and an entered document does not close its folds again. Add to `fake.14-reading.e2e.ts`:

```ts
const EXCERPT_TEXT = [
  '# Excerpts',                          // 0
  '',                                    // 1
  '- [ ] show F @src/a.py:F',            // 2
  '  ```python @src/a.py:F',             // 3
  '  def F():',                          // 4
  '      return 1',                      // 5
  '  ```',                               // 6
  '- [x] done @src/a.py:F ✓ abc1234',    // 7
  '  - a child',                         // 8
  '',
].join('\n');
const EXCERPT_FOLDS = [{ startLine: 3, endLine: 6, kind: 'region' }, { startLine: 7, endLine: 8, kind: 'region' }];

// a new plan file, its text written, opened
async function newPlan(name: string, text: string): Promise<vscode.TextEditor> {
  writeFileSync(join(ws(), `one/plans/${name}`), text);
  return open(file(`one/plans/${name}`));
}
const visibleRow = (ed: vscode.TextEditor, row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
```

```ts
  it('done steps and answered questions close on entry; the heading does not; conclusions show (spec §3.6)', async () => {
    const a = await running();
    const ed = await newPlan('f1.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri), 'entered');
    await until(() => (!visibleRow(ed, 4) && !visibleRow(ed, 6)) || undefined, 'rows 4 and 6 folded');
    assert.ok(visibleRow(ed, 2) && visibleRow(ed, 3) && visibleRow(ed, 5), 'the heading\'s section and the fold starts stay shown');
    await until(() => a.planView.drawn(uri).conclusions.length === 2 || undefined, 'two conclusions');
    assert.deepEqual(a.planView.drawn(uri).conclusions, [{ line: 3, text: '  F ✓ ▸ 1' }, { line: 5, text: ' — A later note. ▸ 2' }]);
    await vscode.commands.executeCommand('editor.unfoldAll');
    await until(() => a.planView.drawn(uri).conclusions.length === 0 || undefined, 'no conclusion once open');
  });

  it('a fold that forms after entry starts open; the entered ones stay closed (spec §3.6)', async () => {
    const a = await running();
    const ed = await newPlan('f2.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri) && !visibleRow(ed, 4), 'entered, row 4 folded');
    reply('textDocument/foldingRange', [...FOLDS, { startLine: 8, endLine: 9, kind: 'region' }]);
    await ed.edit(b => b.insert(new vscode.Position(8, 0), '- [x] later\n  - its child\n'));
    await until(() => a.planView.reading(uri)?.folds?.ranges.some(f => f.start === 8) || undefined, 'the new fold read');
    await sleep(500);
    assert.ok(visibleRow(ed, 9), 'the new fold is open');
    assert.ok(!visibleRow(ed, 4), 'the entered fold is still closed');
  });

  it('foldDone off closes only the excerpts (spec §3.6)', async () => {
    const a = await running();
    await plansConfig().update('foldDone', false, vscode.ConfigurationTarget.Global);
    reply('textDocument/foldingRange', EXCERPT_FOLDS);
    reply('textDocument/semanticTokens/full', { data: [] });
    const ed = await newPlan('f3.md', EXCERPT_TEXT);
    await until(() => a.planView.entered(ed.document.uri.toString()) && !visibleRow(ed, 4), 'the excerpt folded');
    await sleep(300);
    assert.ok(visibleRow(ed, 8), 'the done step stays open');
  });

  it('no folds: gives up after 8 s, not entered; switching away during the wait leaves it not entered; folds that come later enter it (Review Focus)', async function () {
    this.timeout(60_000);
    const a = await running();
    reply('textDocument/foldingRange', null);
    const ed = await newPlan('f4.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await sleep(9_000);
    assert.equal(a.planView.entered(uri), false);
    const ed5 = await newPlan('f5.md', PLAN_TEXT);
    await open(file('one/main.py'));
    await sleep(1_000);
    assert.equal(a.planView.entered(ed5.document.uri.toString()), false);
    reply('textDocument/foldingRange', FOLDS);
    const back = await open(file('one/plans/f4.md'));
    await back.edit(b => b.insert(new vscode.Position(1, 0), ' '));
    await until(() => a.planView.entered(uri), 'entered once folds come');
    await until(() => !visibleRow(back, 4) || undefined, 'row 4 folded');
  });

  it('a plan closed and opened again closes its folds again (Review Focus)', async function () {
    this.timeout(120_000);
    const a = await running();
    const ed = await newPlan('f6.md', PLAN_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.entered(uri) && !visibleRow(ed, 4), 'entered');
    await vscode.commands.executeCommand('editor.unfoldAll');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await until(() => !vscode.workspace.textDocuments.some(d => d.uri.toString() === uri) || undefined, 'the plan closed', 90_000);
    assert.equal(a.planView.entered(uri), false);
    const again = await open(file('one/plans/f6.md'));
    await until(() => a.planView.entered(uri) && !visibleRow(again, 4), 'entered again, row 4 folded');
  });
```

Clean the files up in `after`: `for (const n of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'x1', 'x2', 'e1']) await settle(`one/plans/${n}.md`, null);` (Task 8 adds `x1`, `x2`, `e1`), and `canned()` in `beforeEach` restores the replies.

- [ ] **Step 6: Run it to see it fail**

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: FAIL: `timed out waiting for entered`.

- [ ] **Step 7: Implement close on entry**

`src/plans/folds.ts`:

```ts
import * as vscode from 'vscode';
import { entryTargets, stillOpen } from './foldText';
import type { Fold, PlanReading } from './reading';

export interface EntryDeps {
  reading(uri: string): PlanReading | undefined;
  foldDone(): boolean;
  isPlan(doc: vscode.TextDocument): Promise<boolean>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const WAIT_MS = 8_000;
const POLL_MS = 50;

// FoldEntry: close on entry (spec §3.6; nvim close_on_entry). Per document: the first time a
// plan's editor is active with the server's folds for its version, its targets fold. VS Code's
// folding model takes the ranges a moment after the provider answers, so the targets the
// viewport still shows open fold again until none is or 8 s pass. Only a target shown open is
// folded again: editor.fold on a collapsed region folds its parent. Folds that form later start
// open (VS Code's default). Leaving the editor during the wait, or no folds in 8 s, leaves the
// document not entered: the next activation, or the next folds, try again.
export class FoldEntry {
  private readonly done = new Set<string>();
  private readonly busy = new Set<string>();

  constructor(private readonly d: EntryDeps) {}

  entered(uri: string): boolean { return this.done.has(uri); }
  forget(uri: string): void { this.done.delete(uri); }

  async enter(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const uri = doc.uri.toString();
    if (this.done.has(uri) || this.busy.has(uri) || !(await this.d.isPlan(doc))) return;
    this.busy.add(uri);
    try {
      const deadline = Date.now() + WAIT_MS;
      let folds: Fold[] | undefined;
      while (Date.now() < deadline) {
        if (vscode.window.activeTextEditor !== editor) return;
        const f = this.d.reading(uri)?.folds;
        if (f && f.version === doc.version) {
          folds = f.ranges;
          break;
        }
        await sleep(POLL_MS);
      }
      if (!folds) return;
      const lineAt = (r: number) => (r < doc.lineCount ? doc.lineAt(r).text : undefined);
      let targets = entryTargets(folds, lineAt, this.d.foldDone());
      this.done.add(uri);
      while (targets.length > 0 && Date.now() < deadline) {
        if (vscode.window.activeTextEditor !== editor) return;
        await vscode.commands.executeCommand('editor.fold', { selectionLines: targets });
        await sleep(100);
        targets = stillOpen(targets, editor.visibleRanges.map(r => ({ start: r.start.line, end: r.end.line })));
      }
    } finally {
      this.busy.delete(uri);
    }
  }
}
```

`editor.fold` acts on the focused code editor, else the active one (checked in the 1.145.2 bundle); the `activeTextEditor` check before each call is what keeps it on this plan.

In `src/plans/decorate.ts`: `PaintInput` gains `conclusions?: { line: number; text: string }[]`; the class gains

```ts
  // a collapsed fold's conclusion at its line's end, in the lens colour (spec §3.6)
  private readonly conclusion = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground') },
  });
```

painted with

```ts
    if (input.conclusions) {
      ed.setDecorations(this.conclusion, input.conclusions.filter(c => c.line < ed.document.lineCount).map(c => {
        const end = ed.document.lineAt(c.line).range.end;
        return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: c.text } } };
      }));
    }
```

and disposed in `dispose`.

In `src/plans/layer.ts`:

- `private readonly entry = new FoldEntry({ reading: uri => this.readings.get(uri), foldDone: () => this.opts.foldDone, isPlan: doc => this.isPlan(doc) });`
- in `register`, the listeners and a first try for the editor active at activation:

```ts
      vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) void this.entry.enter(ed); }),
      vscode.window.onDidChangeTextEditorVisibleRanges(e => this.repaint(e.textEditor)),
```

```ts
    const active = vscode.window.activeTextEditor;
    if (active) void this.entry.enter(active);
```

- in `changed(uri, part)`: when `part === 'folds'` and the active editor shows `uri`, `void this.entry.enter(active)` (folds that come after a give-up, or after the server attached, enter the plan; `enter` returns at once for an entered document).
- `closed(uri)` calls `this.entry.forget(uri)`; `api().entered` becomes `uri => this.entry.entered(uri)`.
- in `repaint`, after the margin:

```ts
    const t = r?.tokens;
    const f = r?.folds;
    if (!f || !t) {
      input.conclusions = [];
      drawn.conclusions = [];
    } else if (f.version === doc.version && t.version === doc.version) {
      const visible = ed.visibleRanges.map(v => ({ start: v.start.line, end: v.end.line }));
      const cs = collapsedStarts(f.ranges, visible, doc.lineCount).map(x => ({ line: x.start, text: foldLabel(t.toks, lineAt, x.start, x.end) }));
      input.conclusions = cs;
      drawn.conclusions = cs;
    }
```

Imports: `FoldEntry` from `./folds`; `collapsedStarts`, `foldLabel` from `./foldText`.

- [ ] **Step 8: Run the e2e, the fake suite and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -5 && npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS. If the reopen test cannot see the document close within 90 s on this VS Code, keep the test and report it rather than weakening it: the close path is the one the user meets.

- [ ] **Step 9: Commit**

```bash
git add src/plans/foldText.ts src/plans/folds.ts src/plans/decorate.ts src/plans/layer.ts test/unit/foldText.test.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: done work and excerpts close on entry; a collapsed fold shows its conclusion"
```

---

### Task 8: Enter continues a step, and the excerpt guard (spec §3.5, §3.7)

**Files:**
- Create: `src/plans/enterRule.ts`
- Modify: `src/plans/reading.ts` (`typedInto`), `src/plans/layer.ts` (the guard), `src/extension.ts` (the Enter rule follows `durandal.isPlan`)
- Test: `test/unit/reading.test.ts`, `test/e2e/fake.14-reading.e2e.ts`

**Interfaces:**
- Consumes: `LiveExcerpt`, `liveExcerpts` (Task 3); `trackIsPlan(context, docs, changed)` (Task 2); `PlanLayer` (Tasks 4 to 7); `Say`.
- Produces: `enterRule.ts`: `PLAN_ENTER_RULES: vscode.OnEnterRule[]`; `class EnterRule implements vscode.Disposable { set(on: boolean): void; dispose(): void }`. `reading.ts`: `typedInto(excerpts: readonly LiveExcerpt[], changes: readonly { start: number; end: number }[]): string[]` (the keys typed into). The message constant `TYPED_IN_EXCERPT` in `layer.ts`.

- [ ] **Step 1: Write the failing unit test**

Append to `test/unit/reading.test.ts` (import `typedInto`):

```ts
test('typedInto: a change strictly between a live excerpt\'s fences; each key once, in excerpt order', () => {
  const ex = [{ open: 3, close: 6, key: '@a.py:F' }, { open: 10, close: 12, key: '10' }];
  assert.deepEqual(typedInto(ex, [{ start: 4, end: 4 }]), ['@a.py:F']);
  assert.deepEqual(typedInto(ex, [{ start: 3, end: 3 }, { start: 6, end: 6 }, { start: 2, end: 4 }]), []);
  assert.deepEqual(typedInto(ex, [{ start: 11, end: 11 }, { start: 5, end: 5 }, { start: 4, end: 5 }]), ['@a.py:F', '10']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL to compile (`typedInto` missing).

- [ ] **Step 3: Implement `typedInto`**

Append to `src/plans/reading.ts`:

```ts
// typedInto: the keys of the live excerpts a change lies strictly inside (between the opening
// and the closing fence rows; the fences themselves are the server's), once each.
export function typedInto(excerpts: readonly LiveExcerpt[], changes: readonly { start: number; end: number }[]): string[] {
  return excerpts.filter(x => changes.some(c => c.start > x.open && c.end < x.close)).map(x => x.key);
}
```

Run: `npm run test:unit 2>&1 | tail -5`. Expected: PASS.

- [ ] **Step 4: Write the failing e2e**

Add to `fake.14-reading.e2e.ts`:

```ts
const excerptLens = (open: number, close: number, live: boolean) => ({
  range: { start: { line: open, character: 0 }, end: { line: open, character: 0 } },
  command: { title: live ? 'live · from src/a.py · read-only' : 'frozen at tick', command: 'olifant.plans.excerpt', arguments: ['$uri', open, close, live, '@src/a.py:F'] },
});
const TYPED = 'excerpt: live and read-only, the next reconcile replaces what you type here';
```

(the lens argument `'$uri'` is sent as the literal string: the fake substitutes `$uri` only in `notify` params, and the guard does not read it.)

```ts
  it('Enter continues an open step, a done step as a plain item; not in another markdown file (spec §3.5)', async () => {
    const ed = await newPlan('e1.md', '- [ ] a step\n- [x] done\n');
    await until(async () => (await api()).isPlan(), 'a plan');
    ed.selection = new vscode.Selection(0, 12, 0, 12);
    await vscode.commands.executeCommand('type', { text: '\n' });
    assert.equal(ed.document.lineAt(1).text, '- [ ] ');
    ed.selection = new vscode.Selection(2, 10, 2, 10);
    await vscode.commands.executeCommand('type', { text: '\n' });
    assert.equal(ed.document.lineAt(3).text, '- ');
    await revert(ed.document);
    writeFileSync(join(ws(), 'one/notes.md'), '- [ ] not a plan\n');
    const notes = await open(file('one/notes.md'));
    await until(async () => !(await api()).isPlan() || undefined, 'not a plan');
    notes.selection = new vscode.Selection(0, 16, 0, 16);
    await vscode.commands.executeCommand('type', { text: '\n' });
    assert.equal(notes.document.lineAt(1).text, '');
    await revert(notes.document);
    await settle('one/notes.md', null);
  });

  it('typing inside a live excerpt warns once per excerpt; a frozen one never (spec §3.7)', async () => {
    const a = await running();
    reply('textDocument/foldingRange', []);
    reply('textDocument/codeLens', [excerptLens(3, 6, true)]);
    const ed = await newPlan('x1.md', EXCERPT_TEXT);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.reading(uri)?.lenses?.version === ed.document.version, 'the lenses at the version');
    const from = a.shown.length;
    await ed.edit(b => b.insert(new vscode.Position(4, 2), '#'));
    await until(() => a.shown.slice(from).some(s => s.text === TYPED), 'the warning');
    await until(() => a.planView.reading(uri)?.lenses?.version === ed.document.version, 'the lenses again');
    await ed.edit(b => b.insert(new vscode.Position(5, 2), '#'));
    await ed.edit(b => b.insert(new vscode.Position(2, 0), 'x'));
    await sleep(500);
    assert.deepEqual(a.shown.slice(from).filter(s => s.text === TYPED).map(s => s.level), ['warn']);
    await revert(ed.document);
    reply('textDocument/codeLens', [excerptLens(3, 6, false)]);
    const frozen = await newPlan('x2.md', EXCERPT_TEXT);
    await until(() => a.planView.reading(frozen.document.uri.toString())?.lenses?.version === frozen.document.version, 'the frozen lens');
    const from2 = a.shown.length;
    await frozen.edit(b => b.insert(new vscode.Position(4, 2), '#'));
    await sleep(500);
    assert.ok(!a.shown.slice(from2).some(s => s.text === TYPED));
    await revert(frozen.document);
  });
```

- [ ] **Step 5: Run it to see it fail**

Run: `npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: FAIL: line 1 is `''`, not `'- [ ] '`, and `timed out waiting for the warning`.

- [ ] **Step 6: Implement the Enter rule**

`src/plans/enterRule.ts`:

```ts
import * as vscode from 'vscode';

// Enter continues a step (spec §3.5; nvim comments "b:- [ ],b:-"): after an open step a new
// open step, after a done step a plain item. A language configuration is per language, not
// per file, so it is installed while the active editor shows a plan and disposed when it stops.
// VS Code merges an extension's configuration field by field over the contributed one
// (checked in the 1.145.2 bundle): markdown keeps its brackets, pairs, folding and word pattern.
export const PLAN_ENTER_RULES: vscode.OnEnterRule[] = [
  { beforeText: /^\s*- \[ \] /, action: { indentAction: vscode.IndentAction.None, appendText: '- [ ] ' } },
  { beforeText: /^\s*- \[[xX]\] /, action: { indentAction: vscode.IndentAction.None, appendText: '- ' } },
];

export class EnterRule implements vscode.Disposable {
  private reg: vscode.Disposable | undefined;

  set(on: boolean): void {
    if (on && !this.reg) this.reg = vscode.languages.setLanguageConfiguration('markdown', { onEnterRules: PLAN_ENTER_RULES });
    if (!on && this.reg) {
      this.reg.dispose();
      this.reg = undefined;
    }
  }

  dispose(): void { this.set(false); }
}
```

In `src/extension.ts`, before `trackIsPlan`:

```ts
  const enterRule = new EnterRule();
  context.subscriptions.push(enterRule);
  const plansTracked = trackIsPlan(context, planDocs, yes => enterRule.set(yes));
```

- [ ] **Step 7: Implement the excerpt guard**

In `src/plans/layer.ts`:

```ts
// the excerpt guard's words (nvim plans.lua typed)
export const TYPED_IN_EXCERPT = 'excerpt: live and read-only, the next reconcile replaces what you type here';
```

```ts
  private readonly warned = new Map<string, Set<string>>();
```

in `register`:

```ts
      vscode.workspace.onDidChangeTextDocument(e => this.typed(e)),
```

```ts
  // typed: a change inside a live excerpt warns once per excerpt per document (spec §3.7). The
  // lenses must be the ones the document had just before this change.
  private typed(e: vscode.TextDocumentChangeEvent): void {
    const uri = e.document.uri.toString();
    const l = this.readings.get(uri)?.lenses;
    if (!l || l.version !== e.document.version - 1 || e.contentChanges.length === 0) return;
    const keys = typedInto(liveExcerpts(l.items), e.contentChanges.map(c => ({ start: c.range.start.line, end: c.range.end.line })));
    let w = this.warned.get(uri);
    for (const k of keys) {
      if (!w) {
        w = new Set();
        this.warned.set(uri, w);
      }
      if (w.has(k)) continue;
      w.add(k);
      void this.d.say('warn', TYPED_IN_EXCERPT);
    }
  }
```

`closed(uri)` deletes `this.warned` for `uri`; `stopped()` clears it. Imports: `liveExcerpts`, `typedInto` from `./reading`.

- [ ] **Step 8: Run the e2e, the fake suite and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -5 && npm run build && tsc -p . && DURANDAL_E2E_ONLY=fake. node out/test/e2e/run.js 2>&1 | tail -30`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/plans/enterRule.ts src/plans/reading.ts src/plans/layer.ts src/extension.ts test/unit/reading.test.ts test/e2e/fake.14-reading.e2e.ts
git commit -m "plans: Enter continues a step while a plan is active; typing in a live excerpt warns once"
```

---

### Task 9: Against olifant lsp, the README, and the PR

**Files:**
- Create: `test/e2e/real.9-plans.e2e.ts`
- Modify: `test/e2e/run.ts` (`[plans] pass_cost = 0` in each real sandbox)
- Modify: `README.md` (a Plans section; the settings), `CHANGELOG.md`

**Interfaces:**
- Consumes: `Api.planView` (Tasks 4 to 7), `lineTokens` (Task 3).
- Produces: nothing later tasks use.

- [ ] **Step 1: Keep the real sandboxes from paid claim checks**

At 48f38ab, opening and saving a plan starts a claim pass that runs `claude -p` checks (olifant `Lsp.hs` didOpen / didSave). In `test/e2e/run.ts` `real()`, after each `try-pack.sh` call:

```ts
      // olifant 48f38ab checks a plan's claims with the model on open and save: never in the suite
      appendFileSync(join(ws, name, '.olifant/config.toml'), '\n[plans]\npass_cost = 0\n');
```

(`appendFileSync` joins the `node:fs` import.)

- [ ] **Step 2: Write the real e2e**

`test/e2e/real.9-plans.e2e.ts`:

```ts
import * as assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { lineTokens } from '../../src/plans/reading';
import { file, open, running, until, ws } from './helpers';

// The plans reading layer against olifant lsp at .olifant-ref (python-htmx): the six-modifier
// legend arrives and decodes, a ticked step and an excerpt fold and close on entry. A frozen
// excerpt (" · done"), so no reconcile rewrites it.
const PLAN = 'py/plans/m6a.md';
const TEXT = [
  '- [x] book a table',                                                          // 0
  '  - 25 Oct 21:31 · did it',                                                   // 1
  '- [ ] show the code',                                                         // 2
  '  ```python @src/bistro/booking/commands/create_booking.py:CreateBooking · done', // 3
  '  ```',                                                                       // 4
  '',
].join('\n');

describe('the plans reading layer against olifant lsp (python-htmx)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', true, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global);
    rmSync(join(ws(), PLAN), { force: true });
  });

  it('the legend has six modifiers; the plan\'s tokens decode; a ticked step and an excerpt fold, closed on entry', async () => {
    const a = await running();
    const legend = a.server.client()!.initializeResult!.capabilities.semanticTokensProvider!.legend;
    assert.deepEqual(legend.tokenModifiers, ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']);
    writeFileSync(join(ws(), PLAN), TEXT);
    const ed = await open(file(PLAN));
    const uri = ed.document.uri.toString();
    await until(() => a.planView.reading(uri)?.tokens?.version === ed.document.version || undefined, 'the tokens', 60_000);
    const row0 = lineTokens(a.planView.reading(uri)!.tokens!.toks, 0).map(t => t.type);
    assert.ok(row0.includes('planMarker') && row0.includes('planStepDone'), row0.join(' '));
    await until(() => a.planView.reading(uri)?.folds?.version === ed.document.version || undefined, 'the folds', 60_000);
    const folds = a.planView.reading(uri)!.folds!.ranges.map(f => `${f.start}-${f.end}`).sort();
    assert.ok(folds.includes('0-1') && folds.includes('3-4'), folds.join(' '));
    await until(() => a.planView.entered(uri), 'entered', 30_000);
    const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
    await until(() => (!shown(1) && !shown(4)) || undefined, 'rows 1 and 4 folded');
    assert.ok(shown(0) && shown(2) && shown(3));
  });
});
```

If the server's excerpt fold is not `3-4` for this text, print `folds` and read `excerptSpans` (olifant `Server/Plans.hs:208`) for the info-string rule at the pin before changing the text; the test must keep one excerpt fold.

- [ ] **Step 3: Run it against the pin**

```bash
npm run build && tsc -p . && OLIFANT_BIN=$(cd ~/projects/olifant && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant DURANDAL_E2E_ONLY=real.9 node out/test/e2e/run.js 2>&1 | tail -30
```

In the foreground, with a 20-minute timeout. Expected: PASS (the fake and bare suites run with nothing selected).

- [ ] **Step 4: The README and the CHANGELOG**

In `README.md`, a section before `## Settings`:

```markdown
## Plans

A plan is a markdown file under the project's `plans/` folder (`durandal.plans.dir`, which must
match `[plans] dir` in `.olifant/config.toml`). The server reads it and Durandal shows what it
says:

- **Colours.** Steps, questions, claims, evidence, journal lines, anchors and verdicts are
  semantic tokens; every theme colours them through their base types, and a stale fingerprint
  reads as a comment. Themes with semantic highlighting off (`editor.semanticHighlighting.enabled`)
  show none of it, and no glyphs or fold conclusions either.
- **Glyphs.** With `durandal.plans.conceal` on, `- [ ]` reads ☐, `- [x]` ☑, `- ?` ?, `- test:` ·,
  `- also` +, and anchor paths and fingerprints hide, on every line but the cursor's.
  `durandal.plans.glyphs` changes any of them.
- **Verdicts.** A claim's check shows at the start of its line: ✗ wrong, ? could not tell,
  … checking, ○ waiting, ✓ right; other Olifant findings show E, W, I or H. The worst one on a line
  wins.
- **Folds.** Done steps, answered questions and code excerpts close when a plan is first shown
  (`durandal.plans.foldDone` off: excerpts only). A closed fold shows its conclusion, or a done
  step's unit and verdict, at the end of its line.
- **Typing.** Enter after an open step starts another; after a done step, a plain item. Typing
  inside a live excerpt warns once: the next reconcile replaces it.
```

In `## Settings`, after `durandal.actionLog`:

```markdown
- `durandal.plans.dir`: the plans folder under each project (default `plans`).
- `durandal.plans.conceal`: plan glyphs (off by default).
- `durandal.plans.glyphs`: glyph overrides by name.
- `durandal.plans.foldDone`: close done work on entry, not only excerpts (on by default).
```

In `CHANGELOG.md`, first under `## Unreleased`:

```markdown
- Plans read as in durandal.nvim: theme colours for every plan token, glyphs for markers with
  `durandal.plans.conceal`, claim verdicts at the start of their line, done work and excerpts
  closed on entry with their conclusion at the line's end, Enter continuing a step, and a warning
  when typing inside a live excerpt; olifant pinned at 48f38ab (milestone 6a).
```

- [ ] **Step 5: The whole suite**

```bash
npm run lint && OLIFANT_REPO=~/projects/olifant npm run test:unit 2>&1 | tail -5
OLIFANT_BIN=$(cd ~/projects/olifant && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant npm run test:e2e 2>&1 | tail -40
npm run package 2>&1 | tail -5
```

In the foreground, the e2e with a 60-minute timeout. Expected: all PASS; the package builds.

- [ ] **Step 6: Commit**

```bash
git add test/e2e/real.9-plans.e2e.ts test/e2e/run.ts README.md CHANGELOG.md
git commit -m "plans: the reading layer against olifant lsp; README and CHANGELOG"
```

- [ ] **Step 7: The PR**

Use superpowers:finishing-a-development-branch. Push `m6a-reading` and open the PR against `main` with `gh pr create`. The body:
- what M6a ships (the CHANGELOG entry), and that M6b (verbs) and M6c (the loop) follow;
- the deviations listed at the top of this plan;
- the plan-time findings: the `display: none` hide works as the spec wrote it; `setLanguageConfiguration` merges, so the Enter rule copies nothing (it resets the extension host's markdown word definition while installed); the server's step, question and excerpt folds win the merge with markdown's, so no fold finding needs filing;
- follow-ups for after M6a (spec §7): only olifant's `Check this` / `Show why` action kinds, if M6c finds them `source`;
- the manual checklist, unticked:
  - [ ] glyph alignment and the hidden text taking no width, in light, dark and high-contrast themes;
  - [ ] the verdict glyph colours, and a verdict and a glyph on the same column-0 marker;
  - [ ] the conclusion on a collapsed question and on a collapsed done step;
  - [ ] Enter continues a step in a plan and nothing special in another markdown file;
  - [ ] one close on entry over a plan with 20+ folds does not flicker;
  - [ ] a theme with semantic highlighting off: folds and verdicts still show.

End the body with the attribution lines the session gives.
