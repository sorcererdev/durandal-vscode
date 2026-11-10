# durandal-vscode M6b: the plan verbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chord on a plan row asks, validates or does that step, as in durandal.nvim. A pending mark sits on the row while the request runs, and `Plan: Cancel` stops it. The answer lands: facts are written while the plan is unchanged, an ask's lines go straight in (fingerprints stamped, one undo step), and other blocks wait beside the plan behind Accept all / Reject all. Every block's outcome goes back to the server. The chords also list a plan's files, add a step, show or fold an excerpt, tick or reopen a step, and stub or test a step. A reopened do from the review window now lands fully.

**Architecture:** The landing rules are pure modules with no `vscode` import, unit-tested with `node --test`:
- `plans/facts.ts` gains `applyLineEdits` and `span`.
- `plans/blocks.ts`: sections, `locate`, the fingerprint stamp, block rows, the replace rule, and `landing` (nvim's bottom-up write, rows moved as blocks go in).
- `plans/rows.ts`: a row followed through edits, as nvim's extmarks are.
- `plans/words.ts`: every message, verbatim from nvim.
- `plans/sourceActions.ts`: which source code action a chord uses, and what to do with it.

The VS Code glue is thin and covered by the fake-lsp e2e `fake.15-verbs` and the real `real.9-plans`:
- `plans/lineEdits.ts`: lines as one workspace edit, written as one undo step. The pause controller's copy moves here.
- `plans/here.ts`: the active plan and its cursor row.
- `plans/verbs.ts`: `PlanVerbs` owns dispatch, the running rows and their pending marks, cancel, landing, the flash and outcomes.
- `plans/prompt.ts`: the blocks beside the plan, then Accept all / Reject all.
- `plans/actions.ts`: new step, excerpt and toggle through `textDocument/codeAction`.
- `plans/steps.ts`: files, stub and test on a step.
- `landed.ts`: the landed bus. M6b fires `do`, `accept`, `stub` and `test`, and M6c adds the rest and the first listener.

`protocol.ts` types the answers. `commandTable.ts` and `package.json` build the commands and add chords. `extension.ts` wires it all and exposes `Api.planVerbs` and `Api.landed`. The pause controller's reopen calls `PlanVerbs.run`.

**Tech Stack:** as M1 to M6a: TypeScript 5.9 (`module: node16`), `vscode-languageclient` 11.0.0, `vscode-languageserver-protocol` 3.18.5, esbuild 0.28, `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp. olifant at `48f38abd7e9e7ed02b341598a4744e942392e7c4` (`.olifant-ref`, unchanged).

**Spec:** `docs/superpowers/specs/2026-11-09-m6-plans-design.md` §0, §4, §5.1 (the bus only), §5.7 (the verbs' part), §6, §8. Facts: `~/projects/notes/vscode-port/m6/m6b-plan-facts.md` (olifant 48f38ab's errand, files, stub, test and code action shapes; nvim's `ghosts.lua` and `plans.lua` verbatim; the `plans_spec.lua` fixtures; the VS Code 1.145.2 bundle on undo) and `~/projects/notes/vscode-port/m6/plans-surface.md` §1.4, §2.5–2.6. Read the spec section a task names before starting it.

**Reference code (read, do not depend on):**
- durandal.nvim at `~/projects/durandal.nvim`: `lua/durandal/ghosts.lua` (`find`/`locate`, `fingerprintable`, `stamp`, `accept_id`); `lua/durandal/plans.lua` `anchor_on` :638-654, `section_range` :347-357, `flash` :360-365, `landed` :448-496, `write_answer` :498-527, `dispatch` :609-636, `cancel` :328-345, `new_step` :671-687, `excerpt` :695-722, `toggle` :746-765, `toggle_fold` :769-773, `stub`/`test` :993-1030, `files` :1032-1048. Specs: `tests/plans_spec.lua` :723-891 (errands), :1202-1284 (stub and test in a plan).
- olifant at `~/projects/olifant-48f38ab` (detached worktree at the pin; `~/projects/olifant` is dirty on another branch, leave it alone): `src/Olifant/Lsp.hs` `errandJson` :1962-1977, `errandRequest` :1914-1960, code actions :429-458 and :1470-1590, files/stub/test :699-708, :855-890.

**Branch, PR and models:** this plan is committed to `main` first ([[everything-on-main]] in the user's memory). Execution is one PR, M6b, on branch `m6b-verbs` from `main`. M6c (the loop) gets its own plan after it merges. Suggested implementer models (the user's policy):
- Sonnet: Tasks 1, 2, 6, 7.
- Opus: Tasks 3, 4, 5 (dispatch and landing, the prompt and its rows, the code actions and folds).
- A final whole-branch review on Fable.

**Deviations from the spec, decided here** (say each in the PR body):
1. **The landed bus ships in M6b.** `src/landed.ts` is created here because M6b's verbs and steps fire `do`, `accept`, `stub` and `test` (spec §4.2, §4.4). M6c adds the TDD, conjure and review fires and the reconcile listener.
2. **One landing is one edit.** The facts and blocks are written nvim's way over the plan's lines: blocks go in bottom-up, and the rows of blocks still to write move by what went in above them. The difference is then written as one replace from the first changed row to the last. VS Code minimises the edit for the active editor (`computeMoreMinimalEdits`), and one `workspace.applyEdit` is one undo element (bundle reading in the facts file §8; `fake.15` checks `undo`). This replaces the spec's "list of TextEdits joined with the facts".
3. **The prompt's beside document is `durandal-doc:/plans/<name>/proposal-<n>.md`**, one per prompt, so two prompts on one plan never share a document. Its tab closes with the answer.
4. **`Plan: Toggle Reading` is renamed `Plan: Toggle Step`.** The verb ticks or reopens a step; "reading" is the reconcile's word.
5. **`s` and `t` in a plan run Plan: Stub and Plan: Test**, as nvim's buffer-local `<leader>ms` / `<leader>mt` do. The TDD chords' `when` excludes plans, and the spec's `p s` / `p t` are also bound.
6. **Excerpt (`p e`) toggles without asking in two cases:** the cursor is inside an excerpt (between its fence rows, by the excerpt lenses) or on a collapsed fold. nvim toggles any fold under the cursor; the spec named only collapsed folds. Inside an open excerpt, the spec's rule would ask the server and get "not on a step" (nvim `plans_spec.lua:164` toggles it).
7. **New step puts the cursor at the end of the new line.** nvim does `row + 2` (1-based, so the inserted line) then `startinsert!`. The spec's "row + 2, column 0" is nvim's 1-based row.
8. **"Not implemented yet" names the milestone:** `Durandal: Plan: Accept is not implemented yet (milestone 7)`, as spec §4.3 writes it. Every not-yet command now says its milestone.
9. **A verb on a plan that is not open opens its document** (`openTextDocument`, not shown). Only the review window's reopen does this; a chord always has its plan open. A plan closed while its verb runs drops the answer without a word (spec §6); the request is not cancelled.
10. **`Plan: Cancel` cancels the plan's verbs only.** M6c adds the running reconcile to it (spec §4.1).
11. **The plan stub's notice is M4's `stubWord`** (`stubbed <name>`, then the files saved or left unsaved). nvim says only `stubbed <name>`, but it saves silently.
12. **The standard requests the chords send are typed in `protocol.ts`** as `Lsp.codeAction` and `Lsp.codeActionResolve`. The server does not filter on `only`, so the client keeps kind `source` itself (facts §3).
13. **An ask's answer lands at once, even while the person types.** VS Code has no insert mode; nvim waits for `InsertLeave`.
14. **Facts `{from, to, lines}` are written** through M5's `factEdits`. nvim's `apply_facts` ignores them.
15. **Files with no items says `plans: no files`** (spec §4.4). nvim opens an empty location list.

## Global Constraints

- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency. Every API used must exist in 1.91.
- No file outside `src/protocol.ts` spells an `olifant/*` method string, an `olifant.*` command, or the `textDocument/codeAction` / `codeAction/resolve` method strings.
- Pure modules import nothing from `vscode`: `plans/facts.ts`, `plans/blocks.ts`, `plans/rows.ts`, `plans/words.ts`, `plans/sourceActions.ts`, `plans/reading.ts`.
- Rows are 0-based everywhere: request `line`, block `after`, fact rows, VS Code positions. The only 1-based number is a files item's `line` (a unit's line), and it is converted where the file opens.
- Message strings are durandal.nvim's, verbatim (`words.ts` holds them all): `plans: a request is already running on this line`, `plans: nothing is running`, `cancelled`, `<verb>: nothing came back`, `do: N file|files changed · to review · S s[ · $C]`, `<verb>: N lines · D not found · S s[ · $C]`, `no new step here`, `excerpt: <reason>`, `excerpt: nothing to show here`, `toggle: <reason>`, `toggle: nothing to change here`, `toggle: not on a step`, `tests: P passed · F failed · S s`, ` · plan changed, press again`. New in M6b: `<verb>: N lines in K blocks` (the prompt), `plans: no files`, and the existing `open a plan of an Olifant project first` and `VS Code did not apply the edit`.
- Numbers in messages are JavaScript's `String(n)` (nvim's `tostring`): `9.1`, `0.5`, `$0.0123`.
- Facts land only when the plan's version at landing equals its version when the request was sent; otherwise they are dropped without a word (spec §4.2 step 1).
- A landing reads the plan's lines and calls `workspace.applyEdit` with no `await` between, so typing cannot slip in. One landing is one `applyEdit` call.
- Durandal never saves a plan: plan writes leave it dirty (`applyServerEdit` already skips plans).
- After a server stop, nothing a verb said stands. Running rows, pending marks and waiting prompts are dropped, and a late answer says nothing (spec §5.7).
- No new context keys (the manifest test's known list stays as it is). No action-log events.
- Defaults mirror nvim: `durandal.plans.reviewAnswers` false.
- The working hours rule applies to execution: no agent or background work 9am–5pm America/New_York, Monday to Friday.

## Review Focus

- **Typing above the asked row while the answer is out.** The pending mark and the block follow the row (nvim's extmark), and the answer's facts are dropped because the version moved. Task 3's e2e types a line at the top during a delayed ask, checks the running row moved, then checks the block landed under the moved row and the fact did not land.
- **The plan closed (or reopened with another language) before the answer.** Nothing is written, no outcome is sent, and nothing is said. Task 3's e2e changes the plan's language mid-request (VS Code's close-and-reopen) and checks text, log and messages.
- **The server stopped while a verb runs or a prompt waits.** The pending mark goes, the late rejection says nothing, and a later Accept all writes nothing and sends nothing. Task 3's e2e restarts during a held do; Task 4's restarts while a prompt waits.
- **Blocks the plan cannot place as sent.** `after_text` matching nothing (the section's last row), a prefix, or a substring; `after` past the end (clamped); `null` blocks or lines (nothing lands, nothing breaks). Task 2's unit tests pin each.
- **A resolve against a plan that moved.** `codeAction/resolve` fails with `the plan changed since; ask again`; it is shown as an error and nothing is applied. A resolved edit whose version is stale is refused by `applyServerEdit`. Task 5's e2e pins the first.

---

### Task 1: The answers typed, reviewAnswers, the landed bus, line edits

**Files:**
- Modify: `src/protocol.ts` (errand, files and step results; `Lsp`)
- Modify: `src/plans/settings.ts` (`reviewAnswers`), `package.json` (the setting)
- Modify: `src/plans/facts.ts` (`applyLineEdits`, `span`)
- Create: `src/plans/lineEdits.ts`
- Modify: `src/pause/controller.ts` (`landReview` uses `lineEdits`)
- Create: `src/landed.ts`
- Modify: `src/commandTable.ts` (accept/reject milestone 7; `notYet` names the milestone), `src/commands.ts`
- Modify: `src/extension.ts` (`Api.landed`)
- Test: `test/unit/protocol.test.ts`, `test/unit/plansSettings.test.ts`, `test/unit/facts.test.ts`, `test/unit/manifest.test.ts`, `test/e2e/fake.3-lifecycle.e2e.ts`

**Interfaces:**
- Produces:
  - `protocol.ts`: `BlockLine { text: string; fp?: string | null }`; `Block { after?: number; after_text?: string | null; lines?: BlockLine[] | null; replace?: boolean }`; `ErrandResult { id?: string; verb?: string; facts?: Fact[] | null; blocks?: Block[] | null; dropped?: number; unresolved?: number; seconds?: number; cost?: number | null; changed?: string[] | null; review?: string | null }`; `FileItem { section: string; row: number; text: string; file?: string | null; line?: number | null }`; `FilesResult { items: FileItem[] }`; `StepResult { file?, line?, name?: string, edits?: WorkspaceEdit | null, facts?: Fact[] | null, passed?, failed?, seconds? }`; `Olifant.plansFiles: RequestType<Doc, FilesResult>`; `Lsp.codeAction: RequestType<CodeActionParams, (Command | CodeAction)[] | null>`, `Lsp.codeActionResolve: RequestType<CodeAction, CodeAction>`.
  - `PlansOptions.reviewAnswers: boolean`.
  - `facts.ts`: `applyLineEdits(lines: readonly string[], edits: readonly TextEdit0[]): string[]`; `span(before: readonly string[], after: readonly string[]): TextEdit0 | undefined`.
  - `lineEdits.ts`: `linesOf(doc): string[]`; `lineEdits(doc, edits: readonly TextEdit0[]): vscode.WorkspaceEdit`; `writeLines(doc, before, after): Promise<boolean>`; `writeFacts(doc, facts: readonly Fact[]): Promise<boolean>`.
  - `landed.ts`: `type LandedKind = 'test' | 'stub' | 'conjure' | 'do' | 'accept' | 'review'`; `class Landed { event; fired: LandedKind[]; fire(kind): void; dispose(): void }`.
  - `commandTable.ts`: `notYet(title: string, milestone: number): string`.
  - `Api.landed: Landed`.

- [ ] **Step 1: Write the failing unit tests**

In `test/unit/protocol.test.ts`, import `Lsp` alongside `Olifant` and add:

```ts
test('the standard requests the plan chords send themselves', () => {
  assert.equal(Lsp.codeAction.method, 'textDocument/codeAction');
  assert.equal(Lsp.codeActionResolve.method, 'codeAction/resolve');
  assert.equal(Olifant.plansFiles.method, 'olifant/plans/files');
});
```

In `test/unit/plansSettings.test.ts`, change the defaults assertion to `{ dir: 'plans', conceal: false, glyphs: DEFAULT_GLYPHS, foldDone: true, reviewAnswers: false }` and add:

```ts
test('reviewAnswers takes a boolean only (default false: an ask goes straight in)', () => {
  assert.equal(from({ reviewAnswers: true }).reviewAnswers, true);
  assert.equal(from({ reviewAnswers: 'yes' }).reviewAnswers, false);
});
```

In `test/unit/facts.test.ts`, import `applyLineEdits` and `span` too, and add:

```ts
test('applyLineEdits applies factEdits\' edits in their order', () => {
  const facts: Fact[] = [{ after: 0, lines: ['under title'] }, { row: 2, text: '- [x] a' }];
  assert.deepEqual(applyLineEdits(PLAN, factEdits(PLAN, facts)), ['# T', 'under title', '', '- [x] a', '- [ ] next']);
});

test('span is the one edit from the first row that differs to the last; none when equal', () => {
  assert.equal(span(['a', 'b'], ['a', 'b']), undefined);
  assert.deepEqual(span(['a', 'b', 'c'], ['a', 'x', 'b', 'c']), { start: 1, end: 1, lines: ['x'] });
  assert.deepEqual(span(['a', 'b', 'c'], ['a', 'B', 'c']), { start: 1, end: 2, lines: ['B'] });
  assert.deepEqual(span(['a', 'b', 'c', 'd'], ['A', 'b', 'c', 'D']), { start: 0, end: 4, lines: ['A', 'b', 'c', 'D'] });
  assert.deepEqual(span(['a', ''], ['a', 'x', '']), { start: 1, end: 1, lines: ['x'] });
  assert.deepEqual(span(['a'], ['a', 'x']), { start: 1, end: 1, lines: ['x'] });
  // applied, it gives AFTER
  const before = ['# T', '- a', '- b', '', '- c'];
  const after = ['# T', '- a fact', '  - early', '- b', '', '- c', '  - so'];
  assert.deepEqual(applyLineEdits(before, [span(before, after)!]), after);
});
```

In `test/unit/manifest.test.ts`, add `'durandal.plans.reviewAnswers'` to the sorted settings list in `'the settings and the activation'` (after `'durandal.plans.glyphs'`), import `notYet`, and add:

```ts
test('M6b: reviewAnswers is a boolean, false; accept and reject are milestone 7, and say so', () => {
  const props = pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>;
  assert.deepEqual([props['durandal.plans.reviewAnswers'].type, props['durandal.plans.reviewAnswers'].default], ['boolean', false]);
  assert.equal(NOT_YET['durandal.plan.accept'].milestone, 7);
  assert.equal(NOT_YET['durandal.plan.reject'].milestone, 7);
  assert.equal(notYet('Plan: Accept', 7), 'Durandal: Plan: Accept is not implemented yet (milestone 7)');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL (compile errors: `Lsp`, `applyLineEdits`, `span`, `notYet`'s second argument; then the setting).

- [ ] **Step 3: Type the answers in `src/protocol.ts`**

Add `CodeAction, CodeActionParams, Command` to the `vscode-languageserver-protocol` import. Replace the lines from `export interface ErrandResult` through `export interface StepResult …` (keep `ErrandParams`, `ReconcileParams`, `AnchorResult` as they are) so that the block reads:

```ts
// plans/ask, validate, do (Lsp.hs errandJson :1962-1977). Rows 0-based. A block's line carries
// its anchor's fingerprint (null when it did not resolve); after_text, when a string, names the
// line the block goes under, searched in the request row's section. The server sends no
// `replace`: the client infers it (a do's block whose first line is a step).
export interface BlockLine { text: string; fp?: string | null }
export interface Block { after?: number; after_text?: string | null; lines?: BlockLine[] | null; replace?: boolean }
export interface ErrandResult extends Open {
  id?: string; verb?: string; facts?: Fact[] | null; blocks?: Block[] | null; dropped?: number; unresolved?: number;
  seconds?: number; cost?: number | null; changed?: string[] | null; review?: string | null;
}
export interface ReconcileParams extends Doc { forced: boolean }
export interface AnchorResult extends Open { file?: string; line?: number; unit?: string; fingerprint?: string }
// plans/files: file absolute (null when it does not exist), line its unit's 1-based line
export interface FileItem { section: string; row: number; text: string; file?: string | null; line?: number | null }
export interface FilesResult { items: FileItem[] }
// plans/stub {file, line, name, edits, facts}; plans/test {facts, passed, failed, seconds}
export interface StepResult extends Open {
  file?: string; line?: number; name?: string; edits?: WorkspaceEdit | null; facts?: Fact[] | null;
  passed?: number; failed?: number; seconds?: number;
}
```

Change `plansFiles: req<Doc, Open>('olifant/plans/files'),` to `plansFiles: req<Doc, FilesResult>('olifant/plans/files'),`. After `METHODS`, add:

```ts
// The standard requests the plan chords send themselves (M6b): source code actions never reach
// the lightbulb, so new step, excerpt and toggle ask for them, and resolve them, by hand.
export const Lsp = {
  codeAction: req<CodeActionParams, (Command | CodeAction)[] | null>('textDocument/codeAction'),
  codeActionResolve: req<CodeAction, CodeAction>('codeAction/resolve'),
} as const;
```

If `npm run lint` then reports a use of the old `ErrandResult.facts: unknown` or `StepResult` elsewhere, it is in `src/pause/controller.ts` `redo` (left as is until Task 7: its `Array.isArray(a.changed)` still compiles).

- [ ] **Step 4: `reviewAnswers`**

In `src/plans/settings.ts`, change the header's last sentence to `reconcile (M6c) joins when it is read.`, and:

```ts
export interface PlansOptions { dir: string; conceal: boolean; glyphs: Glyphs; foldDone: boolean; reviewAnswers: boolean }
```

and in `plansOptionsFrom`'s returned object, after `foldDone`:

```ts
    // an ask's answer waits beside the plan for Accept all / Reject all, as a validate's does
    reviewAnswers: get('reviewAnswers', false) === true,
```

In `package.json` `contributes.configuration.properties`, after `durandal.plans.foldDone`:

```json
        "durandal.plans.reviewAnswers": {
          "type": "boolean",
          "default": false,
          "markdownDescription": "An ask's answer waits beside the plan for Accept all or Reject all, as a validate's does. Off: it goes straight into the plan, and one undo takes it back."
        },
```

- [ ] **Step 5: `applyLineEdits` and `span` in `src/plans/facts.ts`**

Append:

```ts
// applyLineEdits: LINES with EDITS applied in their order (factEdits' order: bottom-up, so each
// edit's rows are still those of LINES when it is applied).
export function applyLineEdits(lines: readonly string[], edits: readonly TextEdit0[]): string[] {
  const out = [...lines];
  for (const e of edits) out.splice(e.start, e.end - e.start, ...e.lines);
  return out;
}

// span: the one edit, in rows of BEFORE, that turns BEFORE into AFTER: from the first row that
// differs to the last; undefined when they are equal.
export function span(before: readonly string[], after: readonly string[]): TextEdit0 | undefined {
  let top = 0;
  while (top < before.length && top < after.length && before[top] === after[top]) top++;
  if (top === before.length && top === after.length) return undefined;
  let bottom = 0;
  while (bottom < before.length - top && bottom < after.length - top
    && before[before.length - 1 - bottom] === after[after.length - 1 - bottom]) bottom++;
  return { start: top, end: before.length - bottom, lines: after.slice(top, after.length - bottom) };
}
```

Update the file's header comment: `No vscode import: the review's facts and the plan verbs' landings use it.`

- [ ] **Step 6: `src/plans/lineEdits.ts`**

```ts
import * as vscode from 'vscode';
import type { Fact } from '../protocol';
import { applyLineEdits, factEdits, span, TextEdit0 } from './facts';

// Line edits of a plan as VS Code edits (the review's facts, the verbs' landings). A landing reads
// the lines and writes them with no await between: typing cannot slip in, and VS Code refuses an
// edit made at an older version of an open document (the extension host stamps the version).

// linesOf: a document's lines (lineAt, not split('\n'): a CRLF plan's lines without their '\r')
export const linesOf = (doc: vscode.TextDocument): string[] =>
  Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);

// lineEdits: EDITS (rows of DOC as it is now, none overlapping) as one workspace edit
export function lineEdits(doc: vscode.TextDocument, edits: readonly TextEdit0[]): vscode.WorkspaceEdit {
  const we = new vscode.WorkspaceEdit();
  const uri = doc.uri;
  const docEnd = doc.lineAt(doc.lineCount - 1).range.end;
  for (const e of edits) {
    if (e.end < doc.lineCount) {
      we.replace(uri, new vscode.Range(e.start, 0, e.end, 0), e.lines.map(l => l + '\n').join(''));
    } else if (e.lines.length === 0 && e.start > 0 && e.start < doc.lineCount) {
      // the last rows go: from the end of the row before them
      we.replace(uri, new vscode.Range(doc.lineAt(e.start - 1).range.end, docEnd), '');
    } else {
      // the edit reaches past the last line: replace to the end, no trailing newline added
      const start = e.start < doc.lineCount ? new vscode.Position(e.start, 0) : docEnd;
      we.replace(uri, new vscode.Range(start, docEnd), (e.start >= doc.lineCount ? '\n' : '') + e.lines.join('\n'));
    }
  }
  return we;
}

// writeLines: DOC's lines BEFORE (read just now) become AFTER in one edit, one undo step; true
// when it was written or there was nothing to write
export async function writeLines(doc: vscode.TextDocument, before: readonly string[], after: readonly string[]): Promise<boolean> {
  const e = span(before, after);
  if (!e) return true;
  return vscode.workspace.applyEdit(lineEdits(doc, [e]));
}

// writeFacts: the engine's facts over DOC as it is now, in one edit
export function writeFacts(doc: vscode.TextDocument, facts: readonly Fact[]): Promise<boolean> {
  const lines = linesOf(doc);
  return writeLines(doc, lines, applyLineEdits(lines, factEdits(lines, [...facts])));
}
```

In `src/pause/controller.ts` `landReview`, replace the body of `if (facts && facts.length > 0) { … }` with:

```ts
    if (facts && facts.length > 0) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(planUri));
      const edits = factEdits(linesOf(doc), facts);
      if (edits.length > 0 && !await vscode.workspace.applyEdit(lineEdits(doc, edits))) return 'VS Code did not apply the plan facts';
    }
```

and import `{ lineEdits, linesOf }` from `'../plans/lineEdits'`.

- [ ] **Step 7: The landed bus, `src/landed.ts`**

```ts
import * as vscode from 'vscode';

// The landed bus (M6 spec §5.1): something landed that the open plans should reconcile with. The
// only cross-module event in the port. M6b fires do and accept (plans/verbs.ts) and a plan step's
// stub and test (plans/steps.ts); M6c adds the TDD runs, stubs, conjures and reviews, and the
// reconcile, its first listener.
export type LandedKind = 'test' | 'stub' | 'conjure' | 'do' | 'accept' | 'review';

export class Landed implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<{ kind: LandedKind }>();
  readonly event = this.emitter.event;
  // fired: every kind fired, in order (the e2e tests read it)
  readonly fired: LandedKind[] = [];

  fire(kind: LandedKind): void {
    this.fired.push(kind);
    this.emitter.fire({ kind });
  }

  dispose(): void { this.emitter.dispose(); }
}
```

In `src/extension.ts`: import `Landed` from `'./landed'`; right after `const plans = new Plans(...)`:

```ts
  // the landed bus (M6 spec §5.1)
  const landed = new Landed();
  context.subscriptions.push(landed);
```

Add to `interface Api`, after `planView`:

```ts
  // the landed bus: what landed, in order (M6b fires do, accept, stub, test)
  landed: Landed;
```

and `landed` to the returned object.

- [ ] **Step 8: Milestone 7 and the milestone in the words**

In `src/commandTable.ts`: `'durandal.plan.accept': { title: 'Plan: Accept', milestone: 7 }`, `'durandal.plan.reject': { title: 'Plan: Reject', milestone: 7 }`, and

```ts
export const notYet = (title: string, milestone: number) => `Durandal: ${title} is not implemented yet (milestone ${milestone})`;
```

In `src/commands.ts`: `for (const [id, { title, milestone }] of …)` and `say('info', notYet(title, milestone))`.

In `test/e2e/fake.3-lifecycle.e2e.ts`, the expected text becomes `'Durandal: Plan Excerpt is not implemented yet (milestone 6)'`.

- [ ] **Step 9: Run the unit tests and lint**

Run: `npm run lint && OLIFANT_REPO=~/projects/olifant-48f38ab npm run test:unit 2>&1 | tail -8`
Expected: PASS.

Run the review e2e, which lands facts through `lineEdits` now, and the lifecycle e2e:

```bash
npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.13 node out/test/e2e/run.js 2>&1 | tail -15
DURANDAL_E2E_ONLY=fake.3 node out/test/e2e/run.js 2>&1 | tail -8
```

In the foreground, with a 15-minute timeout. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/protocol.ts src/plans/settings.ts src/plans/facts.ts src/plans/lineEdits.ts src/pause/controller.ts src/landed.ts src/commandTable.ts src/commands.ts src/extension.ts package.json test/unit/protocol.test.ts test/unit/plansSettings.test.ts test/unit/facts.test.ts test/unit/manifest.test.ts test/e2e/fake.3-lifecycle.e2e.ts
git commit -m "plans: the verbs' answers typed, reviewAnswers, the landed bus, line edits shared"
```

---

### Task 2: The landing rules (pure)

**Files:**
- Create: `src/plans/blocks.ts`, `src/plans/rows.ts`, `src/plans/words.ts`
- Test: `test/unit/blocks.test.ts`, `test/unit/rows.test.ts`, `test/unit/words.test.ts`

**Interfaces:**
- Consumes: `Block`, `ErrandResult`, `StepResult`, `FileItem` (Task 1); `TextEdit0`, `applyLineEdits` from `facts.ts` (Task 1).
- Produces:
  - `blocks.ts`: `type Verb = 'ask' | 'validate' | 'do'`; `interface Placed { index: number; row: number; replace: boolean; lines: string[] }`; `sectionRange(lines, row): { start: number; end: number }`; `findRow(lines, start, end, text): number | undefined`; `locate(lines, start, end, text): number`; `anchorEnd(line): number | undefined`; `fingerprintable(line): boolean`; `stamp(line, fp): string`; `replaces(verb, block): boolean`; `placeBlocks(lines, blocks: unknown, verb, requestRow, tracked): Placed[]`; `throughEdits(edits: readonly TextEdit0[], row): number`; `landing(lines, facts: readonly TextEdit0[], placed: readonly Placed[]): { lines: string[]; rows: number[] }`; `proposalText(placed): string`.
  - `rows.ts`: `interface LineChange { startLine: number; startChar: number; endLine: number; newLines: number }`; `shiftRow(row, c): number`; `shiftRows(row, cs: readonly LineChange[]): number`.
  - `words.ts`: `PENDING: Record<Verb, string>`; constants `RUNNING_HERE`, `NOTHING_RUNNING`, `CANCELLED_WORD`, `NO_PLAN`, `NO_FILES`, `NO_NEW_STEP`, `EXCERPT_NOTHING`, `TOGGLE_NOTHING`, `TOGGLE_NO_STEP`, `PLAN_CHANGED`, `NOT_APPLIED`; functions `nothingBack(verb)`, `doWord(r)`, `landedWord(verb, lines, r)`, `promptWord(verb, lines, blocks)`, `testsWord(r)`, `fileItem(it): { label: string; detail: string }`.

- [ ] **Step 1: Write the failing tests**

`test/unit/blocks.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorEnd, fingerprintable, landing, locate, placeBlocks, proposalText, replaces, sectionRange, stamp, throughEdits,
} from '../../src/plans/blocks';
import { applyLineEdits, factEdits } from '../../src/plans/facts';

// durandal.nvim plans_spec.lua :557 (the errands' plan)
const A = ['# T', '- a', '- b', '- c', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo'];

test('sectionRange: from the heading at or above the row to the row before the next heading', () => {
  assert.deepEqual(sectionRange(A, 3), { start: 0, end: 6 });
  assert.deepEqual(sectionRange(A, 7), { start: 7, end: 8 });
  assert.deepEqual(sectionRange(A, 8), { start: 7, end: 8 });
  assert.deepEqual(sectionRange(['- a', '- b'], 1), { start: 0, end: 1 });
  assert.deepEqual(sectionRange(['#nospace', '- a'], 1), { start: 0, end: 1 });
});

test('locate: exact after trimming, then a prefix, then a substring longer than 8; else the section\'s last row', () => {
  assert.equal(locate(A, 0, 6, '  - e target line '), 5);
  assert.equal(locate(A, 0, 6, '- e target'), 5);
  assert.equal(locate(A, 0, 6, 'target line'), 5);
  assert.equal(locate(A, 0, 6, 'target'), 6);
  assert.equal(locate(A, 0, 6, 'nowhere at all'), 6);
  assert.equal(locate(A, 0, 6, '- step'), 6, 'only inside the section');
  assert.equal(locate(['- x', '- x'], 0, 1, '- x'), 0, 'the first match');
});

test('anchorEnd: the end of the last @path:Unit not preceded by a word character', () => {
  assert.equal(anchorEnd('  - a @src/a.py:F'), 17);
  assert.equal(anchorEnd('  - a @src/a.py:F and @src/b.py:G here'), 33);
  assert.equal(anchorEnd('mail me@src/a.py:F'), undefined);
  assert.equal(anchorEnd('  - see @src/a.py:F.'), 20, 'the raw match, its dots kept');
  assert.equal(anchorEnd('no anchor'), undefined);
});

test('stamp: a fingerprintable line\'s last anchor gets " ✓ fp", replacing one that is there', () => {
  assert.equal(stamp('  - a @src/a.py:F', 'abc1234'), '  - a @src/a.py:F ✓ abc1234');
  assert.equal(stamp('  - a @src/a.py:F ✓ 1111111 later', 'abc1234'), '  - a @src/a.py:F ✓ abc1234 later');
  assert.equal(stamp('  - see @src/a.py:F.', 'abc1234'), '  - see @src/a.py:F. ✓ abc1234');
  for (const l of ['- [ ] x @src/a.py:F', '- [x] x @src/a.py:F', '  - test: t @t/a.py:T', '  - also @src/a.py:G', '  - ? why @src/a.py:F', 'plain @src/a.py:F']) {
    assert.equal(stamp(l, 'abc1234'), l, l);
  }
  assert.equal(stamp('  - no anchor', 'abc1234'), '  - no anchor');
  assert.equal(stamp('  - a @src/a.py:F', null), '  - a @src/a.py:F');
  assert.equal(fingerprintable('  - a claim'), true);
  assert.equal(fingerprintable('- [ ] step'), false);
});

test('replaces: block.replace, or a do\'s block whose first line opens a step', () => {
  assert.equal(replaces('do', { lines: [{ text: '  - [x] step' }] }), true);
  assert.equal(replaces('do', { lines: [{ text: '  - did it' }] }), false);
  assert.equal(replaces('validate', { lines: [{ text: '- [x] step' }] }), false);
  assert.equal(replaces('ask', { replace: true, lines: [] }), true);
  assert.equal(replaces('do', { lines: null }), false);
});

test('an ask straight in (plans_spec :575): facts first, then blocks bottom-up, two under one row in order', () => {
  const facts = factEdits(A, [{ row: 1, text: '- a fact' }]);
  const post = applyLineEdits(A, facts);
  const placed = placeBlocks(post, [
    { after: 3, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so' }] },
    { after: 3, lines: [{ text: '  - then' }] },
    { after: 1, lines: [{ text: '  - early' }] },
  ], 'ask', 3, throughEdits(facts, 3));
  assert.deepEqual(placed.map(p => [p.index, p.row, p.replace]), [[0, 3, false], [1, 3, false], [2, 1, false]]);
  const l = landing(A, facts, placed);
  assert.deepEqual(l.lines, ['# T', '- a fact', '  - early', '- b', '- c', '  - a @src/a.py:F ✓ abc1234', '  - so', '  - then', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo']);
  assert.deepEqual(l.rows, [4, 4, 1]);
});

test('a block after the request row lands under the tracked row; others under their after; clamped', () => {
  const placed = placeBlocks(A, [{ after: 3, lines: [{ text: '  - x' }] }, { after: 1, lines: [{ text: '  - y' }] }, { after: 99, lines: [{ text: '  - z' }] }], 'ask', 3, 5);
  assert.deepEqual(placed.map(p => p.row), [5, 1, 8]);
});

test('a validate block with after_text lands under the matching line of the request row\'s section (plans_spec :631)', () => {
  const placed = placeBlocks(A, [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }], 'validate', 2, 2);
  assert.deepEqual(placed, [{ index: 0, row: 5, replace: false, lines: ['  - ok'] }]);
  const none = placeBlocks(A, [{ after: 0, after_text: 'not here', lines: [{ text: '  - ok' }] }], 'validate', 2, 2);
  assert.equal(none[0].row, 6, 'the section\'s last row');
});

test('a do\'s step block replaces its row (plans_spec :641)', () => {
  const placed = placeBlocks(A, [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }], 'do', 8, 8);
  assert.equal(placed[0].replace, true);
  assert.deepEqual(landing(A, [], placed).lines.slice(7), ['## Next', '- [x] step @src/a.py:Foo', '  - did it']);
});

test('null or malformed blocks and lines land nothing and break nothing (plans_spec :1055)', () => {
  assert.deepEqual(placeBlocks(A, null, 'ask', 1, 1), []);
  assert.deepEqual(placeBlocks(A, 'x', 'ask', 1, 1), []);
  const p = placeBlocks(A, [null, { after: 1, after_text: null, lines: null }, { after: 2, lines: [{ text: 7 }, { text: '  - ok' }] }], 'ask', 1, 1);
  assert.deepEqual(p, [{ index: 1, row: 1, replace: false, lines: [] }, { index: 2, row: 2, replace: false, lines: ['  - ok'] }]);
  assert.deepEqual(landing(A, [], p).lines, [...A.slice(0, 3), '  - ok', ...A.slice(3)]);
});

test('throughEdits: a row moved by the facts above it; a replaced row is its edit\'s first', () => {
  const facts = factEdits(A, [{ after: 0, lines: ['x', 'y'] }, { row: 5, text: 'E' }, { from: 6, to: 7, lines: ['F'] }]);
  assert.equal(throughEdits(facts, 0), 0);
  assert.equal(throughEdits(facts, 3), 5);
  assert.equal(throughEdits(facts, 5), 7);
  assert.equal(throughEdits(facts, 7), 8);
  assert.equal(throughEdits(facts, 8), 9);
});

test('proposalText: the blocks\' lines in order, a blank line between blocks', () => {
  assert.equal(proposalText([
    { index: 0, row: 1, replace: false, lines: ['  - a', '  - b'] },
    { index: 1, row: 3, replace: true, lines: ['- [x] s'] },
  ]), '  - a\n  - b\n\n- [x] s\n');
});
```

`test/unit/rows.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftRow, shiftRows } from '../../src/plans/rows';

const ins = (line: number, char: number, newLines: number) => ({ startLine: line, startChar: char, endLine: line, newLines });

test('a row above a change stays; below it moves by the lines added or taken', () => {
  assert.equal(shiftRow(2, ins(5, 0, 1)), 2);
  assert.equal(shiftRow(5, ins(1, 3, 2)), 7);
  assert.equal(shiftRow(5, { startLine: 1, startChar: 0, endLine: 3, newLines: 0 }), 3);
});

test('a line typed before the row (column 0) pushes it down; typed inside it, it stays', () => {
  assert.equal(shiftRow(3, ins(3, 0, 1)), 4);
  assert.equal(shiftRow(3, ins(3, 4, 1)), 3);
  assert.equal(shiftRow(3, ins(3, 0, 0)), 3);
});

test('a row inside a replaced range goes to the range\'s first row', () => {
  assert.equal(shiftRow(4, { startLine: 2, startChar: 1, endLine: 6, newLines: 0 }), 2);
  assert.equal(shiftRow(6, { startLine: 2, startChar: 1, endLine: 6, newLines: 1 }), 2);
});

test('shiftRows applies the changes in their order', () => {
  assert.equal(shiftRows(3, [ins(0, 0, 1), ins(0, 0, 1)]), 5);
  assert.equal(shiftRows(3, []), 3);
});
```

`test/unit/words.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doWord, fileItem, landedWord, nothingBack, PENDING, promptWord, testsWord } from '../../src/plans/words';

test('the do and landing notices, verbatim from durandal.nvim (plans.lua landed)', () => {
  assert.equal(doWord({ changed: ['/p/a.py'], seconds: 42 }), 'do: 1 file changed · to review · 42 s');
  assert.equal(doWord({ changed: ['a', 'b'], seconds: 9.1, cost: 0.5 }), 'do: 2 files changed · to review · 9.1 s · $0.5');
  assert.equal(doWord({}), 'do: 0 files changed · to review · 0 s');
  assert.equal(landedWord('ask', 2, { dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123 }), 'ask: 2 lines · 1 not found · 9.1 s · $0.0123');
  assert.equal(landedWord('validate', 1, { dropped: 0, unresolved: 2, seconds: 1, cost: null }), 'validate: 1 lines · 2 not found · 1 s');
  assert.equal(nothingBack('do'), 'do: nothing came back');
  assert.deepEqual(PENDING, { ask: ' ⋯ asking', validate: ' ⋯ validating', do: ' ⋯ doing' });
});

test('the prompt, the tests notice and a files item', () => {
  assert.equal(promptWord('validate', 3, 2), 'validate: 3 lines in 2 blocks');
  assert.equal(testsWord({ passed: 2, failed: 1, seconds: 0.5 }), 'tests: 2 passed · 1 failed · 0.5 s');
  assert.equal(testsWord({}), 'tests: 0 passed · 0 failed · 0 s');
  assert.deepEqual(fileItem({ section: 'T', row: 1, text: '- a', file: null, line: null }), { label: 'T · - a', detail: 'line 2' });
  assert.deepEqual(fileItem({ section: 'Next', row: 8, text: '- [ ] step', file: '/p/src/a.py', line: 12 }), { label: 'Next · - [ ] step', detail: '/p/src/a.py:12' });
  assert.deepEqual(fileItem({ section: 'Next', row: 8, text: 's', file: '/p/src/a.py' }), { label: 'Next · s', detail: '/p/src/a.py:1' });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit 2>&1 | tail -10`
Expected: FAIL (the modules do not exist).

- [ ] **Step 3: `src/plans/rows.ts`**

```ts
// rows: a plan row followed through the document's edits, as durandal.nvim's extmarks follow
// theirs (a running verb's row, a waiting block's row). No vscode import.

// LineChange: one content change: its range's rows (from startLine at startChar to endLine)
// replaced by text holding newLines line breaks.
export interface LineChange { startLine: number; startChar: number; endLine: number; newLines: number }

// shiftRow: ROW after C. Above the change: the same. Below it: moved by the lines it added or
// took. On its first row: the same, unless the change is an insert at column 0 of that row (a
// line typed before the row pushes it down). Inside it: the change's first row.
export function shiftRow(row: number, c: LineChange): number {
  if (row < c.startLine) return row;
  if (row > c.endLine) return row + c.newLines - (c.endLine - c.startLine);
  if (row === c.startLine && c.startLine === c.endLine && c.startChar === 0) return row + c.newLines;
  return c.startLine;
}

// shiftRows: ROW after CS, in their order (VS Code orders one event's changes so that applying
// them one after another is right)
export const shiftRows = (row: number, cs: readonly LineChange[]): number => cs.reduce(shiftRow, row);
```

- [ ] **Step 4: `src/plans/blocks.ts`**

```ts
// The blocks of an errand's answer (durandal.nvim ghosts.lua and plans.lua landed): where each
// goes, what it writes, and the plan's lines once the facts and the blocks are in. No vscode
// import. Rows are 0-based rows of the lines given.
import type { Block } from '../protocol';
import { applyLineEdits, TextEdit0 } from './facts';

export type Verb = 'ask' | 'validate' | 'do';

// Placed: a block at its row: its lines (fingerprints stamped) go under ROW, or replace it.
// index: the block's place in the answer (its outcome names it).
export interface Placed { index: number; row: number; replace: boolean; lines: string[] }

const HEADING = /^#+\s/;

// sectionRange: the rows of the section holding ROW: from its heading (at or above) to the row
// before the next heading; the whole plan when there is none (plans.lua section_range)
export function sectionRange(lines: readonly string[], row: number): { start: number; end: number } {
  let start = 0;
  let end = lines.length - 1;
  for (let i = Math.min(row, lines.length - 1); i >= 0; i--) {
    if (HEADING.test(lines[i])) {
      start = i;
      break;
    }
  }
  for (let i = row + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  return { start, end: Math.max(end, start) };
}

// findRow: the first row in START..END whose text is TEXT (both trimmed), else the first that
// starts with it, else (TEXT longer than 8) the first that holds it (ghosts.lua find)
export function findRow(lines: readonly string[], start: number, end: number, text: string): number | undefined {
  const rows = lines.slice(start, end + 1);
  const want = text.trim();
  let i = rows.findIndex(l => l.trim() === want);
  if (i < 0 && want !== '') i = rows.findIndex(l => l.trim().startsWith(want));
  if (i < 0 && want.length > 8) i = rows.findIndex(l => l.includes(want));
  return i < 0 ? undefined : start + i;
}

// locate: findRow, else the section's last row (ghosts.lua locate)
export const locate = (lines: readonly string[], start: number, end: number, text: string): number =>
  findRow(lines, start, end, text) ?? end;

const ANCHOR = /@([A-Za-z0-9_.\-/]+):([A-Za-z0-9_.]+)/g;

// anchorEnd: the column just past the line's last @path:Unit (its raw match, a unit's trailing
// dots kept); one preceded by a word character is no anchor (plans.lua anchor_on)
export function anchorEnd(line: string): number | undefined {
  let end: number | undefined;
  let from = 0;
  for (;;) {
    ANCHOR.lastIndex = from;
    const m = ANCHOR.exec(line);
    if (!m) return end;
    if (m.index > 0 && /[A-Za-z0-9_]/.test(line[m.index - 1])) {
      from = m.index + 1;
      continue;
    }
    end = m.index + m[0].length;
    from = end;
  }
}

const NOT_FINGERPRINTED = ['- test: ', '- also @', '- ? ', '- [ ] ', '- [x] '];

// fingerprintable: a claim or evidence line (a "- " line of none of the other kinds)
export function fingerprintable(line: string): boolean {
  const body = line.replace(/^\s*/, '');
  return body.startsWith('- ') && !NOT_FINGERPRINTED.some(p => body.startsWith(p));
}

// stamp: " ✓ FP" after a fingerprintable line's last anchor, replacing a stamp there (ghosts.lua stamp)
export function stamp(line: string, fp: string | null | undefined): string {
  if (typeof fp !== 'string' || !fingerprintable(line)) return line;
  const e = anchorEnd(line);
  if (e === undefined) return line;
  const rest = line.slice(e).replace(/^ ✓ [0-9A-Fa-f]{7}/, '');
  return `${line.slice(0, e)} ✓ ${fp}${rest}`;
}

// replaces: a block replaces its row when it says so, or when a do's block opens with a step
// (the server never says so: plans.lua landed infers it)
export function replaces(verb: Verb, block: Block): boolean {
  if (block.replace === true) return true;
  const first = Array.isArray(block.lines) ? block.lines[0]?.text : undefined;
  return verb === 'do' && typeof first === 'string' && first.trim().startsWith('- [');
}

// placeBlocks: the answer's blocks at their rows in LINES (the plan now, its facts written). A
// block with after_text goes under the line it names in the section of TRACKED (the request
// row where it is now), else under that section's last row; one after the request row goes
// under TRACKED; any other under its after. Rows are clamped to the plan. Blocks that are not
// objects are skipped; lines that are not a list, or a line without text, write nothing.
export function placeBlocks(lines: readonly string[], blocks: unknown, verb: Verb, requestRow: number, tracked: number): Placed[] {
  if (!Array.isArray(blocks)) return [];
  const last = Math.max(lines.length - 1, 0);
  const out: Placed[] = [];
  blocks.forEach((b: unknown, index) => {
    if (typeof b !== 'object' || b === null) return;
    const block = b as Block;
    let row: number;
    if (typeof block.after_text === 'string') {
      const s = sectionRange(lines, tracked);
      row = locate(lines, s.start, s.end, block.after_text);
    } else if (block.after === requestRow || typeof block.after !== 'number') {
      row = tracked;
    } else {
      row = block.after;
    }
    const given = Array.isArray(block.lines) ? block.lines : [];
    const texts = given.filter(l => typeof l === 'object' && l !== null && typeof l.text === 'string');
    out.push({ index, row: Math.max(0, Math.min(row, last)), replace: replaces(verb, block), lines: texts.map(l => stamp(l.text, l.fp)) });
  });
  return out;
}

// throughEdits: where row ROW is once EDITS (factEdits') are applied; a row an edit replaces is
// that edit's first row
export function throughEdits(edits: readonly TextEdit0[], row: number): number {
  const inside = edits.find(e => e.start <= row && row < e.end);
  const at = inside ? inside.start : row;
  let r = at;
  for (const e of edits) if (e.end <= at) r += e.lines.length - (e.end - e.start);
  return r;
}

// landing: LINES with FACTS (factEdits') and then the PLACED blocks written (their rows are rows
// of the plan with the facts in), durandal.nvim's way: from the last block to the first, each
// under its row or over it, and the rows of the other blocks below it moved by what went in;
// so blocks under one row keep the answer's order. rows: each block's row in the result.
export function landing(lines: readonly string[], facts: readonly TextEdit0[], placed: readonly Placed[]): { lines: string[]; rows: number[] } {
  const out = applyLineEdits(lines, facts);
  const rows = placed.map(p => p.row);
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    const r = rows[i];
    if (p.lines.length === 0) continue;
    if (p.replace) out.splice(r, 1, ...p.lines);
    else out.splice(r + 1, 0, ...p.lines);
    const added = p.replace ? p.lines.length - 1 : p.lines.length;
    for (let j = 0; j < rows.length; j++) if (j !== i && rows[j] > r) rows[j] += added;
  }
  return { lines: out, rows };
}

// proposalText: the blocks' lines in order, a blank line between blocks (the prompt's document)
export const proposalText = (placed: readonly Placed[]): string => placed.map(p => p.lines.join('\n')).join('\n\n') + '\n';
```

- [ ] **Step 5: `src/plans/words.ts`**

```ts
// The plan verbs' words, durandal.nvim's verbatim (plans.lua, ghosts.lua). No vscode import.
import type { ErrandResult, FileItem, StepResult } from '../protocol';
import type { Verb } from './blocks';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const cost = (r: ErrandResult): string => (typeof r.cost === 'number' ? ` · $${r.cost}` : '');

// the pending mark at a running row's end
export const PENDING: Record<Verb, string> = { ask: ' ⋯ asking', validate: ' ⋯ validating', do: ' ⋯ doing' };

export const RUNNING_HERE = 'plans: a request is already running on this line';
export const NOTHING_RUNNING = 'plans: nothing is running';
export const CANCELLED_WORD = 'cancelled';
export const NO_PLAN = 'open a plan of an Olifant project first';
export const NO_FILES = 'plans: no files';
export const NO_NEW_STEP = 'no new step here';
export const EXCERPT_NOTHING = 'excerpt: nothing to show here';
export const TOGGLE_NOTHING = 'toggle: nothing to change here';
export const TOGGLE_NO_STEP = 'toggle: not on a step';
export const PLAN_CHANGED = ' · plan changed, press again';
export const NOT_APPLIED = 'VS Code did not apply the edit';

export const nothingBack = (verb: Verb): string => `${verb}: nothing came back`;

// doWord: a do that ends in a review (a git project)
export function doWord(r: ErrandResult): string {
  const n = Array.isArray(r.changed) ? r.changed.length : 0;
  return `do: ${n} ${n === 1 ? 'file' : 'files'} changed · to review · ${num(r.seconds)} s${cost(r)}`;
}

// landedWord: any other landing; LINES the blocks' lines, not found the dropped and unresolved
export const landedWord = (verb: Verb, lines: number, r: ErrandResult): string =>
  `${verb}: ${lines} lines · ${num(r.dropped) + num(r.unresolved)} not found · ${num(r.seconds)} s${cost(r)}`;

// promptWord: the blocks waiting beside the plan
export const promptWord = (verb: Verb, lines: number, blocks: number): string => `${verb}: ${lines} lines in ${blocks} blocks`;

export const testsWord = (r: StepResult): string =>
  `tests: ${num(r.passed)} passed · ${num(r.failed)} failed · ${num(r.seconds)} s`;

// fileItem: a files answer's item in the pick: "section · text", and where it opens
export function fileItem(it: FileItem): { label: string; detail: string } {
  const detail = typeof it.file === 'string' ? `${it.file}:${typeof it.line === 'number' ? it.line : 1}` : `line ${it.row + 1}`;
  return { label: `${it.section} · ${it.text}`, detail };
}
```

- [ ] **Step 6: Run the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -8`
Expected: PASS. If `anchorEnd`'s expected columns disagree, count the characters of the test string again before changing the code: the result is the index just past the match.

- [ ] **Step 7: Commit**

```bash
git add src/plans/blocks.ts src/plans/rows.ts src/plans/words.ts test/unit/blocks.test.ts test/unit/rows.test.ts test/unit/words.test.ts
git commit -m "plans: the landing rules: sections, locate, stamps, block rows, rows through edits, the words"
```

---

### Task 3: Ask, validate and do: dispatch, pending, cancel, landing

**Files:**
- Create: `src/plans/here.ts`, `src/plans/verbs.ts`
- Modify: `src/commandTable.ts` (ask, validate, do, cancel built), `package.json` (their commands)
- Modify: `src/extension.ts` (`PlanVerbs`, `Api.planVerbs`, `hooks.stopped`)
- Test: `test/unit/manifest.test.ts`, create `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: Task 1's `ErrandResult`, `Olifant.plansAsk/Validate/Do/Outcome`, `linesOf`, `writeLines`, `Landed`, `PlansOptions.reviewAnswers`; Task 2's `placeBlocks`, `landing`, `throughEdits`, `Placed`, `Verb`, `shiftRows`, `LineChange`, the words; M6a's `PlanDocs`, `factEdits`, `applyLineEdits`.
- Produces:
  - `here.ts`: `interface PlanHere { editor: vscode.TextEditor; uri: string; row: number }`; `planHere(docs: PlanDocs): Promise<PlanHere | undefined>`.
  - `verbs.ts`: `interface VerbsDeps { server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; planDocs: PlanDocs; options: () => PlansOptions; landed: Landed }`; `interface PlanVerbsApi { running(uri: string): { row: number; verb: Verb }[]; flashes: { uri: string; row: number }[]; waiting(uri: string): { row: number; lines: string[] }[] }`; `class PlanVerbs { register(context); command(verb: Verb): Promise<void>; run(uri: string, verb: Verb, row: number, params?: { resume?: string; text?: string }): Promise<void>; cancel(): void; stopped(): void; api(): PlanVerbsApi }`. Task 4 adds `prompt`; Task 7's reopen calls `run`.
  - `Api.planVerbs: PlanVerbsApi`.

- [ ] **Step 1: Write the failing manifest test**

In `test/unit/manifest.test.ts`:

```ts
test('M6b: ask, validate, do and cancel are built; Plan: Cancel is palette-only', () => {
  for (const id of ['durandal.plan.ask', 'durandal.plan.validate', 'durandal.plan.do', 'durandal.plan.cancel']) {
    assert.ok(id in BUILT && !(id in NOT_YET), id);
  }
  assert.equal(BUILT['durandal.plan.cancel'].title, 'Plan: Cancel');
  assert.ok(!KEYS.some(k => k.command === 'durandal.plan.cancel'));
});
```

Run: `npm run test:unit 2>&1 | tail -5`. Expected: FAIL.

- [ ] **Step 2: The commands**

In `src/commandTable.ts`, remove `durandal.plan.ask`, `.validate` and `.do` from `NOT_YET` and add to `BUILT`, after `'durandal.plan.review'`:

```ts
  'durandal.plan.ask': { title: 'Plan: Ask' },
  'durandal.plan.validate': { title: 'Plan: Validate' },
  'durandal.plan.do': { title: 'Plan: Do' },
  'durandal.plan.cancel': { title: 'Plan: Cancel' },
```

In `package.json` `contributes.commands`, add:

```json
      {
        "command": "durandal.plan.cancel",
        "title": "Plan: Cancel",
        "category": "Durandal"
      },
```

(The three others are contributed already with these titles.)

- [ ] **Step 3: `src/plans/here.ts`**

```ts
import * as vscode from 'vscode';
import type { PlanDocs } from './planDocs';

// PlanHere: the active editor when it shows a plan, and its cursor's row
export interface PlanHere { editor: vscode.TextEditor; uri: string; row: number }

export async function planHere(docs: PlanDocs): Promise<PlanHere | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !(await docs.is(editor.document))) return undefined;
  return { editor, uri: editor.document.uri.toString(), row: editor.selection.active.line };
}
```

- [ ] **Step 4: `src/plans/verbs.ts`**

```ts
import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { ErrandParams, ErrandResult, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { CANCELLED } from '../tdd/flights';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { landing, Placed, placeBlocks, throughEdits, Verb } from './blocks';
import { applyLineEdits, factEdits } from './facts';
import { planHere } from './here';
import { linesOf, writeLines } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { LineChange, shiftRows } from './rows';
import type { PlansOptions } from './settings';
import {
  CANCELLED_WORD, doWord, landedWord, NO_PLAN, NOT_APPLIED, NOTHING_RUNNING, nothingBack, PENDING, RUNNING_HERE,
} from './words';

export interface VerbsDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; planDocs: PlanDocs;
  options: () => PlansOptions; landed: Landed;
}

export interface PlanVerbsApi {
  // the verbs in the air on a plan, at their rows as they are now
  running(uri: string): { row: number; verb: Verb }[];
  // each landing's flashed row
  flashes: { uri: string; row: number }[];
  // the blocks a prompt holds on a plan, at their rows as they are now (Task 4)
  waiting(uri: string): { row: number; lines: string[] }[];
}

// Entry: a verb in the air. row follows the edits (nvim's extmark); request is the row sent; tick
// the plan's version then; gone: its answer is not wanted any more (cancelled, plan closed,
// server stopped).
interface Entry { uri: string; verb: Verb; row: number; request: number; tick: number; cts: vscode.CancellationTokenSource; gone: boolean }

// Wait: blocks a prompt holds; their rows follow the edits. gen: the server start they came from.
interface Wait { uri: string; placed: Placed[]; gen: number }

const REQUEST = { ask: Olifant.plansAsk, validate: Olifant.plansValidate, do: Olifant.plansDo } as const;
const FLASH_MS = 300;

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === keyOf(uri));

// PlanVerbs: ask, validate and do on a plan row (durandal.nvim plans.lua dispatch, landed,
// cancel; M6 spec §4.1-4.2). One request per row; the row shows a pending mark while it runs.
// The answer lands in nvim's order: facts (only at the version asked), a do's review notice,
// blocks (an ask's straight in, the others held for the prompt), the notice, a flash.
export class PlanVerbs {
  private readonly entries = new Set<Entry>();
  private readonly waits = new Set<Wait>();
  // gen: bumped by every server stop; a prompt from an older start does nothing when answered
  private gen = 0;
  private readonly flashes: { uri: string; row: number }[] = [];
  private readonly pending = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground') },
  });
  private readonly flash = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });

  constructor(private readonly d: VerbsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.pending,
      this.flash,
      vscode.commands.registerCommand('durandal.plan.ask', () => this.command('ask')),
      vscode.commands.registerCommand('durandal.plan.validate', () => this.command('validate')),
      vscode.commands.registerCommand('durandal.plan.do', () => this.command('do')),
      vscode.commands.registerCommand('durandal.plan.cancel', () => this.cancel()),
      vscode.workspace.onDidChangeTextDocument(e => this.moved(e)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()),
    );
  }

  api(): PlanVerbsApi {
    return {
      running: uri => [...this.entries].filter(e => e.uri === keyOf(uri)).map(e => ({ row: e.row, verb: e.verb })),
      flashes: this.flashes,
      waiting: uri => [...this.waits].filter(w => w.uri === keyOf(uri)).flatMap(w => w.placed.map(p => ({ row: p.row, lines: p.lines }))),
    };
  }

  // command: the verb on the active plan's cursor row
  async command(verb: Verb): Promise<void> {
    const h = await planHere(this.d.planDocs);
    if (!h) {
      void this.d.say('error', NO_PLAN);
      return;
    }
    await this.run(h.uri, verb, h.row);
  }

  // run: VERB on ROW of the plan URI, its answer landed; PARAMS a reopen's resume and text. A
  // plan that is not open is opened (not shown): the review window's reopen names one.
  async run(uri: string, verb: Verb, row: number, params: { resume?: string; text?: string } = {}): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    let doc = openDoc(uri);
    if (!doc) {
      try {
        doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      } catch (err) {
        void this.d.say('error', errorMessage(err));
        return;
      }
    }
    const key = doc.uri.toString();
    if ([...this.entries].some(e => e.uri === key && e.row === row)) {
      void this.d.say('warn', RUNNING_HERE);
      return;
    }
    const e: Entry = { uri: key, verb, row, request: row, tick: doc.version, cts: new vscode.CancellationTokenSource(), gone: false };
    this.entries.add(e);
    this.paint(key);
    const p: ErrandParams = { textDocument: { uri: key }, line: row, ...params };
    try {
      let r: ErrandResult | null;
      try {
        r = await this.d.server.request(REQUEST[verb], p, e.cts.token);
      } catch (err) {
        if (e.gone) return;
        if ((err as { code?: unknown } | null)?.code === CANCELLED) void this.d.say('info', CANCELLED_WORD);
        else void this.d.say('error', errorMessage(err));
        return;
      }
      if (e.gone) return;
      if (!r) {
        void this.d.say('info', nothingBack(verb));
        return;
      }
      // the entry stays in the air while it lands: the facts' own edit moves its row
      await this.land(e, r);
    } finally {
      this.drop(e);
    }
  }

  // land: R for entry E (plans.lua landed)
  private async land(e: Entry, r: ErrandResult): Promise<void> {
    const doc = openDoc(e.uri);
    if (!doc) return;
    // read, compute and write with no await between
    const lines = linesOf(doc);
    const facts = doc.version === e.tick && Array.isArray(r.facts) ? factEdits(lines, r.facts) : [];
    if (e.verb === 'do' && typeof r.review === 'string') {
      // a git project's do: its lines are its review's (opened by review/ready), its files are
      // reloaded by VS Code itself
      await writeLines(doc, lines, applyLineEdits(lines, facts));
      void this.d.say('info', doWord(r));
      this.d.landed.fire('do');
      return;
    }
    let placed: Placed[];
    let rows: number[];
    const straight = e.verb === 'ask' && !this.d.options().reviewAnswers;
    if (straight) {
      // an ask's answer goes straight in: facts and blocks in one edit, one undo step
      placed = placeBlocks(applyLineEdits(lines, facts), r.blocks, e.verb, e.request, throughEdits(facts, e.row));
      const l = landing(lines, facts, placed);
      if (!(await writeLines(doc, lines, l.lines))) {
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      rows = l.rows;
      if (placed.length > 0) {
        this.outcomes(e.uri, r.id, placed, 'accepted');
        this.d.landed.fire('accept');
      }
    } else {
      // the facts now; the blocks wait for the prompt, placed on the plan as the facts left it
      if (facts.length > 0) await writeLines(doc, lines, applyLineEdits(lines, facts));
      placed = placeBlocks(linesOf(doc), r.blocks, e.verb, e.request, e.row);
      rows = placed.map(p => p.row);
    }
    const count = placed.reduce((k, p) => k + p.lines.length, 0);
    void this.d.say('info', landedWord(e.verb, count, r));
    this.flashRow(doc, rows.at(-1) ?? e.row);
    if (e.verb === 'do') this.d.landed.fire('do');
    // until the prompt (Task 4), held blocks stay unanswered, as a dismissed prompt leaves them
  }

  // outcomes: each placed block's outcome, to the server, against the answer's id
  private outcomes(uri: string, id: unknown, placed: readonly Placed[], outcome: 'accepted' | 'rejected'): void {
    if (typeof id !== 'string' || !this.d.server.client()) return;
    for (const p of placed) {
      this.d.server.notify(Olifant.plansOutcome, { textDocument: { uri }, id, block: p.index, outcome }).catch(() => undefined);
    }
  }

  // cancel: every verb in the air on the active plan (plans.lua cancel); M6c adds its reconcile
  cancel(): void {
    const uri = vscode.window.activeTextEditor?.document.uri.toString();
    const mine = [...this.entries].filter(e => e.uri === uri);
    if (mine.length === 0) {
      void this.d.say('info', NOTHING_RUNNING);
      return;
    }
    for (const e of mine) {
      e.gone = true;
      e.cts.cancel();
      this.drop(e);
    }
    void this.d.say('info', CANCELLED_WORD);
  }

  // the server stopped: nothing it said stands (spec §5.7)
  stopped(): void {
    this.gen++;
    for (const e of [...this.entries]) {
      e.gone = true;
      this.drop(e);
    }
    this.waits.clear();
    this.paintAll();
  }

  // a closed plan's verbs land nothing and say nothing; its waiting blocks are dropped
  private closed(uri: string): void {
    for (const e of [...this.entries]) {
      if (e.uri !== uri) continue;
      e.gone = true;
      this.drop(e);
    }
    for (const w of [...this.waits]) if (w.uri === uri) this.waits.delete(w);
  }

  private drop(e: Entry): void {
    if (!this.entries.delete(e)) return;
    e.cts.dispose();
    this.paint(e.uri);
  }

  // moved: the rows in the air and the waiting blocks' rows follow the plan's edits
  private moved(ev: vscode.TextDocumentChangeEvent): void {
    if (ev.contentChanges.length === 0) return;
    const uri = ev.document.uri.toString();
    const cs: LineChange[] = ev.contentChanges.map(c => ({
      startLine: c.range.start.line, startChar: c.range.start.character, endLine: c.range.end.line,
      newLines: c.text.split('\n').length - 1,
    }));
    let any = false;
    for (const e of this.entries) {
      if (e.uri !== uri) continue;
      e.row = shiftRows(e.row, cs);
      any = true;
    }
    for (const w of this.waits) if (w.uri === uri) for (const p of w.placed) p.row = shiftRows(p.row, cs);
    if (any) this.paint(uri);
  }

  // paint: the pending marks at the end of the running rows, in every editor on URI
  private paint(uri: string): void {
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  private paintAll(): void {
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    ed.setDecorations(this.pending, [...this.entries].filter(e => e.uri === uri && e.row < doc.lineCount).map(e => {
      const end = doc.lineAt(e.row).range.end;
      return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: PENDING[e.verb] } } };
    }));
  }

  // flashRow: the landed row for 300 ms (plans.lua flash)
  private flashRow(doc: vscode.TextDocument, row: number): void {
    if (row < 0 || row >= doc.lineCount) return;
    const uri = doc.uri.toString();
    this.flashes.push({ uri, row });
    const eds = vscode.window.visibleTextEditors.filter(ed => ed.document.uri.toString() === uri);
    const range = new vscode.Range(row, 0, row, 0);
    for (const ed of eds) ed.setDecorations(this.flash, [range]);
    setTimeout(() => { for (const ed of eds) ed.setDecorations(this.flash, []); }, FLASH_MS);
  }
}
```

`Wait`, `waits` and `gen` are used by `stopped`, `closed`, `moved` and `api` now; Task 4 adds the prompt that fills `waits`.

- [ ] **Step 5: Wire it in `src/extension.ts`**

Import `PlanVerbs, PlanVerbsApi` from `'./plans/verbs'`. After `layer.register(context); hooks.reading = layer;`:

```ts
  // the plan verbs (M6 spec §4)
  const verbs = new PlanVerbs({ server: s, say, ui, docs, planDocs, options: () => plansOptions, landed });
  verbs.register(context);
```

In `hooks.stopped`, after `layer.stopped();`, add `verbs.stopped();`. Add to `interface Api`, after `landed`:

```ts
  // the plan verbs (M6b): the rows in the air, the flashes, the blocks waiting
  planVerbs: PlanVerbsApi;
```

and `planVerbs: verbs.api()` to the returned object.

- [ ] **Step 6: Write the e2e `test/e2e/fake.15-verbs.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { api, docOf, file, log, open, reply, restart, revert, running, settle, sleep, until } from './helpers';

// The plan verbs over the fake server (M6 spec §4, §8): dispatch, pending rows, cancel, landing,
// the prompt, new step / excerpt / toggle, files, stub and test.
const PLAN = 'one/plans/v.md';
// durandal.nvim plans_spec.lua :557
const LINES = ['# T', '- a', '- b', '- c', '- d', '- e target line', '- f', '## Next', '- [ ] step @src/a.py:Foo'];
const TEXT = LINES.join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const sent = (method: string) => log().filter(m => m.method === method);
const REPLIES = [
  'olifant/plans/ask', 'olifant/plans/validate', 'olifant/plans/do', 'olifant/plans/files', 'olifant/plans/stub',
  'olifant/plans/test', 'textDocument/codeAction', 'codeAction/resolve', 'textDocument/foldingRange', 'textDocument/codeLens',
];
const lines = () => docOf(PLAN)!.getText().split('\n');

// at: the plan open and active, the cursor on ROW, durandal.isPlan known
async function at(row: number, rel = PLAN): Promise<vscode.TextEditor> {
  const a = await running();
  const ed = await open(file(rel));
  const p = new vscode.Position(row, 0);
  ed.selection = new vscode.Selection(p, p);
  await until(() => a.isPlan(), 'durandal.isPlan');
  return ed;
}

describe('the plan verbs (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(PLAN, TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, null);
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    for (const m of REPLIES) reply(m, null);
    const d = docOf(PLAN);
    if (d?.isDirty) await revert(d);
    await settle(PLAN, TEXT);
  });

  it('an ask goes straight in: facts and blocks, fingerprints stamped, outcomes accepted, one undo (plans_spec :575)', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      id: 'S1', verb: 'ask', facts: [{ row: 1, text: '- a fact' }],
      blocks: [
        { after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] },
        { after: 3, after_text: null, lines: [{ text: '  - then', fp: null }] },
        { after: 1, after_text: null, lines: [{ text: '  - early', fp: null }] },
      ],
      dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
    });
    const outcomes = sent('olifant/plans/outcome').length;
    await at(3);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.deepEqual(sent('olifant/plans/ask').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 3 });
    assert.deepEqual(lines().slice(0, 9), ['# T', '- a fact', '  - early', '- b', '- c', '  - a @src/a.py:F ✓ abc1234', '  - so', '  - then', '- d']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 3, 'three outcomes');
    const os = sent('olifant/plans/outcome').slice(outcomes).map(m => m.params);
    assert.deepEqual(os.map(p => [p.id, p.block, p.outcome]).sort(), [['S1', 0, 'accepted'], ['S1', 1, 'accepted'], ['S1', 2, 'accepted']]);
    assert.ok(os.every(p => p.textDocument.uri === uriOf(PLAN)));
    assert.equal(a.landed.fired.at(-1), 'accept');
    assert.equal(a.shown.at(-1)!.text, 'ask: 4 lines · 0 not found · 1 s');
    assert.ok(a.planVerbs.flashes.some(f => f.uri === uriOf(PLAN) && f.row === 1));
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a RequestFailed shows the reason and leaves the plan alone; an empty answer says so', async () => {
    const a = await running();
    reply('olifant/plans/ask', { lsp_error: 'claude exited 2: no credentials' });
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['error', 'claude exited 2: no credentials']);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    reply('olifant/plans/ask', null);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.equal(a.shown.at(-1)!.text, 'ask: nothing came back');
  });

  it('a second verb on a running row is refused; Plan: Cancel cancels it; nothing running says so', async () => {
    const a = await running();
    reply('olifant/plans/do', { hold: true, title: 'doing' });
    await at(8);
    const n = sent('olifant/plans/do').length;
    const cancels = sent('$/cancelRequest').length;
    void vscode.commands.executeCommand('durandal.plan.do');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the do in the air');
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), [{ row: 8, verb: 'do' }]);
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.equal(a.shown.at(-1)!.text, 'plans: a request is already running on this line');
    assert.equal(sent('olifant/plans/do').length, n + 1);
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.cancel');
    await until(() => sent('$/cancelRequest').length > cancels, '$/cancelRequest');
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    await sleep(500);
    assert.deepEqual(a.shown.slice(from).map(s => s.text), ['cancelled'], 'said once, by the cancel');
    await vscode.commands.executeCommand('durandal.plan.cancel');
    assert.equal(a.shown.at(-1)!.text, 'plans: nothing is running');
  });

  it('typing above the row while the answer is out: the block follows the row, the facts are dropped', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      delay: 2, id: 'S2', verb: 'ask', facts: [{ row: 1, text: '- a fact' }],
      blocks: [{ after: 3, after_text: null, lines: [{ text: '  - so', fp: null }] }],
      dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
    });
    const ed = await at(3);
    const p = vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the ask in the air');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), [{ row: 4, verb: 'ask' }]);
    await p;
    assert.deepEqual(lines().slice(0, 7), ['typed', '# T', '- a', '- b', '- c', '  - so', '- d']);
  });

  it('a plan closed (reopened with another language) before the answer: nothing lands, nothing is sent or said', async () => {
    const a = await running();
    reply('olifant/plans/ask', {
      delay: 2, id: 'S3', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - so', fp: null }] }],
      dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
    });
    const ed = await at(3);
    const outcomes = sent('olifant/plans/outcome').length;
    const p = vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the ask in the air');
    const from = a.shown.length;
    // VS Code closes the document and opens a new one on a language change
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await p;
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.shown.slice(from), []);
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
  });

  it('a do with a review says so and fires landed do; no lines land', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D9', verb: 'do', facts: [], blocks: [], dropped: 0, unresolved: 0, seconds: 3, cost: 0.5,
      changed: ['/w/one/src/a.py'], review: 'D9',
    });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.equal(a.shown.at(-1)!.text, 'do: 1 file changed · to review · 3 s · $0.5');
    assert.equal(a.landed.fired.at(-1), 'do');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a server stop while a do runs: the row and its mark go, the late end says nothing', async () => {
    const a = await running();
    reply('olifant/plans/do', { hold: true, title: 'doing' });
    await at(8);
    const p = vscode.commands.executeCommand('durandal.plan.do');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the do in the air');
    const from = a.shown.length;
    await restart();
    await p;
    assert.deepEqual(a.planVerbs.running(uriOf(PLAN)), []);
    await sleep(300);
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text === 'cancelled'), []);
  });
});
```

If the restart itself says anything (an `info` about the restart), the last assertion already lets `info` through except `cancelled`. If `vscode.commands.executeCommand('durandal.plan.do')` in the stop test does not resolve after the restart, the request promise was not rejected by the client's dispose: then wrap `this.d.server.request(...)` in `run` so that `stopped()` also settles it (keep the entry's `cts` and race the request against a promise resolved when `e.gone` is set by `stopped`), and say so in the task report.

- [ ] **Step 7: Run the tests**

```bash
npm run lint && npm run test:unit 2>&1 | tail -5
npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -30
DURANDAL_E2E_ONLY=fake.13 node out/test/e2e/run.js 2>&1 | tail -10
```

In the foreground, with a 15-minute timeout each. Expected: PASS. If the undo restores only part of the answer, VS Code made more than one undo element: write the facts and blocks through the active editor's `TextEditor.edit` with `undoStopBefore: true, undoStopAfter: true` (one call, the same `span` edit) when the plan is the active editor, keep `applyEdit` otherwise, and say so in the report.

- [ ] **Step 8: Commit**

```bash
git add src/plans/here.ts src/plans/verbs.ts src/commandTable.ts src/extension.ts package.json test/unit/manifest.test.ts test/e2e/fake.15-verbs.e2e.ts
git commit -m "plans: ask, validate and do: one per row, a pending mark, cancel, the answer landed"
```

---

### Task 4: The blocks prompt (until milestone 7)

**Files:**
- Create: `src/plans/prompt.ts`
- Modify: `src/plans/verbs.ts` (`hold` becomes the prompt; `accept`)
- Test: `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: `Placed`, `Verb`, `proposalText`, `landing` (Task 2); `promptWord`, `NOT_APPLIED` (Task 2); `Ui.ask`; `VirtualDocs`, `tabsUnder`; `PlanVerbs` internals (Task 3).
- Produces: `prompt.ts`: `ACCEPT_ALL = 'Accept all'`, `REJECT_ALL = 'Reject all'`; `askBlocks(d: { docs: VirtualDocs; ui: Ui }, uri: string, verb: Verb, placed: readonly Placed[], lines: number): Promise<'accept' | 'reject' | undefined>`.

- [ ] **Step 1: Write the failing e2e tests**

Add to `test/e2e/fake.15-verbs.e2e.ts` (import `FakeUi` from `'../fakeUi'` and `tabsUnder` from `'./helpers'`):

```ts
  // held: a FakeUi whose prompt waits for the test to answer it
  function held(): { ui: FakeUi; answer(pick: string | undefined): void } {
    const ui = new FakeUi();
    let answer!: (pick: string | undefined) => void;
    ui.onAsk = () => new Promise(r => { answer = r; });
    return { ui, answer: pick => answer(pick) };
  }

  const VALIDATE = {
    id: 'V1', verb: 'validate', facts: [], blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }],
    dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
  };

  it('validate: the blocks beside the plan, then Accept all; the rows followed the typing (plans_spec :631)', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    const ed = await at(2);
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    assert.equal(h.ui.asks[0], 'validate: 1 lines in 1 blocks');
    assert.ok(a.shown.some(s => s.text === 'validate: 1 lines · 0 not found · 1 s'));
    await until(() => tabsUnder('/plans/v/').length === 1, 'the proposal beside the plan');
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing written before the answer');
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'] }]);
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), [{ row: 6, lines: ['  - ok'] }]);
    h.answer('Accept all');
    await until(() => lines()[7] === '  - ok', 'the block under the target line');
    assert.equal(lines()[6], '- e target line');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(sent('olifant/plans/outcome').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' });
    assert.equal(a.landed.fired.at(-1), 'accept');
    await until(() => tabsUnder('/plans/v/').length === 0, 'the proposal closed');
    assert.deepEqual(a.planVerbs.waiting(uriOf(PLAN)), []);
  });

  it('Reject all sends rejected and writes nothing; a dismissed prompt sends nothing', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    await at(2);
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    h.answer('Reject all');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.equal(sent('olifant/plans/outcome').at(-1)!.params.outcome, 'rejected');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 2, 'the second prompt');
    h.answer(undefined);
    await until(() => tabsUnder('/plans/v/').length === 0, 'the proposal closed');
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes + 1);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a do with no review (no git) replaces its step when accepted (plans_spec :641)', async () => {
    const a = await running();
    const ui = new FakeUi();
    ui.onAsk = () => 'Accept all';
    a.setUi(ui);
    reply('olifant/plans/do', {
      id: 'D1', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.do');
    await until(() => lines()[9] === '  - did it', 'the do landed');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    assert.ok(a.landed.fired.includes('do'));
  });

  it('with reviewAnswers an ask waits for the prompt (plans_spec :560)', async () => {
    const a = await running();
    const ui = new FakeUi();
    ui.onAsk = () => 'Accept all';
    a.setUi(ui);
    await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', true, vscode.ConfigurationTarget.Global);
    try {
      await sleep(200);
      reply('olifant/plans/ask', {
        id: 'S4', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] }],
        dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123, changed: [], review: null,
      });
      await at(3);
      await vscode.commands.executeCommand('durandal.plan.ask');
      await until(() => ui.asks.length === 1, 'the prompt');
      assert.ok(a.shown.some(s => s.text === 'ask: 2 lines · 1 not found · 9.1 s · $0.0123'));
      await until(() => lines()[4] === '  - a @src/a.py:F ✓ abc1234', 'accepted, stamped');
    } finally {
      await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it('a server stop while the prompt waits: Accept all then writes and sends nothing', async () => {
    const a = await running();
    const h = held();
    a.setUi(h.ui);
    reply('olifant/plans/validate', VALIDATE);
    await at(2);
    await vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => h.ui.asks.length === 1, 'the prompt');
    await restart();
    const outcomes = sent('olifant/plans/outcome').length;
    h.answer('Accept all');
    await sleep(500);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
  });

  it('p y and p n are milestone 7', async () => {
    const a = await running();
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'Durandal: Plan: Accept is not implemented yet (milestone 7)');
    await vscode.commands.executeCommand('durandal.plan.reject');
    assert.equal(a.shown.at(-1)!.text, 'Durandal: Plan: Reject is not implemented yet (milestone 7)');
  });
```

Run: `npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -30`
Expected: the new prompt tests FAIL (no prompt), the milestone test PASSES (Task 1).

- [ ] **Step 2: `src/plans/prompt.ts`**

```ts
import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { Ui } from '../uiTypes';
import { tabsUnder, VirtualDocs } from '../virtualDocs';
import { Placed, proposalText, Verb } from './blocks';
import { promptWord } from './words';

export const ACCEPT_ALL = 'Accept all';
export const REJECT_ALL = 'Reject all';

let seq = 0;

// askBlocks: the blocks of a validate, a do with no review, or an ask held for review, until
// ghost blocks come (milestone 7; M6 spec §4.3): their text beside the plan (a durandal-doc, one
// per prompt), then Accept all / Reject all. The document goes with the answer. undefined: the
// notice was dismissed (nvim's ghost left unanswered: nothing is written or sent).
export async function askBlocks(
  d: { docs: VirtualDocs; ui: Ui }, uri: string, verb: Verb, placed: readonly Placed[], lines: number,
): Promise<'accept' | 'reject' | undefined> {
  const path = `plans/${basename(vscode.Uri.parse(uri).path, '.md')}/proposal-${++seq}.md`;
  const doc = d.docs.set(path, proposalText(placed));
  void vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true })
    .then(undefined, () => undefined);
  try {
    const pick = await d.ui.ask('info', promptWord(verb, lines, placed.length), [ACCEPT_ALL, REJECT_ALL]);
    return pick === ACCEPT_ALL ? 'accept' : pick === REJECT_ALL ? 'reject' : undefined;
  } finally {
    const tabs = tabsUnder(`/${path}`);
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs).then(undefined, () => false);
    d.docs.forget(path);
  }
}
```

- [ ] **Step 3: The prompt in `src/plans/verbs.ts`**

Import `askBlocks` from `'./prompt'` (`landing` is imported already). In `land`, replace the comment line `// until the prompt (Task 4), …` with:

```ts
    if (!straight && placed.length > 0) this.hold(e.uri, e.verb, placed, typeof r.id === 'string' ? r.id : undefined, count);
```

and add, after `land`:

```ts
  // hold: blocks that wait for the prompt; their rows follow the plan's edits meanwhile
  private hold(uri: string, verb: Verb, placed: Placed[], id: string | undefined, lines: number): void {
    const w: Wait = { uri, placed, gen: this.gen };
    this.waits.add(w);
    void askBlocks({ docs: this.d.docs, ui: this.d.ui() }, uri, verb, placed, lines).then(async answer => {
      // a stop (another gen), or the plan closed (dropped from waits): the answer does nothing
      if (!this.waits.delete(w) || w.gen !== this.gen) return;
      if (answer === 'accept') await this.accept(uri, placed, id);
      else if (answer === 'reject') this.outcomes(uri, id, placed, 'rejected');
    }, (err: unknown) => {
      this.waits.delete(w);
      void this.d.say('error', errorMessage(err));
    });
  }

  // accept: the blocks written at their rows now (ghosts.lua accept_id), one edit; outcomes
  // accepted; landed accept. A plan no longer open drops them without an outcome.
  private async accept(uri: string, placed: readonly Placed[], id: string | undefined): Promise<void> {
    const doc = openDoc(uri);
    if (!doc) return;
    const lines = linesOf(doc);
    const last = Math.max(lines.length - 1, 0);
    const at = placed.map(p => ({ ...p, row: Math.max(0, Math.min(p.row, last)) }));
    const l = landing(lines, [], at);
    if (!(await writeLines(doc, lines, l.lines))) {
      void this.d.say('error', NOT_APPLIED);
      return;
    }
    this.outcomes(uri, id, placed, 'accepted');
    this.d.landed.fire('accept');
    this.flashRow(doc, l.rows.at(-1) ?? 0);
  }
```

`stopped()` already clears `waits` and bumps `gen`; `closed()` already drops a closed plan's waits.

- [ ] **Step 4: Run the tests**

```bash
npm run lint && npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -30
```

In the foreground, with a 15-minute timeout. Expected: PASS. If the `reviewAnswers` test asks no prompt, the configuration change had not reached `plansOptions` yet: raise its `sleep(200)` to an `until` on `vscode.workspace.getConfiguration('durandal.plans').get('reviewAnswers') === true` followed by `sleep(100)`, not the code.

- [ ] **Step 5: Commit**

```bash
git add src/plans/prompt.ts src/plans/verbs.ts test/e2e/fake.15-verbs.e2e.ts
git commit -m "plans: blocks wait beside the plan for Accept all or Reject all; outcomes sent"
```

---

### Task 5: New step, excerpt and toggle through source code actions

**Files:**
- Create: `src/plans/sourceActions.ts`, `src/plans/actions.ts`
- Modify: `src/plans/reading.ts` (`excerptAt`), `src/plans/layer.ts` (`collapsedAt`, `foldStartsAt`, `excerptAt`), `src/plans/folds.ts` (`toggleFoldAt`)
- Modify: `src/commandTable.ts` (new step, excerpt, toggle built; `p enter`), `package.json`, `src/extension.ts`
- Test: `test/unit/sourceActions.test.ts`, `test/unit/reading.test.ts`, `test/unit/manifest.test.ts`, `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: `Lsp.codeAction`, `Lsp.codeActionResolve` (Task 1); `planHere` (Task 3); the words (Task 2); `applyServerEdit`; M6a's `Readings`, `collapsedStarts`.
- Produces:
  - `sourceActions.ts`: `type Next = { kind: 'apply'; action: CodeAction } | { kind: 'resolve'; action: CodeAction; none: string } | { kind: 'fold'; row: number; reason: string } | { kind: 'say'; level: 'info' | 'warn'; text: string }`; `sources(xs: unknown): CodeAction[]`; `newStepNext(xs): Next`; `excerptNext(xs): Next`; `toggleNext(xs): Next`.
  - `reading.ts`: `interface Excerpt { open: number; close: number }`; `excerptAt(lenses: readonly Lens[], row: number): Excerpt | undefined`.
  - `PlanLayer.collapsedAt(ed: vscode.TextEditor, row: number): Fold | undefined`; `PlanLayer.foldStartsAt(ed, row): boolean`; `PlanLayer.excerptAt(ed, row): Excerpt | undefined`.
  - `folds.ts`: `toggleFoldAt(row: number, collapsed: boolean): Promise<void>`.
  - `class PlanActions { register(context); newStep(); excerpt(); toggle() }`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/sourceActions.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerptNext, newStepNext, sources, toggleNext } from '../../src/plans/sourceActions';

const edit = { changes: {} };
const newStep = { title: 'New step below', kind: 'source', edit };
const showWhy = { title: 'Show why', kind: '', command: { title: 'Show why', command: 'olifant.showWhy', arguments: [] } };
const claimCode = { title: 'Show the code here', kind: '', command: { title: 'Show the code here', command: 'olifant.showCode', arguments: ['/p/a.py', 3] } };

test('sources keeps kind source only: the server does not filter on only (facts §3)', () => {
  assert.deepEqual(sources([newStep, showWhy, claimCode, { title: 'Re-fingerprint this claim', kind: 'quickfix', edit }, null, 'x']), [newStep]);
  assert.deepEqual(sources(null), []);
  assert.deepEqual(sources([{ title: 'x', kind: 'source.organizeImports' }]).length, 1);
});

test('new step: the action with its edit, else the warning', () => {
  assert.deepEqual(newStepNext([newStep]), { kind: 'apply', action: newStep });
  assert.deepEqual(newStepNext([{ title: 'New step below', kind: 'source' }]), { kind: 'say', level: 'warn', text: 'no new step here' });
});

test('excerpt: a disabled one folds at its open row or says its reason; an edit applies; else resolve', () => {
  const at = (x: object) => excerptNext(sources([{ title: 'Show the code here', kind: 'source', ...x }]));
  assert.deepEqual(at({ disabled: { reason: 'the step shows its code already' }, data: { kind: 'excerpt', open: 4 } }),
    { kind: 'fold', row: 4, reason: 'excerpt: the step shows its code already' });
  assert.deepEqual(at({ disabled: { reason: 'not on a step' }, data: { kind: 'excerpt', open: null } }), { kind: 'say', level: 'info', text: 'excerpt: not on a step' });
  assert.equal(at({ edit }).kind, 'apply');
  const r = at({ data: { kind: 'excerpt', path: '/p/plans/t.md', line: 2, version: 3 } });
  assert.equal(r.kind, 'resolve');
  assert.equal((r as { none: string }).none, 'excerpt: nothing to show here');
  assert.deepEqual(excerptNext([]), { kind: 'say', level: 'info', text: 'excerpt: nothing to show here' });
});

test('toggle: by data.kind; disabled says its reason; an edit applies; else resolve; none: not on a step', () => {
  const at = (x: object) => toggleNext(sources([{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', line: 2 }, ...x }]));
  assert.deepEqual(at({ disabled: { reason: 'not on a step' } }), { kind: 'say', level: 'info', text: 'toggle: not on a step' });
  assert.equal(at({ edit }).kind, 'apply');
  assert.deepEqual((at({}) as { none: string }).none, 'toggle: nothing to change here');
  assert.deepEqual(toggleNext([newStep]), { kind: 'say', level: 'info', text: 'toggle: not on a step' });
});
```

In `test/unit/reading.test.ts`, import `excerptAt` and add:

```ts
test('excerptAt: the excerpt lens whose fence rows hold ROW, live or frozen', () => {
  const lenses = [
    { line: 3, command: 'olifant.plans.excerpt', args: ['u', 3, 6, true, '@a.py:F'] },
    { line: 9, command: 'olifant.plans.excerpt', args: ['u', 9, 11, false, '@a.py:G'] },
    { line: 0, command: 'olifant.plans.review', args: ['R1', 'u'] },
  ];
  assert.deepEqual(excerptAt(lenses, 3), { open: 3, close: 6 });
  assert.deepEqual(excerptAt(lenses, 5), { open: 3, close: 6 });
  assert.deepEqual(excerptAt(lenses, 10), { open: 9, close: 11 });
  assert.equal(excerptAt(lenses, 7), undefined);
  assert.equal(excerptAt([{ line: 1, command: 'olifant.plans.excerpt', args: ['u', 'x', 2] }], 1), undefined);
});
```

In `test/unit/manifest.test.ts`:

```ts
test('M6b: new step (p enter), excerpt and toggle are built; toggle is Plan: Toggle Step', () => {
  for (const id of ['durandal.plan.newStep', 'durandal.plan.excerpt', 'durandal.plan.toggle']) assert.ok(id in BUILT && !(id in NOT_YET), id);
  assert.equal(BUILT['durandal.plan.newStep'].title, 'Plan: New Step');
  assert.equal(BUILT['durandal.plan.toggle'].title, 'Plan: Toggle Step');
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.newStep'), { command: 'durandal.plan.newStep', keys: 'p enter', when: 'durandal.isPlan' });
});
```

Run: `npm run test:unit 2>&1 | tail -8`. Expected: FAIL.

- [ ] **Step 2: `src/plans/sourceActions.ts`**

```ts
// Which of a plan row's source code actions a chord uses, and what it does with it (durandal.nvim
// plans.lua new_step, excerpt, toggle). olifant answers every action whatever `only` says, and
// adds the disabled excerpt and toggle placeholders only when `only` names source; the claim
// pass's "Show the code here" (kind "", a command) is not the excerpt's (kind source). No vscode
// import.
import type { CodeAction } from 'vscode-languageserver-protocol';
import { EXCERPT_NOTHING, NO_NEW_STEP, TOGGLE_NO_STEP, TOGGLE_NOTHING } from './words';

export type Next =
  | { kind: 'apply'; action: CodeAction }
  | { kind: 'resolve'; action: CodeAction; none: string }
  | { kind: 'fold'; row: number; reason: string }
  | { kind: 'say'; level: 'info' | 'warn'; text: string };

export const NEW_STEP_TITLE = 'New step below';
export const EXCERPT_TITLE = 'Show the code here';

const isAction = (x: unknown): x is CodeAction =>
  typeof x === 'object' && x !== null && typeof (x as CodeAction).title === 'string' && typeof (x as CodeAction).kind === 'string';

// sources: the answer's actions of kind source
export function sources(xs: unknown): CodeAction[] {
  if (!Array.isArray(xs)) return [];
  return xs.filter(isAction).filter(a => a.kind === 'source' || a.kind!.startsWith('source.'));
}

export function newStepNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => x.title === NEW_STEP_TITLE && x.edit);
  return a ? { kind: 'apply', action: a } : { kind: 'say', level: 'warn', text: NO_NEW_STEP };
}

// excerptNext: disabled with data.open: the step shows its code already, its fold toggles
export function excerptNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => x.title === EXCERPT_TITLE);
  if (!a) return { kind: 'say', level: 'info', text: EXCERPT_NOTHING };
  if (a.disabled) {
    const reason = `excerpt: ${a.disabled.reason}`;
    const open = (a.data as { open?: unknown } | undefined)?.open;
    return typeof open === 'number' && Number.isInteger(open) ? { kind: 'fold', row: open, reason } : { kind: 'say', level: 'info', text: reason };
  }
  if (a.edit) return { kind: 'apply', action: a };
  return { kind: 'resolve', action: a, none: EXCERPT_NOTHING };
}

export function toggleNext(xs: readonly CodeAction[]): Next {
  const a = xs.find(x => (x.data as { kind?: unknown } | undefined)?.kind === 'toggle');
  if (!a) return { kind: 'say', level: 'info', text: TOGGLE_NO_STEP };
  if (a.disabled) return { kind: 'say', level: 'info', text: `toggle: ${a.disabled.reason}` };
  if (a.edit) return { kind: 'apply', action: a };
  return { kind: 'resolve', action: a, none: TOGGLE_NOTHING };
}
```

- [ ] **Step 3: `excerptAt`, the layer's fold questions, `toggleFoldAt`**

In `src/plans/reading.ts`, after `liveExcerpts`:

```ts
// Excerpt: an excerpt's fence rows (its lens: olifant.plans.excerpt [uri, open, close, live, anchor])
export interface Excerpt { open: number; close: number }

// excerptAt: the excerpt, live or frozen, whose fence rows hold ROW
export function excerptAt(lenses: readonly Lens[], row: number): Excerpt | undefined {
  for (const l of lenses) {
    if (l.command !== CLIENT_COMMANDS.planExcerpt) continue;
    const [, open, close] = l.args;
    if (typeof open === 'number' && typeof close === 'number' && open <= row && row <= close) return { open, close };
  }
  return undefined;
}
```

In `src/plans/layer.ts`, import `excerptAt` and `Excerpt` from `'./reading'` and add to `PlanLayer`, after `api()`:

```ts
  // collapsedAt: the server fold starting at ROW that ED shows collapsed (folds read at its version)
  collapsedAt(ed: vscode.TextEditor, row: number): Fold | undefined {
    const doc = ed.document;
    const f = this.readings.get(doc.uri.toString())?.folds;
    if (!f || f.version !== doc.version) return undefined;
    const visible = ed.visibleRanges.map(v => ({ start: v.start.line, end: v.end.line }));
    const lastRowEmpty = doc.lineAt(doc.lineCount - 1).text === '';
    return collapsedStarts(f.ranges, visible, doc.lineCount, lastRowEmpty).find(x => x.start === row);
  }

  // foldStartsAt: a server fold starts at ROW (folds read at ED's version)
  foldStartsAt(ed: vscode.TextEditor, row: number): boolean {
    const f = this.readings.get(ed.document.uri.toString())?.folds;
    return !!f && f.version === ed.document.version && f.ranges.some(x => x.start === row && x.end > x.start);
  }

  // excerptAt: the excerpt holding ROW, by the lenses read at ED's version
  excerptAt(ed: vscode.TextEditor, row: number): Excerpt | undefined {
    const l = this.readings.get(ed.document.uri.toString())?.lenses;
    return l && l.version === ed.document.version ? excerptAt(l.items, row) : undefined;
  }
```

In `src/plans/folds.ts`, append:

```ts
// toggleFoldAt: the fold at ROW of the focused editor opens when COLLAPSED, else closes; levels 1
// touches only the region at the row (nvim toggle_fold). The cursor stays.
export async function toggleFoldAt(row: number, collapsed: boolean): Promise<void> {
  await vscode.commands.executeCommand(collapsed ? 'editor.unfold' : 'editor.fold', { levels: 1, selectionLines: [row] });
}
```

- [ ] **Step 4: `src/plans/actions.ts`**

```ts
import * as vscode from 'vscode';
import type { CodeAction, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import { Lsp } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { toggleFoldAt } from './folds';
import { planHere, PlanHere } from './here';
import type { PlanLayer } from './layer';
import type { PlanDocs } from './planDocs';
import { excerptNext, newStepNext, Next, sources, toggleNext } from './sourceActions';
import { NO_PLAN, NOT_APPLIED } from './words';

export interface ActionsDeps {
  server: Server; say: Say; planDocs: PlanDocs;
  layer: Pick<PlanLayer, 'collapsedAt' | 'foldStartsAt' | 'excerptAt'>;
}

// PlanActions: new step, excerpt and toggle (M6 spec §4.4). Each asks textDocument/codeAction at
// the row with only: [source] itself (source actions never reach the lightbulb) and applies the
// server's edit through applyServerEdit, so a stale one is refused as every server edit is.
export class PlanActions {
  constructor(private readonly d: ActionsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.newStep', () => this.newStep()),
      vscode.commands.registerCommand('durandal.plan.excerpt', () => this.excerpt()),
      vscode.commands.registerCommand('durandal.plan.toggle', () => this.toggle()),
    );
  }

  async newStep(): Promise<void> {
    const h = await this.here();
    const xs = h && await this.sources(h);
    if (!h || !xs) return;
    const n = newStepNext(xs);
    if (n.kind !== 'apply') return this.next(h, n);
    if (!(await this.apply(n.action))) return;
    // the new step's line, the cursor at its end (nvim: row + 2, 1-based, then startinsert!)
    const ed = h.editor;
    const row = Math.min(h.row + 1, ed.document.lineCount - 1);
    const end = ed.document.lineAt(row).range.end;
    ed.selection = new vscode.Selection(end, end);
    ed.revealRange(new vscode.Range(end, end));
  }

  async excerpt(): Promise<void> {
    const h = await this.here();
    if (!h) return;
    // inside an excerpt, or on a collapsed fold: the fold opens or closes, nothing is asked
    const x = this.d.layer.excerptAt(h.editor, h.row);
    if (x && this.d.layer.foldStartsAt(h.editor, x.open)) {
      await toggleFoldAt(x.open, !!this.d.layer.collapsedAt(h.editor, x.open));
      return;
    }
    if (this.d.layer.collapsedAt(h.editor, h.row)) {
      await toggleFoldAt(h.row, true);
      return;
    }
    const xs = await this.sources(h);
    if (xs) await this.next(h, excerptNext(xs));
  }

  async toggle(): Promise<void> {
    const h = await this.here();
    const xs = h && await this.sources(h);
    if (h && xs) await this.next(h, toggleNext(xs));
  }

  private async here(): Promise<PlanHere | undefined> {
    const h = await planHere(this.d.planDocs);
    if (!h) void this.d.say('error', NO_PLAN);
    else if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return undefined;
    }
    return h;
  }

  private async sources(h: PlanHere): Promise<CodeAction[] | undefined> {
    const at = { line: h.row, character: 0 };
    try {
      return sources(await this.d.server.request(Lsp.codeAction, {
        textDocument: { uri: h.uri }, range: { start: at, end: at }, context: { only: ['source'], diagnostics: [] },
      }));
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return undefined;
    }
  }

  private async next(h: PlanHere, n: Next): Promise<void> {
    switch (n.kind) {
      case 'say':
        void this.d.say(n.level, n.text);
        return;
      case 'fold':
        if (this.d.layer.foldStartsAt(h.editor, n.row)) await toggleFoldAt(n.row, !!this.d.layer.collapsedAt(h.editor, n.row));
        else void this.d.say('info', n.reason);
        return;
      case 'apply':
        await this.apply(n.action);
        return;
      case 'resolve': {
        let r: CodeAction | null;
        try {
          r = await this.d.server.request(Lsp.codeActionResolve, n.action);
        } catch (err) {
          // a plan that moved since: "the plan changed since; ask again"
          void this.d.say('error', errorMessage(err));
          return;
        }
        if (r?.edit) await this.apply(r);
        else void this.d.say('info', n.none);
      }
    }
  }

  // apply: the action's edit, as every server edit lands (refused whole if stale)
  private async apply(a: CodeAction): Promise<boolean> {
    const lc = this.d.server.client();
    if (!lc) {
      void this.d.say('error', NOT_RUNNING);
      return false;
    }
    const done = await applyServerEdit(lc, { label: a.title, edit: a.edit as WorkspaceEdit }, t => void this.d.say('info', t));
    if (!done.applied) void this.d.say('error', done.failureReason ?? NOT_APPLIED);
    return done.applied;
  }
}
```

- [ ] **Step 5: The commands, the chord, the wiring**

In `src/commandTable.ts`: remove `durandal.plan.excerpt` and `durandal.plan.toggle` from `NOT_YET`; add to `BUILT`:

```ts
  'durandal.plan.newStep': { title: 'Plan: New Step' },
  'durandal.plan.excerpt': { title: 'Plan: Excerpt' },
  'durandal.plan.toggle': { title: 'Plan: Toggle Step' },
```

and to `KEYS`, after the `p x` entry:

```ts
  { command: 'durandal.plan.newStep', keys: 'p enter', when: 'durandal.isPlan' },
```

In `package.json`: change the title of `durandal.plan.toggle` to `Plan: Toggle Step`; add the command

```json
      {
        "command": "durandal.plan.newStep",
        "title": "Plan: New Step",
        "category": "Durandal"
      },
```

and, in `contributes.keybindings` right after the `durandal.plan.toggle` binding:

```json
      {
        "command": "durandal.plan.newStep",
        "key": "ctrl+alt+d p enter",
        "mac": "cmd+alt+d p enter",
        "when": "durandal.isPlan"
      },
```

In `src/extension.ts`, after the verbs:

```ts
  new PlanActions({ server: s, say, planDocs, layer }).register(context);
```

(import `PlanActions` from `'./plans/actions'`).

- [ ] **Step 6: Write the e2e tests**

Add to `test/e2e/fake.15-verbs.e2e.ts`:

```ts
  const actionsAsked = () => sent('textDocument/codeAction').filter(m => m.params.textDocument.uri === uriOf(PLAN));

  it('new step: the source action\'s edit under the row, the cursor at its end; only source asked', async () => {
    const a = await running();
    reply('textDocument/codeAction', [
      { title: 'Show why', kind: '', command: { title: 'Show why', command: 'olifant.showWhy', arguments: [] } },
      { title: 'New step below', kind: 'source', edit: { changes: { [uriOf(PLAN)]: [{ range: { start: { line: 3, character: 3 }, end: { line: 3, character: 3 } }, newText: '\n- [ ] step @anchor' }] } } },
    ]);
    const ed = await at(3);
    await vscode.commands.executeCommand('durandal.plan.newStep');
    assert.equal(lines()[4], '- [ ] step @anchor');
    assert.deepEqual([ed.selection.active.line, ed.selection.active.character], [4, '- [ ] step @anchor'.length]);
    const p = actionsAsked().at(-1)!.params;
    assert.deepEqual(p.context, { only: ['source'], diagnostics: [] });
    assert.deepEqual(p.range, { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } });
    reply('textDocument/codeAction', []);
    await vscode.commands.executeCommand('durandal.plan.newStep');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'no new step here']);
  });

  it('excerpt: a disabled action says its reason; one that needs resolving is resolved and applied', async () => {
    const a = await running();
    reply('textDocument/codeAction', [{ title: 'Show the code here', kind: 'source', disabled: { reason: 'not on a step' }, data: { kind: 'excerpt', path: '/x', line: 1, version: null } }]);
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.excerpt');
    assert.equal(a.shown.at(-1)!.text, 'excerpt: not on a step');
    const action = { title: 'Show the code here', kind: 'source', data: { kind: 'excerpt', path: '/x', line: 8, version: null } };
    reply('textDocument/codeAction', [action]);
    reply('codeAction/resolve', { ...action, edit: { documentChanges: [{ textDocument: { uri: uriOf(PLAN), version: null }, edits: [
      { range: { start: { line: 8, character: 24 }, end: { line: 8, character: 24 } }, newText: '\n  ```python @src/a.py:Foo\n  ```' },
    ] }] } });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.excerpt');
    assert.deepEqual(lines().slice(8, 11), ['- [ ] step @src/a.py:Foo', '  ```python @src/a.py:Foo', '  ```']);
    assert.deepEqual(sent('codeAction/resolve').at(-1)!.params.data, action.data);
  });

  it('a resolve against a plan that moved is refused with the server\'s words; nothing changes', async () => {
    const a = await running();
    reply('textDocument/codeAction', [{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: '/x', line: 8, version: 1 } }]);
    reply('codeAction/resolve', { lsp_error: 'the plan changed since; ask again' });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['error', 'the plan changed since; ask again']);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('toggle: resolved and applied; disabled or absent says so', async () => {
    const a = await running();
    const action = { title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: '/x', line: 8, version: null } };
    reply('textDocument/codeAction', [action]);
    reply('codeAction/resolve', { ...action, edit: { documentChanges: [{ textDocument: { uri: uriOf(PLAN), version: null }, edits: [
      { range: { start: { line: 8, character: 0 }, end: { line: 8, character: 5 } }, newText: '- [x]' },
    ] }] } });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    reply('textDocument/codeAction', [{ ...action, disabled: { reason: 'not on a step' } }]);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(a.shown.at(-1)!.text, 'toggle: not on a step');
    reply('textDocument/codeAction', []);
    await vscode.commands.executeCommand('durandal.plan.toggle');
    assert.equal(a.shown.at(-1)!.text, 'toggle: not on a step');
  });

  it('excerpt on a closed excerpt opens it without asking; again (no lens) asks, and the disabled answer folds it', async () => {
    const a = await running();
    const XPLAN = 'one/plans/x.md';
    const XTEXT = ['# X', '- [ ] show F @src/a.py:F', '  ```python @src/a.py:F', '  def F():', '      return 1', '  ```', '- [ ] next', ''].join('\n');
    reply('textDocument/foldingRange', [{ startLine: 2, endLine: 5, kind: 'region' }]);
    reply('textDocument/codeLens', []);
    await settle(XPLAN, XTEXT);
    try {
      const ed = await at(2, XPLAN);
      const ux = uriOf(XPLAN);
      const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
      await until(() => a.planView.entered(ux), 'entered');
      await until(() => !shown(3) || undefined, 'the excerpt closed on entry');
      const asked = sent('textDocument/codeAction').length;
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.excerpt');
      await until(() => shown(3) || undefined, 'opened');
      assert.equal(sent('textDocument/codeAction').length, asked, 'nothing asked');
      reply('textDocument/codeAction', [{ title: 'Show the code here', kind: 'source', disabled: { reason: 'the step shows its code already' }, data: { kind: 'excerpt', open: 2 } }]);
      ed.selection = new vscode.Selection(1, 0, 1, 0);
      await vscode.commands.executeCommand('durandal.plan.excerpt');
      await until(() => !shown(3) || undefined, 'closed again');
      assert.equal(ed.selection.active.line, 1, 'the cursor stays');
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await settle(XPLAN, null);
    }
  });
```

- [ ] **Step 7: Run the tests**

```bash
npm run lint && npm run test:unit 2>&1 | tail -5
npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -30
DURANDAL_E2E_ONLY=fake.14 node out/test/e2e/run.js 2>&1 | tail -10
```

In the foreground, with a 15-minute timeout each. Expected: PASS. If `editor.unfold` with `levels: 1` does not open a collapsed region at its start row on 1.145.2, read `editor/contrib/folding/browser/folding.ts` `UnfoldAction` in the cached bundle (`.vscode-test/…/workbench.desktop.main.js`) and use the arguments it honours; keep `levels: 1` for `editor.fold` (M6a's finding).

- [ ] **Step 8: Commit**

```bash
git add src/plans/sourceActions.ts src/plans/actions.ts src/plans/reading.ts src/plans/layer.ts src/plans/folds.ts src/commandTable.ts src/extension.ts package.json test/unit/sourceActions.test.ts test/unit/reading.test.ts test/unit/manifest.test.ts test/e2e/fake.15-verbs.e2e.ts
git commit -m "plans: new step, excerpt and toggle through the server's source actions; folds toggled in place"
```

---

### Task 6: Files, and stub and test on a step

**Files:**
- Create: `src/plans/steps.ts`
- Modify: `src/commandTable.ts` (files built; plan stub and test; `p s`, `p t`, `s` and `t` in a plan; `TDD_HERE_WHEN`), `package.json`, `src/extension.ts`
- Test: `test/unit/manifest.test.ts`, `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: `Olifant.plansFiles/plansStub/plansTest`, `FilesResult`, `FileItem`, `StepResult` (Task 1); `writeFacts`, `Landed` (Task 1); `planHere` (Task 3); `fileItem`, `testsWord`, `PLAN_CHANGED`, `NO_FILES`, `NO_PLAN`, `NOT_APPLIED` (Task 2); M4's `stubWord`; `applyServerEdit`; `Ui.pick`.
- Produces: `class PlanSteps { register(context); files(); stub(); test() }`; `TDD_HERE_WHEN` in `commandTable.ts`.

- [ ] **Step 1: Write the failing manifest tests**

In `test/unit/manifest.test.ts`, import `TDD_HERE_WHEN` too. Replace, in `'the keybindings are KEYS under the chord prefix…'`, the two lines from `const project = …` to `assert.equal(new Set(project).size, …)` and the two `tdd` lines with:

```ts
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
```

(the existing `p `-chord `isPlan` assertion stays once). Replace the test `'t, shift+t and s also work from the results document and the untitled test file (final-review ruling)'` with:

```ts
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
  for (const id of ['durandal.plan.files', 'durandal.plan.stub', 'durandal.plan.test']) assert.ok(id in BUILT && !(id in NOT_YET), id);
  const keys = (id: string) => KEYS.filter(k => k.command === id).map(k => `${k.keys}|${k.when}`);
  assert.deepEqual(keys('durandal.plan.stub'), ['p s|durandal.isPlan', 's|durandal.isPlan']);
  assert.deepEqual(keys('durandal.plan.test'), ['p t|durandal.isPlan', 't|durandal.isPlan']);
  assert.deepEqual(Object.keys(NOT_YET).sort(), ['durandal.plan.accept', 'durandal.plan.reconcile', 'durandal.plan.reject']);
});
```

The TDD chords test `'the TDD chords match durandal.nvim…'` keeps passing (`keys('durandal.test.here')` is still `['t']`).

Run: `npm run test:unit 2>&1 | tail -8`. Expected: FAIL.

- [ ] **Step 2: The commands and chords**

In `src/commandTable.ts`:

```ts
// TDD_HERE_WHEN: t and s outside a plan; in a plan they are the plan step's (as durandal.nvim's
// buffer-local keys are)
export const TDD_HERE_WHEN = `(${TDD_WHEN}) && !durandal.isPlan`;
```

In `KEYS`: the `durandal.test.here` and `durandal.stub` entries take `when: TDD_HERE_WHEN`; after the `p enter` entry add:

```ts
  { command: 'durandal.plan.stub', keys: 'p s', when: 'durandal.isPlan' },
  { command: 'durandal.plan.test', keys: 'p t', when: 'durandal.isPlan' },
  { command: 'durandal.plan.stub', keys: 's', when: 'durandal.isPlan' },
  { command: 'durandal.plan.test', keys: 't', when: 'durandal.isPlan' },
```

Remove `durandal.plan.files` from `NOT_YET`; add to `BUILT`:

```ts
  'durandal.plan.files': { title: 'Plan: Files' },
  'durandal.plan.stub': { title: 'Plan: Stub' },
  'durandal.plan.test': { title: 'Plan: Test' },
```

In `package.json`: the `durandal.test.here` and `durandal.stub` keybindings' `when` become `(durandal.inProject || resourceScheme == durandal-doc || resourceScheme == untitled) && !durandal.isPlan`; add the commands `durandal.plan.stub` (`Plan: Stub`) and `durandal.plan.test` (`Plan: Test`), category `Durandal`; and, after the `durandal.plan.newStep` keybinding, four bindings in the KEYS order: `ctrl+alt+d p s` / `cmd+alt+d p s` → `durandal.plan.stub`, `p t` → `durandal.plan.test`, `ctrl+alt+d s` / `cmd+alt+d s` → `durandal.plan.stub`, `ctrl+alt+d t` / `cmd+alt+d t` → `durandal.plan.test`, each `"when": "durandal.isPlan"`.

- [ ] **Step 3: `src/plans/steps.ts`**

```ts
import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { FileItem, Olifant, StepResult } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { stubWord } from '../tdd/landing';
import type { Ui } from '../uiTypes';
import { planHere, PlanHere } from './here';
import { writeFacts } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { fileItem, NO_FILES, NO_PLAN, NOT_APPLIED, PLAN_CHANGED, testsWord } from './words';

export interface StepsDeps { server: Server; say: Say; ui: () => Ui; planDocs: PlanDocs; landed: Landed }

// PlanSteps: a plan's files, and stub and test on the step under the cursor (durandal.nvim
// plans.lua files, stub, test; M6 spec §4.4). The plan stays the active editor; the facts are
// written only when the plan is still at the version asked.
export class PlanSteps {
  constructor(private readonly d: StepsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.files', () => this.files()),
      vscode.commands.registerCommand('durandal.plan.stub', () => this.stub()),
      vscode.commands.registerCommand('durandal.plan.test', () => this.test()),
    );
  }

  private async here(): Promise<PlanHere | undefined> {
    const h = await planHere(this.d.planDocs);
    if (!h) {
      void this.d.say('error', NO_PLAN);
      return undefined;
    }
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return undefined;
    }
    return h;
  }

  // files: the plan's items in a pick; one opens its file at its unit, or moves to its plan row
  async files(): Promise<void> {
    const h = await this.here();
    if (!h) return;
    let items: FileItem[];
    try {
      const r = await this.d.server.request(Olifant.plansFiles, { textDocument: { uri: h.uri } });
      items = Array.isArray(r?.items) ? r.items : [];
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (items.length === 0) {
      void this.d.say('info', NO_FILES);
      return;
    }
    const it = await this.d.ui().pick<FileItem>({ title: 'plan files', items: items.map(x => ({ ...fileItem(x), value: x })) });
    if (!it) return;
    const [uri, row] = typeof it.file === 'string'
      ? [vscode.Uri.file(it.file), Math.max((typeof it.line === 'number' ? it.line : 1) - 1, 0)]
      : [h.editor.document.uri, it.row];
    const ed = await vscode.window.showTextDocument(uri, { preview: false });
    const at = new vscode.Position(Math.min(row, ed.document.lineCount - 1), 0);
    ed.selection = new vscode.Selection(at, at);
    ed.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  // stub: a test stub for the step, saved as a stub is (M4); its test line in the plan
  async stub(): Promise<void> {
    const h = await this.here();
    if (!h) return;
    const doc = h.editor.document;
    const tick = doc.version;
    let r: StepResult | null;
    try {
      r = await this.d.server.request(Olifant.plansStub, { textDocument: { uri: h.uri }, line: h.row });
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!r || typeof r !== 'object') return;
    const name = typeof r.name === 'string' ? r.name : undefined;
    if (r.edits) {
      const lc = this.d.server.client();
      if (!lc) {
        void this.d.say('error', NOT_RUNNING);
        return;
      }
      const done = await applyServerEdit(lc, { label: name ? `stub ${name}` : 'stub', edit: r.edits }, t => void this.d.say('info', t),
        (saved, unsaved, kept) => (name ? stubWord(name, saved, unsaved, kept) : 'stubbed'));
      if (!done.applied) {
        void this.d.say('error', done.failureReason ?? NOT_APPLIED);
        return;
      }
    } else {
      void this.d.say('info', name ? `stubbed ${name}` : 'stubbed');
    }
    if (!doc.isClosed && doc.version === tick && Array.isArray(r.facts)) await writeFacts(doc, r.facts);
    this.d.landed.fire('stub');
  }

  // test: the step's tests run; their facts written, or a warning when the plan moved meanwhile
  async test(): Promise<void> {
    const h = await this.here();
    if (!h) return;
    const doc = h.editor.document;
    const tick = doc.version;
    let r: StepResult | null;
    try {
      r = await this.d.server.request(Olifant.plansTest, { textDocument: { uri: h.uri }, line: h.row });
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!r || typeof r !== 'object') return;
    const word = testsWord(r);
    if (!doc.isClosed && doc.version === tick) {
      if (Array.isArray(r.facts)) await writeFacts(doc, r.facts);
      void this.d.say('info', word);
    } else {
      void this.d.say('warn', word + PLAN_CHANGED);
    }
    this.d.landed.fire('test');
  }
}
```

In `src/extension.ts`, after the actions:

```ts
  new PlanSteps({ server: s, say, ui, planDocs, landed }).register(context);
```

(import `PlanSteps` from `'./plans/steps'`).

- [ ] **Step 4: Write the e2e tests**

Add to `test/e2e/fake.15-verbs.e2e.ts` (import `disk` from `'./helpers'`):

```ts
  it('files: section · text in a pick; an item with a file opens it at its line, one without moves in the plan', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    const main = file('one/main.py').fsPath;
    reply('olifant/plans/files', { items: [
      { section: 'T', row: 1, text: '- a', file: null, line: null },
      { section: 'Next', row: 8, text: '- [ ] step', file: main, line: 1 },
    ] });
    ui.onPick = o => o.items[1].value;
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, i.detail]), [['T · - a', 'line 2'], ['Next · - [ ] step', `${main}:1`]]);
    assert.equal(vscode.window.activeTextEditor!.document.uri.fsPath, main);
    ui.onPick = o => o.items[0].value;
    await at(5);
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.equal(vscode.window.activeTextEditor!.selection.active.line, 1);
    reply('olifant/plans/files', { items: [] });
    await vscode.commands.executeCommand('durandal.plan.files');
    assert.equal(a.shown.at(-1)!.text, 'plans: no files');
  });

  it('stub on a step: the stub saved, its test line in the plan, the plan still active (plans_spec :736, :746)', async () => {
    const a = await running();
    const other = 'one/other.py';
    reply('olifant/plans/stub', {
      file: file(other).fsPath, line: 1, name: 'test_foo',
      edits: { changes: { [uriOf(other)]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'def test_foo(): pass\n' }] } },
      facts: [{ after: 8, lines: ['  - test: foo @tests/test_a.py:test_foo'] }],
    });
    try {
      await at(8);
      await vscode.commands.executeCommand('durandal.plan.stub');
      assert.deepEqual(sent('olifant/plans/stub').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 8 });
      assert.ok(disk(other).includes('def test_foo'));
      assert.ok(a.shown.some(s => s.text.startsWith('stubbed test_foo')));
      assert.equal(lines()[9], '  - test: foo @tests/test_a.py:test_foo');
      assert.equal(vscode.window.activeTextEditor!.document.uri.toString(), uriOf(PLAN));
      assert.equal(a.landed.fired.at(-1), 'stub');
    } finally {
      await settle(other, 'y = 2\n');
    }
  });

  it('test on a step writes its facts; with the plan edited during the run it warns and writes none (plans_spec :757, :781)', async () => {
    const a = await running();
    reply('olifant/plans/test', { facts: [{ row: 8, text: '- [x] step @src/a.py:Foo' }], passed: 2, failed: 1, seconds: 0.5 });
    await at(8);
    await vscode.commands.executeCommand('durandal.plan.test');
    assert.equal(a.shown.at(-1)!.text, 'tests: 2 passed · 1 failed · 0.5 s');
    assert.equal(lines()[8], '- [x] step @src/a.py:Foo');
    assert.equal(a.landed.fired.at(-1), 'test');
    await revert(docOf(PLAN)!);
    reply('olifant/plans/test', { delay: 2, facts: [{ row: 8, text: '- [x] step @src/a.py:Foo ✓ abc1234' }], passed: 1, failed: 0, seconds: 3 });
    const ed = await at(8);
    const n = sent('olifant/plans/test').length;
    const p = vscode.commands.executeCommand('durandal.plan.test');
    await until(() => sent('olifant/plans/test').length > n, 'the second test asked');
    await ed.edit(b => b.insert(new vscode.Position(1, 0), 'typed\n'));
    await p;
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'tests: 1 passed · 0 failed · 3 s · plan changed, press again']);
    assert.equal(lines()[9], '- [ ] step @src/a.py:Foo');
    assert.equal(a.landed.fired.at(-1), 'test');
  });
```

- [ ] **Step 5: Run the tests**

```bash
npm run lint && npm run test:unit 2>&1 | tail -5
npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -30
DURANDAL_E2E_ONLY=fake.11 node out/test/e2e/run.js 2>&1 | tail -10
```

In the foreground, with a 15-minute timeout each. Expected: PASS (fake.11 checks that the TDD chords still work outside plans).

- [ ] **Step 6: Commit**

```bash
git add src/plans/steps.ts src/commandTable.ts src/extension.ts package.json test/unit/manifest.test.ts test/e2e/fake.15-verbs.e2e.ts
git commit -m "plans: files, and stub and test on a step; s and t in a plan are the step's"
```

---

### Task 7: The reopen lands fully; against olifant lsp; README; the PR

**Files:**
- Modify: `src/pause/controller.ts` (`redo` goes; the reopen calls the verbs), `src/extension.ts` (the verbs reach the controller)
- Modify: `test/e2e/fake.13-review.e2e.ts` (the reopen's landing notice)
- Modify: `test/e2e/real.9-plans.e2e.ts`
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `PlanVerbs.run` (Task 3).
- Produces: `ControllerDeps.redo(planUri: string, line: number, id: string, text: string): Promise<void>`.

- [ ] **Step 1: Write the failing e2e assertion**

In `test/e2e/fake.13-review.e2e.ts`, at the end of `'errand o: what to change, then plans/do resumes its thread; Escape sends nothing'`, add:

```ts
    // the do lands as Plan: Do lands it (M6 spec §4.4)
    await until(() => a.shown.some(s => s.text === 'do: 1 file changed · to review · 9 s'), 'the do\'s notice');
    assert.equal(a.landed.fired.at(-1), 'do');
```

Run: `npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.13 node out/test/e2e/run.js 2>&1 | tail -15`
Expected: FAIL on `landed` (the controller's own `redo` fires nothing).

- [ ] **Step 2: The controller calls the verbs**

In `src/pause/controller.ts`, add to `ControllerDeps`:

```ts
  // redo: plans/do resuming a review's thread on the plan's LINE, landed as Plan: Do lands it (M6b)
  redo(planUri: string, line: number, id: string, text: string): Promise<void>;
```

Delete the private `redo` method, and replace its two calls in `reopen` (`await this.redo(r.planUri, review.id, line, text)` and `await this.redo(r.planUri, res.reopen.id, line, text)`) with `await this.d.redo(r.planUri, line, review.id, text)` and `await this.d.redo(r.planUri, line, res.reopen.id, text)`. Remove imports that become unused (`ErrandResult`, possibly `Olifant` stays for the choose request).

In `src/extension.ts`, the controller is built before the verbs. Add, before `const ctl = new PauseController(...)`:

```ts
  // the plan verbs are built with the plans below; the reopen reaches them through this holder
  const planHold: { verbs?: PlanVerbs } = {};
```

pass `redo: (planUri, line, id, text) => planHold.verbs?.run(planUri, 'do', line, { resume: id, text }) ?? Promise.resolve()` in the controller's deps, and after `const verbs = new PlanVerbs(...)` add `planHold.verbs = verbs;`.

- [ ] **Step 3: Run the review e2e**

Run: `npm run lint && npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.13 node out/test/e2e/run.js 2>&1 | tail -15`
Expected: PASS, with the reopen test's `plans/do` params unchanged (`{ textDocument, line: 2, resume: 'R1', text: 'add a docstring' }`).

- [ ] **Step 4: The real e2e**

Add to `test/e2e/real.9-plans.e2e.ts` (import `FakeUi` from `'../fakeUi'` and `revert` from `'./helpers'`), inside the `describe`, after the existing test:

```ts
  const STEPS = 'py/plans/m6b.md';
  const STEPS_TEXT = ['# Booking', '', '- [ ] book a table @src/bistro/booking/commands/create_booking.py:CreateBooking', ''].join('\n');

  it('files lists the step\'s file; new step adds one under it; toggle ticks the step through resolve', async () => {
    const a = await running();
    writeFileSync(join(ws(), STEPS), STEPS_TEXT);
    try {
      const ed = await open(file(STEPS));
      await until(() => a.isPlan(), 'durandal.isPlan');
      const ui = new FakeUi();
      a.setUi(ui);
      await vscode.commands.executeCommand('durandal.plan.files');
      assert.ok(ui.picks[0]?.items.some(i => (i.detail ?? '').includes('create_booking.py')), JSON.stringify(ui.picks[0]?.items));
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.newStep');
      await until(() => ed.document.lineAt(3).text.startsWith('- [ ] ') || undefined, 'a new step under the row', 30_000);
      await revert(ed.document);
      await vscode.window.showTextDocument(ed.document);
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.toggle');
      await until(() => ed.document.lineAt(2).text.startsWith('- [x] book a table') || undefined, 'the step ticked', 30_000);
    } finally {
      a.setUi(undefined);
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(STEPS).toString());
      if (d?.isDirty) await revert(d);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const path = join(ws(), STEPS);
      rmSync(path, { force: true });
      await a.server.notify(DidChangeWatchedFilesNotification.type,
        { changes: [{ uri: vscode.Uri.file(path).toString(), type: FileChangeType.Deleted }] });
    }
  });

  // a real model's ask: local only (CI has no model), as real.8's conjure
  it('asks about a step and lands the answer', async function () {
    const model = process.env.DURANDAL_E2E_MODEL;
    if (!model) return this.skip();
    this.timeout(600_000);
    const a = await running();
    writeFileSync(join(ws(), STEPS), STEPS_TEXT);
    await vscode.workspace.getConfiguration('durandal').update('model', model, vscode.ConfigurationTarget.Global);
    try {
      await restart();
      const ed = await open(file(STEPS));
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      const from = a.shown.length;
      await vscode.commands.executeCommand('durandal.plan.ask');
      assert.ok(a.shown.slice(from).some(s => /^ask: \d+ lines · /.test(s.text)), JSON.stringify(a.shown.slice(from)));
    } finally {
      await vscode.workspace.getConfiguration('durandal').update('model', undefined, vscode.ConfigurationTarget.Global);
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(STEPS).toString());
      if (d?.isDirty) await revert(d);
      rmSync(join(ws(), STEPS), { force: true });
      await restart();
    }
  });
```

(`restart` joins the helpers import.) If the server's toggle on this step answers `not on a step` or a disabled action, print `sent`-style the `textDocument/codeAction` answer by running the request through `a.server.request(Lsp.codeAction, …)` in the test and read olifant `Lsp.hs:1550-1590` (`toggleAction`, `stepOf`) at the pin before changing the text; the test must keep one toggle resolved by the server.

Run, in the foreground with a 20-minute timeout:

```bash
npm run build && npx tsc -p . && OLIFANT_BIN=$(cd ~/projects/olifant-48f38ab && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-48f38ab DURANDAL_E2E_ONLY=real.9 node out/test/e2e/run.js 2>&1 | tail -30
```

Expected: PASS, the model test skipped.

- [ ] **Step 5: README and CHANGELOG**

In `README.md` `## Plans`, after the `**Claim checks.**` bullet:

```markdown
- **Verbs.** On a plan row, `Cmd+Alt+D P Q` (`Ctrl+Alt+D P Q`) asks the model about it, `P V`
  validates it, `P D` does the step. The row shows `⋯ asking` while it runs; `Durandal: Plan:
  Cancel` stops it. An ask's answer goes straight in, fingerprints stamped, and one undo takes
  it back (`durandal.plans.reviewAnswers` makes it wait). A validate's blocks, and a do's in a
  project without git, open beside the plan behind Accept all / Reject all. A do in a git
  project opens its review.
- **Steps.** `P Enter` adds a step under the row, `P E` shows the step's code (or folds an
  excerpt), `P X` ticks or reopens a step, `P F` lists the plan's files, and `S` / `T` (or `P S`
  / `P T`) stub and run the step's tests.
```

In `## Settings`, after `durandal.plans.foldDone`:

```markdown
- `durandal.plans.reviewAnswers`: an ask's answer waits for Accept all / Reject all (off by default).
```

In `CHANGELOG.md`, first under `## Unreleased`:

```markdown
- Plan verbs as in durandal.nvim: ask, validate and do on a row with a pending mark and Plan:
  Cancel; answers land with their facts, an ask's straight in (one undo), other blocks behind
  Accept all / Reject all beside the plan, outcomes sent; new step, excerpt, toggle, files, and
  stub and test on a step; a reopened do lands fully (milestone 6b).
```

- [ ] **Step 6: The whole suite**

```bash
npm run lint && OLIFANT_REPO=~/projects/olifant-48f38ab npm run test:unit 2>&1 | tail -5
OLIFANT_BIN=$(cd ~/projects/olifant-48f38ab && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-48f38ab npm run test:e2e 2>&1 | tail -40
npm run package 2>&1 | tail -5
```

In the foreground, the e2e with a 60-minute timeout. Expected: all PASS; the package builds. The whole-fake run has known host-stall flakes in fake.6/10/11/12 (also on main, M6a final review); a test that fails only in the whole run is re-run alone with `DURANDAL_E2E_ONLY` and reported, not "fixed" by sleeps.

- [ ] **Step 7: Commit**

```bash
git add src/pause/controller.ts src/extension.ts test/e2e/fake.13-review.e2e.ts test/e2e/real.9-plans.e2e.ts README.md CHANGELOG.md
git commit -m "plans: a reopened do lands as Plan: Do; the verbs against olifant lsp; README and CHANGELOG"
```

- [ ] **Step 8: The PR**

Use superpowers:finishing-a-development-branch. Push `m6b-verbs` and open the PR against `main` with `gh pr create`. The body:
- what M6b ships (the CHANGELOG entry), and that M6c (the loop) follows;
- the deviations listed at the top of this plan;
- the plan-time findings: olifant sends no `replace` (the client infers it), `only` is not filtered by the server, the claim pass's "Show the code here" is kind `""` with a command, one `workspace.applyEdit` is one undo element (bundle reading, confirmed by `fake.15`'s undo);
- follow-ups for after M6b: none filed yet; list any the reviews raise;
- the manual checklist, unticked:
  - [ ] the pending mark `⋯ asking` reads well at a row's end in light, dark and high-contrast themes;
  - [ ] an ask straight in, then one `Cmd+Z`, restores the plan exactly;
  - [ ] Accept all / Reject all with the proposal beside the plan; the tab closes with the answer;
  - [ ] `Cmd+Alt+D P Enter` adds a step and leaves the cursor at its end;
  - [ ] `Cmd+Alt+D S` and `T` act on the step in a plan and on the code in a module;
  - [ ] the flash after a landing is visible and brief.

End the body with the attribution lines the session gives.

## Plans

The next plan after this PR merges is M6c (the loop: the reconcile scheduler and its triggers, idle, the lens commands, errands, the claim-pass actions in the chord-`a` menu, and the stopped handling of all of it), written from the same spec in a fresh session.
