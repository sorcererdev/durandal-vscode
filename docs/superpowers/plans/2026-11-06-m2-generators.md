# durandal-vscode M2: generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parity with durandal.nvim's actions at cursor, generate picker (list, form, live preview, apply, `+ New` steps), ⚡ hints, migration report and action log, on native VS Code surfaces (QuickPick, InputBox, `durandal-doc` virtual documents, the diff editor, inlay hints), and the extension activating after startup so a project file opened from anywhere starts the server (issue #1).

**Architecture:** Pure modules with no `vscode` import carry every rule and are unit-tested with `node --test`: `actionLog.ts`, `protocol.ts`, `generate/form.ts` (steps, rows, notes, `+ New`, payloads), `generate/rank.ts`, `generate/preview.ts`, `generate/review.ts`, `generate/stale.ts`, `generate/flow.ts` (the state machine, driven through a `Ui` interface and a fake), `actions/menu.ts`, `hintLog.ts`, `migration.ts`, `document.ts`. VS Code glue is thin and covered by the fake-lsp contract e2e: `quickInput.ts` (the `Ui` on QuickPick/InputBox), `land.ts` (stale check, apply through M1's `applyServerEdit`, snippets, the review window), `generate/previewDoc.ts`, `generate/command.ts`, `actions/command.ts`, the `Hints` class, `migrationCommand.ts`. alder-vscode's `flow.ts`, `form.ts`, `picker.ts`, `ui.ts`, `previewDoc.ts`, `review.ts`, `planCheck.ts`, `command.ts`, `virtualDocs.ts` are the models: copied in spirit and retyped for olifant's multi-step wire, not imported.

**Tech Stack:** as M1: TypeScript 5.9 (`module: node16`), `vscode-languageclient` ^11, `vscode-languageserver-protocol` 3.18.5, esbuild, `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp, olifant at `.olifant-ref` for the real-server suite.

**Spec:** `docs/superpowers/specs/2026-11-06-m2-generators-design.md` (this repository), umbrella `docs/superpowers/specs/2026-11-06-durandal-vscode-design.md` §6 row 2. Facts with pointers: `~/projects/notes/vscode-port/m2/generator-surface.md`. Issue #1 (activate on `onStartupFinished`) is folded into Task 1. Read the spec before starting a task.

**Reference code (read, do not depend on):** alder-vscode at `~/projects/alder-vscode` (`src/generate/*`, `src/virtualDocs.ts`, `test/unit/flow.test.ts`, `test/e2e/fakeUi.ts`); durandal.nvim at `~/projects/durandal.nvim` (`lua/durandal/generate.lua`, `generate/rank.lua`, `actions.lua`, `preview.lua`, `apply.lua`, `hints.lua`, `migration.lua`, `util.lua`, `snippet.lua`, and their specs under `tests/`); olifant at `~/projects/olifant` (`src/Olifant/Lsp.hs`, `Output.hs`; the book `user/16-the-language-server.md`).

**Branch and models:** work on a branch `m2-generators` from `main` (`a250ddc` or later, with this plan merged). Suggested implementer models (the user's policy): Sonnet for Tasks 1–4, 9, 10, 11; Opus for Tasks 5–8 (the state machine and the VS Code glue); a final whole-branch review on Fable.

## Global Constraints

- No webview. No change to olifant. `.olifant-ref` stays `1ae076fc29455069fc32d2d7e48fa206cf033947` unless a task says otherwise.
- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency.
- No file outside `src/protocol.ts` spells an `olifant/*` method string or an olifant command name; standard LSP types (`CodeAction`, `InlayHint`, `CodeActionRequest`, `CodeActionResolveRequest`) come from the library.
- The extension never rewords the server: refusals and errors are shown as the server sent them.
- Activation events: `workspaceContains:**/.olifant/config.toml` and `onStartupFinished` (issue #1).
- Virtual documents use the scheme `durandal-doc`: `/preview/<n>/<path>` (live preview), `/plan/<n>/before|after/<path>` (review diffs), `/Migration`.
- Preview debounce 80 ms; every preview carries a sequence number and an answer for an older one is dropped; `-32800` from `olifant/preview` is ignored.
- `+ New` nests two levels at most: three steps.
- Recents: the top 10 generator ids per project, most recent first, in `workspaceState` under `durandal.recent:<root real path>`.
- Action log: directory `$DURANDAL_LOG_DIR`, else `$XDG_CACHE_HOME/durandal`, else `~/.cache/durandal`; file `actions.jsonl`; one JSON object per line, the event's fields then `t` (`YYYY-MM-DDTHH:MM:SSZ`, UTC); `mkdir -p`; best effort (one output-channel warning, never thrown). Events this milestone: `shown {file, generators}`, `picked {file, generator}`, `fix-picked {file, generator}`, `generate-applied {generator}`, `applied {generator, files}` (`files` is a count, as nvim logs it), `hinted {generator}`.
- Settings added: `durandal.hints` (boolean, default `true`), `durandal.actionLog` (boolean, default `true`). Context key added: `durandal.formOpen`.
- Commands added: `durandal.generate` (takes an optional preset `{generator, sets?, done?}`), `durandal.generate.apply`, `durandal.generate.review`, `durandal.actions`, `durandal.migration`, `durandal.hints.toggle`, and `olifant.showActions` built (it leaves the not-yet list). Internal: `durandal.applyResolvedEdit` (the lightbulb path, Task 8).
- Keys: `ctrl+alt+d g` / `a` exist from M1. `ctrl+enter` (`cmd+enter` on macOS) → `durandal.generate.apply` and `ctrl+o` → `durandal.generate.review`, both `when: durandal.formOpen && inQuickOpen`.
- Messages quoted in the spec are used verbatim: "no generators in <root> (its packs: .olifant/config.toml)", "no Olifant project open", "<path> changed since planning; nothing was applied — plan again", "Nothing to change: the code already has it", "Applied <name>: N file(s)", "No Olifant generators apply to <relative path>", "this project is not migrating (no [migrate] in .olifant/config.toml; olifant init --migrate PATH sets it up)".
- Working hours (the user's rule): no agent or background work 9am–5pm America/New_York, Monday to Friday; weekends are free.
- **Decisions this plan makes where the spec is silent or wrong (say each in the PR description):**
  1. **The lightbulb path.** The spec says Ctrl+. applies a resolved action's `edit` "through M1's `applyServerEdit`". M1 does not: a resolved code action's edit goes through VS Code's own apply (no version check, no saves, and the refactor preview for olifant's `needsConfirmation` annotation). Task 8 adds a `resolveCodeAction` middleware that resolves the action itself, keeps the protocol edit, and hands it to `applyServerEdit` through the internal command `durandal.applyResolvedEdit`.
  2. **`hinted {generator}`.** olifant's inlay hint carries only its label and `olifant.showActions [uri, Position(line, 0)]`, no generator id (`Lsp.hs` 406-422). The hints middleware asks `olifant/fileActions` once for the lines it has not logged and logs the generator of the first non-snippet action whose range covers each line.
  3. **The log directory honours `XDG_CACHE_HOME`**, as nvim's `stdpath("cache")` does, so both editors write the same file.
  4. **Picker headings** `here` and `all` are shown when nothing is typed; with a query the list is the ranked matches without headings (a name match can precede a `here` item, so headings would repeat).
  5. **The preview tab title.** A changed file's diff tab is titled with the file counts (`~ src/a.py +3 −1, + src/b.py`). A new file opens as the virtual document alone, whose tab title is its file name, so the form's title carries the same counts in both cases.
  6. **The fake server** gains two capabilities, `codeActionProvider: {resolveProvider: true}` and `inlayHintProvider: true`, so the library registers both features against it (the second vendored change after M1's `--help`).
  7. **Unit tests** run on `node:test`, as M1 decided (the spec says mocha).
  8. **Test seams on `Api`:** `setUi(ui?)` swaps the quick-input UI for a fake in the e2e suites (alder passed it as a command argument; one switch serves the generate, actions and review paths), and `plans` exposes the landing code (Task 6), which M3's follow-ups reuse.
  9. **A preset generator missing from `olifant/generators`** (a `menu = false` generator that an action names) opens anyway, as `{id, name: <last segment>}`: previews and plans go by id.
  10. **Snippet line.** `plan.snippet.line` is 1-based and the body replaces that line's text (nvim `snippet.lua`: `set_lines(line-1, line, {""})`, then expand). `insertSnippet` replaces the line's range; a line past the end inserts at the end.

## Review Focus

1. **Typing quickly in a field while previews are in flight, the server superseding the older ones (`-32800`).** Expected: one request per burst, only the newest answer paints, no error shown, Enter waits for the newest. Pinned by the flow tests "one preview per burst", "an older answer is dropped" and "-32800 is ignored" (Task 5).
2. **A planned file edited (unsaved or on disk) between planning and Apply, or a file the plan creates appearing meanwhile.** Expected: nothing applied, "<path> changed since planning; nothing was applied — plan again". Pinned by `firstStale`/`seenText` unit tests (Task 4) and the stale contract tests (Task 6).
3. **The server stops while the form is open.** Expected: the next preview or plan fails with the not-running message, one error, the form closes, nothing hangs. Pinned by the flow test "the server gone closes the form" (Task 5).
4. **Picking a plain choice for an input a `+ New` step makes, and asking for a fourth step.** Expected: the made step (and any step that made it) is dropped and the next preview has no `makes`; `+ New` past three steps is refused with a warning. Pinned by `setValue`/`chooseNew` unit tests (Task 3) and the flow test "a plain choice drops the + New step" (Task 5).
5. **The action log off, or its directory unwritable.** Expected: nothing written when off; when unwritable, one warning in the output channel and every action still works. Pinned by the `ActionLog` unit tests (Task 1).

---

## File structure

```
package.json                     activation (T1), settings (T1, T9), commands and keys (T7–T10)
src/actionLog.ts                 log dir, line format, best-effort writer (T1)
src/protocol.ts                  tightened generate/actions/model types (T2)
src/commandTable.ts              BUILT commands, FORM_KEYS, SERVER_NAMED without showActions (T7, T8)
src/document.ts                  pure: which document a command speaks for (T7)
src/origin.ts                    VS Code: the active editor or a root's config.toml (T7)
src/uiTypes.ts                   the Ui interface the flow and commands use (T5)
src/quickInput.ts                the Ui on QuickPick/InputBox (T6)
src/virtualDocs.ts               durandal-doc content provider (T6)
src/land.ts                      Plans: land (stale + applyServerEdit), snippet, review window (T6)
src/applyEdit.ts                 applyServerEdit gains a wording hook (T6)
src/generate/form.ts             steps, rows, notes, options, + New, payloads (T3)
src/generate/rank.ts             fuzzy, rank, recents, picker rows (T3)
src/generate/preview.ts          preview view and file summary (T4)
src/generate/review.ts           review model (T4)
src/generate/stale.ts            stale check and messages (T4)
src/generate/flow.ts             the generate state machine (T5)
src/generate/previewDoc.ts       the live preview sink (T7)
src/generate/command.ts          durandal.generate, .apply, .review (T7)
src/actions/menu.ts              menu items, explainMiss (T8)
src/actions/command.ts           durandal.actions, olifant.showActions (T8)
src/hintLog.ts                   pure: the hinted line's generator, lines seen (T9)
src/hints.ts                     ⚡ hints: the middleware hook, the toggle, the hinted log (T9)
src/migration.ts                 pure: migrationLines (T10)
src/migrationCommand.ts          durandal.migration (T10)
src/server.ts                    middleware: resolveCodeAction (T8), provideInlayHints (T9)
src/extension.ts                 wiring (T6–T10)
test/fake-lsp/fake-lsp           two capabilities (T2)
test/fakeUi.ts                   FakeUi for unit and e2e (T5)
test/unit/*.test.ts              per pure module
test/e2e/run.ts                  the bare suite (T1), DURANDAL_LOG_DIR (T1)
test/e2e/bare.1-activation.e2e.ts  issue #1 (T1)
test/e2e/fake.4-plans.e2e.ts … fake.8-migration.e2e.ts   (T6–T10)
test/e2e/real.5-generate.e2e.ts  (T11)
README.md, CHANGELOG.md          (T11)
```

---

### Task 1: Activate after startup (issue #1), and the action log

**Model:** Sonnet.

**Files:**
- Modify: `package.json` (`activationEvents`, setting `durandal.actionLog`)
- Create: `src/actionLog.ts`
- Create: `test/unit/actionLog.test.ts`
- Modify: `test/unit/manifest.test.ts`
- Modify: `test/e2e/run.ts` (the `bare` suite; `DURANDAL_LOG_DIR` for both fake suites)
- Modify: `test/e2e/helpers.ts` (`actionLog()`)
- Create: `test/e2e/bare.1-activation.e2e.ts`

**Interfaces:**
- Produces: `ActionEvent` (union below), `logDir(env, home): string`, `stamp(d): string`, `logLine(e, now): string`, `class ActionLog { constructor(o: { dir(): string; enabled(): boolean; warn(m: string): void; now?(): Date }); write(e: ActionEvent): void }`. Test helper `actionLog(): Record<string, unknown>[]` (the lines of `$DURANDAL_LOG_DIR/actions.jsonl`).

- [ ] **Step 1: Write the failing unit tests**

`test/unit/actionLog.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActionLog, logDir, logLine, stamp } from '../../src/actionLog';

test('logDir: DURANDAL_LOG_DIR, else the XDG cache, else ~/.cache; durandal under a cache', () => {
  assert.equal(logDir({ DURANDAL_LOG_DIR: '/tmp/x' }, '/home/u'), '/tmp/x');
  assert.equal(logDir({ XDG_CACHE_HOME: '/c' }, '/home/u'), '/c/durandal');
  assert.equal(logDir({}, '/home/u'), '/home/u/.cache/durandal');
  assert.equal(logDir({ DURANDAL_LOG_DIR: '', XDG_CACHE_HOME: '' }, '/home/u'), '/home/u/.cache/durandal');
});

test('logLine: the event, its fields, then t in UTC to the second', () => {
  const now = new Date(Date.UTC(2026, 10, 6, 21, 5, 9, 123));
  assert.equal(stamp(now), '2026-11-06T21:05:09Z');
  assert.equal(logLine({ event: 'picked', file: 'src/a.py', generator: 'p/command' }, now),
    '{"event":"picked","file":"src/a.py","generator":"p/command","t":"2026-11-06T21:05:09Z"}\n');
  assert.equal(logLine({ event: 'applied', generator: 'g', files: 2 }, now),
    '{"event":"applied","generator":"g","files":2,"t":"2026-11-06T21:05:09Z"}\n');
});

test('ActionLog appends one line per event and makes the directory', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'a', 'b');
  const log = new ActionLog({ dir: () => dir, enabled: () => true, warn: m => assert.fail(m) });
  log.write({ event: 'hinted', generator: 'g' });
  log.write({ event: 'generate-applied', generator: 'g' });
  const lines = readFileSync(join(dir, 'actions.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { event: string; t: string });
  assert.deepEqual(lines.map(l => l.event), ['hinted', 'generate-applied']);
  assert.match(lines[0].t, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test('ActionLog off writes nothing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'off');
  new ActionLog({ dir: () => dir, enabled: () => false, warn: m => assert.fail(m) }).write({ event: 'hinted', generator: 'g' });
  assert.ok(!existsSync(dir));
});

test('ActionLog is best effort: an unwritable directory warns once and never throws', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'durandal-log-')), 'a-file');
  writeFileSync(file, '');
  const warned: string[] = [];
  const log = new ActionLog({ dir: () => join(file, 'sub'), enabled: () => true, warn: m => warned.push(m) });
  log.write({ event: 'hinted', generator: 'g' });
  log.write({ event: 'hinted', generator: 'h' });
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^the action log could not be written \(.*sub\): /);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/actionLog'` (tsc error).

- [ ] **Step 3: Write `src/actionLog.ts`**

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The action log: which actions were offered where and which were picked, one JSON object per
// line, to tune where generators apply (durandal.nvim util.log; the olifant book ch. 14).
// Olifant logs nothing itself.
export type ActionEvent =
  | { event: 'shown'; file: string; generators: string[] }
  | { event: 'picked' | 'fix-picked'; file: string; generator: string }
  | { event: 'generate-applied'; generator: string }
  | { event: 'applied'; generator: string; files: number }
  | { event: 'hinted'; generator: string };

// logDir is durandal.nvim's: $DURANDAL_LOG_DIR, else the cache directory's durandal folder
// (nvim's stdpath("cache") honours XDG_CACHE_HOME), so both editors write the same file.
export function logDir(env: Record<string, string | undefined>, home: string): string {
  if (env.DURANDAL_LOG_DIR) return env.DURANDAL_LOG_DIR;
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'durandal');
}

export function stamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function logLine(e: ActionEvent, now: Date): string {
  return JSON.stringify({ ...e, t: stamp(now) }) + '\n';
}

export class ActionLog {
  private warned = false;

  constructor(private readonly o: { dir(): string; enabled(): boolean; warn(m: string): void; now?(): Date }) {}

  // write appends e; a failure is said once (to the output channel) and never thrown.
  write(e: ActionEvent): void {
    if (!this.o.enabled()) return;
    const dir = this.o.dir();
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, 'actions.jsonl'), logLine(e, this.o.now ? this.o.now() : new Date()));
    } catch (err) {
      if (this.warned) return;
      this.warned = true;
      this.o.warn(`the action log could not be written (${dir}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`
Expected: the five `actionLog` tests PASS (the manifest test still passes: nothing in `package.json` changed yet).

- [ ] **Step 5: Change the manifest test first, then `package.json`**

In `test/unit/manifest.test.ts`, replace the last test with:
```ts
test('the settings and the activation', () => {
  assert.deepEqual(Object.keys(pkg.contributes.configuration.properties).sort(),
    ['durandal.actionLog', 'durandal.debounceMs', 'durandal.fills', 'durandal.model', 'durandal.path', 'durandal.trace.server']);
  // after startup too (issue #1): a project file opened in a window with no project folder
  assert.deepEqual(pkg.activationEvents, ['workspaceContains:**/.olifant/config.toml', 'onStartupFinished']);
  const log = pkg.contributes.configuration.properties['durandal.actionLog'];
  assert.equal(log.type, 'boolean');
  assert.equal(log.default, true);
});
```
Run `npm run test:unit`: FAIL (the setting and the event are missing). Then in `package.json` set
```json
  "activationEvents": [
    "workspaceContains:**/.olifant/config.toml",
    "onStartupFinished"
  ],
```
and add to `contributes.configuration.properties`, after `durandal.fills`:
```json
        "durandal.actionLog": {
          "type": "boolean",
          "default": true,
          "markdownDescription": "Append the actions offered and picked to `actions.jsonl` in `$DURANDAL_LOG_DIR`, else `~/.cache/durandal` (the file durandal.nvim writes), to tune where generators apply."
        },
```
The JSON import's type then has `durandal.actionLog` with `type` and `default`; if `tsc` complains that the property index is not typed, index with `(pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.actionLog']`.

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Write the bare suite (issue #1)**

In `test/e2e/run.ts`, in `fake()`, add `DURANDAL_LOG_DIR: join(base, 'log'),` to the env passed to `launch`. Then add, after `fake()`:
```ts
// bare: a window whose folder holds no project (issue #1). The extension activates after
// startup anyway, and a project file opened from outside starts the server.
async function bare(): Promise<void> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'durandal-bare-')));
  const ws = join(base, 'ws');
  const outside = join(base, 'outside');
  const replies = join(base, 'replies');
  try {
    write(join(ws, 'notes.txt'), 'notes\n');
    write(join(outside, '.olifant/config.toml'), '');
    write(join(outside, 'lib.py'), 'z = 3\n');
    mkdirSync(replies);
    settings(ws, join(ROOT, 'test/fake-lsp/fake-lsp'));
    await launch(ws, {
      DURANDAL_E2E_SUITE: 'bare',
      DURANDAL_E2E_OUTSIDE: outside,
      FAKE_LSP_LOG: join(base, 'fake.log'),
      FAKE_LSP_REPLIES: replies,
      DURANDAL_LOG_DIR: join(base, 'log'),
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
```
and in `main()` call `await bare();` right after `await fake();`.

In `test/e2e/helpers.ts` add:
```ts
// actionLog is the action log's lines ($DURANDAL_LOG_DIR/actions.jsonl), oldest first.
export function actionLog(): Record<string, unknown>[] {
  const p = join(process.env.DURANDAL_LOG_DIR!, 'actions.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(l => l !== '').map(l => JSON.parse(l) as Record<string, unknown>);
}
```

`test/e2e/bare.1-activation.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { added, open, until } from './helpers';

describe('a window with no project folder (fake server, issue #1)', () => {
  it('activates after startup; a project file opened from outside starts the server and joins', async () => {
    const ext = vscode.extensions.getExtension<Api>('sorcererdev.durandal')!;
    // not ext.activate(): that would activate it whatever the manifest says
    await until(() => ext.isActive, 'the extension active after startup', 30_000);
    const a = ext.exports;
    assert.equal(a.server.state(), 'not started', 'no project, no server');
    const outside = process.env.DURANDAL_E2E_OUTSIDE!;
    await open(vscode.Uri.file(join(outside, 'lib.py')));
    await until(() => a.server.state() === 'running', 'olifant lsp running', 60_000);
    await until(() => a.inProject(), 'durandal.inProject for the outside file');
    await until(() => added().includes(vscode.Uri.file(outside).toString()), 'the outside project added as a folder');
    assert.deepEqual(a.server.roots(), [outside]);
  });
});
```

- [ ] **Step 7: Run the e2e suites**

Run: `npm run test:e2e`
Expected: the fake suite PASSES as before; the bare suite PASSES (1 test). To see it fail first, run it once with `onStartupFinished` removed from `package.json`: the bare test times out on "the extension active after startup". Put it back.

- [ ] **Step 8: Lint and commit**

Run: `npm run lint`
Expected: no errors.
```bash
git add package.json src/actionLog.ts test/unit/actionLog.test.ts test/unit/manifest.test.ts test/e2e/run.ts test/e2e/helpers.ts test/e2e/bare.1-activation.e2e.ts
git commit -m "Activate after startup too (#1); the action log (durandal.actionLog)"
```
The PR description says "Closes #1".

---

### Task 2: The wire contract for generators, actions and the model

**Model:** Sonnet.

**Files:**
- Modify: `src/protocol.ts:19-31` (the generate section), `:81-83` (`fileActions`, `model` result types)
- Modify: `test/unit/protocol.test.ts`
- Modify: `test/fake-lsp/fake-lsp:1-3,55` (header, two capabilities)

**Interfaces:**
- Produces (exact names later tasks import from `src/protocol.ts`):
  - `Values = Record<string, string>`
  - `GeneratorItem { id: string; name: string; kind?: string; summary?: string; here?: boolean }`
  - `Source = 'you' | 'path' | 'here' | 'only' | 'default' | 'new' | 'suggested'`
  - `Field { name; value: string | null; source: Source | null; valid: boolean; why: string | null; choices: string[] | null; needs: string[]; new: string[] }`
  - `Step { generator: string; sets: Values; makes?: { step: number; input: string } }`
  - `PreviewParams extends At { steps: Step[] }`, `PreviewFile { path; new; added; removed }`, `PreviewMain { path; text; first }`, `PreviewResult { steps: { generator; fields: Field[] }[]; files: PreviewFile[]; main: PreviewMain | null; ready: boolean; error: string | null }`
  - `PlanFile { path; before: string | null; after: string }`, `Hole`, `PlanSnippet { file; line; body; ghost? }`, `Conflict { code; message }`, `Plan`, `PlanResult { plan: Plan; edit?: WorkspaceEdit }`
  - `FileAction`, `Nearby`, `FileActionsResult { actions: FileAction[]; nearby: Nearby[] }`
  - `Migration`, `ModelResult { migration?: Migration }`
  - `ActionData` (a code action's `data`)
  - `Olifant.preview: RequestType<PreviewParams, PreviewResult>`, `Olifant.plan: RequestType<PlanParams, PlanResult>`, `Olifant.fileActions: RequestType<Doc, FileActionsResult>`, `Olifant.model: RequestType<Doc, ModelResult | null>`

- [ ] **Step 1: Write the failing drift test for the keys**

Append to `test/unit/protocol.test.ts`:
```ts
// The JSON keys the client reads from or sends in the generate, actions and model answers
// (protocol.ts types them). Each must appear as a string literal in olifant's source: a key the
// server renames fails here. When one fails, find what the server sends now and fix
// protocol.ts and its readers; never drop the key from this list to make it pass.
const KEYS = [
  'generators', 'id', 'name', 'summary', 'here',
  'steps', 'generator', 'sets', 'makes', 'step', 'input',
  'fields', 'value', 'source', 'valid', 'why', 'choices', 'needs', 'new',
  'files', 'path', 'added', 'removed', 'main', 'text', 'first', 'ready', 'error',
  'plan', 'edit', 'before', 'after', 'conflicts', 'message', 'warnings', 'holes', 'status', 'model', 'fill',
  'snippet', 'file', 'line', 'body',
  'actions', 'nearby', 'label', 'range', 'missing',
  'migration', 'switches', 'on', 'added_legacy', 'unregistered',
];

test('the keys the client reads are olifant\'s', { skip: !process.env.OLIFANT_REPO && 'OLIFANT_REPO is not set' }, () => {
  const src = hsFiles(join(process.env.OLIFANT_REPO!, 'src')).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.deepEqual(KEYS.filter(k => !src.includes(`"${k}"`)), []);
});
```
and, before it, a compile-time check that the types are the tightened ones (its import goes with the others at the top of the file):
```ts
import type { Field, PreviewResult, Plan, FileActionsResult, ModelResult, GeneratorItem } from '../../src/protocol';

test('the generate types read as the server sends them', () => {
  const g: GeneratorItem = { id: 'python-htmx/command', name: 'Command', here: true };
  const f: Field = { name: 'app', value: 'bistro', source: 'only', valid: true, why: null, choices: ['bistro'], needs: [], new: [] };
  const r: PreviewResult = { steps: [{ generator: g.id, fields: [f] }], files: [{ path: 'a.py', new: true, added: 2, removed: 0 }], main: { path: 'a.py', text: 'x\n', first: 1 }, ready: true, error: null };
  const p: Plan = { files: [{ path: 'a.py', before: null, after: 'x\n' }], conflicts: [], warnings: [], holes: [], snippet: null };
  const fa: FileActionsResult = { actions: [{ generator: 'g', name: 'G', label: 'Do', range: { start: [3, 4], end: [3, 8] }, sets: {}, missing: [], snippet: false }], nearby: [] };
  const m: ModelResult = { migration: { line: 'x', switches: [{ name: 's', on: true }], added_legacy: [], unregistered: [] } };
  assert.ok(r.steps[0].fields[0].name === 'app' && p.files!.length === 1 && fa.actions.length === 1 && m.migration!.switches.length === 1);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL at compile: `Module '"../../src/protocol"' has no exported member 'Field'` (and the others).

- [ ] **Step 3: Tighten `src/protocol.ts`**

Replace the `// --- generate (milestone 2)` section (lines 19-31) with:
```ts
// --- generate and actions (milestone 2)
export type Values = Record<string, string>;
// olifant/generators lists each generator's full showJson plus `here`; the client reads these.
// (`pack` is not in the detailed list.)
export interface GeneratorsParams extends Doc { position?: Position }
export interface GeneratorItem extends Open { id: string; name: string; kind?: string; summary?: string; here?: boolean }
export interface GeneratorsResult extends Open { generators: GeneratorItem[] }
export interface ChoicesParams extends Doc { generator: string; sets: Sets }
export interface ChoicesResult extends Open { inputs: unknown[] }

// olifant/preview: the form's fields for every step, the files it would write, the main one's text.
export type Source = 'you' | 'path' | 'here' | 'only' | 'default' | 'new' | 'suggested';
export interface Field {
  name: string; value: string | null; source: Source | null; valid: boolean; why: string | null;
  choices: string[] | null; needs: string[]; new: string[];
}
// Step: a generator of the form, with the values you set; a `+ New` step comes first and
// `makes` names the later step (0-based) whose input it fills.
export interface Step { generator: string; sets: Values; makes?: { step: number; input: string } }
export interface PreviewParams extends At { steps: Step[] }
export interface PreviewFile { path: string; new: boolean; added: number; removed: number }
// main: the first new file, else the first changed one; first: its first differing line (1-based)
export interface PreviewMain { path: string; text: string; first: number }
export interface PreviewResult {
  steps: { generator: string; fields: Field[] }[]; files: PreviewFile[]; main: PreviewMain | null; ready: boolean; error: string | null;
}

// olifant/plan (and codeAction/resolve's data.plan): files relative to the project root.
export interface PlanFile { path: string; before: string | null; after: string }
export interface Hole extends Open { name: string; status: string; model?: string | null; why?: string | null; fill?: string | null; file?: string; line?: number }
// snippet: line is 1-based; its text is replaced by body (TextMate-style tab stops)
export interface PlanSnippet { file: string; line: number; body: string; ghost?: unknown }
export interface Conflict { code: string; message: string }
export interface Plan extends Open {
  generator?: string; files?: PlanFile[]; conflicts: Conflict[]; warnings: string[]; holes: Hole[]; snippet: PlanSnippet | null;
}
// olifant/plan: the generate picker's steps, a follow-up's planId, or a recognition's sets.
export type PlanParams =
  | (At & { steps: Step[] })
  | { planId: string; fill?: boolean }
  | (Doc & { generator: string; sets: Sets; recognize: true });
export interface PlanResult extends Open { plan: Plan; edit?: WorkspaceEdit }

// olifant/fileActions: lines and columns 1-based; range null for a whole-file action.
export interface FileAction extends Open {
  generator: string; name: string; label: string; range: { start: [number, number]; end: [number, number] } | null;
  sets: Sets; missing: string[]; snippet: boolean; trigger?: boolean;
}
export interface Nearby extends Open { generator: string; name?: string; label?: string; why: string }
export interface FileActionsResult extends Open { actions: FileAction[]; nearby: Nearby[] }

// olifant/model's migration (present only while the project migrates).
export interface Migration extends Open { line: string; switches: { name: string; on: boolean }[]; added_legacy: string[]; unregistered: string[] }
export interface ModelResult extends Open { migration?: Migration }

// A code action's data (textDocument/codeAction): a generator's action or a rule's fix; what
// codeAction/resolve adds is the plan.
export interface ActionData extends Open {
  kind?: string; generator?: string; rule?: string; sets?: Values; missing?: string[];
  choices?: Record<string, string[]>; snippet?: boolean; plan?: Plan;
}
```
and in the `Olifant` table:
```ts
  preview: req<PreviewParams, PreviewResult>('olifant/preview'),
  plan: req<PlanParams, PlanResult>('olifant/plan'),
  fileActions: req<Doc, FileActionsResult>('olifant/fileActions'),
  holes: req<Doc, unknown>('olifant/holes'),
  model: req<Doc, ModelResult | null>('olifant/model'),
```

- [ ] **Step 4: Give the fake server the two capabilities**

In `test/fake-lsp/fake-lsp`, change the header's first two lines to:
```python
# Vendored from sorcererdev/durandal.nvim tests/fake-lsp at 7969a55; two changes: `--help`
# lists an `lsp` command and exits, so the fake passes durandal-vscode's binary gate; and the
# capabilities add codeActionProvider (with resolve) and inlayHintProvider, so the client
# registers both features (olifant lsp has both).
```
and in the `initialize` answer add, after `"codeLensProvider": {"resolveProvider": False},`:
```python
"codeActionProvider": {"resolveProvider": True}, "inlayHintProvider": True,
```

- [ ] **Step 5: Run everything**

Run: `npm run lint && npm run test:unit && OLIFANT_REPO=~/projects/olifant npm run test:unit`
Expected: PASS, including the keys test with the local olifant checkout. Then `npm run test:e2e`: PASS (the fake now answers `textDocument/codeAction` and `textDocument/inlayHint` requests from the library with `null`).

- [ ] **Step 6: Commit**

```bash
git add src/protocol.ts test/unit/protocol.test.ts test/fake-lsp/fake-lsp
git commit -m "protocol: type the generate, actions and model answers; the fake serves code actions and inlay hints"
```

---

### Task 3: The form's steps and the generator list (pure)

**Model:** Sonnet.

**Files:**
- Create: `src/generate/form.ts`
- Create: `src/generate/rank.ts`
- Create: `test/unit/form.test.ts`
- Create: `test/unit/rank.test.ts`

**Interfaces:**
- Consumes: `Field`, `Source`, `Step`, `Values`, `GeneratorItem` from `src/protocol.ts` (Task 2).
- Produces, `src/generate/form.ts`:
  - `interface FormStep { generator: string; sets: Values; fields: Field[]; makes?: { target: FormStep; input: string } }`
  - `NOTES: Record<Source, string | undefined>`, `MAX_STEPS = 3`, `short(id: string): string`, `rowKey(step: number, name: string): string`
  - `valueOf(st: FormStep, f: Field): string | null`
  - `type FormRow = { kind: 'heading'; label: string } | { kind: 'field'; key: string; step: number; name: string; description: string; detail?: string; error: boolean }`
  - `note(f: Field): { text?: string; error: boolean }`, `formRows(steps: FormStep[]): FormRow[]`
  - `interface Option { label: string; value?: string; generator?: string }`, `isChoice(f: Field): boolean`, `options(f: Field): Option[]`
  - `firstMissing(steps: FormStep[]): { step: number; name: string } | undefined`
  - `stepsPayload(steps: FormStep[], inferred: boolean): Step[]`
  - `setValue(steps: FormStep[], i: number, name: string, value: string | undefined): FormStep[]` (mutates `steps[i].sets`; returns the steps left)
  - `chooseNew(steps: FormStep[], i: number, name: string, generator: string): FormStep[] | undefined`
- Produces, `src/generate/rank.ts`: `RECENT_MAX = 10`, `fuzzy<T>(list: T[], query: string, text: (x: T) => string): T[]`, `rank(items: GeneratorItem[], query: string, recent: string[]): GeneratorItem[]`, `remember(recent: string[], id: string): string[]`, `type PickerRow = { heading: 'here' | 'all' } | { item: GeneratorItem }`, `pickerRows(items: GeneratorItem[], query: string): PickerRow[]`.

- [ ] **Step 1: Write the failing tests**

`test/unit/form.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Field } from '../../src/protocol';
import { chooseNew, firstMissing, FormStep, formRows, isChoice, note, options, rowKey, setValue, short, stepsPayload, valueOf } from '../../src/generate/form';

const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
const step = (generator: string, fields: Field[], sets: Record<string, string> = {}): FormStep => ({ generator, sets, fields });

test('short is the last segment of a generator id', () => {
  assert.equal(short('python-htmx/repository'), 'repository');
  assert.equal(short('plain'), 'plain');
});

test('note: why (an error), else set X first, else where the value came from', () => {
  assert.deepEqual(note(fld({ name: 'a', why: 'not a name', valid: false })), { text: 'not a name', error: true });
  assert.deepEqual(note(fld({ name: 'a', needs: ['app', 'service'] })), { text: 'set app, service first', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'only' })), { text: 'only one', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'path' })), { text: 'from this file', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'here' })), { text: 'from the cursor', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'suggested' })), { text: 'suggested', error: false });
  assert.deepEqual(note(fld({ name: 'a', source: 'you' })), { text: undefined, error: false });
  assert.deepEqual(note(fld({ name: 'a' })), { text: undefined, error: false });
});

test('formRows: a heading per step (a + New step says what it is for), then its fields', () => {
  const target = step('p/add-dependency', [fld({ name: 'port', valid: false }), fld({ name: 'kind', value: 'commands', source: 'only' })]);
  const made: FormStep = { ...step('p/repository', [fld({ name: 'entity', value: 'table', source: 'you' })], { entity: 'table' }), makes: { target, input: 'port' } };
  assert.deepEqual(formRows([made, target]), [
    { kind: 'heading', label: '+ New repository (for port)' },
    { kind: 'field', key: '0:entity', step: 0, name: 'entity', description: 'table', detail: undefined, error: false },
    { kind: 'heading', label: 'add-dependency' },
    { kind: 'field', key: '1:port', step: 1, name: 'port', description: '⟨port⟩', detail: undefined, error: false },
    { kind: 'field', key: '1:kind', step: 1, name: 'kind', description: 'commands', detail: 'only one', error: false },
  ]);
  assert.equal(rowKey(1, 'port'), '1:port');
});

test('valueOf: what you set, else the server\'s value', () => {
  const st = step('g', [fld({ name: 'a', value: 'server' })], { a: 'mine' });
  assert.equal(valueOf(st, st.fields[0]), 'mine');
  assert.equal(valueOf(step('g', [fld({ name: 'a', value: 'server' })]), fld({ name: 'a', value: 'server' })), 'server');
});

test('options: the choices, then + New for each generator that makes one', () => {
  const f = fld({ name: 'port', choices: ['orders'], new: ['python-htmx/repository'] });
  assert.ok(isChoice(f));
  assert.ok(isChoice(fld({ name: 'x', new: ['g'] })));
  assert.ok(!isChoice(fld({ name: 'x' })));
  assert.deepEqual(options(f), [{ label: 'orders', value: 'orders' }, { label: '+ New repository…', generator: 'python-htmx/repository' }]);
});

test('firstMissing: the first field of any step with no value or not valid', () => {
  const a = step('a', [fld({ name: 'x', value: 'v' }), fld({ name: 'y' })]);
  const b = step('b', [fld({ name: 'z', value: 'bad', valid: false })]);
  assert.deepEqual(firstMissing([a, b]), { step: 0, name: 'y' });
  a.sets.y = 'set';
  assert.deepEqual(firstMissing([a, b]), { step: 1, name: 'z' });
  assert.equal(firstMissing([a]), undefined);
});

test('stepsPayload: your values only, or merged with what the server inferred; makes as a 0-based index', () => {
  const target = step('p/add', [fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port' }), fld({ name: 'note', value: 'x', source: 'you' })], { note: 'x' });
  const made: FormStep = { ...step('p/repo', [fld({ name: 'entity', value: 'table', source: 'you' })], { entity: 'table' }), makes: { target, input: 'port' } };
  assert.deepEqual(stepsPayload([made, target], false), [
    { generator: 'p/repo', sets: { entity: 'table' }, makes: { step: 1, input: 'port' } },
    { generator: 'p/add', sets: { note: 'x' } },
  ]);
  assert.deepEqual(stepsPayload([made, target], true)[1], { generator: 'p/add', sets: { kind: 'commands', note: 'x' } });
});

test('setValue sets or clears a value; a plain value for an input a + New step makes drops that step and its maker', () => {
  const target = step('p/add', [fld({ name: 'port', new: ['p/repo'] })]);
  const middle: FormStep = { ...step('p/repo', [fld({ name: 'entity', new: ['p/entity'] })]), makes: { target, input: 'port' } };
  const first: FormStep = { ...step('p/entity', []), makes: { target: middle, input: 'entity' } };
  let steps = [first, middle, target];
  steps = setValue(steps, 2, 'port', 'orders');
  assert.deepEqual(steps, [target]);
  assert.deepEqual(target.sets, { port: 'orders' });
  steps = setValue(steps, 0, 'port', '');
  assert.deepEqual(target.sets, {});
  steps = setValue(steps, 0, 'other', 'x');
  assert.deepEqual(target.sets, { other: 'x' });
  setValue(steps, 0, 'other', undefined);
  assert.deepEqual(target.sets, {});
});

test('chooseNew: a step before the target carrying its other values; a fourth step is refused; again for the same input replaces', () => {
  const target = step('p/add', [fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port' }), fld({ name: 'command' })], { command: 'create', port: 'old' });
  const one = chooseNew([target], 0, 'port', 'p/repo')!;
  assert.equal(one.length, 2);
  assert.equal(one[1], target);
  assert.deepEqual(one[0].sets, { kind: 'commands', command: 'create' });
  assert.deepEqual(one[0].makes, { target, input: 'port' });
  assert.ok(!('port' in target.sets), 'the made input is the new step\'s now');
  one[0].fields = [fld({ name: 'entity', new: ['p/entity'] })];
  const two = chooseNew(one, 0, 'entity', 'p/entity')!;
  assert.equal(two.length, 3);
  assert.equal(two[0].makes!.target, one[0]);
  two[0].fields = [fld({ name: 'x', new: ['p/more'] })];
  assert.equal(chooseNew(two, 0, 'x', 'p/more'), undefined, 'two levels at most');
  const again = chooseNew(two, 2, 'port', 'p/other')!;
  assert.deepEqual(again.map(s => s.generator), ['p/other', 'p/add'], 'the old + New steps for port go');
});
```

`test/unit/rank.test.ts` (ports of durandal.nvim `tests/rank_spec.lua`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GeneratorItem } from '../../src/protocol';
import { fuzzy, pickerRows, rank, remember } from '../../src/generate/rank';

const g = (id: string, name: string, summary = '', here = false): GeneratorItem => ({ id, name, summary, here });
const ids = (xs: GeneratorItem[]) => xs.map(x => x.id);
const items = [
  g('p/query', 'Query', 'reads data'),
  g('p/command', 'Command', 'a use case that changes state', true),
  g('p/event', 'Event', 'something that happened'),
  g('p/repository', 'Repository', 'stores entities'),
];

test('with no query: here first, then recent (most recent first), then by name', () => {
  assert.deepEqual(ids(rank(items, '', ['p/repository', 'p/query'])), ['p/command', 'p/repository', 'p/query', 'p/event']);
});

test('filters fuzzily on the name and the summary', () => {
  assert.deepEqual(ids(rank(items, 'stores', [])), ['p/repository']);
  assert.ok(!ids(rank(items, 'zzz', [])).length);
});

test('a match in the name beats one only in the summary, even one that applies here', () => {
  const more = [g('p/wire', 'Wire', 'adds a port', true), g('p/port', 'Port', 'an adapter')];
  assert.deepEqual(ids(rank(more, 'port', [])), ['p/port', 'p/wire']);
});

test('among matches, here comes first, then recent', () => {
  const more = [g('p/a', 'Alpha', 'data'), g('p/b', 'Beta', 'data', true), g('p/c', 'Gamma', 'data')];
  assert.deepEqual(ids(rank(more, 'data', ['p/c'])), ['p/b', 'p/c', 'p/a']);
});

test('fuzzy: characters in order, ignoring case; earliest and tightest first', () => {
  assert.deepEqual(fuzzy(['xabc', 'abc', 'a-b-c', 'cba'], 'ABC', s => s), ['abc', 'xabc', 'a-b-c']);
});

test('remember: most recent first, once each, ten at most', () => {
  let r: string[] = [];
  for (let i = 0; i < 12; i++) r = remember(r, `g${i}`);
  assert.equal(r.length, 10);
  assert.equal(r[0], 'g11');
  assert.deepEqual(remember(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
});

test('pickerRows: here and all headings with no query; none with one', () => {
  const ranked = rank(items, '', []);
  assert.deepEqual(pickerRows(ranked, '').map(r => ('heading' in r ? `[${r.heading}]` : r.item.id)),
    ['[here]', 'p/command', '[all]', 'p/event', 'p/query', 'p/repository']);
  assert.deepEqual(pickerRows(rank(items, 'que', []), 'que').every(r => 'item' in r), true);
});
```
- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/generate/form'` and `'../../src/generate/rank'`.

- [ ] **Step 3: Write `src/generate/form.ts`**

```ts
import type { Field, Source, Step, Values } from '../protocol';

// form: the generate form's model, ported from durandal.nvim generate.lua. One step per
// generator (a `+ New` step first, then the one it fills), each with the values you set and
// the last preview's fields. Pure.

export interface FormStep { generator: string; sets: Values; fields: Field[]; makes?: { target: FormStep; input: string } }

// NOTES: where a value came from (generate.lua `notes`); `you` has none.
export const NOTES: Record<Source, string | undefined> = {
  you: undefined, only: 'only one', path: 'from this file', here: 'from the cursor', default: 'default', new: 'new', suggested: 'suggested',
};
export const MAX_STEPS = 3;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export const short = (id: string) => id.replace(/^.*\//, '');
export const rowKey = (step: number, name: string) => `${step}:${name}`;

export function valueOf(st: FormStep, f: Field): string | null {
  return has(st.sets, f.name) ? st.sets[f.name] : f.value;
}

export type FormRow =
  | { kind: 'heading'; label: string }
  | { kind: 'field'; key: string; step: number; name: string; description: string; detail?: string; error: boolean };

// note is a field's line under its value: the server's why, else what it needs first, else
// where its value came from.
export function note(f: Field): { text?: string; error: boolean } {
  if (f.why) return { text: f.why, error: true };
  if (f.needs.length > 0) return { text: `set ${f.needs.join(', ')} first`, error: false };
  return { text: f.source ? NOTES[f.source] : undefined, error: false };
}

export function formRows(steps: FormStep[]): FormRow[] {
  const out: FormRow[] = [];
  steps.forEach((st, i) => {
    out.push({ kind: 'heading', label: st.makes ? `+ New ${short(st.generator)} (for ${st.makes.input})` : short(st.generator) });
    for (const f of st.fields) {
      const n = note(f);
      out.push({ kind: 'field', key: rowKey(i, f.name), step: i, name: f.name, description: valueOf(st, f) ?? `⟨${f.name}⟩`, detail: n.text, error: n.error });
    }
  });
  return out;
}

export interface Option { label: string; value?: string; generator?: string }

// A choice field lists its choices, or offers `+ New …` (generate.lua: `f.choices ~= nil or #f.new > 0`).
export const isChoice = (f: Field) => f.choices !== null || f.new.length > 0;

export function options(f: Field): Option[] {
  return [
    ...(f.choices ?? []).map(c => ({ label: c, value: c })),
    ...f.new.map(g => ({ label: `+ New ${short(g)}…`, generator: g })),
  ];
}

// firstMissing is generate.lua's first_missing: the first field of any step whose value is
// absent or that the server marked not valid.
export function firstMissing(steps: FormStep[]): { step: number; name: string } | undefined {
  for (let i = 0; i < steps.length; i++) {
    for (const f of steps[i].fields) {
      if (valueOf(steps[i], f) === null || f.valid === false) return { step: i, name: f.name };
    }
  }
  return undefined;
}

// stepsPayload is generate.lua's steps_payload: each step's generator and the values you set;
// with inferred, also what the last preview worked out (a value whose source is not you); a
// `+ New` step names the later step it fills by index.
export function stepsPayload(steps: FormStep[], inferred: boolean): Step[] {
  return steps.map(st => {
    const sets: Values = {};
    if (inferred) for (const f of st.fields) if (f.value !== null && f.source !== 'you') sets[f.name] = f.value;
    Object.assign(sets, st.sets);
    const out: Step = { generator: st.generator, sets };
    if (st.makes) {
      const j = steps.indexOf(st.makes.target);
      if (j >= 0) out.makes = { step: j, input: st.makes.input };
    }
    return out;
  });
}

// setValue sets name in step i (empty or undefined clears it, so the server falls back). A
// `+ New` step that made this input is dropped, and so is every step that made a dropped one.
export function setValue(steps: FormStep[], i: number, name: string, value: string | undefined): FormStep[] {
  const target = steps[i];
  if (value === undefined || value === '') delete target.sets[name];
  else target.sets[name] = value;
  const dropped = new Set(steps.filter(st => st.makes?.target === target && st.makes.input === name));
  for (let grew = true; grew;) {
    grew = false;
    for (const st of steps) {
      if (!dropped.has(st) && st.makes && dropped.has(st.makes.target)) {
        dropped.add(st);
        grew = true;
      }
    }
  }
  return steps.filter(st => !dropped.has(st));
}

// chooseNew is generate.lua's choose_new: a step for generator before step i, carrying the
// values of i's other fields, that fills i's input name. Undefined past three steps.
export function chooseNew(steps: FormStep[], i: number, name: string, generator: string): FormStep[] | undefined {
  const target = steps[i];
  const replacing = steps.some(s => s.makes?.target === target && s.makes.input === name);
  // refused before anything changes (nvim refuses at three steps)
  if (steps.length >= MAX_STEPS && !replacing) return undefined;
  // a + New already making this input is replaced (and the input cleared)
  const kept = setValue(steps, i, name, undefined);
  if (kept.length >= MAX_STEPS) return undefined;
  const carried: Values = {};
  for (const f of target.fields) {
    const v = valueOf(target, f);
    if (v !== null && f.name !== name) carried[f.name] = v;
  }
  const at = kept.indexOf(target);
  const fresh: FormStep = { generator, sets: carried, fields: [], makes: { target, input: name } };
  return [...kept.slice(0, at), fresh, ...kept.slice(at)];
}
```
- [ ] **Step 4: Write `src/generate/rank.ts`**

```ts
import type { GeneratorItem } from '../protocol';

// rank: the generate list's order, ported from durandal.nvim generate/rank.lua. With nothing
// typed: here first, then recent, then by name. With a query (fuzzy over the name and the
// summary; the detailed list has no pack): a match in the name first, then here, then
// recent, then how well it matched. Pure.

export const RECENT_MAX = 10;

// fuzzy keeps the items whose text holds query's characters in order (ignoring case), best
// first: the earliest first match, then the fewest gaps, then list order (alder form.ts).
export function fuzzy<T>(list: T[], query: string, text: (x: T) => string): T[] {
  const q = query.toLowerCase();
  const scored: { x: T; score: number; i: number }[] = [];
  list.forEach((x, i) => {
    const t = text(x).toLowerCase();
    let at = -1;
    let first = -1;
    let gaps = 0;
    for (const ch of q) {
      const k = t.indexOf(ch, at + 1);
      if (k < 0) return;
      if (first < 0) first = k;
      else gaps += k - at - 1;
      at = k;
    }
    scored.push({ x, score: first + gaps, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map(s => s.x);
}

const label = (g: GeneratorItem) => g.name || g.id;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function rank(items: GeneratorItem[], query: string, recent: string[]): GeneratorItem[] {
  const recency = new Map(recent.map((id, i) => [id, i]));
  const matched = query
    ? fuzzy(items, query, g => `${label(g)} ${g.summary ?? ''}`)
    : [...items].sort((a, b) => cmp(label(a), label(b)));
  const inName = new Set(query ? fuzzy(matched, query, label).map(g => g.id) : []);
  const order = new Map(matched.map((g, i) => [g, i]));
  return matched.sort((a, b) => {
    const na = inName.has(a.id);
    const nb = inName.has(b.id);
    if (na !== nb) return na ? -1 : 1;
    const ha = a.here === true;
    const hb = b.here === true;
    if (ha !== hb) return ha ? -1 : 1;
    const ra = recency.get(a.id);
    const rb = recency.get(b.id);
    if (ra !== rb) {
      if (ra !== undefined && rb !== undefined) return ra - rb;
      return ra !== undefined ? -1 : 1;
    }
    return order.get(a)! - order.get(b)!;
  });
}

// remember puts id first among the recents, once, keeping RECENT_MAX.
export function remember(recent: string[], id: string): string[] {
  return [id, ...recent.filter(x => x !== id)].slice(0, RECENT_MAX);
}

// PickerRow: a heading (`here` above the first item that applies at the cursor, `all` above
// the first other) or a generator. Headings only with nothing typed: ranked matches mix them.
export type PickerRow = { heading: 'here' | 'all' } | { item: GeneratorItem };

export function pickerRows(items: GeneratorItem[], query: string): PickerRow[] {
  if (query) return items.map(item => ({ item }));
  const out: PickerRow[] = [];
  let seenHere = false;
  let seenRest = false;
  for (const item of items) {
    if (item.here && !seenHere) {
      out.push({ heading: 'here' });
      seenHere = true;
    } else if (!item.here && !seenRest) {
      out.push({ heading: 'all' });
      seenRest = true;
    }
    out.push({ item });
  }
  return out;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS. A failing ordering is a `rank` bug: fix `rank`, not the test (the cases are durandal.nvim's `rank_spec.lua`).

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/generate/form.ts src/generate/rank.ts test/unit/form.test.ts test/unit/rank.test.ts
git commit -m "generate: the form's steps, notes, + New and payloads; the list's rank and recents"
```

---
### Task 4: The preview, review and stale-check models (pure)

**Model:** Sonnet.

**Files:**
- Create: `src/generate/preview.ts`, `src/generate/review.ts`, `src/generate/stale.ts`
- Create: `test/unit/preview.test.ts`, `test/unit/review.test.ts`, `test/unit/stale.test.ts`

**Interfaces:**
- Consumes: `PreviewFile`, `PreviewResult`, `Plan`, `PlanFile`, `Hole` from `src/protocol.ts` (Task 2).
- Produces:
  - `preview.ts`: `fileLine(f: PreviewFile): string`, `fileSummary(files: PreviewFile[]): string`, `NOTHING = 'Nothing to change'`, `type PreviewView = { kind: 'error'; lines: string[] } | { kind: 'nothing' } | { kind: 'changed' | 'new'; path: string; text: string; line: number; title: string }` (`line` 0-based), `previewView(r: PreviewResult): PreviewView`.
  - `review.ts`: `ReviewNote { text: string; jump?: { path: string; line: number } }` (`line` 1-based), `ReviewFile { path: string; mark: '+' | '~'; before: string; after: string }`, `ReviewModel { notes: ReviewNote[]; files: ReviewFile[]; canApply: boolean }`, `holeNote(h: Hole): string`, `reviewModel(plan: Plan): ReviewModel`.
  - `stale.ts`: `staleMessage(path: string): string`, `NOTHING_TO_CHANGE`, `seenText(doc: { dirty: boolean; text: string } | undefined, disk: string | null): string | null`, `firstStale(files: PlanFile[], textOf: (path: string) => Promise<string | null>): Promise<string | undefined>`, `landedMessage(name: string, count: number, unsaved: string[]): string`.

- [ ] **Step 1: Write the failing tests**

`test/unit/preview.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PreviewResult } from '../../src/protocol';
import { fileLine, fileSummary, previewView } from '../../src/generate/preview';

const base: PreviewResult = { steps: [], files: [], main: null, ready: false, error: null };

test('fileLine: + for a new file; ~ with what it adds and removes for a changed one', () => {
  assert.equal(fileLine({ path: 'a.py', new: true, added: 20, removed: 0 }), '+ a.py');
  assert.equal(fileLine({ path: 'b.py', new: false, added: 3, removed: 1 }), '~ b.py +3 −1');
  assert.equal(fileSummary([{ path: 'a.py', new: true, added: 2, removed: 0 }, { path: 'b.py', new: false, added: 3, removed: 1 }]), '+ a.py, ~ b.py +3 −1');
});

test('previewView: an error is its "; " parts', () => {
  assert.deepEqual(previewView({ ...base, error: 'choose app, service to see what it writes; b.py: a conflict' }),
    { kind: 'error', lines: ['choose app, service to see what it writes', 'b.py: a conflict'] });
});

test('previewView: no files and no error is nothing to change', () => {
  assert.deepEqual(previewView(base), { kind: 'nothing' });
});

test('previewView: the main file, changed or new, at its first differing line (0-based), titled with every file', () => {
  const files = [{ path: 'b.py', new: false, added: 3, removed: 1 }, { path: 'a.py', new: true, added: 2, removed: 0 }];
  assert.deepEqual(previewView({ ...base, files, main: { path: 'b.py', text: 'x\ny\n', first: 2 } }),
    { kind: 'changed', path: 'b.py', text: 'x\ny\n', line: 1, title: '~ b.py +3 −1, + a.py' });
  assert.deepEqual(previewView({ ...base, files, main: { path: 'a.py', text: 'z\n', first: 1 } }).kind, 'new');
});
```

`test/unit/review.test.ts` (ports of durandal.nvim `tests/preview_spec.lua`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan } from '../../src/protocol';
import { holeNote, reviewModel } from '../../src/generate/review';

const plan = (o: Partial<Plan>): Plan => ({ files: [], conflicts: [], warnings: [], holes: [], snippet: null, ...o });

test('holeNote: filled (first line of the fill), skipped, else left with why', () => {
  assert.equal(holeNote({ name: 'body', status: 'filled', model: 'claude', fill: 'return 1\nmore' }), 'body filled by claude: return 1 …');
  assert.equal(holeNote({ name: 'body', status: 'skipped' }), 'body left as a placeholder (--no-fill)');
  assert.equal(holeNote({ name: 'body', status: 'unfilled', why: 'no model' }), 'body left as a placeholder: no model');
});

test('reviewModel: unparseable code first (a jump target), then holes, other warnings, conflicts', () => {
  const m = reviewModel(plan({
    warnings: ['a note', 'src/a.py:12 does not parse: unexpected indent'],
    holes: [{ name: 'body', status: 'unfilled', why: 'no model' }],
    conflicts: [{ code: 'exists', message: 'src/b.py exists' }],
  }));
  assert.deepEqual(m.notes, [
    { text: '⚠ src/a.py:12 does not parse: unexpected indent', jump: { path: 'src/a.py', line: 12 } },
    { text: 'body left as a placeholder: no model' },
    { text: '⚠ a note' },
    { text: '✗ src/b.py exists' },
  ]);
  assert.equal(m.canApply, false);
});

test('reviewModel: files marked + (new) or ~ with both sides', () => {
  const m = reviewModel(plan({ files: [{ path: 'n.py', before: null, after: 'x\n' }, { path: 'c.py', before: 'a\n', after: 'b\n' }] }));
  assert.deepEqual(m.files, [
    { path: 'n.py', mark: '+', before: '', after: 'x\n' },
    { path: 'c.py', mark: '~', before: 'a\n', after: 'b\n' },
  ]);
  assert.equal(m.canApply, true);
});
```

`test/unit/stale.test.ts` (ports of `tests/apply_spec.lua`'s refusals and alder's `planCheck.test.ts`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstStale, landedMessage, seenText, staleMessage } from '../../src/generate/stale';

test('seenText: a dirty document\'s text; a clean one of a file gone is gone; else the document, else the disk', () => {
  assert.equal(seenText({ dirty: true, text: 'typed' }, 'disk'), 'typed');
  assert.equal(seenText({ dirty: true, text: 'typed' }, null), 'typed');
  assert.equal(seenText({ dirty: false, text: 'old' }, null), null);
  assert.equal(seenText({ dirty: false, text: 'doc' }, 'doc'), 'doc');
  assert.equal(seenText(undefined, 'disk'), 'disk');
  assert.equal(seenText(undefined, null), null);
});

test('firstStale: the first file whose text is not its planned before; null before means it must not exist (Review Focus 2)', async () => {
  const texts: Record<string, string | null> = { 'a.py': 'a\n', 'b.py': null, 'c.py': 'c\n' };
  const textOf = async (p: string) => texts[p] ?? null;
  const files = [{ path: 'a.py', before: 'a\n', after: 'A\n' }, { path: 'b.py', before: null, after: 'B\n' }];
  assert.equal(await firstStale(files, textOf), undefined);
  texts['a.py'] = 'a\ntyped\n';
  assert.equal(await firstStale(files, textOf), 'a.py');
  texts['a.py'] = 'a\n';
  texts['b.py'] = 'appeared\n';
  assert.equal(await firstStale(files, textOf), 'b.py');
  assert.equal(staleMessage('b.py'), 'b.py changed since planning; nothing was applied — plan again');
});

test('landedMessage: the name and the count; files left unsaved named', () => {
  assert.equal(landedMessage('Command', 2, []), 'Applied Command: 2 files');
  assert.equal(landedMessage('Command', 1, []), 'Applied Command: 1 file');
  assert.equal(landedMessage('Command', 2, ['b.py']), 'Applied Command: 2 files (unsaved: b.py)');
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL, the three modules do not exist.

- [ ] **Step 3: Write `src/generate/preview.ts`**

```ts
import type { PreviewFile, PreviewResult } from '../protocol';

// preview: what the live preview shows for an answer (durandal.nvim generate.lua
// render_preview): the error's parts; nothing to change; or the main file, changed (a diff
// against the file) or new (its text alone), at its first differing line. Pure.

export const NOTHING = 'Nothing to change';

export function fileLine(f: PreviewFile): string {
  return f.new ? `+ ${f.path}` : `~ ${f.path} +${f.added} −${f.removed}`;
}

export function fileSummary(files: PreviewFile[]): string {
  return files.map(fileLine).join(', ');
}

export type PreviewView =
  | { kind: 'error'; lines: string[] }
  | { kind: 'nothing' }
  | { kind: 'changed' | 'new'; path: string; text: string; line: number; title: string };

export function previewView(r: PreviewResult): PreviewView {
  if (r.error) return { kind: 'error', lines: r.error.split('; ') };
  const files = r.files ?? [];
  const main = r.main;
  if (files.length === 0 || !main) return { kind: 'nothing' };
  const f = files.find(x => x.path === main.path);
  return {
    kind: f && !f.new ? 'changed' : 'new',
    path: main.path,
    text: main.text,
    line: Math.max((main.first || 1) - 1, 0),
    title: fileSummary(files),
  };
}
```

- [ ] **Step 4: Write `src/generate/review.ts`**

```ts
import type { Hole, Plan } from '../protocol';

// review: a plan as the review window shows it, ported from durandal.nvim preview.lua's
// model: notes (unparseable code first, as it explains what follows; then holes, other
// warnings, conflicts) and the files with both sides for vscode.diff. Pure.

export interface ReviewNote { text: string; jump?: { path: string; line: number } }
export interface ReviewFile { path: string; mark: '+' | '~'; before: string; after: string }
export interface ReviewModel { notes: ReviewNote[]; files: ReviewFile[]; canApply: boolean }

const PARSE = /^(.*?):(\d+) does not parse/;

export function holeNote(h: Hole): string {
  if (h.status === 'filled') return `${h.name} filled by ${h.model ?? ''}: ${(h.fill ?? '').replace(/\n[\s\S]*/, ' …')}`;
  if (h.status === 'skipped') return `${h.name} left as a placeholder (--no-fill)`;
  return `${h.name} left as a placeholder: ${h.why ?? ''}`;
}

export function reviewModel(plan: Plan): ReviewModel {
  const notes: ReviewNote[] = [];
  const warnings = plan.warnings ?? [];
  for (const w of warnings) {
    const m = PARSE.exec(w);
    if (m) notes.push({ text: `⚠ ${w}`, jump: { path: m[1], line: Number(m[2]) } });
  }
  for (const h of plan.holes ?? []) notes.push({ text: holeNote(h) });
  for (const w of warnings) if (!PARSE.test(w)) notes.push({ text: `⚠ ${w}` });
  for (const c of plan.conflicts ?? []) notes.push({ text: `✗ ${c.message}` });
  const files = (plan.files ?? []).map((f): ReviewFile => ({ path: f.path, mark: f.before === null ? '+' : '~', before: f.before ?? '', after: f.after }));
  return { notes, files, canApply: (plan.conflicts ?? []).length === 0 };
}
```

- [ ] **Step 5: Write `src/generate/stale.ts`**

```ts
import type { PlanFile } from '../protocol';

// stale: the pure half of applying a plan (durandal.nvim apply.lua, alder planCheck.ts):
// every planned file must still read as it did when planned, else nothing is applied.

export const staleMessage = (path: string) => `${path} changed since planning; nothing was applied — plan again`;
export const NOTHING_TO_CHANGE = 'Nothing to change: the code already has it';

// seenText is a file's text as the user sees it: a dirty document's text; else none when the
// file is not on disk (a clean document of a removed file is stale); else the document's,
// else the disk's.
export function seenText(doc: { dirty: boolean; text: string } | undefined, disk: string | null): string | null {
  if (doc?.dirty) return doc.text;
  if (disk === null) return null;
  return doc ? doc.text : disk;
}

// firstStale is the first file whose seen text is not its planned before (null: it must not exist).
export async function firstStale(files: PlanFile[], textOf: (path: string) => Promise<string | null>): Promise<string | undefined> {
  for (const f of files) {
    if ((await textOf(f.path)) !== f.before) return f.path;
  }
  return undefined;
}

export function landedMessage(name: string, count: number, unsaved: string[]): string {
  const n = `${count} file${count === 1 ? '' : 's'}`;
  return unsaved.length === 0 ? `Applied ${name}: ${n}` : `Applied ${name}: ${n} (unsaved: ${unsaved.join(', ')})`;
}
```

- [ ] **Step 6: Run the tests, lint, commit**

Run: `npm run test:unit && npm run lint`
Expected: PASS.
```bash
git add src/generate/preview.ts src/generate/review.ts src/generate/stale.ts test/unit/preview.test.ts test/unit/review.test.ts test/unit/stale.test.ts
git commit -m "generate: the preview view, the review model, the stale check"
```

---

### Task 5: The generate flow (state machine, no VS Code)

**Model:** Opus.

**Files:**
- Create: `src/uiTypes.ts`
- Create: `src/generate/flow.ts`
- Create: `test/fakeUi.ts`
- Create: `test/unit/flow.test.ts`

**Interfaces:**
- Consumes: Task 2's protocol types and `Olifant`; Task 3's `form.ts` and `rank.ts`; Task 4's `fileSummary`, `ReviewModel`, `ReviewFile`; Task 1's `ActionEvent`.
- Produces, `src/uiTypes.ts` (every later task's UI goes through it):
  - `Item<T> { label: string; description?: string; detail?: string; separator?: boolean; value?: T }`
  - `PickOptions<T> { title: string; placeholder?: string; items: Item<T>[]; active?: string; query?(text: string): Item<T>[] }`
  - `TextOptions { title: string; value: string; prompt?: string; onChange?(text: string): void }`, `TextView { setValidation(m: string | undefined): void; result: Promise<string | undefined> }`
  - `FormModel { title: string; rows: FormRow[]; ready: boolean; updating: boolean; error?: string; active?: string }`
  - `FormAnswer = { kind: 'field'; step: number; name: string } | { kind: 'apply' } | { kind: 'review' } | { kind: 'back' } | { kind: 'escape' }`, `FormView { update(m: FormModel): void; close(): void }`
  - `ReviewAnswer = { kind: 'apply' } | { kind: 'close' } | { kind: 'jump'; path: string; line: number }`
  - `Ui { info; warn; error; pick<T>(o: PickOptions<T>): Promise<T | undefined>; text(o: TextOptions): TextView; form(m, answer): FormView; review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer>; closeSteps(): void }`
- Produces, `src/generate/flow.ts`: `DEBOUNCE_MS = 80`, `Origin { uri: string; position: { line: number; character: number }; root: string }`, `FlowServer { request<P, R>(type: RequestType<P, R, void>, params: P): Promise<R>; running(): boolean }`, `PreviewSink { show(r: PreviewResult): void; dispose(): void }`, `Preset { generator: string; sets?: Values; done?: boolean }`, `FlowEnd = { kind: 'closed' } | { kind: 'applied' } | { kind: 'snippet' } | { kind: 'reviewed' } | { kind: 'sets'; sets: Values }`, `FlowEnv` (below), `asPreset(a: unknown): Preset | undefined`, `class Flow { constructor(env: FlowEnv, origin: Origin); readonly result: Promise<FlowEnd>; start(preset?: Preset): Promise<void>; answer(a: FormAnswer): Promise<void>; close(): void }`.
- Produces, `test/fakeUi.ts`: `class FakeUi implements Ui` with `log: string[]`, `picks`, `forms`, `texts`, `onPick`, `onReview`, `stepsClosed`, `openForm` (used by Tasks 6–11).

`FlowEnv`:
```ts
export interface FlowEnv {
  server: FlowServer;
  ui: Ui;
  preview: PreviewSink;
  recent: string[];                 // generator ids, most recent first
  remember(id: string): void;
  log(e: ActionEvent): void;
  // land applies a plan: undefined when it landed (its notice said so), else why it did not
  land(plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined>;
  snippet(s: PlanSnippet): Promise<boolean>;
  // review opens the review window on a plan; landed runs when its Apply landed
  review(plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void>;
  debounceMs?: number;
}
```

- [ ] **Step 1: Write `src/uiTypes.ts` (types only; the tests need them to compile)**

```ts
import type { FormRow } from './generate/form';
import type { ReviewFile, ReviewModel } from './generate/review';

// uiTypes: what the commands ask of the screen. src/quickInput.ts is VS Code's; test/fakeUi.ts
// answers in the tests. A step that is hidden (Escape) answers its "nothing".

export interface Item<T> { label: string; description?: string; detail?: string; separator?: boolean; value?: T }

export interface PickOptions<T> {
  title: string;
  placeholder?: string;
  items: Item<T>[];
  // active: the label of the item to start on
  active?: string;
  // query: the items for what is typed, ranked by the caller (VS Code's filter is bypassed)
  query?(text: string): Item<T>[];
}

export interface TextOptions { title: string; value: string; prompt?: string; onChange?(text: string): void }
export interface TextView { setValidation(message: string | undefined): void; result: Promise<string | undefined> }

export interface FormModel { title: string; rows: FormRow[]; ready: boolean; updating: boolean; error?: string; active?: string }
export type FormAnswer =
  | { kind: 'field'; step: number; name: string }
  | { kind: 'apply' }
  | { kind: 'review' }
  | { kind: 'back' }
  | { kind: 'escape' };
export interface FormView { update(m: FormModel): void; close(): void }

export type ReviewAnswer = { kind: 'apply' } | { kind: 'close' } | { kind: 'jump'; path: string; line: number };

export interface Ui {
  info(m: string): void;
  warn(m: string): void;
  error(m: string): void;
  pick<T>(o: PickOptions<T>): Promise<T | undefined>;
  text(o: TextOptions): TextView;
  form(m: FormModel, answer: (a: FormAnswer) => void): FormView;
  review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer>;
  // closeSteps hides the pick, text or review that is up (each answers its "nothing")
  closeSteps(): void;
}
```

- [ ] **Step 2: Write `test/fakeUi.ts`**

```ts
import type { ReviewFile, ReviewModel } from '../src/generate/review';
import type { FormAnswer, FormModel, PickOptions, ReviewAnswer, TextOptions, TextView, Ui } from '../src/uiTypes';

// FakeUi answers the commands in a test (unit and e2e): pick and review call the handlers
// (default: nothing, as Escape); text and form record what was asked, for the test to answer.
export class FakeUi implements Ui {
  log: string[] = [];
  picks: PickOptions<unknown>[] = [];
  forms: { model: FormModel; answer(a: FormAnswer): void; closed: boolean }[] = [];
  texts: { title: string; value: string; onChange?(t: string): void; validation?: string; finish(v: string | undefined): void }[] = [];
  onPick: (o: PickOptions<unknown>) => unknown = () => undefined;
  onReview: (m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }) => ReviewAnswer | Promise<ReviewAnswer> = () => ({ kind: 'close' });
  stepsClosed = 0;

  info(m: string) { this.log.push(`info ${m}`); }
  warn(m: string) { this.log.push(`warn ${m}`); }
  error(m: string) { this.log.push(`error ${m}`); }

  async pick<T>(o: PickOptions<T>): Promise<T | undefined> {
    this.picks.push(o as PickOptions<unknown>);
    this.log.push(`pick ${o.title}`);
    return this.onPick(o as PickOptions<unknown>) as T | undefined;
  }

  text(o: TextOptions): TextView {
    let finish!: (v: string | undefined) => void;
    const result = new Promise<string | undefined>(r => { finish = r; });
    const entry = { title: o.title, value: o.value, onChange: o.onChange, validation: undefined as string | undefined, finish };
    this.texts.push(entry);
    this.log.push(`text ${o.title}`);
    return { setValidation: m => { entry.validation = m; }, result };
  }

  form(model: FormModel, answer: (a: FormAnswer) => void) {
    const call = { model, answer, closed: false };
    this.forms.push(call);
    return { update: (m: FormModel) => { call.model = m; }, close: () => { call.closed = true; } };
  }

  async review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer> {
    this.log.push(`review ${o.title}`);
    return this.onReview(m, o);
  }

  closeSteps() {
    this.stepsClosed++;
    for (const t of this.texts) t.finish(undefined);
  }

  // openForm is the form that is up, if any
  get openForm() {
    const f = this.forms[this.forms.length - 1];
    return f && !f.closed ? f : undefined;
  }
}
```

- [ ] **Step 3: Write the failing flow tests**

`test/unit/flow.test.ts` (ports of durandal.nvim `tests/generate_spec.lua` and alder `test/unit/flow.test.ts`, for what the flow decides):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RequestType } from 'vscode-languageserver-protocol';
import type { ActionEvent } from '../../src/actionLog';
import { asPreset, Flow, FlowEnv, FlowServer, Origin } from '../../src/generate/flow';
import type { FormRow } from '../../src/generate/form';
import type { Field, GeneratorItem, Plan, PlanResult, PlanSnippet, PreviewResult } from '../../src/protocol';
import { FakeUi } from '../fakeUi';

const tick = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Pending { method: string; params: any; resolve(v: unknown): void; reject(e: unknown): void }

class FakeServer implements FlowServer {
  pending: Pending[] = [];
  sent: Pending[] = [];
  up = true;
  request<P, R>(type: RequestType<P, R, void>, params: P): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const p: Pending = { method: type.method, params, resolve: resolve as (v: unknown) => void, reject };
      this.pending.push(p);
      this.sent.push(p);
    });
  }
  running() { return this.up; }
  // take removes and returns the oldest pending request of method
  take(method: string): Pending {
    const i = this.pending.findIndex(p => p.method === method);
    assert.ok(i >= 0, `no pending ${method}; pending: ${this.pending.map(p => p.method).join(', ')}`);
    return this.pending.splice(i, 1)[0];
  }
  count(method: string) { return this.sent.filter(p => p.method === method).length; }
}

class FakeSink {
  shown: PreviewResult[] = [];
  disposed = false;
  show(r: PreviewResult) { this.shown.push(r); }
  dispose() { this.disposed = true; }
}

const origin: Origin = { uri: 'file:///w/src/booking/create_booking.py', position: { line: 3, character: 2 }, root: '/w' };
const command: GeneratorItem = { id: 'p/command', name: 'Command', summary: 'a use case', here: true };
const query: GeneratorItem = { id: 'p/query', name: 'Query', summary: 'reads' };
const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
const preview = (fields: Field[], o: Partial<PreviewResult> = {}): PreviewResult => ({
  steps: [{ generator: 'p/command', fields }],
  files: [{ path: 'src/a.py', new: true, added: 3, removed: 0 }],
  main: { path: 'src/a.py', text: 'a\n', first: 1 },
  ready: false, error: null, ...o,
});
const app = fld({ name: 'app', value: 'bistro', source: 'only' });
const missing = preview([app, fld({ name: 'command', valid: false })]);
const filled = preview([app, fld({ name: 'command', value: 'close_table', source: 'you' })], { ready: true });
const planned = (o: Partial<Plan> = {}): PlanResult => ({
  plan: { files: [{ path: 'src/a.py', before: null, after: 'a\n' }], conflicts: [], warnings: [], holes: [], snippet: null, ...o },
  edit: { documentChanges: [] },
});
const fieldRows = (rows: FormRow[]) => rows.filter((r): r is Extract<FormRow, { kind: 'field' }> => r.kind === 'field');

function setup(debounceMs = 0) {
  const server = new FakeServer();
  const ui = new FakeUi();
  const sink = new FakeSink();
  const logged: ActionEvent[] = [];
  const remembered: string[] = [];
  const landed: { plan: Plan; name: string }[] = [];
  const snippets: PlanSnippet[] = [];
  const reviews: { plan: Plan; title: string; landed(): void }[] = [];
  let landError: string | undefined;
  const env: FlowEnv = {
    server, ui, preview: sink, recent: ['p/query'],
    remember: id => { remembered.push(id); },
    log: e => { logged.push(e); },
    land: async (plan, _edit, name) => { landed.push({ plan, name }); return landError; },
    snippet: async s => { snippets.push(s); return true; },
    review: async (plan, _edit, o) => { reviews.push({ plan, ...o }); },
    debounceMs,
  };
  const flow = new Flow(env, origin);
  return { server, ui, sink, logged, remembered, landed, snippets, reviews, flow, failLand: (m: string) => { landError = m; } };
}
type S = ReturnType<typeof setup>;

// opened: past the list on Command, its first preview answered with r.
async function opened(r: PreviewResult = missing, debounceMs = 0): Promise<S> {
  const s = setup(debounceMs);
  s.ui.onPick = o => o.items.find(i => (i.value as GeneratorItem | undefined)?.id === 'p/command')?.value;
  void s.flow.start();
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [query, command] });
  await tick();
  s.server.take('olifant/preview').resolve(r);
  await tick();
  return s;
}

// type answers a text field: opens it, types text (one preview, debounce 0) and accepts.
async function type(s: S, step: number, name: string, text: string): Promise<void> {
  void s.ui.openForm!.answer({ kind: 'field', step, name });
  await tick();
  const t = s.ui.texts[s.ui.texts.length - 1];
  t.onChange!(text);
  t.finish(text);
  await tick();
}

// ready: command typed and the preview ready.
async function ready(): Promise<S> {
  const s = await opened();
  await type(s, 0, 'command', 'close_table');
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  return s;
}

test('asPreset reads {generator, sets, done}, keeping string values', () => {
  assert.deepEqual(asPreset({ generator: 'g', sets: { a: 'x', n: 1 }, done: true }), { generator: 'g', sets: { a: 'x' }, done: true });
  assert.deepEqual(asPreset({ generator: 'g' }), { generator: 'g', sets: {}, done: false });
  assert.equal(asPreset('g'), undefined);
  assert.equal(asPreset(undefined), undefined);
});

test('no generators: the error names the root, and the flow ends', async () => {
  const s = setup();
  void s.flow.start();
  await tick();
  const p = s.server.take('olifant/generators');
  assert.deepEqual(p.params, { textDocument: { uri: origin.uri }, position: origin.position });
  p.resolve({ generators: [] });
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.deepEqual(s.ui.log, ['error no generators in /w (its packs: .olifant/config.toml)']);
  assert.equal(s.ui.forms.length, 0);
});

test('the list: here first under its heading, then the rest by recent and name; a query ranks without headings', async () => {
  const s = setup();
  s.ui.onPick = () => undefined;
  void s.flow.start();
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [{ id: 'p/event', name: 'Event' }, command, query] });
  await tick();
  const o = s.ui.picks[0];
  assert.deepEqual(o.items.map(i => (i.separator ? `[${i.label}]` : i.label)), ['[here]', 'Command', '[all]', 'Query', 'Event']);
  assert.deepEqual(o.query!('que').map(i => i.label), ['Query']);
  assert.deepEqual(await s.flow.result, { kind: 'closed' }, 'nothing picked');
});

test('picking opens the form and previews with no values; the answer fills the rows and the title', async () => {
  const s = await opened();
  const first = s.server.sent.filter(p => p.method === 'olifant/preview')[0];
  assert.deepEqual(first.params, { textDocument: { uri: origin.uri }, position: origin.position, steps: [{ generator: 'p/command', sets: {} }] });
  const m = s.ui.openForm!.model;
  assert.equal(m.title, 'Command · + src/a.py');
  assert.deepEqual(fieldRows(m.rows).map(r => [r.name, r.description, r.detail]), [['app', 'bistro', 'only one'], ['command', '⟨command⟩', undefined]]);
  assert.equal(m.ready, false);
  assert.deepEqual(s.sink.shown[s.sink.shown.length - 1], missing);
});

test('a preset opens its generator at once with its values; one the list lacks opens too', async () => {
  for (const id of ['p/command', 'p/hidden']) {
    const s = setup();
    void s.flow.start({ generator: id, sets: { app: 'bistro' } });
    await tick();
    s.server.take('olifant/generators').resolve({ generators: [command] });
    await tick();
    assert.equal(s.ui.picks.length, 0);
    assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: id, sets: { app: 'bistro' } }]);
  }
});

test('typing: one preview per burst (Review Focus 1)', async () => {
  const s = await opened(missing, 30);
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('c');
  t.onChange!('cl');
  t.onChange!('close');
  await sleep(80);
  const sent = s.server.sent.filter(p => p.method === 'olifant/preview');
  assert.equal(sent.length, 2, 'the first, then one for the burst');
  assert.deepEqual(sent[1].params.steps[0].sets, { command: 'close' });
});

test('an older answer is dropped (Review Focus 1)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('a');
  await tick();
  const old = s.server.take('olifant/preview');
  t.onChange!('ab');
  await tick();
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  old.resolve(missing);
  await tick();
  assert.deepEqual(s.sink.shown[s.sink.shown.length - 1], filled);
});

test('-32800 (superseded) is ignored (Review Focus 1)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[0].onChange!('x');
  await tick();
  s.server.take('olifant/preview').reject(Object.assign(new Error('superseded by a newer preview'), { code: -32800 }));
  await tick();
  assert.deepEqual(s.ui.log.filter(l => l.startsWith('error')), []);
  assert.equal(s.sink.shown.length, 1, 'nothing painted');
});

test('a failed preview shows its error and disarms a waiting Enter', async () => {
  const s = await opened(missing, 30);
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  const t = s.ui.texts[0];
  t.onChange!('close');
  t.finish('close');
  await tick();
  // the debounced preview is still waiting: Enter sends it now and waits for its answer
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/preview').reject(new Error('boom'));
  await tick();
  assert.equal(s.sink.shown[s.sink.shown.length - 1].error, 'the preview failed: boom');
  assert.equal(s.server.count('olifant/plan'), 0);
  assert.equal(s.ui.texts.length, 1, 'the disarmed Enter opened no editor');
  assert.ok(s.ui.openForm);
});

test('Enter when not ready opens the first missing field', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  assert.equal(s.ui.texts[s.ui.texts.length - 1].title, 'command: command');
  assert.equal(s.server.count('olifant/plan'), 0);
});

test('Enter when ready plans with the inferred values merged, lands, logs, remembers, ends', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  const p = s.server.take('olifant/plan');
  assert.deepEqual(p.params.steps, [{ generator: 'p/command', sets: { app: 'bistro', command: 'close_table' } }]);
  p.resolve(planned());
  assert.deepEqual(await s.flow.result, { kind: 'applied' });
  assert.deepEqual(s.landed.map(l => l.name), ['Command']);
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
  assert.deepEqual(s.remembered, ['p/command']);
  assert.ok(s.sink.disposed);
  assert.ok(!s.ui.openForm);
});

test('a plan that did not land keeps the form open with its values and the error', async () => {
  const s = await ready();
  s.failLand('src/a.py changed since planning; nothing was applied — plan again');
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').resolve(planned());
  await tick();
  assert.equal(s.ui.openForm!.model.error, 'src/a.py changed since planning; nothing was applied — plan again');
  assert.ok(s.ui.log.includes('error src/a.py changed since planning; nothing was applied — plan again'));
  assert.deepEqual(s.logged, []);
  assert.equal(fieldRows(s.ui.openForm!.model.rows)[1].description, 'close_table');
});

test('a refused plan (the server\'s error) keeps the form with the error', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').reject(new Error('src/a.py exists'));
  await tick();
  assert.equal(s.ui.openForm!.model.error, 'src/a.py exists');
  assert.equal(s.landed.length, 0);
});

test('a snippet plan inserts the snippet instead of landing', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'apply' });
  await tick();
  s.server.take('olifant/plan').resolve(planned({ snippet: { file: 'src/a.py', line: 3, body: 'x = ${1:1}' } }));
  assert.deepEqual(await s.flow.result, { kind: 'snippet' });
  assert.deepEqual(s.snippets, [{ file: 'src/a.py', line: 3, body: 'x = ${1:1}' }]);
  assert.equal(s.landed.length, 0);
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
});

test('done mode: Enter hands back the last step\'s values, merged, without planning', async () => {
  const s = setup();
  void s.flow.start({ generator: 'p/command', sets: { app: 'bistro' }, done: true });
  await tick();
  s.server.take('olifant/generators').resolve({ generators: [command] });
  await tick();
  s.server.take('olifant/preview').resolve(missing);
  await tick();
  await type(s, 0, 'command', 'close_table');
  s.server.take('olifant/preview').resolve(filled);
  await tick();
  void s.ui.openForm!.answer({ kind: 'apply' });
  assert.deepEqual(await s.flow.result, { kind: 'sets', sets: { app: 'bistro', command: 'close_table' } });
  assert.equal(s.server.count('olifant/plan'), 0);
});

test('Review plans, closes the form, opens the review; its landing logs generate-applied', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'review' });
  await tick();
  s.server.take('olifant/plan').resolve(planned());
  assert.deepEqual(await s.flow.result, { kind: 'reviewed' });
  assert.equal(s.reviews.length, 1);
  assert.equal(s.reviews[0].title, 'Command');
  assert.ok(!s.ui.openForm);
  s.reviews[0].landed();
  assert.deepEqual(s.logged, [{ event: 'generate-applied', generator: 'p/command' }]);
});

test('a review whose values changed while it was planned is dropped', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'review' });
  await tick();
  const p = s.server.take('olifant/plan');
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[s.ui.texts.length - 1].onChange!('other');
  await tick();
  p.resolve(planned());
  await tick();
  assert.equal(s.reviews.length, 0);
});

test('+ New puts a step before the field\'s, with makes; a plain choice later drops it (Review Focus 4)', async () => {
  const port = preview([fld({ name: 'kind', value: 'commands', source: 'only' }), fld({ name: 'port', valid: false, choices: ['orders'], new: ['p/repository'] })]);
  const s = await opened(port);
  s.ui.onPick = o => o.items.find(i => i.label === '+ New repository…')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'port' });
  await tick();
  const sent = s.server.take('olifant/preview');
  assert.deepEqual(sent.params.steps, [
    { generator: 'p/repository', sets: { kind: 'commands' }, makes: { step: 1, input: 'port' } },
    { generator: 'p/command', sets: {} },
  ]);
  sent.resolve({ ...port, steps: [{ generator: 'p/repository', fields: [fld({ name: 'entity', valid: false })] }, port.steps[0]] });
  await tick();
  const m = s.ui.openForm!.model;
  assert.deepEqual(m.rows.filter(r => r.kind === 'heading').map(r => r.label), ['+ New repository (for port)', 'command']);
  assert.equal(m.active, '0:entity', 'the new step\'s first field');
  s.ui.onPick = o => o.items.find(i => i.label === 'orders')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 1, name: 'port' });
  await tick();
  assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: 'p/command', sets: { port: 'orders' } }]);
});

test('+ New past three steps is refused with a warning (Review Focus 4)', async () => {
  const deep = (generator: string) => ({ generator, fields: [fld({ name: 'x', valid: false, new: ['p/more'] })] });
  const s = await opened(preview([], { steps: [deep('p/command')] }));
  s.ui.onPick = o => o.items.find(i => i.label === '+ New more…')?.value;
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  s.server.take('olifant/preview').resolve(preview([], { steps: [deep('p/more'), deep('p/command')] }));
  await tick();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  s.server.take('olifant/preview').resolve(preview([], { steps: [deep('p/more'), deep('p/more'), deep('p/command')] }));
  await tick();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'x' });
  await tick();
  assert.ok(s.ui.log.includes('warn + New goes two levels deep at most'));
  assert.equal(s.server.pending.filter(p => p.method === 'olifant/preview').length, 0);
});

test('Back returns to the list and keeps the generator\'s values', async () => {
  const s = await ready();
  void s.ui.openForm!.answer({ kind: 'back' });
  await tick();
  assert.equal(s.ui.picks.filter(p => p.title === 'Generate').length, 2);
  assert.deepEqual(s.server.take('olifant/preview').params.steps, [{ generator: 'p/command', sets: { command: 'close_table' } }]);
});

test('Escape ends the flow and closes the preview', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'escape' });
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.ok(s.sink.disposed);
});

test('the server gone: the failed preview says so once and the form closes (Review Focus 3)', async () => {
  const s = await opened();
  void s.ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await tick();
  s.ui.texts[0].onChange!('x');
  await tick();
  s.server.up = false;
  s.server.take('olifant/preview').reject(new Error('olifant lsp is not running here (Durandal: Show Health)'));
  assert.deepEqual(await s.flow.result, { kind: 'closed' });
  assert.deepEqual(s.ui.log.filter(l => l.startsWith('error')), ['error olifant lsp is not running here (Durandal: Show Health)']);
  assert.ok(s.ui.stepsClosed > 0, 'the open editor closed');
});
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/generate/flow'`.

- [ ] **Step 5: Write `src/generate/flow.ts`**

```ts
import type { RequestType, WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { ActionEvent } from '../actionLog';
import { Field, GeneratorItem, GeneratorsResult, Olifant, Plan, PlanResult, PlanSnippet, PreviewResult, Values } from '../protocol';
import type { FormAnswer, FormModel, FormView, Item, TextView, Ui } from '../uiTypes';
import { chooseNew, firstMissing, FormStep, formRows, isChoice, Option, options, rowKey, setValue, short, stepsPayload, valueOf } from './form';
import { fileSummary } from './preview';
import { pickerRows, rank } from './rank';

// flow: the generate picker's state, ported from durandal.nvim generate.lua (and alder-vscode's
// flow.ts): the list, the form of one or more steps, one preview per burst of typing with a
// sequence number so a late answer never counts, Enter's rules, the review, + New. No vscode
// here: the server, the UI and the preview come in through FlowEnv.

export const DEBOUNCE_MS = 80;

export interface Origin { uri: string; position: { line: number; character: number }; root: string }
export interface FlowServer { request<P, R>(type: RequestType<P, R, void>, params: P): Promise<R>; running(): boolean }
export interface PreviewSink { show(r: PreviewResult): void; dispose(): void }
export interface Preset { generator: string; sets?: Values; done?: boolean }
export type FlowEnd = { kind: 'closed' } | { kind: 'applied' } | { kind: 'snippet' } | { kind: 'reviewed' } | { kind: 'sets'; sets: Values };

export interface FlowEnv {
  server: FlowServer;
  ui: Ui;
  preview: PreviewSink;
  recent: string[];
  remember(id: string): void;
  log(e: ActionEvent): void;
  land(plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined>;
  snippet(s: PlanSnippet): Promise<boolean>;
  review(plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void>;
  debounceMs?: number;
}

// asPreset reads durandal.generate's argument: {generator, sets, done} (an action's preset).
export function asPreset(a: unknown): Preset | undefined {
  if (!a || typeof a !== 'object') return undefined;
  const o = a as { generator?: unknown; sets?: unknown; done?: unknown };
  if (typeof o.generator !== 'string') return undefined;
  const sets: Values = {};
  if (o.sets && typeof o.sets === 'object') {
    for (const [k, v] of Object.entries(o.sets)) if (typeof v === 'string') sets[k] = v;
  }
  return { generator: o.generator, sets, done: o.done === true };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const cancelled = (err: unknown) => !!err && typeof err === 'object' && (err as { code?: unknown }).code === -32800;
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// shared by every flow, so a closed flow's answer never matches a new one's number
let seqCounter = 0;

export class Flow {
  readonly result: Promise<FlowEnd>;
  private finish!: (e: FlowEnd) => void;
  private closed = false;
  private items: GeneratorItem[] = [];
  private sel: GeneratorItem | undefined;
  private steps: FormStep[] = [];
  // kept: each generator's steps as Back left them
  private readonly kept = new Map<string, FormStep[]>();
  private doneMode = false;
  private seq = 0;
  private ready = false;
  private updating = false;
  private planning = false;
  private summary = '';
  private error: string | undefined;
  // afterPreview: what Enter or Review does once the newest preview has landed
  private afterPreview: (() => void) | undefined;
  // busy: a field editor is up, or a plan for Enter is being made and landed
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private view: FormView | undefined;
  private textView: { step: FormStep; name: string; view: TextView } | undefined;
  private active: string | undefined;
  // focusStep: a + New step whose first field gets the focus once its fields arrive
  private focusStep: FormStep | undefined;

  constructor(private readonly env: FlowEnv, private readonly origin: Origin) {
    this.result = new Promise(r => { this.finish = r; });
  }

  private at<E extends object>(extra: E) {
    return { textDocument: { uri: this.origin.uri }, position: this.origin.position, ...extra };
  }

  async start(preset?: Preset): Promise<void> {
    this.doneMode = preset?.done === true;
    let res: GeneratorsResult | null;
    try {
      res = await this.env.server.request(Olifant.generators, this.at({}));
    } catch (err) {
      if (!this.closed) {
        this.env.ui.error(message(err));
        this.close();
      }
      return;
    }
    if (this.closed) return;
    this.items = res?.generators ?? [];
    if (this.items.length === 0) {
      this.env.ui.error(`no generators in ${this.origin.root} (its packs: .olifant/config.toml)`);
      return this.close();
    }
    if (preset) {
      // an action may name a generator the menu leaves out (menu = false): open it by id
      const g = this.items.find(i => i.id === preset.generator) ?? { id: preset.generator, name: short(preset.generator) };
      return this.select(g, preset.sets ?? {});
    }
    await this.pick();
  }

  private async pick(): Promise<void> {
    const rows = (q: string): Item<GeneratorItem>[] => pickerRows(rank(this.items, q, this.env.recent), q).map(r => ('heading' in r
      ? { label: r.heading, separator: true }
      : { label: r.item.name || r.item.id, description: r.item.summary, value: r.item }));
    const g = await this.env.ui.pick<GeneratorItem>({ title: 'Generate', placeholder: 'a generator', items: rows(''), query: rows });
    if (this.closed) return;
    if (!g) return this.close();
    this.select(g);
  }

  private select(g: GeneratorItem, sets?: Values): void {
    this.sel = g;
    this.steps = (!sets && this.kept.get(g.id)) || [{ generator: g.id, sets: { ...(sets ?? {}) }, fields: [] }];
    this.active = undefined;
    this.error = undefined;
    this.summary = '';
    this.ready = false;
    this.openForm();
    void this.sendPreview();
  }

  private model(): FormModel {
    const name = this.sel ? this.sel.name || short(this.sel.id) : '';
    return {
      title: this.summary ? `${name} · ${this.summary}` : name,
      rows: formRows(this.steps),
      ready: this.ready,
      updating: this.updating || this.planning,
      error: this.error,
      active: this.active,
    };
  }

  private openForm(): void {
    if (this.closed || !this.sel) return;
    this.closeForm();
    this.view = this.env.ui.form(this.model(), a => void this.answer(a));
  }

  private closeForm(): void {
    this.view?.close();
    this.view = undefined;
  }

  private render(): void {
    if (this.sel) this.view?.update(this.model());
  }

  // invalidate makes every preview in flight or waiting stale: not ready until a newer answer.
  private invalidate(): void {
    seqCounter++;
    this.seq = seqCounter;
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  // requestPreview asks after a pause (one request per burst of typing).
  private requestPreview(): void {
    if (this.closed) return;
    this.invalidate();
    this.error = undefined;
    this.updating = true;
    this.render();
    const ms = this.env.debounceMs ?? DEBOUNCE_MS;
    // no debounce asks at once: a 0 ms timer would still wait for the timers phase
    if (ms <= 0) {
      void this.sendPreview();
      return;
    }
    this.timer = setTimeout(() => void this.sendPreview(), ms);
  }

  private async sendPreview(): Promise<void> {
    if (this.closed || !this.sel) return;
    this.invalidate();
    const n = this.seq;
    this.updating = true;
    this.render();
    let r: PreviewResult;
    try {
      r = await this.env.server.request(Olifant.preview, this.at({ steps: stepsPayload(this.steps, false) }));
    } catch (err) {
      if (this.closed || n !== this.seq || cancelled(err)) return;
      if (!this.env.server.running()) {
        this.env.ui.error(message(err));
        return this.close();
      }
      return this.onPreviewFailed(n, `the preview failed: ${message(err)}`);
    }
    this.onPreview(n, r);
  }

  private whyOf(st: FormStep, name: string): string | undefined {
    return st.fields.find(f => f.name === name)?.why ?? undefined;
  }

  private onPreview(n: number, r: PreviewResult): void {
    if (this.closed || n !== this.seq) return;
    this.updating = false;
    (r.steps ?? []).forEach((s, i) => { if (this.steps[i]) this.steps[i].fields = s.fields ?? []; });
    this.ready = r.ready === true;
    this.summary = fileSummary(r.files ?? []);
    this.env.preview.show(r);
    if (this.textView) this.textView.view.setValidation(this.whyOf(this.textView.step, this.textView.name));
    const fresh = this.focusStep;
    if (fresh && fresh.fields.length > 0) {
      this.active = rowKey(this.steps.indexOf(fresh), fresh.fields[0].name);
      this.focusStep = undefined;
    }
    this.render();
    const k = this.afterPreview;
    this.afterPreview = undefined;
    // an answer with an error disarms a waiting Enter (it never applies later, unasked)
    if (k && !r.error) k();
  }

  private onPreviewFailed(n: number, text: string): void {
    if (this.closed || n !== this.seq) return;
    this.updating = false;
    this.ready = false;
    this.afterPreview = undefined;
    this.env.preview.show({ steps: [], files: [], main: null, ready: false, error: text });
    this.render();
  }

  async answer(a: FormAnswer): Promise<void> {
    if (this.closed) return;
    switch (a.kind) {
      case 'escape':
        return this.close();
      case 'back':
        if (this.busy || !this.sel) return;
        this.kept.set(this.sel.id, this.steps);
        this.closeForm();
        this.invalidate();
        this.updating = false;
        this.afterPreview = undefined;
        this.sel = undefined;
        return this.pick();
      case 'field':
        return this.edit(a.step, a.name);
      case 'apply':
        return this.enter();
      case 'review':
        return this.review();
    }
  }

  private async edit(i: number, name: string): Promise<void> {
    const sel = this.sel;
    const st = this.steps[i];
    const f = st?.fields.find(x => x.name === name);
    if (this.closed || this.busy || !sel || !st || !f) return;
    this.active = rowKey(i, name);
    this.closeForm();
    this.busy = true;
    try {
      await this.editor(st, f);
    } catch (err) {
      if (!this.closed) this.env.ui.error(message(err));
    } finally {
      this.busy = false;
    }
    if (!this.closed && this.sel === sel) this.openForm();
  }

  // editor asks for a field's value: a choice field from its choices and `+ New …`; else typed,
  // each keystroke previewed, Escape putting the value back.
  private async editor(st: FormStep, f: Field): Promise<void> {
    const ui = this.env.ui;
    const title = `${short(st.generator)}: ${f.name}`;
    const now = valueOf(st, f) ?? '';
    if (isChoice(f)) {
      const o = await ui.pick<Option>({ title, items: options(f).map(x => ({ label: x.label, value: x })), active: now || undefined });
      const i = this.steps.indexOf(st);
      if (!o || this.closed || i < 0) return;
      if (o.generator) {
        const next = chooseNew(this.steps, i, f.name, o.generator);
        if (!next) {
          ui.warn('+ New goes two levels deep at most');
          return;
        }
        this.focusStep = next[next.indexOf(st) - 1];
        this.steps = next;
      } else {
        this.steps = setValue(this.steps, i, f.name, o.value);
      }
      this.requestPreview();
      return;
    }
    const had = has(st.sets, f.name);
    const before = st.sets[f.name];
    const set = (v: string | undefined) => {
      const i = this.steps.indexOf(st);
      if (i >= 0) this.steps = setValue(this.steps, i, f.name, v);
      this.requestPreview();
    };
    const view = ui.text({ title, value: now, onChange: t => set(t) });
    this.textView = { step: st, name: f.name, view };
    view.setValidation(this.whyOf(st, f.name));
    const v = await view.result;
    this.textView = undefined;
    if (this.closed) return;
    if (v === undefined) {
      if (had ? st.sets[f.name] !== before : has(st.sets, f.name)) set(had ? before : undefined);
    } else if ((st.sets[f.name] ?? '') !== v) {
      set(v);
    }
  }

  // whenPreviewed runs k once the newest preview has landed: a waiting one is sent now.
  private whenPreviewed(k: () => void): void {
    if (this.timer) {
      this.afterPreview = k;
      void this.sendPreview();
      return;
    }
    if (this.updating) {
      this.afterPreview = k;
      return;
    }
    k();
  }

  private enter(): void {
    if (!this.sel || this.busy) return;
    this.whenPreviewed(() => void this.enterNow());
  }

  // enterNow is generate.lua's enter: not ready → the first missing field; done mode → the
  // values go back; else plan, then a snippet or the files.
  private async enterNow(): Promise<void> {
    const sel = this.sel;
    if (this.closed || !sel || this.busy) return;
    if (!this.ready) {
      const m = firstMissing(this.steps);
      // not awaited: the editor stays up until it answers
      if (m) void this.edit(m.step, m.name);
      return;
    }
    const last = this.steps.length - 1;
    const id = this.steps[last].generator;
    if (this.doneMode) return this.end({ kind: 'sets', sets: stepsPayload(this.steps, true)[last].sets });
    const r = await this.plan(true);
    if (!r || this.closed || this.sel !== sel) return;
    if (r.plan.snippet) {
      this.teardown();
      if (await this.env.snippet(r.plan.snippet)) this.applied(id);
      return this.finish({ kind: 'snippet' });
    }
    this.busy = true;
    this.planning = true;
    this.render();
    let err: string | undefined;
    try {
      err = await this.env.land(r.plan, r.edit, sel.name || short(id));
    } catch (e) {
      err = message(e);
    } finally {
      this.busy = false;
      this.planning = false;
    }
    if (this.closed) return;
    if (err) {
      // the form stays, with its values and why
      this.error = err;
      this.env.ui.error(err);
      this.render();
      return;
    }
    this.applied(id);
    this.end({ kind: 'applied' });
  }

  // plan asks for the plan of the fields as they are (with what the server inferred). hold
  // keeps every other answer out meanwhile (Enter); Review does not, and checks after.
  private async plan(hold: boolean): Promise<PlanResult | undefined> {
    if (hold) this.busy = true;
    this.planning = true;
    this.render();
    try {
      const r = await this.env.server.request(Olifant.plan, this.at({ steps: stepsPayload(this.steps, true) }));
      if (!r || typeof r.plan !== 'object' || r.plan === null) throw new Error('the server sent no plan');
      return r;
    } catch (err) {
      if (this.closed) return undefined;
      this.error = message(err);
      this.env.ui.error(this.error);
      if (!this.env.server.running()) this.close();
      return undefined;
    } finally {
      if (hold) this.busy = false;
      this.planning = false;
      this.render();
    }
  }

  private review(): void {
    const sel = this.sel;
    if (!sel || this.busy || this.doneMode) return;
    this.whenPreviewed(() => void this.reviewNow(sel));
  }

  private async reviewNow(sel: GeneratorItem): Promise<void> {
    if (this.closed || this.sel !== sel || this.busy) return;
    const asked = JSON.stringify(stepsPayload(this.steps, false));
    const r = await this.plan(false);
    // the form changed while it was planned, or an editor is up: not the plan of what is on screen
    if (!r || this.closed || this.busy || this.sel !== sel || JSON.stringify(stepsPayload(this.steps, false)) !== asked) return;
    const id = this.steps[this.steps.length - 1].generator;
    this.teardown();
    await this.env.review(r.plan, r.edit, { title: sel.name || short(id), landed: () => this.applied(id) });
    this.finish({ kind: 'reviewed' });
  }

  private applied(id: string): void {
    this.env.remember(id);
    this.env.log({ event: 'generate-applied', generator: id });
  }

  private teardown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.closeForm();
    this.env.ui.closeSteps();
    this.env.preview.dispose();
  }

  private end(e: FlowEnd): void {
    this.teardown();
    this.finish(e);
  }

  close(): void {
    this.end({ kind: 'closed' });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:unit`
Expected: PASS. When a timing test fails, add `await tick()` in the test only where an answer has not had a turn to land; never loosen an assertion.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/uiTypes.ts src/generate/flow.ts test/fakeUi.ts test/unit/flow.test.ts
git commit -m "generate: the flow (list, multi-step form, live preview, Enter, review, + New, done mode)"
```

---
### Task 6: The quick-input UI and landing a plan

**Model:** Opus.

**Files:**
- Create: `src/virtualDocs.ts`
- Create: `src/quickInput.ts`
- Create: `src/land.ts`
- Modify: `src/applyEdit.ts:18-24,57-58` (a wording hook)
- Modify: `src/extension.ts` (VirtualDocs, the UI switch, `Plans`; `Api.setUi`, `Api.plans`)
- Create: `test/e2e/fake.4-plans.e2e.ts`
- Modify: `test/e2e/helpers.ts` (`docOf`, `planTabs`, `settle`)

**Interfaces:**
- Consumes: `Ui` and friends (Task 5), `reviewModel`/`ReviewFile`/`ReviewModel` (Task 4), `firstStale`, `seenText`, `staleMessage`, `landedMessage`, `NOTHING_TO_CHANGE` (Task 4), `Plan`, `PlanSnippet` (Task 2), M1's `Server`, `Say`, `NOT_RUNNING`, `applyServerEdit`.
- Produces:
  - `src/virtualDocs.ts`: `DOC_SCHEME = 'durandal-doc'`, `class VirtualDocs { register(context): void; uri(path: string): vscode.Uri; set(path: string, text: string): vscode.Uri; forget(prefix: string): void }`.
  - `src/quickInput.ts`: `quickInputUi(say: Say): Ui`; sets context key `durandal.formOpen` while a form is up.
  - `src/land.ts`: `class Plans { constructor(d: { server: Server; docs: VirtualDocs; say: Say }); land(root: string, plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined>; snippet(root: string, s: PlanSnippet): Promise<boolean>; review(ui: Ui, root: string, plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void> }`.
  - `applyServerEdit(lc, params, say, word?: (saved: string[], unsaved: string[]) => string | undefined)`.
  - `Api` gains `setUi(ui: Ui | undefined): void` and `plans: Plans`; `extension.ts` keeps `const ui = (): Ui => testUi ?? realUi` for Tasks 7–10.

- [ ] **Step 1: Give `applyServerEdit` a wording hook**

In `src/applyEdit.ts` change the signature and the notice:
```ts
// word: the one notice, from the files saved and those that could not be (default: the label
// and the names; a plan says "Applied <name>: N files").
export function applyServerEdit(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
  word: (saved: string[], unsaved: string[]) => string | undefined = (s, u) => appliedMessage(params.label, s, u),
): Promise<ApplyWorkspaceEditResult> {
  const run = lock.then(() => applyNow(lc, params, say, word));
  lock = run.catch(() => undefined);
  return run;
}
```
pass `word` through `applyNow`'s parameters, and replace `const text = appliedMessage(params.label, saved, unsaved);` with `const text = word(saved, unsaved);`. The `appliedMessage` import stays.

- [ ] **Step 2: Write `src/virtualDocs.ts`**

```ts
import * as vscode from 'vscode';

export const DOC_SCHEME = 'durandal-doc';

// VirtualDocs are the read-only documents the extension writes (alder-vscode's): the live
// preview, the review's two sides, the migration report. A path's extension picks the
// language. Setting a path's text again updates its open editor.
export class VirtualDocs implements vscode.TextDocumentContentProvider {
  private texts = new Map<string, string>();
  private changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DOC_SCHEME, this), this.changed);
  }

  uri(path: string): vscode.Uri {
    return vscode.Uri.from({ scheme: DOC_SCHEME, path: '/' + path });
  }

  set(path: string, text: string): vscode.Uri {
    const uri = this.uri(path);
    this.texts.set(uri.path, text);
    this.changed.fire(uri);
    return uri;
  }

  // forget drops every text under prefix (a document still open then reads as empty).
  forget(prefix: string): void {
    const p = this.uri(prefix).path;
    for (const k of [...this.texts.keys()]) if (k.startsWith(p)) this.texts.delete(k);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.path) ?? '';
  }
}
```

- [ ] **Step 3: Write `src/quickInput.ts`**

```ts
import * as vscode from 'vscode';
import type { ReviewFile, ReviewModel } from './generate/review';
import type { Say } from './server';
import type { FormAnswer, FormModel, Item, PickOptions, ReviewAnswer, TextOptions, TextView, Ui } from './uiTypes';

// quickInput: the Ui on VS Code's quick inputs (alder-vscode ui.ts). Every step keeps
// ignoreFocusOut, so the preview and the review's diffs can update beside it. A hide nobody
// asked for (Escape) is the step's "nothing". Messages go through say (the e2e tests read it).

const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
const reviewButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('diff'), tooltip: 'Review the plan (Ctrl+O)' };
const applyButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('check'), tooltip: `Apply (${mod}+Enter)` };
const SEP = vscode.QuickPickItemKind.Separator;

const setFormOpen = (on: boolean) => void vscode.commands.executeCommand('setContext', 'durandal.formOpen', on);

// once runs a quick pick until accept resolves it or it hides (none).
function once<T, I extends vscode.QuickPickItem>(qp: vscode.QuickPick<I>, accept: (done: (v: T) => void) => void, none: T): Promise<T> {
  return new Promise<T>(resolve => {
    let finished = false;
    const finish = (v: T) => {
      if (finished) return;
      finished = true;
      qp.dispose();
      resolve(v);
    };
    qp.onDidAccept(() => accept(finish));
    qp.onDidHide(() => finish(none));
    qp.show();
  });
}

interface FieldItem extends vscode.QuickPickItem { step?: number; name?: string; apply?: boolean }
interface ReviewItem extends vscode.QuickPickItem { file?: ReviewFile; jump?: { path: string; line: number }; apply?: boolean }

export function quickInputUi(say: Say): Ui {
  // steps: the quick inputs up besides the form, so closeSteps can hide them
  const steps = new Set<vscode.QuickInput>();
  const step = <Q extends vscode.QuickInput>(q: Q): Q => {
    steps.add(q);
    q.onDidHide(() => steps.delete(q));
    return q;
  };
  return {
    info: m => void say('info', m),
    warn: m => void say('warn', m),
    error: m => void say('error', m),

    pick<T>(o: PickOptions<T>): Promise<T | undefined> {
      type I = vscode.QuickPickItem & { value?: T };
      const qp = step(vscode.window.createQuickPick<I>());
      qp.title = o.title;
      qp.placeholder = o.placeholder;
      qp.ignoreFocusOut = true;
      qp.matchOnDescription = true;
      // with a query the caller ranks and filters: every item shown, in its order
      const items = (xs: Item<T>[]): I[] => xs.map(x => (x.separator
        ? { label: x.label, kind: SEP }
        : { label: x.label, description: x.description, detail: x.detail, value: x.value, alwaysShow: !!o.query }));
      qp.items = items(o.items);
      const a = qp.items.find(i => i.kind !== SEP && i.label === o.active);
      if (a) qp.activeItems = [a];
      if (o.query) qp.onDidChangeValue(t => { qp.items = items(o.query!(t)); });
      return once<T | undefined, I>(qp, done => {
        const v = qp.activeItems[0]?.value;
        if (v !== undefined) done(v);
      }, undefined);
    },

    text(o: TextOptions): TextView {
      const ib = step(vscode.window.createInputBox());
      ib.title = o.title;
      ib.value = o.value;
      ib.prompt = o.prompt;
      ib.ignoreFocusOut = true;
      const result = new Promise<string | undefined>(resolve => {
        let finished = false;
        const finish = (v: string | undefined) => {
          if (finished) return;
          finished = true;
          ib.dispose();
          resolve(v);
        };
        ib.onDidChangeValue(t => o.onChange?.(t));
        ib.onDidAccept(() => finish(ib.value));
        ib.onDidHide(() => finish(undefined));
      });
      ib.show();
      return { setValidation: m => { ib.validationMessage = m; }, result };
    },

    form(m: FormModel, answer: (a: FormAnswer) => void) {
      const qp = vscode.window.createQuickPick<FieldItem>();
      qp.ignoreFocusOut = true;
      qp.matchOnDescription = true;
      let closing = false;
      let lastActive: string | undefined;
      const key = (i: FieldItem) => (i.apply ? '\0apply' : i.name !== undefined ? `${i.step}:${i.name}` : undefined);
      const paint = (model: FormModel) => {
        const keep = qp.activeItems[0];
        // a new active field (the first of a + New step) wins; else the item you are on stays
        const want = model.active !== lastActive ? model.active : ((keep && key(keep)) ?? model.active);
        lastActive = model.active;
        qp.title = model.title;
        qp.busy = model.updating;
        qp.buttons = [vscode.QuickInputButtons.Back, reviewButton, ...(model.ready ? [applyButton] : [])];
        const items: FieldItem[] = [];
        if (model.error) items.push({ label: `$(error) ${model.error}`, alwaysShow: true });
        for (const r of model.rows) {
          if (r.kind === 'heading') items.push({ label: r.label, kind: SEP });
          else items.push({ label: r.name, description: r.description, detail: r.detail === undefined ? undefined : r.error ? `$(error) ${r.detail}` : r.detail, step: r.step, name: r.name });
        }
        items.push({ label: '$(check) Apply', description: model.ready ? '' : 'not ready', apply: true, alwaysShow: true });
        qp.items = items;
        const a = items.find(i => want !== undefined && key(i) === want);
        if (a) qp.activeItems = [a];
      };
      paint(m);
      qp.onDidAccept(() => {
        const item = qp.activeItems[0];
        if (!item) return;
        if (item.apply) answer({ kind: 'apply' });
        else if (item.name !== undefined) answer({ kind: 'field', step: item.step!, name: item.name });
      });
      qp.onDidTriggerButton(b => {
        if (b === vscode.QuickInputButtons.Back) answer({ kind: 'back' });
        else if (b === reviewButton) answer({ kind: 'review' });
        else if (b === applyButton) answer({ kind: 'apply' });
      });
      qp.onDidHide(() => {
        // a hide after close() is the flow's own: close() cleared the key already
        if (closing) return;
        closing = true;
        setFormOpen(false);
        qp.dispose();
        answer({ kind: 'escape' });
      });
      qp.show();
      setFormOpen(true);
      return {
        update: paint,
        close: () => {
          if (closing) return;
          closing = true;
          setFormOpen(false);
          qp.dispose();
        },
      };
    },

    review(m: ReviewModel, o: { title: string; onActive(f: ReviewFile): void }): Promise<ReviewAnswer> {
      const qp = step(vscode.window.createQuickPick<ReviewItem>());
      qp.title = `${o.title}: review`;
      qp.placeholder = m.canApply ? 'Enter applies · Escape closes' : 'cannot apply: a conflict (✗) · Escape closes';
      qp.ignoreFocusOut = true;
      const applyNow: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('check'), tooltip: 'Apply' };
      qp.buttons = m.canApply ? [applyNow] : [];
      qp.items = [
        ...(m.notes.length > 0 ? [{ label: 'notes', kind: SEP }, ...m.notes.map(n => ({ label: n.text, jump: n.jump }))] : []),
        { label: 'files', kind: SEP },
        ...m.files.map(f => ({ label: `${f.mark} ${f.path}`, file: f })),
        ...(m.canApply ? [{ label: '$(check) Apply', apply: true, alwaysShow: true }] : []),
      ];
      const first = qp.items.find(i => i.file);
      if (first) {
        qp.activeItems = [first];
        o.onActive(first.file!);
      }
      qp.onDidChangeActive(items => { if (items[0]?.file) o.onActive(items[0].file); });
      return new Promise<ReviewAnswer>(resolve => {
        let finished = false;
        const finish = (v: ReviewAnswer) => {
          if (finished) return;
          finished = true;
          qp.dispose();
          resolve(v);
        };
        qp.onDidAccept(() => {
          const i = qp.activeItems[0];
          if (!i) return;
          if (i.jump) finish({ kind: 'jump', ...i.jump });
          else if ((i.file || i.apply) && m.canApply) finish({ kind: 'apply' });
        });
        qp.onDidTriggerButton(() => finish({ kind: 'apply' }));
        qp.onDidHide(() => finish({ kind: 'close' }));
        qp.show();
      });
    },

    closeSteps() {
      // each hide answers its step's "nothing"; a copy, as each hide deletes itself
      for (const q of [...steps]) q.hide();
    },
  };
}
```

- [ ] **Step 4: Write `src/land.ts`**

```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from './applyEdit';
import { ReviewFile, reviewModel } from './generate/review';
import { firstStale, landedMessage, NOTHING_TO_CHANGE, seenText, staleMessage } from './generate/stale';
import type { Plan, PlanSnippet } from './protocol';
import { NOT_RUNNING, Say, Server } from './server';
import type { ReviewAnswer, Ui } from './uiTypes';
import { DOC_SCHEME, VirtualDocs } from './virtualDocs';

// textOf is a file's text as the user sees it (seenText): its open document's, else the disk's.
async function textOf(path: string): Promise<string | null> {
  const doc = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && d.uri.fsPath === path);
  let disk: string | null;
  try {
    disk = await fs.readFile(path, 'utf8');
  } catch {
    disk = null;
  }
  return seenText(doc && { dirty: doc.isDirty, text: doc.getText() }, disk);
}

// Plans is a plan landing in VS Code (durandal.nvim apply.lua and preview.lua): the stale
// check against every file's planned before, then the server's own edit through
// applyServerEdit (versions, annotations, saves, one notice); a snippet put in its line; the
// review window with a diff per file.
export class Plans {
  private count = 0;

  constructor(private readonly d: { server: Server; docs: VirtualDocs; say: Say }) {}

  // land applies plan (its paths relative to root): undefined when it landed or there was
  // nothing to change, else why nothing was applied.
  async land(root: string, plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined> {
    const conflicts = plan.conflicts ?? [];
    if (conflicts.length > 0) return conflicts.map(c => c.message).join('; ');
    const files = plan.files ?? [];
    if (files.length === 0) {
      void this.d.say('info', NOTHING_TO_CHANGE);
      return undefined;
    }
    const stale = await firstStale(files, rel => textOf(join(root, rel)));
    if (stale) return staleMessage(stale);
    const lc = this.d.server.client();
    if (!lc) return NOT_RUNNING;
    if (!edit) return 'the server sent no edit';
    const r = await applyServerEdit(lc, { label: name, edit }, text => void this.d.say('info', text),
      (_saved, unsaved) => landedMessage(name, files.length, unsaved));
    return r.applied ? undefined : (r.failureReason ?? 'VS Code did not apply the edit');
  }

  // snippet puts s.body in place of its line (1-based; past the end: at the end), tab stops live.
  async snippet(root: string, s: PlanSnippet): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, s.file)));
    const ed = await vscode.window.showTextDocument(doc);
    const i = s.line - 1;
    const where = i >= 0 && i < doc.lineCount ? doc.lineAt(i).range : doc.lineAt(doc.lineCount - 1).range.end;
    return ed.insertSnippet(new vscode.SnippetString(s.body), where);
  }

  // review is the review window: notes and files in a quick pick, the active file's diff
  // beside; Apply lands the plan (landed runs when it did); a parse warning jumps to its line.
  async review(ui: Ui, root: string, plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void> {
    const m = reviewModel(plan);
    if (m.files.length === 0 && m.canApply) {
      void this.d.say('info', NOTHING_TO_CHANGE);
      return;
    }
    const n = ++this.count;
    let a: ReviewAnswer;
    try {
      a = await ui.review(m, { title: o.title, onActive: f => this.showFile(n, f) });
    } finally {
      await this.closeFiles(n);
    }
    if (a.kind === 'jump') {
      const p = new vscode.Position(Math.max(a.line - 1, 0), 0);
      await vscode.window.showTextDocument(vscode.Uri.file(join(root, a.path)), { selection: new vscode.Range(p, p) });
      return;
    }
    if (a.kind !== 'apply' || !m.canApply) return;
    const err = await this.land(root, plan, edit, o.title);
    if (err) ui.error(err);
    else o.landed();
  }

  private showFile(n: number, f: ReviewFile): void {
    const before = this.d.docs.set(`plan/${n}/before/${f.path}`, f.before);
    const after = this.d.docs.set(`plan/${n}/after/${f.path}`, f.after);
    void vscode.commands.executeCommand('vscode.diff', before, after, `${f.mark} ${f.path} (plan)`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true });
  }

  // closeFiles closes review n's diff tabs and frees their texts.
  private async closeFiles(n: number): Promise<void> {
    const ours = (u: vscode.Uri) => u.scheme === DOC_SCHEME && u.path.startsWith(`/plan/${n}/`);
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs)
      .filter(t => t.input instanceof vscode.TabInputTextDiff && (ours(t.input.original) || ours(t.input.modified)));
    if (tabs.length > 0) await Promise.resolve(vscode.window.tabGroups.close(tabs)).catch(() => false);
    this.d.docs.forget(`plan/${n}/`);
  }
}
```

- [ ] **Step 5: Wire them into `src/extension.ts`**

Add imports (`Plans` from `./land`, `quickInputUi` from `./quickInput`, `Ui` type from `./uiTypes`, `VirtualDocs` from `./virtualDocs`), extend `Api`:
```ts
  // the e2e suites answer the quick inputs with a fake; undefined puts VS Code's back
  setUi(ui: Ui | undefined): void;
  // the UI the commands use now
  ui(): Ui;
  plans: Plans;
```
and in `activate`, after `const s = new Server(output, say);`:
```ts
  const docs = new VirtualDocs();
  docs.register(context);
  const realUi = quickInputUi(say);
  let testUi: Ui | undefined;
  const ui = (): Ui => testUi ?? realUi;
  const plans = new Plans({ server: s, docs, say });
```
Return `{ server: s, health, shown, inProject: projects.inProject, setUi: u => { testUi = u; }, ui, plans }`.

- [ ] **Step 6: Write the contract tests**

Add to `test/e2e/helpers.ts`:
```ts
// docOf is the open document of a workspace file, if any.
export const docOf = (rel: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === file(rel).toString());

// tabsUnder are the open tabs showing durandal-doc documents under prefix (a diff by either side).
export function tabsUnder(prefix: string): vscode.Tab[] {
  const ours = (u: vscode.Uri) => u.scheme === 'durandal-doc' && u.path.startsWith(prefix);
  return vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t =>
    (t.input instanceof vscode.TabInputText && ours(t.input.uri))
    || (t.input instanceof vscode.TabInputTextDiff && (ours(t.input.original) || ours(t.input.modified))));
}

// settle puts rel back to text on disk and waits until an open document of it reads the same.
export async function settle(rel: string, text: string | null): Promise<void> {
  const p = join(ws(), rel);
  if (text === null) rmSync(p, { force: true });
  else writeFileSync(p, text);
  const d = docOf(rel);
  if (d && text !== null) await until(() => docOf(rel)!.getText() === text && !docOf(rel)!.isDirty, `${rel} reloaded`);
}
```
(import `rmSync` from `node:fs`).

`test/e2e/fake.4-plans.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { Plan } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { disk, file, open, revert, running, settle, tabsUnder, until, ws } from './helpers';

const R0 = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const root = () => join(ws(), 'one');
const plan = (o: Partial<Plan>): Plan => ({ files: [], conflicts: [], warnings: [], holes: [], snippet: null, ...o });

// twoFiles: a plan that creates one/made.py and puts a line on top of one/other.py, and its edit.
function twoFiles(o: Partial<Plan> = {}) {
  const before = disk('one/other.py');
  return {
    before,
    plan: plan({ files: [{ path: 'made.py', before: null, after: 'made = 1\n' }, { path: 'other.py', before, after: `# planned\n${before}` }], ...o }),
    edit: { documentChanges: [
      { kind: 'create', uri: file('one/made.py').toString() },
      { textDocument: { uri: file('one/made.py').toString(), version: null }, edits: [{ range: R0, newText: 'made = 1\n' }] },
      { textDocument: { uri: file('one/other.py').toString(), version: null }, edits: [{ range: R0, newText: '# planned\n' }] },
    ] } as WorkspaceEdit,
  };
}

describe('landing a plan (fake server)', () => {
  it('lands: the new file and the edit written and saved, one notice', async () => {
    const a = await running();
    const t = twoFiles();
    const n = a.shown.length;
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), undefined);
    assert.equal(disk('one/made.py'), 'made = 1\n');
    assert.equal(disk('one/other.py'), `# planned\n${t.before}`);
    assert.deepEqual(a.shown.slice(n).map(s => s.text), ['Applied Made: 2 files']);
    await settle('one/made.py', null);
    await settle('one/other.py', t.before);
  });

  it('a file typed in since planning: nothing applied (Review Focus 2)', async () => {
    const a = await running();
    const t = twoFiles();
    const ed = await open(file('one/other.py'));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# typed\n'));
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'other.py changed since planning; nothing was applied — plan again');
    assert.ok(!existsSync(join(root(), 'made.py')));
    await revert(ed.document);
  });

  it('a file the plan creates, there meanwhile: nothing applied (Review Focus 2)', async () => {
    const a = await running();
    const t = twoFiles();
    writeFileSync(join(root(), 'made.py'), 'already\n');
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'made.py changed since planning; nothing was applied — plan again');
    assert.equal(disk('one/made.py'), 'already\n');
    assert.equal(disk('one/other.py'), t.before);
    await settle('one/made.py', null);
  });

  it('nothing to change is said; a conflict is the answer and nothing lands', async () => {
    const a = await running();
    const n = a.shown.length;
    assert.equal(await a.plans.land(root(), plan({}), undefined, 'Made'), undefined);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Nothing to change: the code already has it'));
    const t = twoFiles({ conflicts: [{ code: 'exists', message: 'made.py exists' }] });
    assert.equal(await a.plans.land(root(), t.plan, t.edit, 'Made'), 'made.py exists');
    assert.ok(!existsSync(join(root(), 'made.py')));
  });

  it('a snippet replaces its line with the body, its first tab stop selected', async () => {
    const a = await running();
    const ed = await open(file('one/main.py'));
    assert.ok(await a.plans.snippet(root(), { file: 'main.py', line: 1, body: 'def ${1:name}():\n    ${2:pass}' }));
    const doc = vscode.window.activeTextEditor!.document;
    assert.ok(doc.getText().startsWith('def name():\n    pass'), doc.getText());
    assert.equal(doc.getText(vscode.window.activeTextEditor!.selection), 'name');
    await revert(ed.document);
  });

  it('the review: a file\'s diff beside; Apply lands, says landed, closes the diffs', async () => {
    const a = await running();
    const t = twoFiles();
    const ui = new FakeUi();
    ui.onReview = async (m, o) => {
      assert.deepEqual(m.files.map(f => `${f.mark} ${f.path}`), ['+ made.py', '~ other.py']);
      o.onActive(m.files[1]);
      await until(() => tabsUnder('/plan/').length === 1, 'the plan diff tab');
      return { kind: 'apply' };
    };
    let landed = 0;
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => { landed++; } });
    assert.equal(landed, 1);
    assert.equal(disk('one/made.py'), 'made = 1\n');
    assert.equal(tabsUnder('/plan/').length, 0, 'the diff tabs closed');
    await settle('one/made.py', null);
    await settle('one/other.py', t.before);
  });

  it('the review: a conflict blocks Apply; closing applies nothing and closes the diffs', async () => {
    const a = await running();
    const t = twoFiles({ conflicts: [{ code: 'exists', message: 'made.py exists' }] });
    const ui = new FakeUi();
    ui.onReview = async (m, o) => {
      assert.equal(m.canApply, false);
      assert.deepEqual(m.notes.map(x => x.text), ['✗ made.py exists']);
      o.onActive(m.files[0]);
      await until(() => tabsUnder('/plan/').length === 1, 'the plan diff tab');
      return { kind: 'apply' };
    };
    let landed = 0;
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => { landed++; } });
    assert.equal(landed, 0);
    assert.ok(!existsSync(join(root(), 'made.py')));
    assert.equal(tabsUnder('/plan/').length, 0);
  });

  it('the review: a parse warning jumps to its line', async () => {
    const a = await running();
    const t = twoFiles({ warnings: ['main.py:1 does not parse: unexpected indent'] });
    const ui = new FakeUi();
    ui.onReview = async m => ({ kind: 'jump', ...m.notes[0].jump! });
    await a.plans.review(ui, root(), t.plan, t.edit, { title: 'Made', landed: () => assert.fail('nothing lands') });
    const ed = vscode.window.activeTextEditor!;
    assert.equal(ed.document.uri.toString(), file('one/main.py').toString());
    assert.equal(ed.selection.active.line, 0);
  });
});
```

- [ ] **Step 7: Run everything**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS (the fake suite gains 8 tests). If the snippet test shows `${1:name}` literally, VS Code did not take the body as a snippet: check `insertSnippet` got a `SnippetString`, not a string.

- [ ] **Step 8: Commit**

```bash
git add src/virtualDocs.ts src/quickInput.ts src/land.ts src/applyEdit.ts src/extension.ts test/e2e/helpers.ts test/e2e/fake.4-plans.e2e.ts
git commit -m "Landing a plan: the stale check, the server's edit with saves, snippets, the review window; the quick-input UI"
```

---

### Task 7: The generate command, its live preview and the form keys

**Model:** Opus.

**Files:**
- Create: `src/document.ts`, `test/unit/document.test.ts`
- Create: `src/origin.ts`
- Create: `src/generate/previewDoc.ts`
- Create: `src/generate/command.ts`
- Modify: `src/commandTable.ts` (`BUILT`, `FORM_KEYS`; `durandal.generate` leaves `NOT_YET`)
- Modify: `package.json` (keybindings for the form keys)
- Modify: `test/unit/manifest.test.ts`
- Modify: `src/extension.ts` (the action log, `Generate`)
- Create: `test/e2e/fake.5-generate.e2e.ts`

**Interfaces:**
- Consumes: `Flow`, `FlowEnd`, `Preset`, `asPreset`, `Origin`, `PreviewSink` (Task 5); `previewView`, `NOTHING` (Task 4); `remember` (Task 3); `Plans`, `VirtualDocs`, `Ui` switch (Task 6); `ActionLog`, `logDir` (Task 1); M1's `Server`, `findRoot`, `realRoot`.
- Produces:
  - `src/document.ts`: `NO_PROJECT = 'no Olifant project open'`, `type DocumentChoice = { kind: 'here'; root: string } | { kind: 'config'; root: string } | { kind: 'choose'; roots: string[] } | { kind: 'none' }`, `chooseDocument(activeRoot: string | undefined, roots: string[]): DocumentChoice`, `configPath(root: string): string`.
  - `src/origin.ts`: `interface Found { origin: Origin; editor?: vscode.TextEditor; selection?: vscode.Selection }`, `findOrigin(server: Server, ui: Ui, title: string): Promise<Found | undefined>` (Task 10 reuses it).
  - `src/generate/command.ts`: `class Generate { constructor(d: GenerateDeps); register(context): void; run(preset?: Preset): Promise<FlowEnd> }` with `GenerateDeps { server: Server; docs: VirtualDocs; plans: Plans; log: ActionLog; state: vscode.Memento; ui(): Ui }` (Task 8 calls `run`).
  - `src/commandTable.ts`: `BUILT: Record<string, { title: string }>`, `FORM_KEYS: { command: string; key: string; mac: string; when: string }[]`.
  - `extension.ts` keeps `const log = new ActionLog(...)` and `const generate = new Generate(...)` for Tasks 8–9.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/document.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseDocument, configPath } from '../../src/document';

test('chooseDocument: the active file in a known project; else the one project\'s config; several: ask; none: say so', () => {
  assert.deepEqual(chooseDocument('/w/one', ['/w/one', '/w/two']), { kind: 'here', root: '/w/one' });
  assert.deepEqual(chooseDocument(undefined, ['/w/one']), { kind: 'config', root: '/w/one' });
  assert.deepEqual(chooseDocument('/elsewhere', ['/w/one']), { kind: 'config', root: '/w/one' });
  assert.deepEqual(chooseDocument(undefined, ['/w/two', '/w/one']), { kind: 'choose', roots: ['/w/one', '/w/two'] });
  assert.deepEqual(chooseDocument(undefined, []), { kind: 'none' });
  assert.equal(configPath('/w/one'), '/w/one/.olifant/config.toml');
});
```
In `test/unit/manifest.test.ts`, import `BUILT` and `FORM_KEYS` and replace the first two tests with:
```ts
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
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL: `src/document` missing, `BUILT`/`FORM_KEYS` not exported.

- [ ] **Step 3: Write `src/document.ts` and the command table**

```ts
import { join } from 'node:path';

// document: which document a project command speaks for (durandal.nvim util.document_for):
// the active file when it is in a known project; else a project's .olifant/config.toml, the
// only one silently, one of several by asking. Pure.

export const NO_PROJECT = 'no Olifant project open';

export type DocumentChoice =
  | { kind: 'here'; root: string }
  | { kind: 'config'; root: string }
  | { kind: 'choose'; roots: string[] }
  | { kind: 'none' };

export function chooseDocument(activeRoot: string | undefined, roots: string[]): DocumentChoice {
  if (activeRoot && roots.includes(activeRoot)) return { kind: 'here', root: activeRoot };
  if (roots.length === 0) return { kind: 'none' };
  if (roots.length === 1) return { kind: 'config', root: roots[0] };
  return { kind: 'choose', roots: [...roots].sort() };
}

export const configPath = (root: string) => join(root, '.olifant', 'config.toml');
```
In `src/commandTable.ts`: delete the `'durandal.generate'` line from `NOT_YET`, and add after it:
```ts
// The commands built so far, contributed with these titles (spec §6's rest is NOT_YET).
export const BUILT: Record<string, { title: string }> = {
  'durandal.generate': { title: 'Generate…' },
};

// The keys inside the generate form (a quick input): apply, and review the plan.
export const FORM_KEYS: { command: string; key: string; mac: string; when: string }[] = [
  { command: 'durandal.generate.apply', key: 'ctrl+enter', mac: 'cmd+enter', when: 'durandal.formOpen && inQuickOpen' },
  { command: 'durandal.generate.review', key: 'ctrl+o', mac: 'ctrl+o', when: 'durandal.formOpen && inQuickOpen' },
];
```
In `package.json`, append the two `FORM_KEYS` entries (same fields, same order) at the end of `contributes.keybindings`. The `durandal.generate` command entry stays as it is.

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Write `src/origin.ts`**

```ts
import * as vscode from 'vscode';
import { chooseDocument, configPath, NO_PROJECT } from './document';
import type { Origin } from './generate/flow';
import { findRoot, realRoot } from './root';
import type { Server } from './server';
import type { Ui } from './uiTypes';

export interface Found { origin: Origin; editor?: vscode.TextEditor; selection?: vscode.Selection }

const configOrigin = (root: string): Origin =>
  ({ uri: vscode.Uri.file(configPath(root)).toString(), position: { line: 0, character: 0 }, root });

// findOrigin is the document a project command speaks for (document.ts): the active editor's
// file at its cursor, or a project's config.toml at 0:0. editor and selection are where to
// come back to.
export async function findOrigin(server: Server, ui: Ui, title: string): Promise<Found | undefined> {
  const editor = vscode.window.activeTextEditor;
  const doc = editor?.document;
  const here = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
  const c = chooseDocument(here ? await realRoot(here) : undefined, server.roots());
  const back = editor ? { editor, selection: editor.selection } : {};
  switch (c.kind) {
    case 'here': {
      const p = editor!.selection.active;
      return { origin: { uri: doc!.uri.toString(), position: { line: p.line, character: p.character }, root: c.root }, ...back };
    }
    case 'config':
      return { origin: configOrigin(c.root), ...back };
    case 'choose': {
      const root = await ui.pick<string>({ title, placeholder: 'a project', items: c.roots.map(r => ({ label: r, value: r })) });
      return root ? { origin: configOrigin(root), ...back } : undefined;
    }
    case 'none':
      ui.info(NO_PROJECT);
      return undefined;
  }
}
```

- [ ] **Step 6: Write `src/generate/previewDoc.ts`**

```ts
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { PreviewResult } from '../protocol';
import { DOC_SCHEME, VirtualDocs } from '../virtualDocs';
import type { PreviewSink } from './flow';
import { NOTHING, previewView } from './preview';

// PreviewDoc is a flow's live preview (durandal.nvim's preview pane), beside the form without
// taking focus: a changed main file as a diff of the file against its previewed text (titled
// with every file's counts), a new one as its text alone, an error or nothing-to-change as
// text. Each answer replaces the text in place and moves to the first differing line; another
// main file replaces the tab. dispose closes its tabs.
export class PreviewDoc implements PreviewSink {
  private readonly prefix: string;
  private shown: string | undefined;
  private target: vscode.Uri | undefined;
  private line = 0;
  private disposed = false;
  private readonly sub: vscode.Disposable;

  constructor(private readonly docs: VirtualDocs, n: number, private readonly root: string) {
    this.prefix = `preview/${n}/`;
    // the provider's change reloads the document after set: move to the line once it is in
    this.sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (this.target && e.document.uri.toString() === this.target.toString()) this.reveal();
    });
  }

  show(r: PreviewResult): void {
    if (this.disposed) return;
    const v = previewView(r);
    if (v.kind === 'error') return this.open('text', 'Preview', v.lines.join('\n'), 0);
    if (v.kind === 'nothing') return this.open('text', 'Preview', NOTHING, 0);
    this.open(v.kind, v.path, v.text, v.line, v.title);
  }

  private open(kind: 'text' | 'new' | 'changed', path: string, text: string, line: number, title = ''): void {
    const right = this.docs.set(this.prefix + path, text);
    this.target = right;
    this.line = line;
    const key = `${kind}:${path}`;
    if (this.shown === key) {
      this.reveal();
      return;
    }
    this.closeTabs();
    this.shown = key;
    const opts: vscode.TextDocumentShowOptions = { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: false };
    const done = () => (this.disposed ? this.closeTabs() : this.reveal());
    if (kind !== 'changed') {
      vscode.window.showTextDocument(right, opts).then(done, () => undefined);
      return;
    }
    const left = vscode.Uri.file(join(this.root, path));
    const label = `${title} (preview)`;
    // spec §12: if VS Code refuses the real file on the left, a snapshot of it stands in
    Promise.resolve(vscode.commands.executeCommand('vscode.diff', left, right, label, opts)).then(done, async () => {
      const before = await vscode.workspace.openTextDocument(left).then(d => d.getText(), () => '');
      const snap = this.docs.set(`${this.prefix}before/${path}`, before);
      await vscode.commands.executeCommand('vscode.diff', snap, right, label, opts);
      done();
    });
  }

  private reveal(): void {
    const ed = this.target && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this.target!.toString());
    if (!ed) return;
    const p = new vscode.Position(Math.min(this.line, Math.max(ed.document.lineCount - 1, 0)), 0);
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private ours(u: vscode.Uri): boolean {
    return u.scheme === DOC_SCHEME && u.path.startsWith('/' + this.prefix);
  }

  private closeTabs(): void {
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t =>
      (t.input instanceof vscode.TabInputText && this.ours(t.input.uri))
      || (t.input instanceof vscode.TabInputTextDiff && this.ours(t.input.modified)));
    if (tabs.length > 0) void vscode.window.tabGroups.close(tabs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sub.dispose();
    this.closeTabs();
    this.docs.forget(this.prefix);
  }
}
```

- [ ] **Step 7: Write `src/generate/command.ts`**

```ts
import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import type { Plans } from '../land';
import { findOrigin } from '../origin';
import type { Server } from '../server';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { asPreset, Flow, FlowEnd, Preset } from './flow';
import { PreviewDoc } from './previewDoc';
import { remember } from './rank';

export interface GenerateDeps { server: Server; docs: VirtualDocs; plans: Plans; log: ActionLog; state: vscode.Memento; ui(): Ui }

// Generate owns durandal.generate (an action's preset may come with it) and the form's keys,
// durandal.generate.apply and .review. One flow at a time: a new one closes the old.
export class Generate {
  private active: { closed: boolean; flow?: Flow } | undefined;
  private count = 0;

  constructor(private readonly d: GenerateDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.generate', (preset?: unknown) => this.run(asPreset(preset))),
      vscode.commands.registerCommand('durandal.generate.apply', () => this.active?.flow?.answer({ kind: 'apply' })),
      vscode.commands.registerCommand('durandal.generate.review', () => this.active?.flow?.answer({ kind: 'review' })),
    );
  }

  async run(preset?: Preset): Promise<FlowEnd> {
    if (this.active) {
      this.active.closed = true;
      this.active.flow?.close();
    }
    // claimed before findOrigin awaits, so a second quick run supersedes this one
    const slot: { closed: boolean; flow?: Flow } = { closed: false };
    this.active = slot;
    const n = ++this.count;
    const ui = this.d.ui();
    try {
      const found = await findOrigin(this.d.server, ui, 'Generate in which project?');
      if (!found || slot.closed) return { kind: 'closed' };
      const { origin } = found;
      const key = `durandal.recent:${origin.root}`;
      const recent = () => this.d.state.get<string[]>(key, []);
      const flow = new Flow({
        server: { request: (t, p) => this.d.server.request(t, p), running: () => this.d.server.state() === 'running' },
        ui,
        preview: new PreviewDoc(this.d.docs, n, origin.root),
        recent: recent(),
        remember: id => void this.d.state.update(key, remember(recent(), id)),
        log: e => this.d.log.write(e),
        land: (plan, edit, name) => this.d.plans.land(origin.root, plan, edit, name),
        snippet: s => this.d.plans.snippet(origin.root, s),
        review: (plan, edit, o) => this.d.plans.review(ui, origin.root, plan, edit, o),
      }, origin);
      slot.flow = flow;
      await flow.start(preset);
      const end = await flow.result;
      // back where you were (generate.lua close restores the cursor), after the form and its tabs
      if ((end.kind === 'closed' || end.kind === 'applied') && found.editor && found.selection) {
        await vscode.window.showTextDocument(found.editor.document, { viewColumn: found.editor.viewColumn, selection: found.selection })
          .then(() => undefined, () => undefined);
      }
      return end;
    } finally {
      if (this.active === slot) this.active = undefined;
    }
  }
}
```
If `tsc` rejects `(t, p) => this.d.server.request(t, p)` (M1's `request` takes `RequestParam<P>`), write `(t, p) => this.d.server.request(t, p as RequestParam<typeof p>)` with `RequestParam` imported as a type from `vscode-languageclient/node`.

- [ ] **Step 8: Wire it into `src/extension.ts`**

Imports: `os` from `node:os`, `ActionLog, logDir` from `./actionLog`, `Generate` from `./generate/command`. After `const plans = …`:
```ts
  const log = new ActionLog({
    dir: () => logDir(process.env, os.homedir()),
    enabled: () => vscode.workspace.getConfiguration('durandal').get<boolean>('actionLog', true),
    warn: m => output.warn(m),
  });
  const generate = new Generate({ server: s, docs, plans, log, state: context.workspaceState, ui });
  generate.register(context);
```
`registerNotYet` no longer registers `durandal.generate` (it left `NOT_YET`), so there is no duplicate registration.

- [ ] **Step 9: Write the contract tests**

`test/e2e/fake.5-generate.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Field } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { actionLog, disk, file, log, open, reply, revert, running, settle, tabsUnder, until, ws } from './helpers';

const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
const gens = { generators: [{ id: 'p/command', name: 'Command', summary: 'a use case', here: true }, { id: 'p/query', name: 'Query', summary: 'reads' }] };
const missing = {
  steps: [{ generator: 'p/command', fields: [fld({ name: 'command', valid: false })] }],
  files: [{ path: 'main.py', new: false, added: 1, removed: 0 }],
  main: { path: 'main.py', text: 'x = 1\n# ⟨command⟩\n', first: 2 },
  ready: false, error: null,
};
const filled = {
  ...missing,
  steps: [{ generator: 'p/command', fields: [fld({ name: 'command', value: 'close_table', source: 'you' })] }],
  main: { path: 'main.py', text: 'x = 1\n# close_table\n', first: 2 },
  ready: true,
};

// planOf: the plan Command makes from before (main.py's text): close_table.py new, a line
// added to main.py, and its edit.
function planOf(before: string) {
  const end = { line: before.split('\n').length - 1, character: 0 };
  return {
    plan: { files: [{ path: 'main.py', before, after: `${before}# close_table\n` }, { path: 'close_table.py', before: null, after: 'class CloseTable: pass\n' }], conflicts: [], warnings: [], holes: [], snippet: null },
    edit: { documentChanges: [
      { kind: 'create', uri: file('one/close_table.py').toString() },
      { textDocument: { uri: file('one/close_table.py').toString(), version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'class CloseTable: pass\n' }] },
      { textDocument: { uri: file('one/main.py').toString(), version: null }, edits: [{ range: { start: end, end }, newText: '# close_table\n' }] },
    ] },
  };
}

// start opens main.py, runs Generate with ui picking Command, and waits for the form's fields.
// The run is wrapped: an async function returning the thenable itself would wait for it.
async function start(ui: FakeUi, pick = 'p/command'): Promise<{ run: Thenable<unknown> }> {
  const a = await running();
  a.setUi(ui);
  ui.onPick = o => o.items.find(i => (i.value as { id?: string } | undefined)?.id === pick)?.value;
  await open(file('one/main.py'));
  const run = vscode.commands.executeCommand('durandal.generate');
  await until(() => ui.openForm?.model.rows.some(r => r.kind === 'field'), 'the form with its fields');
  return { run };
}

// typeCommand types close_table into the command field and waits for the ready preview.
async function typeCommand(ui: FakeUi): Promise<void> {
  reply('olifant/preview', filled);
  const n = ui.texts.length;
  ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await until(() => ui.texts.length > n, 'the command input');
  const t = ui.texts[ui.texts.length - 1];
  t.onChange!('close_table');
  t.finish('close_table');
  await until(() => ui.openForm?.model.ready, 'the form ready');
}

describe('generate (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('pick, the preview diff beside, a field, Ctrl+Enter: both files written and saved, logged', async () => {
    const a = await running();
    const before = disk('one/main.py');
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', planOf(before));
    const ui = new FakeUi();
    const { run } = await start(ui);
    assert.equal(ui.picks[0].title, 'Generate');
    await until(() => tabsUnder('/preview/').some(t => t.input instanceof vscode.TabInputTextDiff
      && t.input.original.toString() === file('one/main.py').toString()), 'the preview: main.py against its previewed text');
    await typeCommand(ui);
    await until(() => vscode.workspace.textDocuments.some(d => d.uri.scheme === 'durandal-doc' && d.uri.path.endsWith('/main.py')
      && d.getText() === filled.main.text), 'the preview updated in place');
    const n = a.shown.length;
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    assert.equal(disk('one/close_table.py'), 'class CloseTable: pass\n');
    assert.equal(disk('one/main.py'), `${before}# close_table\n`);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Applied Command: 2 files'), JSON.stringify(a.shown.slice(n)));
    const plans = log().filter(m => m.method === 'olifant/plan');
    assert.deepEqual(plans[plans.length - 1].params.steps, [{ generator: 'p/command', sets: { command: 'close_table' } }]);
    assert.deepEqual(actionLog().slice(logged).map(e => [e.event, e.generator]), [['generate-applied', 'p/command']]);
    await until(() => tabsUnder('/preview/').length === 0, 'the preview closed');
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), file('one/main.py').toString(), 'back in main.py');
    await settle('one/close_table.py', null);
    await settle('one/main.py', before);
  });

  it('a refused plan keeps the form, its values and the error', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', { lsp_error: 'close_table.py exists' });
    const ui = new FakeUi();
    const { run } = await start(ui);
    await typeCommand(ui);
    ui.openForm!.answer({ kind: 'apply' });
    await until(() => ui.openForm?.model.error === 'close_table.py exists', 'the error in the form');
    assert.ok(ui.log.includes('error close_table.py exists'));
    ui.openForm!.answer({ kind: 'escape' });
    await run;
  });

  it('+ New sends the new step first, with makes', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', { ...missing, steps: [{ generator: 'p/command', fields: [fld({ name: 'port', valid: false, choices: ['orders'], new: ['p/repository'] })] }] });
    const ui = new FakeUi();
    const { run } = await start(ui);
    ui.onPick = o => o.items.find(i => i.label === '+ New repository…')?.value;
    const n = log().length;
    ui.openForm!.answer({ kind: 'field', step: 0, name: 'port' });
    const sent = await until(() => log().slice(n).find(m => m.method === 'olifant/preview'), 'the preview with the new step');
    assert.deepEqual(sent.params.steps, [{ generator: 'p/repository', sets: {}, makes: { step: 1, input: 'port' } }, { generator: 'p/command', sets: {} }]);
    await until(() => ui.openForm, 'the form back');
    ui.openForm!.answer({ kind: 'escape' });
    await run;
  });

  it('a snippet plan puts its body in place of its line', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: { file: 'main.py', line: 1, body: 'def ${1:close_table}():\n    pass' } } });
    const ui = new FakeUi();
    const { run } = await start(ui);
    await typeCommand(ui);
    ui.openForm!.answer({ kind: 'apply' });
    await run;
    const doc = vscode.window.activeTextEditor!.document;
    assert.ok(doc.getText().startsWith('def close_table():\n    pass'), doc.getText());
    await revert(doc);
  });

  it('Ctrl+O reviews; the review\'s Apply lands and logs generate-applied', async () => {
    const before = disk('one/main.py');
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', planOf(before));
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    const { run } = await start(ui);
    await typeCommand(ui);
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.generate.review');
    await run;
    assert.equal(disk('one/close_table.py'), 'class CloseTable: pass\n');
    assert.ok(ui.log.includes('review Command'));
    assert.deepEqual(actionLog().slice(logged).map(e => e.event), ['generate-applied']);
    await settle('one/close_table.py', null);
    await settle('one/main.py', before);
  });

  it('outside a project with several open: which project, then its config.toml at 0:0', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await open(file('plain/notes.txt'));
    ui.onPick = o => (o.title === 'Generate in which project?' ? o.items.find(i => i.label.endsWith('/one'))?.value : undefined);
    const n = log().length;
    await vscode.commands.executeCommand('durandal.generate');
    const asked = log().slice(n).find(m => m.method === 'olifant/generators');
    assert.deepEqual(asked?.params, { textDocument: { uri: vscode.Uri.file(`${ws()}/one/.olifant/config.toml`).toString() }, position: { line: 0, character: 0 } });
  });
});
```
(`until` returns its value; the `+ New` test relies on that. In the last test the second pick, the list, answers nothing, so the flow ends.)

- [ ] **Step 10: Run everything**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS. If the first test times out on "the preview: main.py against its previewed text" on VS Code 1.91 but a tab with `/preview/1/before/main.py` on the left exists, the spec §12 fallback ran: VS Code refused the real file. Keep the fallback and change that assertion to accept either left side; say so in the PR.

- [ ] **Step 11: Commit**

```bash
git add src/document.ts src/origin.ts src/generate/previewDoc.ts src/generate/command.ts src/commandTable.ts src/extension.ts package.json test/unit/document.test.ts test/unit/manifest.test.ts test/e2e/fake.5-generate.e2e.ts
git commit -m "Generate: the command, the live preview beside the form, Ctrl/Cmd+Enter and Ctrl+O"
```

---
### Task 8: Actions at the cursor, the hint's command, and the lightbulb's edits

**Model:** Opus.

**Files:**
- Create: `src/actions/menu.ts`, `test/unit/menu.test.ts`
- Create: `src/actions/command.ts`
- Modify: `src/server.ts` (`APPLY_RESOLVED`; `resolveCodeAction` middleware)
- Modify: `src/commandTable.ts` (`durandal.actions` built; `showActions` leaves `SERVER_NAMED_INFO`)
- Modify: `src/extension.ts` (`Actions`)
- Modify: `test/e2e/fake.3-lifecycle.e2e.ts:337-341` (the not-yet server command is now Plan Review)
- Create: `test/e2e/fake.6-actions.e2e.ts`

**Interfaces:**
- Consumes: `ActionData`, `FileActionsResult`, `Values`, `Olifant`, `CLIENT_COMMANDS` (Task 2); `Generate.run` and `FlowEnd` (Tasks 5, 7); `Plans` (Task 6); `ActionLog` (Task 1); `Ui` (Task 5); M1's `findRoot`, `realRoot`, `applyServerEdit`, `Server`.
- Produces:
  - `src/actions/menu.ts`: `dataOf(a: CodeAction): ActionData`, `generatorOf(a: CodeAction): string`, `MenuItem { label: string; description?: string; action: CodeAction }`, `menuItems(actions: CodeAction[]): MenuItem[]`, `MissItem { label: string; separator?: boolean; line?: number; col?: number }`, `Miss = { kind: 'elsewhere'; text: string; items: MissItem[] } | { kind: 'nearby' | 'none'; text: string }`, `explainMiss(fa: FileActionsResult | null | undefined, rel: string): Miss`, `AskWay = { kind: 'form'; generator: string; done: boolean } | { kind: 'direct'; missing: string[] }`, `askWay(a: CodeAction): AskWay`.
  - `src/actions/command.ts`: `NOT_IN_PROJECT`, `class Actions { constructor(d: { server: Server; plans: Plans; generate: Generate; log: ActionLog; ui(): Ui; say: Say }); register(context): void; at(uri: vscode.Uri, pos: vscode.Position): Promise<void> }`.
  - `src/server.ts`: `APPLY_RESOLVED = 'durandal.applyResolvedEdit'` (arguments `[label: string, edit: WorkspaceEdit]`).

- [ ] **Step 1: Write the failing unit tests**

`test/unit/menu.test.ts` (ports of durandal.nvim `tests/actions_spec.lua` and `lsp_features_spec.lua`'s menu):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CodeAction } from 'vscode-languageserver-protocol';
import type { FileAction } from '../../src/protocol';
import { askWay, explainMiss, generatorOf, menuItems } from '../../src/actions/menu';

const act = (title: string, kind: string, data: object): CodeAction => ({ title, kind, data });
const fa = (label: string, line: number): FileAction =>
  ({ generator: 'rust-htmx/wire-command', name: 'Wire', label, range: { start: [line, 5], end: [line, 20] }, sets: { command: 'c' }, missing: [], snippet: false });

test('menuItems: the fixes first, as Fix:, then the rest in the server\'s order; (asks …) from missing', () => {
  const items = menuItems([
    act('Extract', 'refactor.rewrite', { generator: 'g/extract', missing: [] }),
    act('Add a service', 'quickfix', { rule: 'r/service', missing: ['app', 'service'] }),
    act('Wire', 'refactor.rewrite', { generator: 'g/wire' }),
  ]);
  assert.deepEqual(items.map(i => [i.label, i.description]), [['Fix: Add a service', '(asks app, service)'], ['Extract', undefined], ['Wire', undefined]]);
  assert.deepEqual(items.map(i => generatorOf(i.action)), ['r/service', 'g/extract', 'g/wire']);
});

test('askWay: a generator with inputs missing asks in the form (a fix hands its values back); else each input', () => {
  assert.deepEqual(askWay(act('x', 'refactor', { generator: 'g', missing: ['a'] })), { kind: 'form', generator: 'g', done: false });
  assert.deepEqual(askWay(act('x', 'quickfix', { generator: 'g', missing: ['a'] })), { kind: 'form', generator: 'g', done: true });
  assert.deepEqual(askWay(act('x', 'quickfix', { rule: 'r', missing: ['a'] })), { kind: 'direct', missing: ['a'] });
  assert.deepEqual(askWay(act('x', 'refactor', { generator: 'g', missing: [] })), { kind: 'direct', missing: [] });
});

test('(a) explainMiss points to actions elsewhere in the file, by line', () => {
  const m = explainMiss({ actions: [fa('Wire c', 9)], nearby: [] }, 'src/a.rs');
  assert.equal(m.kind, 'elsewhere');
  assert.ok(m.kind === 'elsewhere');
  assert.deepEqual(m.items, [{ label: '⚡ Wire c — line 9', line: 9, col: 5 }]);
});

test('(b) explainMiss says what a nearby generator looks for', () => {
  assert.deepEqual(explainMiss({ actions: [], nearby: [{ generator: 'rust-htmx/wire-command', label: 'Wire', why: 'on a field of the CancelInvoice struct' }] }, 'src/a.rs'),
    { kind: 'nearby', text: 'rust-htmx/wire-command applies on a field of the CancelInvoice struct — none yet' });
});

test('explainMiss shows what a generator waits for above the actions elsewhere (review I5)', () => {
  const m = explainMiss({ actions: [fa('Add Unknown to every match', 22)], nearby: [{ generator: 'rust-htmx/wire-command', name: 'Wire Command Dependencies', label: 'Wire', why: 'on a field of the CancelInvoice struct' }] }, 'src/a.rs');
  assert.ok(m.kind === 'elsewhere');
  assert.deepEqual(m.items[0], { label: 'Wire Command Dependencies applies on a field of the CancelInvoice struct — none yet', separator: true });
  assert.equal(m.items[1].line, 22);
});

test('(c) explainMiss says when nothing relates to the file', () => {
  assert.deepEqual(explainMiss({ actions: [], nearby: [] }, 'src/a.rs'), { kind: 'none', text: 'No Olifant generators apply to src/a.rs' });
  assert.deepEqual(explainMiss(null, 'src/a.rs'), { kind: 'none', text: 'No Olifant generators apply to src/a.rs' });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL, `src/actions/menu` missing.

- [ ] **Step 3: Write `src/actions/menu.ts`**

```ts
import type { CodeAction } from 'vscode-languageserver-protocol';
import type { ActionData, FileActionsResult } from '../protocol';

// menu: the actions-at-cursor menu and its miss, ported from durandal.nvim actions.lua. Pure.

export const dataOf = (a: CodeAction): ActionData => (a.data && typeof a.data === 'object' ? a.data : {}) as ActionData;
export const generatorOf = (a: CodeAction): string => dataOf(a).generator ?? dataOf(a).rule ?? '';

export interface MenuItem { label: string; description?: string; action: CodeAction }

// menuItems: a rule's fixes first (as "Fix: …"), then the rest in the server's order.
export function menuItems(actions: CodeAction[]): MenuItem[] {
  const fixes = actions.filter(a => a.kind === 'quickfix');
  const others = actions.filter(a => a.kind !== 'quickfix');
  return [...fixes, ...others].map(a => {
    const missing = dataOf(a).missing ?? [];
    return { label: `${a.kind === 'quickfix' ? 'Fix: ' : ''}${a.title}`, description: missing.length > 0 ? `(asks ${missing.join(', ')})` : undefined, action: a };
  });
}

export type AskWay = { kind: 'form'; generator: string; done: boolean } | { kind: 'direct'; missing: string[] };

// askWay: an action naming a generator with inputs missing asks in the generate form (a fix's
// form hands its values back, nothing planned there); else each missing input is asked.
export function askWay(a: CodeAction): AskWay {
  const d = dataOf(a);
  const missing = d.missing ?? [];
  if (missing.length > 0 && typeof d.generator === 'string') return { kind: 'form', generator: d.generator, done: a.kind === 'quickfix' };
  return { kind: 'direct', missing };
}

export interface MissItem { label: string; separator?: boolean; line?: number; col?: number }
export type Miss = { kind: 'elsewhere'; text: string; items: MissItem[] } | { kind: 'nearby' | 'none'; text: string };

// explainMiss is actions.lua's explain_miss: what a generator nearby waits for comes first;
// actions elsewhere in the file are listed by line (1-based) to jump to.
export function explainMiss(fa: FileActionsResult | null | undefined, rel: string): Miss {
  const nearby = (fa?.nearby ?? []).map(n => `${n.name ?? n.generator} applies ${n.why} — none yet`);
  const ranged = (fa?.actions ?? []).filter(a => a.range);
  if (ranged.length > 0) {
    return {
      kind: 'elsewhere',
      text: 'Nothing at the cursor. In this file:',
      items: [
        ...nearby.map(label => ({ label, separator: true })),
        ...ranged.map(a => ({ label: `⚡ ${a.label} — line ${a.range!.start[0]}`, line: a.range!.start[0], col: a.range!.start[1] })),
      ],
    };
  }
  if (nearby.length > 0) return { kind: 'nearby', text: nearby.join('\n') };
  return { kind: 'none', text: `No Olifant generators apply to ${rel}` };
}
```
Run `npm run test:unit`: PASS.

- [ ] **Step 4: Check the converter names the middleware needs**

Run:
```bash
grep -n "asCodeAction\b\|asCodeAction(" node_modules/vscode-languageclient/lib/common/codeConverter.d.ts node_modules/vscode-languageclient/lib/common/protocolConverter.d.ts
grep -n "resolveCodeAction" node_modules/vscode-languageclient/lib/common/codeAction.d.ts
```
Expected: `code2ProtocolConverter.asCodeAction(item: code.CodeAction, token?: code.CancellationToken): Promise<proto.CodeAction>`, `protocol2CodeConverter.asCodeAction(item: proto.CodeAction | undefined | null, token?): Promise<code.CodeAction | undefined>`, and the middleware `resolveCodeAction?: (this: void, item: VCodeAction, token: CancellationToken, next: ResolveCodeActionSignature) => ProviderResult<VCodeAction>`. If a name differs in this library version, use the one the `.d.ts` has; the behaviour below stays.

- [ ] **Step 5: The lightbulb's resolved edits take the server-edit path (`src/server.ts`)**

Add to the imports from `vscode-languageclient/node`: `CodeActionResolveRequest`. Add after `NOT_RUNNING`:
```ts
// The command a lightbulb action resolved by the server runs: its edit through applyServerEdit
// (arguments: the action's title, the server's WorkspaceEdit). Registered by actions/command.ts.
export const APPLY_RESOLVED = 'durandal.applyResolvedEdit';
```
and in `middleware`, next to `workspace`:
```ts
        // a code action picked from the lightbulb (Ctrl+.): resolved here so the server's edit
        // keeps its versions, then applied durandal.nvim's way (refused if stale, files saved,
        // no refactor preview) by APPLY_RESOLVED instead of by VS Code (spec §4)
        resolveCodeAction: async (item, token, next) => {
          const lc = made.lc;
          if (!lc) return next(item, token);
          const raw = await lc.sendRequest(CodeActionResolveRequest.type, await lc.code2ProtocolConverter.asCodeAction(item, token), token);
          const out = await lc.protocol2CodeConverter.asCodeAction(raw, token);
          if (!out || !raw?.edit) return out ?? item;
          out.edit = undefined;
          out.command = { title: raw.title, command: APPLY_RESOLVED, arguments: [raw.title, raw.edit] };
          return out;
        },
```

- [ ] **Step 6: Write `src/actions/command.ts`**

```ts
import { relative } from 'node:path';
import * as vscode from 'vscode';
import { CodeAction, CodeActionRequest, CodeActionResolveRequest, WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { ActionLog } from '../actionLog';
import { applyServerEdit } from '../applyEdit';
import type { Generate } from '../generate/command';
import type { Plans } from '../land';
import { CLIENT_COMMANDS, FileActionsResult, Olifant, Values } from '../protocol';
import { findRoot, realRoot } from '../root';
import { APPLY_RESOLVED, NOT_RUNNING, Say, Server } from '../server';
import type { Ui } from '../uiTypes';
import { askWay, dataOf, explainMiss, generatorOf, MenuItem, menuItems, MissItem } from './menu';

export const NOT_IN_PROJECT = 'not in an Olifant project (no .olifant/ above this file)';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export interface ActionsDeps { server: Server; plans: Plans; generate: Generate; log: ActionLog; ui(): Ui; say: Say }

// Actions is durandal.actions (the chord, at the cursor) and olifant.showActions (the ⚡ hint's
// command, at its line), ported from durandal.nvim actions.lua: the server's code actions as a
// menu (a rule's fixes first); the pick asks what it still needs, resolves to its plan and
// opens the review window (a snippet goes in its line). Nothing here: why, from the file's
// actions. Also APPLY_RESOLVED, the lightbulb path's apply.
export class Actions {
  constructor(private readonly d: ActionsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.actions', () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed) {
          this.d.ui().info(NOT_IN_PROJECT);
          return;
        }
        return this.at(ed.document.uri, ed.selection.active);
      }),
      vscode.commands.registerCommand(CLIENT_COMMANDS.showActions, (uri: string, pos: { line: number; character: number }) =>
        this.at(vscode.Uri.parse(uri), new vscode.Position(pos.line, pos.character))),
      vscode.commands.registerCommand(APPLY_RESOLVED, async (label: string, edit: WorkspaceEdit) => {
        const lc = this.d.server.client();
        if (!lc) return void this.d.say('error', NOT_RUNNING);
        const r = await applyServerEdit(lc, { label, edit }, text => void this.d.say('info', text));
        if (!r.applied) void this.d.say('error', r.failureReason ?? 'VS Code did not apply the edit');
      }),
    );
  }

  async at(uri: vscode.Uri, pos: vscode.Position): Promise<void> {
    const ui = this.d.ui();
    const found = uri.scheme === 'file' ? await findRoot(uri.fsPath) : undefined;
    if (!found) {
      ui.info(NOT_IN_PROJECT);
      return;
    }
    const root = await realRoot(found);
    const rel = relative(found, uri.fsPath);
    const at = { line: pos.line, character: pos.character };
    let actions: CodeAction[];
    try {
      const got = await this.d.server.request(CodeActionRequest.type,
        { textDocument: { uri: uri.toString() }, range: { start: at, end: at }, context: { diagnostics: [] } });
      // a bare Command (command: string) is not an action this menu offers
      actions = (got ?? []).filter((x): x is CodeAction => typeof (x as { command?: unknown }).command !== 'string');
    } catch (err) {
      ui.error(message(err));
      return;
    }
    if (actions.length === 0) return this.miss(uri, rel, ui);
    const items = menuItems(actions);
    this.d.log.write({ event: 'shown', file: rel, generators: items.map(i => generatorOf(i.action)) });
    const picked = await ui.pick<MenuItem>({ title: 'Olifant', items: items.map(i => ({ label: i.label, description: i.description, value: i })) });
    if (!picked) return;
    const a = picked.action;
    this.d.log.write({ event: a.kind === 'quickfix' ? 'fix-picked' : 'picked', file: rel, generator: generatorOf(a) });
    const sets = await this.ask(a, ui);
    if (sets) await this.resolve(a, sets, root, ui);
  }

  // ask is what the action still needs (actions.lua ask): undefined when skipped, or when the
  // generate form applied the action itself.
  private async ask(a: CodeAction, ui: Ui): Promise<Values | undefined> {
    const d = dataOf(a);
    const preset: Values = { ...(d.sets ?? {}) };
    const way = askWay(a);
    if (way.kind === 'form') {
      const end = await this.d.generate.run({ generator: way.generator, sets: preset, done: way.done });
      return end.kind === 'sets' ? { ...preset, ...end.sets } : undefined;
    }
    const sets = { ...preset };
    for (const k of way.missing) {
      const cs = d.choices?.[k] ?? [];
      const v = cs.length > 0
        ? await ui.pick<string>({ title: k, items: cs.map(c => ({ label: c, value: c })) })
        : await ui.text({ title: k, value: '' }).result;
      if (!v) return undefined;
      sets[k] = v;
    }
    return sets;
  }

  // resolve plans the action with sets (the server reports progress, titled as the action),
  // then reviews the plan, or puts a snippet in its line.
  private async resolve(a: CodeAction, sets: Values, root: string, ui: Ui): Promise<void> {
    const d = dataOf(a);
    let resolved: CodeAction | null;
    try {
      resolved = await this.d.server.request(CodeActionResolveRequest.type, { ...a, data: { ...d, sets } });
    } catch (err) {
      ui.error(message(err));
      return;
    }
    const plan = resolved ? dataOf(resolved).plan : undefined;
    if (!plan || typeof plan !== 'object') {
      ui.error('the server sent no plan');
      return;
    }
    if (plan.snippet && d.snippet === true) {
      await this.d.plans.snippet(root, plan.snippet);
      return;
    }
    await this.d.plans.review(ui, root, plan, resolved!.edit, {
      title: a.title,
      landed: () => this.d.log.write({ event: 'applied', generator: generatorOf(a), files: (plan.files ?? []).length }),
    });
  }

  // miss: nothing at the cursor. The file's actions are always asked again (a miss is asked
  // for); actions elsewhere are a menu, and picking one moves there and asks again.
  private async miss(uri: vscode.Uri, rel: string, ui: Ui): Promise<void> {
    let fa: FileActionsResult | null = null;
    try {
      fa = await this.d.server.request(Olifant.fileActions, { textDocument: { uri: uri.toString() } });
    } catch {
      // explained from nothing
    }
    const m = explainMiss(fa, rel);
    if (m.kind !== 'elsewhere') {
      ui.info(m.text);
      return;
    }
    const it = await ui.pick<MissItem>({ title: m.text, items: m.items.map(i => (i.separator ? { label: i.label, separator: true } : { label: i.label, value: i })) });
    if (!it || it.line === undefined) return;
    const ed = await vscode.window.showTextDocument(uri);
    const line = Math.max(Math.min(it.line, ed.document.lineCount) - 1, 0);
    const p = new vscode.Position(line, Math.max((it.col ?? 1) - 1, 0));
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p));
    return this.at(uri, p);
  }
}
```
If `tsc` rejects `this.d.server.request(CodeActionRequest.type, …)` because the library's `ProtocolRequestType` is not a `RequestType<P, R, void>`, pass `CodeActionRequest.type as unknown as RequestType<CodeActionParams, (Command | CodeAction)[] | null, void>` (and the same for resolve): `Server.request` sends by method name, so only the types matter.

- [ ] **Step 7: The command table, the lifecycle test, the wiring**

In `src/commandTable.ts`: remove `'durandal.actions'` from `NOT_YET`; add `'durandal.actions': { title: 'Actions Here' },` to `BUILT`; change `SERVER_NAMED_INFO` to
```ts
// showActions is built (actions/command.ts); the rest are later milestones'.
const SERVER_NAMED_INFO: Record<Exclude<keyof typeof CLIENT_COMMANDS, 'showActions'>, { title: string; milestone: number }> = {
  planReview: { title: 'Plan Review', milestone: 5 },
  planExcerpt: { title: 'Plan Excerpt', milestone: 6 },
  planErrand: { title: 'Plan Delegations', milestone: 6 },
};

export const SERVER_NAMED: Record<string, { title: string; milestone: number }> = Object.fromEntries(
  (Object.keys(SERVER_NAMED_INFO) as (keyof typeof SERVER_NAMED_INFO)[]).map(k => [CLIENT_COMMANDS[k], SERVER_NAMED_INFO[k]]),
);
```
In `test/e2e/fake.3-lifecycle.e2e.ts` change the not-yet test to run `olifant.plans.review` and expect `'Durandal: Plan Review is not implemented yet'`.

In `src/extension.ts`: import `Actions`; after `generate.register(context);`:
```ts
  new Actions({ server: s, plans, generate, log, ui, say }).register(context);
```

- [ ] **Step 8: Write the contract tests**

`test/e2e/fake.6-actions.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Field } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { actionLog, count, disk, file, log, open, reply, running, settle, until } from './helpers';

const R0 = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const empty = { files: [], conflicts: [], warnings: [], holes: [], snippet: null };
const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
const fix = { title: 'Add a service', kind: 'quickfix', data: { kind: 'fix', rule: 'r/service', sets: { app: 'bistro' }, missing: ['service'], choices: { service: ['booking', 'orders'] } } };
const wire = { title: 'Wire close_table', kind: 'refactor.rewrite', data: { kind: 'action', generator: 'p/wire', sets: { command: 'close_table' }, missing: [], choices: {} } };
const topEdit = (rel: string, text: string) => ({ documentChanges: [{ textDocument: { uri: file(rel).toString(), version: null }, edits: [{ range: R0, newText: text }] }] });

async function withUi(): Promise<FakeUi> {
  const ui = new FakeUi();
  (await running()).setUi(ui);
  return ui;
}

describe('actions at the cursor (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('fixes first with what they ask; an input from its choices; resolved with the sets; reviewed, applied, logged', async () => {
    const before = disk('one/other.py');
    reply('textDocument/codeAction', [wire, fix]);
    reply('codeAction/resolve', { ...fix, data: { ...fix.data, plan: { ...empty, files: [{ path: 'other.py', before, after: `# service\n${before}` }] } }, edit: topEdit('one/other.py', '# service\n') });
    const ui = await withUi();
    ui.onPick = o => (o.title === 'Olifant' ? o.items[0].value : o.title === 'service' ? 'orders' : undefined);
    ui.onReview = () => ({ kind: 'apply' });
    await open(file('one/main.py'));
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, i.description]), [['Fix: Add a service', '(asks service)'], ['Wire close_table', undefined]]);
    const resolve = log().filter(m => m.method === 'codeAction/resolve').pop()!;
    assert.deepEqual(resolve.params.data.sets, { app: 'bistro', service: 'orders' });
    assert.ok(ui.log.includes('review Add a service'));
    assert.equal(disk('one/other.py'), `# service\n${before}`);
    const events = actionLog().slice(logged);
    assert.deepEqual(events.map(e => e.event), ['shown', 'fix-picked', 'applied']);
    assert.deepEqual(events[0].generators, ['r/service', 'p/wire']);
    assert.equal(events[0].file, 'main.py');
    assert.equal(events[2].files, 1);
    await settle('one/other.py', before);
  });

  it('a fix naming a generator asks in the generate form, which hands its values back; then resolve', async () => {
    const fixGen = { ...fix, data: { ...fix.data, generator: 'p/service', choices: {} } };
    reply('textDocument/codeAction', [fixGen]);
    reply('olifant/generators', { generators: [{ id: 'p/service', name: 'Service', here: true }] });
    const shape = (service: Field, ready: boolean) => ({ steps: [{ generator: 'p/service', fields: [fld({ name: 'app', value: 'bistro', source: 'you' }), service] }], files: [], main: null, ready, error: null });
    reply('olifant/preview', shape(fld({ name: 'service', valid: false }), false));
    reply('codeAction/resolve', { ...fixGen, data: { ...fixGen.data, plan: empty } });
    const ui = await withUi();
    ui.onPick = o => (o.title === 'Olifant' ? o.items[0].value : undefined);
    await open(file('one/main.py'));
    const run = vscode.commands.executeCommand('durandal.actions');
    await until(() => ui.openForm?.model.rows.some(r => r.kind === 'field'), 'the generate form');
    reply('olifant/preview', shape(fld({ name: 'service', value: 'orders', source: 'you' }), true));
    ui.openForm!.answer({ kind: 'field', step: 0, name: 'service' });
    await until(() => ui.texts.length > 0, 'the service input');
    ui.texts[0].onChange!('orders');
    ui.texts[0].finish('orders');
    await until(() => ui.openForm?.model.ready, 'ready');
    const plans = count('olifant/plan');
    ui.openForm!.answer({ kind: 'apply' });
    await run;
    assert.equal(count('olifant/plan'), plans, 'nothing planned in the form');
    const resolve = log().filter(m => m.method === 'codeAction/resolve').pop()!;
    assert.deepEqual(resolve.params.data.sets, { app: 'bistro', service: 'orders' });
  });

  it('nothing here: the file\'s actions elsewhere, what waits first; picking one moves there and asks again', async () => {
    reply('textDocument/codeAction', []);
    reply('olifant/fileActions', { actions: [{ generator: 'g', name: 'G', label: 'Do it', range: { start: [1, 2], end: [1, 4] }, sets: {}, missing: [], snippet: false }], nearby: [{ generator: 'p/wire', name: 'Wire', label: 'Wire', why: 'on a field of a command' }] });
    const ui = await withUi();
    let menus = 0;
    ui.onPick = o => {
      menus++;
      return menus === 1 ? o.items.find(i => !i.separator)?.value : undefined;
    };
    await open(file('one/main.py'));
    const asked = count('olifant/fileActions');
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, !!i.separator]), [['Wire applies on a field of a command — none yet', true], ['⚡ Do it — line 1', false]]);
    assert.equal(menus, 2, 'asked again where it moved');
    assert.ok(count('olifant/fileActions') >= asked + 2, 'the file\'s actions asked each time');
    const sel = vscode.window.activeTextEditor!.selection.active;
    assert.deepEqual([sel.line, sel.character], [0, 1]);
  });

  it('nothing here and nothing elsewhere: what waits, or that nothing applies', async () => {
    reply('textDocument/codeAction', []);
    const ui = await withUi();
    await open(file('one/main.py'));
    reply('olifant/fileActions', { actions: [], nearby: [{ generator: 'p/wire', why: 'on a field of a command' }] });
    await vscode.commands.executeCommand('durandal.actions');
    reply('olifant/fileActions', { actions: [], nearby: [] });
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.log.filter(l => l.startsWith('info')), ['info p/wire applies on a field of a command — none yet', 'info No Olifant generators apply to main.py']);
  });

  it('the ⚡ hint\'s command opens the menu at its line; outside a project it says so', async () => {
    reply('textDocument/codeAction', [wire]);
    const ui = await withUi();
    const n = log().length;
    await vscode.commands.executeCommand('olifant.showActions', file('one/main.py').toString(), { line: 0, character: 0 });
    assert.equal(ui.picks[0].title, 'Olifant');
    assert.ok(log().slice(n).some(m => m.method === 'textDocument/codeAction' && m.params.textDocument.uri === file('one/main.py').toString()
      && m.params.range.start.line === 0 && m.params.context.diagnostics.length === 0));
    await open(file('plain/notes.txt'));
    await vscode.commands.executeCommand('durandal.actions');
    assert.ok(ui.log.includes('info not in an Olifant project (no .olifant/ above this file)'));
  });

  it('the lightbulb: a resolved action\'s edit is applied the server-edit way, saved and named', async () => {
    const a = await running();
    const before = disk('one/other.py');
    reply('textDocument/codeAction', [wire]);
    reply('codeAction/resolve', { ...wire, edit: topEdit('one/other.py', '# wired\n') });
    await open(file('one/main.py'));
    const got = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', file('one/main.py'), new vscode.Range(0, 0, 0, 0), undefined, 1);
    const act = got.find(x => x.title === 'Wire close_table')!;
    assert.equal(act.edit, undefined, 'no edit for VS Code to apply');
    assert.equal(act.command?.command, 'durandal.applyResolvedEdit');
    const n = a.shown.length;
    await vscode.commands.executeCommand(act.command!.command, ...act.command!.arguments!);
    assert.equal(disk('one/other.py'), `# wired\n${before}`);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Wire close_table: other.py'));
    await settle('one/other.py', before);
  });
});
```

- [ ] **Step 9: Run everything**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS. If the lightbulb test finds `act.edit` set, the middleware did not run: check that `resolveCodeAction` sits directly in `middleware` (not under `workspace`) and that the fake advertises `resolveProvider: true` (Task 2).

- [ ] **Step 10: Commit**

```bash
git add src/actions src/server.ts src/commandTable.ts src/extension.ts test/unit/menu.test.ts test/e2e/fake.3-lifecycle.e2e.ts test/e2e/fake.6-actions.e2e.ts
git commit -m "Actions at the cursor and the hint's command (menu, asks, resolve, review, miss); lightbulb edits through applyServerEdit"
```

---

### Task 9: ⚡ hints

**Model:** Sonnet.

**Files:**
- Create: `src/hintLog.ts`, `test/unit/hintLog.test.ts`
- Create: `src/hints.ts`
- Modify: `src/server.ts` (`ClientHooks`; `provideInlayHints` middleware)
- Modify: `src/commandTable.ts` (`durandal.hints.toggle` built), `package.json` (setting, command), `test/unit/manifest.test.ts`
- Modify: `src/extension.ts`
- Create: `test/e2e/fake.7-hints.e2e.ts`

**Interfaces:**
- Consumes: `FileActionsResult`, `Olifant` (Task 2); `ActionLog` (Task 1); M1's `Server`.
- Produces:
  - `src/hintLog.ts`: `generatorAt(fa: FileActionsResult | null | undefined, line: number): string | undefined` (`line` 1-based), `class Seen { fresh(uri: string, lines: number[]): number[] }`.
  - `src/server.ts`: `ClientHooks { hints?: { enabled(): boolean; shown(uri: string, lines: number[]): void } }`; `new Server(output, say, hooks?: ClientHooks)`.
  - `src/hints.ts`: `class Hints { constructor(d: { server: Server; log: ActionLog }); enabled(): boolean; shown(uri: string, lines: number[]): void; register(context): void }`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/hintLog.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FileAction } from '../../src/protocol';
import { generatorAt, Seen } from '../../src/hintLog';

const a = (generator: string, from: number, to: number, snippet = false): FileAction =>
  ({ generator, name: generator, label: generator, range: { start: [from, 1], end: [to, 1] }, sets: {}, missing: [], snippet });

test('generatorAt: the first action covering the line that is not a snippet', () => {
  const fa = { actions: [a('snip', 3, 3, true), a('wide', 1, 10), a('narrow', 3, 3)], nearby: [] };
  assert.equal(generatorAt(fa, 3), 'wide');
  assert.equal(generatorAt(fa, 11), undefined);
  assert.equal(generatorAt({ actions: [{ ...a('whole', 1, 1), range: null }], nearby: [] }, 1), undefined);
  assert.equal(generatorAt(null, 1), undefined);
});

test('Seen: each uri:line once per session', () => {
  const s = new Seen();
  assert.deepEqual(s.fresh('file:///a', [0, 3]), [0, 3]);
  assert.deepEqual(s.fresh('file:///a', [3, 4]), [4]);
  assert.deepEqual(s.fresh('file:///b', [3]), [3]);
});
```
In `test/unit/manifest.test.ts`, add `'durandal.hints'` to the settings list (sorted), and:
```ts
  const hints = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.hints'];
  assert.equal(hints.type, 'boolean');
  assert.equal(hints.default, true);
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL: `src/hintLog` missing; the settings list differs.

- [ ] **Step 3: Write `src/hintLog.ts`, the setting and the command entry**

```ts
import type { FileActionsResult } from './protocol';

// hintLog: what the hinted log line needs. olifant's ⚡ hint carries only its label and the
// line, so the generator comes from olifant/fileActions: the first action, not a snippet,
// whose range covers the line (1-based). Pure.

export function generatorAt(fa: FileActionsResult | null | undefined, line: number): string | undefined {
  return (fa?.actions ?? []).find(a => !a.snippet && a.range && a.range.start[0] <= line && line <= a.range.end[0])?.generator;
}

// Seen keeps the uri:line pairs already logged this session (hints.lua logs once per line).
export class Seen {
  private readonly keys = new Set<string>();
  fresh(uri: string, lines: number[]): number[] {
    return lines.filter(l => {
      const k = `${uri}:${l}`;
      if (this.keys.has(k)) return false;
      this.keys.add(k);
      return true;
    });
  }
}
```
`package.json`: add the setting (after `durandal.actionLog`):
```json
        "durandal.hints": {
          "type": "boolean",
          "default": true,
          "markdownDescription": "Show ⚡ at the end of each line where an Olifant action applies; clicking it opens the actions there. `Durandal: Toggle ⚡ Hints` flips it."
        },
```
and the command `{ "command": "durandal.hints.toggle", "title": "Toggle ⚡ Hints", "category": "Durandal" }`; in `src/commandTable.ts` add `'durandal.hints.toggle': { title: 'Toggle ⚡ Hints' },` to `BUILT`.

Run `npm run test:unit`: PASS.

- [ ] **Step 4: Check the inlay hint feature's names**

Run:
```bash
grep -n "provideInlayHints\|onDidChangeInlayHints\|InlayHintsProviderShape" node_modules/vscode-languageclient/lib/common/inlayHint.d.ts
grep -n "getFeature(request: typeof InlayHintRequest.method)" node_modules/vscode-languageclient/lib/common/client.d.ts
```
Expected: the middleware `provideInlayHints?: (this: void, document, viewPort, token, next) => ProviderResult<VInlayHint[]>`, `InlayHintsProviderShape { provider; onDidChangeInlayHints: EventEmitter<void> }`, and `getFeature(request: typeof InlayHintRequest.method): DynamicFeature<…> & TextDocumentProviderFeature<InlayHintsProviderShape>`. Use the names the `.d.ts` has.

- [ ] **Step 5: The middleware hook (`src/server.ts`)**

Add:
```ts
// ClientHooks are what other parts of the extension put into the client's middleware.
export interface ClientHooks {
  // ⚡ hints (spec §6): off draws none; on, shown hears the lines drawn (for the action log)
  hints?: { enabled(): boolean; shown(uri: string, lines: number[]): void };
}
```
change the constructor to `constructor(private readonly output: vscode.LogOutputChannel, private readonly say: Say, private readonly hooks: ClientHooks = {}) {}`, and add to `middleware` (with `const hooks = this.hooks;` before `clientOptions`):
```ts
        provideInlayHints: async (document, viewPort, token, next) => {
          const h = hooks.hints;
          if (h && !h.enabled()) return [];
          const hints = (await next(document, viewPort, token)) ?? [];
          h?.shown(document.uri.toString(), hints.map(x => x.position.line));
          return hints;
        },
```

- [ ] **Step 6: Write `src/hints.ts`**

```ts
import * as vscode from 'vscode';
import { InlayHintRequest } from 'vscode-languageclient/node';
import type { ActionLog } from './actionLog';
import { generatorAt, Seen } from './hintLog';
import { Olifant } from './protocol';
import type { Server } from './server';

// Hints are the ⚡ hints: the library's inlay hints as olifant serves them (one per line with
// actions, every visible line; clicking runs olifant.showActions), gated by durandal.hints,
// each line logged once (hinted). durandal.hints.toggle is :DurandalHints.
export class Hints {
  private readonly seen = new Seen();

  constructor(private readonly d: { server: Server; log: ActionLog }) {}

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('hints', true);
  }

  shown(uri: string, lines: number[]): void {
    const fresh = this.seen.fresh(uri, lines);
    if (fresh.length === 0) return;
    this.d.server.request(Olifant.fileActions, { textDocument: { uri } }).then(fa => {
      for (const l of fresh) {
        const g = generatorAt(fa, l + 1);
        if (g) this.d.log.write({ event: 'hinted', generator: g });
      }
    }, () => undefined);
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.hints.toggle', async () => {
        const c = vscode.workspace.getConfiguration('durandal');
        const set = c.inspect<boolean>('hints');
        const target = set?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        await c.update('hints', !this.enabled(), target);
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('durandal.hints')) this.refresh();
      }),
    );
  }

  // refresh has VS Code ask for the hints again (the library provider's change event).
  private refresh(): void {
    const lc = this.d.server.client();
    if (!lc) return;
    const feature = lc.getFeature(InlayHintRequest.method);
    for (const ed of vscode.window.visibleTextEditors) feature.getProvider(ed.document)?.onDidChangeInlayHints.fire();
  }
}
```

- [ ] **Step 7: Wire it (`src/extension.ts`)**

Before `new Server(...)`: `const hooks: ClientHooks = {};` and pass it: `new Server(output, say, hooks)`. After the `ActionLog`:
```ts
  const hints = new Hints({ server: s, log });
  hints.register(context);
  hooks.hints = hints;
```

- [ ] **Step 8: Write the contract test**

`test/e2e/fake.7-hints.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { actionLog, file, open, reply, running, sleep, until } from './helpers';

const hintsAt = () => vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', file('one/main.py'), new vscode.Range(0, 0, 1, 0));

describe('⚡ hints (fake server)', () => {
  after(() => reply('textDocument/inlayHint', null));

  it('the server\'s hint, its command, logged once per line; the toggle turns them off and on', async () => {
    await running();
    const logged = actionLog().length;
    reply('olifant/fileActions', { actions: [{ generator: 'p/wire', name: 'Wire', label: 'Wire close_table', range: { start: [1, 1], end: [1, 6] }, sets: {}, missing: [], snippet: false }], nearby: [] });
    reply('textDocument/inlayHint', [{
      position: { line: 0, character: 5 },
      label: [{ value: '⚡ Wire close_table +1', command: { title: '⚡ Wire close_table +1', command: 'olifant.showActions', arguments: [file('one/main.py').toString(), { line: 0, character: 0 }] } }],
      paddingLeft: true,
    }]);
    await open(file('one/main.py'));
    let hints = await hintsAt();
    assert.equal(hints.length, 1);
    const part = (hints[0].label as vscode.InlayHintLabelPart[])[0];
    assert.equal(part.value, '⚡ Wire close_table +1');
    assert.equal(part.command?.command, 'olifant.showActions');
    await until(() => actionLog().slice(logged).some(e => e.event === 'hinted'), 'hinted logged');
    await hintsAt();
    await sleep(500);
    assert.deepEqual(actionLog().slice(logged).filter(e => e.event === 'hinted').map(e => e.generator), ['p/wire'], 'once per line');

    const conf = () => vscode.workspace.getConfiguration('durandal');
    await vscode.commands.executeCommand('durandal.hints.toggle');
    assert.equal(conf().get('hints'), false);
    hints = await hintsAt();
    assert.equal(hints.length, 0);
    await vscode.commands.executeCommand('durandal.hints.toggle');
    assert.equal(conf().get('hints'), true);
    assert.equal((await hintsAt()).length, 1);
  });
});
```

- [ ] **Step 9: Run everything, commit**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS.
```bash
git add src/hintLog.ts src/hints.ts src/server.ts src/commandTable.ts src/extension.ts package.json test/unit/hintLog.test.ts test/unit/manifest.test.ts test/e2e/fake.7-hints.e2e.ts
git commit -m "⚡ hints: the server's inlay hints, durandal.hints and its toggle, hinted logged once per line"
```

---

### Task 10: The migration report

**Model:** Sonnet.

**Files:**
- Create: `src/migration.ts`, `test/unit/migration.test.ts`
- Create: `src/migrationCommand.ts`
- Modify: `src/commandTable.ts` (`durandal.migration` built), `package.json` (command), `src/extension.ts`
- Create: `test/e2e/fake.8-migration.e2e.ts`

**Interfaces:**
- Consumes: `Migration`, `ModelResult`, `Olifant` (Task 2); `findOrigin` (Task 7); `VirtualDocs`, `Ui` (Tasks 5, 6).
- Produces: `src/migration.ts`: `NOT_MIGRATING`, `migrationLines(m: Migration): string[]`; `src/migrationCommand.ts`: `registerMigration(context, d: { server: Server; docs: VirtualDocs; ui(): Ui }): void`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/migration.test.ts` (ports of durandal.nvim `tests/migration_spec.lua`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrationLines } from '../../src/migration';

const mig = { line: '+1 extracted (close-table), legacy 4 → 3 functions; switches: 1 on, 1 off', switches: [{ name: 'close-table', on: true }, { name: 'x', on: false }], added_legacy: [], unregistered: [] };

test('the PR line, then each switch aligned, on or off', () => {
  assert.deepEqual(migrationLines(mig), [mig.line, '', 'switches', '  close-table  on', '  x            off']);
});

test('no switches yet; what the branch added to legacy code; switches the registry lacks', () => {
  assert.deepEqual(migrationLines({ ...mig, switches: [], added_legacy: ['a', 'b'], unregistered: ['s'] }), [
    mig.line, '', 'no switches yet',
    '', 'legacy functions this branch added: a, b',
    '', 'switches not in the registry: s',
  ]);
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL, `src/migration` missing.

- [ ] **Step 3: Write `src/migration.ts` and `src/migrationCommand.ts`**

```ts
import type { Migration } from './protocol';

// migration: :DurandalMigration's report from olifant/model's migration (durandal.nvim
// migration.lua): the PR line, each switch on or off, then what the branch added to legacy
// code and any switch the registry lacks. Pure.

export const NOT_MIGRATING = 'this project is not migrating (no [migrate] in .olifant/config.toml; olifant init --migrate PATH sets it up)';

export function migrationLines(m: Migration): string[] {
  const out = [m.line ?? '', ''];
  const switches = m.switches ?? [];
  if (switches.length === 0) {
    out.push('no switches yet');
  } else {
    const width = Math.max(...switches.map(s => s.name.length));
    out.push('switches');
    for (const s of switches) out.push(`  ${s.name}${' '.repeat(width - s.name.length + 2)}${s.on ? 'on' : 'off'}`);
  }
  if ((m.added_legacy ?? []).length > 0) out.push('', `legacy functions this branch added: ${m.added_legacy.join(', ')}`);
  if ((m.unregistered ?? []).length > 0) out.push('', `switches not in the registry: ${m.unregistered.join(', ')}`);
  return out;
}
```
```ts
import * as vscode from 'vscode';
import { migrationLines, NOT_MIGRATING } from './migration';
import { findOrigin } from './origin';
import { ModelResult, Olifant } from './protocol';
import type { Server } from './server';
import type { Ui } from './uiTypes';
import type { VirtualDocs } from './virtualDocs';

// durandal.migration: the migration report of the active file's project (else a project's
// config.toml, as Generate finds it), read-only beside.
export function registerMigration(context: vscode.ExtensionContext, d: { server: Server; docs: VirtualDocs; ui(): Ui }): void {
  context.subscriptions.push(vscode.commands.registerCommand('durandal.migration', async () => {
    const ui = d.ui();
    const found = await findOrigin(d.server, ui, 'Migration report for which project?');
    if (!found) return;
    let model: ModelResult | null;
    try {
      model = await d.server.request(Olifant.model, { textDocument: { uri: found.origin.uri } });
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!model?.migration) {
      ui.info(NOT_MIGRATING);
      return;
    }
    const uri = d.docs.set('Migration', migrationLines(model.migration).join('\n'));
    await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  }));
}
```
`package.json`: add `{ "command": "durandal.migration", "title": "Migration Report", "category": "Durandal" }`; `src/commandTable.ts`: `'durandal.migration': { title: 'Migration Report' },` in `BUILT`; `src/extension.ts`: `registerMigration(context, { server: s, docs, ui });`.

- [ ] **Step 4: Write the contract test**

`test/e2e/fake.8-migration.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { file, open, reply, running, until } from './helpers';

describe('the migration report (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('opens the report beside; a project not migrating says so', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await open(file('one/main.py'));
    reply('olifant/model', { project: 'one', elements: [], relations: [], problems: [], migration: { line: '+1 extracted (close-table)', switches: [{ name: 'close-table', on: true }], added_legacy: [], unregistered: [] } });
    await vscode.commands.executeCommand('durandal.migration');
    const doc = await until(() => vscode.workspace.textDocuments.find(d => d.uri.scheme === 'durandal-doc' && d.uri.path === '/Migration'), 'the report');
    assert.equal(doc.getText(), '+1 extracted (close-table)\n\nswitches\n  close-table  on');
    reply('olifant/model', { project: 'one', elements: [], relations: [], problems: [] });
    await open(file('one/main.py'));
    await vscode.commands.executeCommand('durandal.migration');
    assert.ok(ui.log.includes('info this project is not migrating (no [migrate] in .olifant/config.toml; olifant init --migrate PATH sets it up)'));
  });
});
```

- [ ] **Step 5: Run everything, commit**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS.
```bash
git add src/migration.ts src/migrationCommand.ts src/commandTable.ts src/extension.ts package.json test/unit/migration.test.ts test/e2e/fake.8-migration.e2e.ts
git commit -m "The migration report (durandal.migration)"
```

---

### Task 11: The real-server suite, the README, the PR

**Model:** Sonnet.

**Files:**
- Create: `test/e2e/real.5-generate.e2e.ts`
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above; `FakeUi` drives the real server's flows.

- [ ] **Step 1: Write the real-server tests (ports of durandal.nvim `tests/e2e_python_spec.lua` 78-110 and `e2e_lsp_spec.lua` 92)**

`test/e2e/real.5-generate.e2e.ts`:
```ts
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { FormRow } from '../../src/generate/form';
import { Olifant } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { file, open, running, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';
const exists = (rel: string) => existsSync(join(ws(), rel));
type FieldRow = Extract<FormRow, { kind: 'field' }>;

const fieldRow = (ui: FakeUi, name: string, step?: number) => ui.openForm?.model.rows.find(
  (r): r is FieldRow => r.kind === 'field' && r.name === name && (step === undefined || r.step === step));

// fill answers the field name with value: from its choices (or `+ New value…`) when it lists
// some, else typed.
async function fill(ui: FakeUi, name: string, value: string, step?: number): Promise<void> {
  const row = await until(() => fieldRow(ui, name, step), `the ${name} field`, 60_000);
  const picks = ui.picks.length;
  const texts = ui.texts.length;
  ui.onPick = o => o.items.find(i => i.label === value || i.label === `+ New ${value}…`)?.value;
  ui.openForm!.answer({ kind: 'field', step: row.step, name });
  await until(() => ui.picks.length > picks || ui.texts.length > texts, `the ${name} editor`);
  if (ui.texts.length > texts) {
    const t = ui.texts[ui.texts.length - 1];
    t.onChange!(value);
    t.finish(value);
  }
  await until(() => ui.openForm, 'the form back');
}

const ready = (ui: FakeUi) => until(() => ui.openForm && !ui.openForm.model.updating && ui.openForm.model.ready,
  'the form ready', 90_000);

describe('generate against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    (await running()).setUi(undefined);
    const cwd = join(ws(), 'py');
    execFileSync('git', ['checkout', '--', '.'], { cwd });
    execFileSync('git', ['clean', '-fdq'], { cwd });
  });

  it('comm → close_table → Ctrl+Enter: the command and its test written', async () => {
    await open(file(BOOKING));
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    ui.onPick = o => {
      if (o.title !== 'Generate') return undefined;
      const top = o.query!('comm').find(i => !i.separator)!;
      assert.equal((top.value as { id: string }).id, 'python-htmx/command');
      return top.value;
    };
    const run = vscode.commands.executeCommand('durandal.generate');
    await fill(ui, 'command', 'close_table');
    await ready(ui);
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    await until(() => exists('py/src/bistro/booking/commands/close_table__test.py'), 'the test written', 60_000);
    assert.ok(exists('py/src/bistro/booking/commands/close_table.py'));
  });

  it('Add a port → + New repository → table: both written, the command takes the port', async () => {
    await open(file(BOOKING));
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    ui.onPick = o => (o.title === 'Generate' ? o.items.find(i => (i.value as { id?: string } | undefined)?.id === 'python-htmx/add-dependency')?.value : undefined);
    const run = vscode.commands.executeCommand('durandal.generate');
    await fill(ui, 'kind', 'commands');
    await fill(ui, 'command', 'create_booking');
    await fill(ui, 'port', 'repository');
    await until(() => ui.openForm?.model.rows.some(r => r.kind === 'heading' && r.label.startsWith('+ New repository')), 'the + New step', 60_000);
    await fill(ui, 'entity', 'table', 0);
    await ready(ui);
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    await until(() => exists('py/src/bistro/booking/ports/table_repository/table_repository.py'), 'the repository written', 60_000);
    assert.ok(readFileSync(join(ws(), BOOKING), 'utf8').includes('table_repository: TableRepository'));
  });

  it('olifant/fileActions lists the project\'s actions for a project file', async () => {
    const ed = await open(file(BOOKING));
    const a = await running();
    const r = await a.server.request(Olifant.fileActions, { textDocument: { uri: ed.document.uri.toString() } });
    assert.ok(r.actions.length > 0 && r.actions.every(x => x.generator.startsWith('python-htmx/')), JSON.stringify(r.actions.map(x => x.generator)));
  });
});
```
The field names (`kind`, `command`, `port`, `entity`) are the server's at durandal.nvim's last run. If a `fill` times out on "the <name> field", print `ui.openForm.model.rows` from a failing run and use the names the server at `.olifant-ref` sends, keeping the flow (and say so in the PR).

- [ ] **Step 2: Run the real suite**

Run: `OLIFANT_BIN=<olifant built at .olifant-ref> OLIFANT_REPO=<that checkout> DURANDAL_E2E_ONLY=real.5 npm run test:e2e`
Expected: the fake and bare suites run whole first (`DURANDAL_E2E_ONLY` narrows by prefix in both; `real.5` matches no fake file, so they run nothing), then `real.5` PASSES (3 tests). Then run the whole e2e once without the filter: PASS.

- [ ] **Step 3: The README and the CHANGELOG**

In `README.md`, replace the opening paragraph's "(in later releases) actions, generators, ghost text, the TDD loop and plans" with "actions and generators with a live preview, ⚡ hints, the migration report, and (in later releases) ghost text, the TDD loop and plans", and add after "## Requirements":
```markdown
## Actions and generators

- **Actions here** (`Ctrl+Alt+D A`, `Cmd+Alt+D A` on macOS): the server's actions at the cursor,
  a rule's fixes first. Pick one: it asks what it still needs, then shows the plan in the review
  window (notes, then each file's diff beside); Enter applies it. With nothing at the cursor it
  says why, or lists the actions elsewhere in the file to jump to.
- **Generate** (`Ctrl+Alt+D G`): the project's generators (those that apply at the cursor first,
  then the ones you used recently), then a form of their inputs with a live preview beside it.
  `Ctrl+Enter` (`Cmd+Enter`) applies, `Ctrl+O` reviews the plan first. An input another
  generator can make offers `+ New …`, which adds that generator's inputs to the form.
- **The lightbulb** (`Ctrl+.`) offers the same actions and applies the chosen one at once,
  without the review window. Either way, a file you changed since the plan was made is never
  overwritten: nothing is applied, and the message says to plan again.
- **⚡ hints** mark the lines where an action applies; click one for its menu.
  `durandal.hints` or `Durandal: Toggle ⚡ Hints` turns them off.
- **Durandal: Migration Report**: how a strangler migration stands (switches, legacy code added).

Durandal appends what it offered and what you picked to `~/.cache/durandal/actions.jsonl`
(`$DURANDAL_LOG_DIR` if set; the file durandal.nvim writes), to tune where generators apply.
`durandal.actionLog` turns it off.
```
and add to "## Settings":
```markdown
- `durandal.hints`: the ⚡ hints.
- `durandal.actionLog`: the action log.
```
In `CHANGELOG.md` add at the top:
```markdown
## Unreleased

- Actions at the cursor, the generate picker with a live preview and `+ New` steps, the review
  window, ⚡ hints, the migration report and the action log (milestone 2).
- The extension activates after startup, so a project file opened in a window without the
  project starts the server (#1).
```

- [ ] **Step 4: Run everything once more**

Run: `npm run lint && OLIFANT_REPO=<checkout> npm run test:unit && OLIFANT_BIN=<bin> OLIFANT_REPO=<checkout> npm run test:e2e && npm run package`
Expected: all PASS; the `.vsix` builds.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add test/e2e/real.5-generate.e2e.ts README.md CHANGELOG.md
git commit -m "real-server generate e2e (comm → close_table, + New repository, fileActions); README and CHANGELOG"
git push -u origin m2-generators
gh pr create --base main --title "M2: generators (actions, generate with live preview, review, ⚡ hints, migration report, action log)" --body-file <scratchpad>/pr-body.md
```
The PR body: a summary; "Closes #1"; the ten decisions from Global Constraints; the manual checklist below; the attribution lines from the session's system reminder. Watch CI with one foreground `gh pr checks --watch`. Merging is the user's call.

Manual checklist for the PR (the user walks it once before merge):
- [ ] ⚡ hints look right (end of line, dim) and a click opens the menu for that line.
- [ ] Typing in a form field updates the preview's diff editor live, and it scrolls to the change.
- [ ] `Ctrl/Cmd+Enter` applies and `Ctrl+O` reviews from inside the form.
- [ ] The status bar shows the server's progress ("Generating") while a plan is made.
- [ ] The chords work on macOS with VS Code started from the Dock.
- [ ] Escape in the review window closes it and its diff tabs.
- [ ] Typing in the generator list keeps the ranked order (VS Code's quick pick does not re-sort the items).
- [ ] The lightbulb (`Ctrl+.`) on a cursor action applies and saves without the refactor preview.
- [ ] If a pack offers a snippet generator: its body expands with live tab stops (spec §12, olifant's `vim.snippet` body in VS Code).

---

## Self-review notes

- **Spec coverage.** §1 parity: actions (Task 8), generate list/form/preview/apply/`+ New` (Tasks 3, 5, 7), hints (Task 9), migration (Task 10), action log (Tasks 1, 7–9); native surfaces only (no webview anywhere). §2 kept/added/dropped: flow, form, picker rows, ui, preview sink, review model, stale check, command, virtual docs are retyped copies (Tasks 3–7); `steps[]`/`makes`/`+ New`/`needs`/`new[]`/source notes (Task 3), rank and recents (Task 3), actions, miss, snippets, log, migration (Tasks 6, 8–10); alder's `types.ts`, server diff, `origin.ts`, `entry.ts`, module/bool kinds and deletes are not ported. §3 document choice (Task 7), list ranking with the `pack` deviation (Task 3), form rows, notes, choices with `+ New`, InputBox with `why` (Tasks 3, 5, 6), live preview with seq, debounce, `-32800`, diff or new doc, counts, error disarming (Tasks 4, 5, 7), apply with the in-flight wait and merged values (Task 5), review, Back, Esc, done mode (Task 5). §4 actions, fixes first, `(asks …)`, logs, form vs direct asks, resolve, snippet, review, miss kinds, hint command (Task 8); the lightbulb path (Task 8, decision 1). §5 stale check, `applyServerEdit`, "Applied <name>: N file(s)", nothing to change, conflicts, snippets, review window with notes order and diff tabs (Tasks 4, 6). §6 hints, gating, `hinted` once, toggle (Task 9, decision 2). §7 migration (Task 10). §8 action log (Task 1, decision 3). §9 commands, keys, settings, context key, protocol types (Tasks 1, 2, 7–10). §10 unit ports, contract e2e, real e2e, manual checklist (every task, Task 11). §12 risks: the live diff fallback is in `PreviewDoc` (Task 7); the `edit` vs `files` risk is covered by the two-file landings (Tasks 6, 7, 11); the snippet body is on the manual checklist and the fake e2e proves VS Code's syntax.
- **Not in this milestone** (spec §11): `olifant/choices`, ghost text, follow-ups, Tab, the hole action beyond the lightbulb, plan-file actions, Windows paths.
- **Placeholders:** none; the two "use the name the `.d.ts` has" steps (Tasks 8, 9) are checks against the installed library with the expected names given.
