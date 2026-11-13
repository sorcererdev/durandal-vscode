# durandal-vscode M7: ghost blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An engine answer to a plan row (a validate, an ask held for review, a do in a project without git) waits under that row as a ghost until `p y` (or Tab) writes it or `p n` drops it, as durandal.nvim's virtual lines do. Every ghost row ends in `ai · +N lines` with a hover that shows the lines. The cursor's row shows its lines as VS Code ghost text. A pushed ghost-kind suggestion whose block goes under the cursor line shows its lines there too, and Tab still plans it with the model through the review. Nothing of either reaches the document, the server or the disk until it is accepted. M6's Accept all / Reject all prompt is gone.

**Architecture:** Pure rules first, with no `vscode` import, unit-tested with `node --test`:
- `plans/ghosts.ts`: the per-document ghost store (rows follow edits through M6b's `shiftRows`), the row's lines once accepted, the marker and the hover text.
- `suggest/ghostItem.ts`: one inline item shape for both kinds (the whole line replaced by itself plus the ghost's lines), refused where VS Code would draw nothing.

The VS Code glue is thin:
- `plans/ghostView.ts` (`GhostView`): the marker decoration and its hover, the inline item at the cursor row, the re-trigger on every cursor move on a ghost row, Esc's memory.
- `plans/verbs.ts`: holds answers as ghosts, owns `p y` / `p n` and the native-commit command.
- `server.ts`: the inline middleware asks the plan ghost first, then the suggestions' path.
- `suggest/`: the controller knows which ghost is drawn inline (`ghostAt`, `durandal.ghostInline`), and `Inline` serves its item.

**Tech Stack:** as M1 to M6c: TypeScript 5.9 (`module: node16`), `vscode-languageclient` 11.0.0, `vscode-languageserver-protocol` 3.18.5, esbuild 0.28, `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp. olifant at `48f38abd7e9e7ed02b341598a4744e942392e7c4` (`.olifant-ref`, unchanged).

**Spec:** `docs/superpowers/specs/2026-11-12-m7-ghost-blocks-design.md` (all of it). Facts, read before starting a task:
- `~/projects/notes/vscode-port/m7/m7-plan-facts.md`: the port's seams at `2126de9`, verbatim with line numbers (verbs, blocks, rows, prompt, commandTable, the suggest modules, server middleware, extension wiring, manifest pins, fake.15 / fake.10 / fake.9, the run commands).
- `~/projects/notes/vscode-port/m7/m7-plan-checks.md`: the spec §8 checks run in the 1.145.2 host, with the probe's code (the driving pattern for `trigger` / `commit`).
- `~/projects/notes/vscode-port/m7/ghost-blocks-surface.md` and `suggestion-seams.md`: the spec's inputs.

**Reference code (read, do not depend on):**
- durandal.nvim at `~/projects/durandal.nvim` (`b80676c`): `lua/durandal/ghosts.lua` (all, 154 lines: `show`, `at`, `accept_id`, `reject`, `clear`), `lua/durandal/plans.lua` :49-50 (the `p y` / `p n` keys and `no ghost here`), :484-528 (`landed`), :535-555 (`write_answer`).
- olifant at `~/projects/olifant-48f38ab` (detached worktree at the pin; `~/projects/olifant` is dirty on another branch, leave it alone).

**Branch, PR and models:** this plan is committed to `main` first ([[everything-on-main]] in the user's memory). Execution is one PR, M7, on branch `m7-ghost-blocks` from `main`. Suggested implementer models (the user's policy):
- Sonnet: Tasks 1 and 5.
- Opus: Tasks 2, 3 and 4 (verbs and its races, the inline middleware and VS Code's inline-suggestion behaviour, the suggestion keys).
- A final whole-branch review on Fable.

**Deviations from the spec, decided here** (say each in the PR body):
1. **The test API is `api().planVerbs.ghosts(uri)`, `.markers(uri)` and `.served`, and `api().suggest.served`.** `api().planView` is M6a's reading layer, so the spec's `planView.ghosts` would mix two owners. No `suggest.inline(uri)` reader exists; `served` records every item the middleware handed VS Code (facts §0.1-0.2).
2. **The plan ghost log events are `plan-ghost-shown`, `plan-ghost-accepted` and `plan-ghost-rejected`** (with `verb`, `blocks` and, on a decision, `how`: `chord` or `tab`). The spec's `ghost-shown` is already M3's event for a suggestion ghost (facts §0.7). `ghost-inserted` is kept.
3. **A deleted row's ghost moves to the row that takes its place** instead of being dropped. M6b's `shiftRows` already behaves this way, and so does nvim: `ghosts.lua` sets its extmarks without `invalidate`, so they move rather than die. The spec's §3.1 claim about nvim is wrong.
4. **An item is served only when the row's new text starts with its current text and is at most 5000 characters long** (plan checks §1). VS Code draws no deletion, would draw a subsequence replace as in-line insertions, and gives up past 5000 characters. A do's step re-spelled from `- [ ]` to `- [x]` is such a replace: its marker, hover and chords work, and no lines are drawn.
5. **The ghost is asked for again on every cursor move on its row**, for plan ghosts and suggestion ghosts. VS Code hides an inline suggestion on any cursor move and does not ask again (plan checks §2). The spec said "once per entry".
6. **Esc on a plan ghost row is ours: `durandal.plan.ghostEscape` under the new context key `durandal.planGhostRow`.** It hides the ghost and remembers the row until the cursor leaves it (spec §0.10). VS Code's own Esc cannot be heard, so without this the next cursor move would bring the ghost back.
7. **A word-wise or line-wise accept (⌘→, Accept Word / Accept Line in the hover toolbar) is a known limit.** It inserts the ghost's leading line break and indent, runs no command, and the ghost hides until the cursor returns (plan checks §4). The spec's §3.3 ("plain typing, the ghost re-renders") and §0.9's ⌘→ half were wrong. A plan ghost stays attached to its row. For a suggestion, the band clears by M3's cursor-off-the-line rule and no `ghost-inserted` is logged. The hover toolbar's Accept is a full commit and behaves as the spec says. The manual checklist walks it.
8. **The native commit names the blocks by key, not by row.** `durandal.plan.ghostAccepted` carries `{uri, gen, keys}`. VS Code may report its own edit as a change that starts at the row's column 0, which would move the row before the command runs.
9. **`commands.ts` stays as `registerServerNamed`** and registers the server-named commands only; `NOT_YET` goes. `SERVER_NAMED` is empty today, but its type forces an entry, and so a registration, for any client command olifant adds later.
10. **The titles are "Plan: Accept Ghost" and "Plan: Reject Ghost"**, in the palette's title case (the spec wrote "ghost").
11. **A `p y` whose edit VS Code refuses keeps the ghosts** and says `VS Code did not apply the edit`.
12. **No real e2e ghost-kind case.** Whether olifant's python chain ever classifies a ghost was not checked; the manual checklist covers the suggestion ghost lines (spec §6 already lists it as a follow-up candidate).
13. **`GateIn.nonInline` and `gate.ts` are unchanged.** The spec's "`nonInline` becomes `ghostAt`" lands in `Controller` (a new `ghostAt` beside `nonInline`) and in `Inline.inline`, which serves the ghost item before the gate.

## Global Constraints

- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency. Every API used must exist in 1.91 (`InlineCompletionItem`, `InlineCompletionContext`, `MarkdownString`, `ThemeColor('editorGhostText.foreground')` all do).
- No file outside `src/protocol.ts` spells an `olifant/*` method string. M7 adds no method; outcomes go through `Olifant.plansOutcome` as today.
- Pure modules import nothing from `vscode`: `plans/ghosts.ts`, `suggest/ghostItem.ts`, `plans/blocks.ts`, `plans/rows.ts`, `plans/words.ts`, `suggest/recognition.ts`, `suggest/controller.ts`.
- Rows are 0-based everywhere: store rows, `ghosts(uri)` rows, item lines, VS Code positions.
- Words are durandal.nvim's, verbatim: `no ghost here` (plans.lua :49-50), said as a warning. The marker is `ai · +N lines`, and `ai · +1 line` for one line.
- Nothing of a ghost reaches the document, the server or the disk until it is accepted: no text edit, no `didChange`, no outcome before `p y`, `p n` or a commit.
- An inline item's `insertText` is a plain string, never a `SnippetString`. A snippet with tab stops turns a word-wise accept into a full one (plan checks §4).
- `durandal.ghosts` off turns off every suggestion kind. Plan ghost blocks ignore it.
- After a server stop or restart, no ghost stands: the store is cleared, the markers go, a late native commit does nothing (its `gen` is stale).
- One `p y` is one edit and one undo step. Undo of an accept removes the text; the ghost does not return.
- Durandal never saves a plan (`applyServerEdit` and `writeLines` leave it dirty).
- Context keys: `durandal.planGhostRow` (Task 3) and `durandal.ghostInline` (Task 4) are the only new ones. Each is set by a literal `'setContext', 'durandal.<key>'` (the manifest test greps for it).
- The working hours rule applies to execution: no agent or background work 9am–5pm America/New_York, Monday to Friday.

## Review Focus

- **Two answers on one row.** A second validate under a row that already has a ghost appends its blocks after the first answer's. `p y` writes all of them in answer order as one edit and sends `accepted` for each block against its own answer's id. Task 2's e2e runs two validates on one row.
- **A plan closed, or reopened with another language, while it has ghosts.** The ghosts are dropped with no outcome and no word, and the reopened plan has none. Task 2's e2e switches the language with a ghost held.
- **`p y` on a row whose verb is still running** (the `⋯` mark, no ghost yet). It says `no ghost here`, and the verb lands its ghost afterwards as usual. Task 2's e2e holds a validate and presses `p y` on its row.
- **Typing on the ghost row.** The item is recomputed from the row's current text, so the ghost follows the typed text and still lands under it. Task 3's e2e types at the row's end and checks the served item and the commit.
- **A native commit from before a server restart.** The late `durandal.plan.ghostAccepted` carries a stale `gen` and does nothing, even when a new answer put a ghost on the same row. Task 3's e2e calls it with the old arguments after a restart.

---

### Task 1: The ghost store (pure)

**Files:**
- Create: `src/plans/ghosts.ts`
- Test: `test/unit/ghosts.test.ts` (new)

**Interfaces:**
- Consumes: `blocks.ts` `landing(lines, facts, placed): { lines: string[]; rows: number[] }`, `Placed { index; row; replace; lines }`, `Verb`; `rows.ts` `LineChange`, `shiftRows(row, cs)`.
- Produces (`src/plans/ghosts.ts`):
  - `interface Ghost { key: number; id: string | undefined; verb: Verb; index: number; row: number; replace: boolean; lines: string[] }`
  - `class Ghosts` with `add(uri: string, verb: Verb, id: string | undefined, placed: readonly Placed[]): void`; `at(uri: string, row: number): Ghost[]`; `rows(uri: string): number[]`; `take(uri: string, row: number): Ghost[]`; `takeKeys(uri: string, keys: readonly number[]): Ghost[]`; `put(uri: string, blocks: readonly Ghost[]): void`; `shift(uri: string, cs: readonly LineChange[]): boolean`; `drop(uri: string): void`; `clear(): void`.
  - `rowLines(rowText: string, blocks: readonly Ghost[]): string[]`
  - `lineCount(blocks: readonly Ghost[]): number`
  - `markerText(n: number): string`
  - `hoverText(blocks: readonly Ghost[]): string`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/ghosts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Placed } from '../../src/plans/blocks';
import { Ghosts, hoverText, lineCount, markerText, rowLines } from '../../src/plans/ghosts';

const U = 'file:///w/one/plans/v.md';
const p = (index: number, row: number, lines: string[], replace = false): Placed => ({ index, row, replace, lines });

// durandal.nvim ghosts.lua show / at: an answer's blocks under their rows, kept per buffer
test('add keeps each block with its answer\'s id and verb; at gives a row\'s blocks in the order they came', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two']), p(2, 2, ['  - early'])]);
  g.add(U, 'ask', 'S1', [p(0, 5, ['  - three'])]);
  assert.deepEqual(g.at(U, 5).map(b => [b.id, b.verb, b.index, b.lines[0]]),
    [['V1', 'validate', 0, '  - one'], ['V1', 'validate', 1, '  - two'], ['S1', 'ask', 0, '  - three']]);
  assert.deepEqual(g.rows(U), [2, 5]);
  assert.deepEqual(g.at(U, 3), []);
  assert.deepEqual(g.rows('file:///w/other.md'), []);
});

test('every block gets a key of its own; an answer without an id keeps undefined', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 1, ['a']), p(1, 1, ['b'])]);
  g.add(U, 'do', undefined, [p(0, 1, ['c'])]);
  const keys = g.at(U, 1).map(b => b.key);
  assert.equal(new Set(keys).size, 3);
  assert.equal(g.at(U, 1)[2].id, undefined);
});

test('add copies the lines: changing the answer\'s array changes no ghost', () => {
  const g = new Ghosts();
  const lines = ['  - one'];
  g.add(U, 'validate', 'V1', [p(0, 5, lines)]);
  lines.push('  - more');
  assert.deepEqual(g.at(U, 5)[0].lines, ['  - one']);
});

test('take removes and returns a row\'s blocks; takeKeys the blocks named; put brings blocks back', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a']), p(1, 2, ['b'])]);
  const five = g.take(U, 5);
  assert.deepEqual(five.map(b => b.index), [0]);
  assert.deepEqual(g.rows(U), [2]);
  assert.deepEqual(g.take(U, 5), []);
  g.put(U, five);
  assert.deepEqual(g.rows(U), [2, 5]);
  const two = g.at(U, 2)[0];
  assert.deepEqual(g.takeKeys(U, [two.key, 9999]).map(b => b.index), [1]);
  assert.deepEqual(g.takeKeys(U, [two.key]), []);
  assert.deepEqual(g.rows(U), [5]);
  g.put(U, []);
  assert.deepEqual(g.rows(U), [5]);
});

// the rows follow the edits as M6b's verbs' rows do (rows.ts, nvim's extmarks without invalidate)
test('shift: typed above or at column 0 moves the row; a line break inside it does not; a deleted row\'s ghost takes the next row\'s place', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a'])]);
  assert.equal(g.shift(U, [{ startLine: 0, startChar: 0, endLine: 0, newLines: 1 }]), true);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 6, startChar: 3, endLine: 6, newLines: 1 }]);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 6, startChar: 0, endLine: 7, newLines: 0 }]);
  assert.deepEqual(g.rows(U), [6]);
  g.shift(U, [{ startLine: 2, startChar: 0, endLine: 4, newLines: 0 }]);
  assert.deepEqual(g.rows(U), [4]);
  assert.equal(g.shift('file:///w/other.md', [{ startLine: 0, startChar: 0, endLine: 0, newLines: 1 }]), false);
});

test('drop forgets one plan; clear forgets every plan', () => {
  const g = new Ghosts();
  const V = 'file:///w/one/plans/w.md';
  g.add(U, 'validate', 'V1', [p(0, 1, ['a'])]);
  g.add(V, 'validate', 'V2', [p(0, 1, ['b'])]);
  g.drop(U);
  assert.deepEqual(g.rows(U), []);
  assert.deepEqual(g.rows(V), [1]);
  g.clear();
  assert.deepEqual(g.rows(V), []);
});

// ghosts.lua accept_id: under the row, or over it (a do's step); several under one row in order
test('rowLines: the row once its blocks are in', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two', '  - three'])]);
  assert.deepEqual(rowLines('- e target line', g.at(U, 5)), ['- e target line', '  - one', '  - two', '  - three']);
  g.add(U, 'do', 'D1', [p(0, 8, ['- [x] step @src/a.py:Foo', '  - did it'], true)]);
  assert.deepEqual(rowLines('- [ ] step @src/a.py:Foo', g.at(U, 8)), ['- [x] step @src/a.py:Foo', '  - did it']);
  g.add(U, 'validate', 'V2', [p(0, 3, [])]);
  assert.deepEqual(rowLines('- c', g.at(U, 3)), ['- c']);
});

test('lineCount and the marker: ai · +N lines, one line singular', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['a']), p(1, 5, ['b', 'c'])]);
  assert.equal(lineCount(g.at(U, 5)), 3);
  assert.equal(markerText(3), 'ai · +3 lines');
  assert.equal(markerText(1), 'ai · +1 line');
  assert.equal(markerText(0), 'ai · +0 lines');
});

test('hoverText: the row\'s lines fenced as markdown, the fence longer than any backticks in them', () => {
  const g = new Ghosts();
  g.add(U, 'validate', 'V1', [p(0, 5, ['  - one']), p(1, 5, ['  - two'])]);
  assert.equal(hoverText(g.at(U, 5)), '```markdown\n  - one\n  - two\n```');
  g.add(U, 'validate', 'V2', [p(0, 7, ['  - see ```code``` here'])]);
  assert.equal(hoverText(g.at(U, 7)), '````markdown\n  - see ```code``` here\n````');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL: `tsc` reports `Cannot find module '../../src/plans/ghosts'`.

- [ ] **Step 3: Write the store**

Create `src/plans/ghosts.ts`:

```ts
// Ghost blocks (M7 spec §2, §3.1; durandal.nvim ghosts.lua): an answer's blocks held under their
// plan rows until p y / p n, or a native commit, decides them. Rows follow the document's edits
// as nvim's extmarks do (rows.ts). No vscode import.
import { landing, Placed, Verb } from './blocks';
import { LineChange, shiftRows } from './rows';

// Ghost: one block of an answer: key (unique, names it in a native commit), its answer's id and
// verb, index (its place in the answer: its outcome names it), its row now, whether it replaces
// the row, its lines (fingerprints stamped by placeBlocks)
export interface Ghost { key: number; id: string | undefined; verb: Verb; index: number; row: number; replace: boolean; lines: string[] }

export class Ghosts {
  // per document, in the order they came: blocks under one row keep their answers' order
  private readonly m = new Map<string, Ghost[]>();
  private next = 0;

  add(uri: string, verb: Verb, id: string | undefined, placed: readonly Placed[]): void {
    const list = this.m.get(uri) ?? [];
    for (const p of placed) list.push({ key: ++this.next, id, verb, index: p.index, row: p.row, replace: p.replace, lines: [...p.lines] });
    if (list.length > 0) this.m.set(uri, list);
  }

  // at: the blocks under ROW, in the order they came
  at(uri: string, row: number): Ghost[] {
    return (this.m.get(uri) ?? []).filter(g => g.row === row);
  }

  // rows: the rows with a ghost, top to bottom
  rows(uri: string): number[] {
    return [...new Set((this.m.get(uri) ?? []).map(g => g.row))].sort((a, b) => a - b);
  }

  // take: ROW's blocks, removed
  take(uri: string, row: number): Ghost[] {
    return this.remove(uri, g => g.row === row);
  }

  // takeKeys: the blocks named by KEYS that are still here, removed
  takeKeys(uri: string, keys: readonly number[]): Ghost[] {
    return this.remove(uri, g => keys.includes(g.key));
  }

  // put: BLOCKS taken back (an accept VS Code did not apply), before the rest
  put(uri: string, blocks: readonly Ghost[]): void {
    if (blocks.length === 0) return;
    this.m.set(uri, [...blocks, ...(this.m.get(uri) ?? [])]);
  }

  // shift: the rows after one change event's changes; true when URI has ghosts
  shift(uri: string, cs: readonly LineChange[]): boolean {
    const list = this.m.get(uri);
    if (!list) return false;
    for (const g of list) g.row = shiftRows(g.row, cs);
    return true;
  }

  drop(uri: string): void { this.m.delete(uri); }

  clear(): void { this.m.clear(); }

  private remove(uri: string, f: (g: Ghost) => boolean): Ghost[] {
    const list = this.m.get(uri) ?? [];
    const out = list.filter(f);
    const rest = list.filter(g => !f(g));
    if (rest.length > 0) this.m.set(uri, rest);
    else this.m.delete(uri);
    return out;
  }
}

// rowLines: ROWTEXT once BLOCKS (all under one row) are written: each goes under the row or
// over it, in their order (M6b's landing on the row alone)
export function rowLines(rowText: string, blocks: readonly Ghost[]): string[] {
  return landing([rowText], [], blocks.map(b => ({ index: b.index, row: 0, replace: b.replace, lines: b.lines }))).lines;
}

export const lineCount = (blocks: readonly Ghost[]): number => blocks.reduce((k, b) => k + b.lines.length, 0);

// markerText: the end of a ghost row (nvim's "ai" sign)
export const markerText = (n: number): string => `ai · +${n} ${n === 1 ? 'line' : 'lines'}`;

// hoverText: the row's proposal, its blocks' lines in order, as a fenced markdown block; the
// fence is longer than any run of backticks in the lines
export function hoverText(blocks: readonly Ghost[]): string {
  const lines = blocks.flatMap(b => b.lines);
  const runs = lines.flatMap(l => [...l.matchAll(/`+/g)].map(m => m[0].length));
  const fence = '`'.repeat(Math.max(2, ...runs) + 1);
  return `${fence}markdown\n${lines.join('\n')}\n${fence}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: PASS, every test (the earlier 482 plus the 9 new ones).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/plans/ghosts.ts test/unit/ghosts.test.ts
git commit -m "plans: the ghost store (pure): rows that follow edits, a row's lines once accepted, marker, hover"
```

---

### Task 2: Plan ghosts held, marked, and decided by `p y` / `p n`

**Files:**
- Create: `src/plans/ghostView.ts`
- Modify: `src/plans/verbs.ts` (whole file below), `src/plans/words.ts`, `src/plans/blocks.ts` (drop `proposalText`), `src/plans/settings.ts:34` (comment), `src/actionLog.ts`, `src/commandTable.ts`, `src/commands.ts`, `src/extension.ts`, `package.json`
- Delete: `src/plans/prompt.ts`
- Test: `test/unit/words.test.ts`, `test/unit/blocks.test.ts`, `test/unit/manifest.test.ts`, `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: Task 1's `Ghosts`, `Ghost`, `rowLines`, `lineCount`, `markerText`, `hoverText`; `here.ts` `planHere(docs): Promise<PlanHere | undefined>` (`{ editor, uri, row }`); `lineEdits.ts` `linesOf`, `writeLines(doc, before, after): Promise<boolean>`.
- Produces:
  - `GhostView` (`src/plans/ghostView.ts`): `constructor(d: { ghosts: Ghosts })`, `register(context)`, `markers(uri): { row: number; text: string }[]`, `paint(uri)`, `paintAll()`, `forget(uri)`.
  - `PlanVerbsApi.ghosts(uri): { row: number; lines: string[]; marker: string }[]` and `PlanVerbsApi.markers(uri): { row: number; text: string }[]` (`waiting` is gone).
  - `VerbsDeps` is `{ server; say; planDocs; options; landed; log: ActionLog }` (`ui` and `docs` are gone).
  - `PlanVerbs.decide(outcome: 'accepted' | 'rejected'): Promise<void>` (the two chords).
  - `PlanVerbs` private `decided(uri: string, blocks: readonly Ghost[], outcome: 'accepted' | 'rejected', how: 'chord' | 'tab'): void` (Task 3's native commit uses it).
  - `ActionEvent` gains `{ event: 'plan-ghost-shown'; verb: string; blocks: number }` and `{ event: 'plan-ghost-accepted' | 'plan-ghost-rejected'; verb: string; blocks: number; how: 'chord' | 'tab' }`, and `{ event: 'ghost-inserted'; generator: string }` (Task 4 writes it).
  - `words.ts`: `NO_GHOST = 'no ghost here'`; `promptWord` is gone.
  - `commands.ts`: `registerServerNamed(context, say)`.
  - `BUILT['durandal.plan.accept'] = { title: 'Plan: Accept Ghost' }`, `BUILT['durandal.plan.reject'] = { title: 'Plan: Reject Ghost' }`; `NOT_YET` is gone; `notYet` stays (server-named commands use it).

- [ ] **Step 1: Write the failing unit tests**

In `test/unit/words.test.ts`, change line 3's import: drop `promptWord`, add `NO_GHOST`. Replace line 16 (`assert.equal(promptWord(...), ...)`) with:

```ts
  assert.equal(NO_GHOST, 'no ghost here');
```

and rename that test (line 15) to `'no ghost here, the tests notice and a files item'`.

In `test/unit/blocks.test.ts`, drop `proposalText` from the import (line 4) and delete the test `'proposalText: the blocks\' lines in order, a blank line between blocks'` (lines 107-112).

In `test/unit/manifest.test.ts`:

1. Line 8: `import { BUILT, FORM_KEYS, KEYS, PREFIX, SERVER_NAMED, SUGGEST_KEYS, TDD_HERE_WHEN, TDD_WHEN } from '../../src/commandTable';`
2. Replace lines 10-20 (the first test) with:

```ts
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
```

3. Line 107: `for (const id of ['durandal.plan.files', 'durandal.plan.stub', 'durandal.plan.test']) assert.ok(id in BUILT, id);`. Delete line 111 (`assert.deepEqual(Object.keys(NOT_YET).sort(), ...)`).
4. Line 121: `for (const id of ['durandal.test.here', 'durandal.test.file', 'durandal.test.all', 'durandal.jump']) assert.ok(id in BUILT, id);`
5. Line 137: delete `assert.ok(!('durandal.plan.review' in NOT_YET));`.
6. Replace lines 198-206 (the `'M6b: reviewAnswers is a boolean, false; accept and reject are milestone 7, and say so'` test) with:

```ts
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
```

7. Line 210: `assert.ok(id in BUILT, id);`. Line 217: `for (const id of ['durandal.plan.newStep', 'durandal.plan.excerpt', 'durandal.plan.toggle']) assert.ok(id in BUILT, id);`

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL: `tsc` reports that `NO_GHOST` is not exported by `words.ts` (and the manifest test's titles differ once it compiles).

- [ ] **Step 3: The words, the log events, the command table, the manifest**

`src/plans/words.ts`: delete lines 45-46 (`promptWord`) and add, after `NO_RECORD` (line 24):

```ts
// p y / p n on a row with no ghost (plans.lua :49-50)
export const NO_GHOST = 'no ghost here';
```

`src/plans/blocks.ts`: delete lines 152-153 (`proposalText`).

`src/actionLog.ts`: replace line 17 (`| { event: 'snippet-anticipated'; generator: string; line: number };`) with:

```ts
  | { event: 'snippet-anticipated'; generator: string; line: number }
  // plan ghost blocks (M7 spec §5): held under a row, then decided by a chord or by Tab
  | { event: 'plan-ghost-shown'; verb: string; blocks: number }
  | { event: 'plan-ghost-accepted' | 'plan-ghost-rejected'; verb: string; blocks: number; how: 'chord' | 'tab' }
  // a suggestion's ghost lines inserted as they stand (the hover toolbar's Accept): no fill
  | { event: 'ghost-inserted'; generator: string };
```

`src/commandTable.ts`: delete lines 3-7 (`NOT_YET`). Replace the comment at lines 9-11 with:

```ts
// The commands, contributed with these titles. The form keys' commands (spec §9) are enabled
// only while the generate form is open; the suggestion's only while one is shown (M3 spec §4).
```

and add to `BUILT`, after the `'durandal.plan.cancel'` entry:

```ts
  'durandal.plan.accept': { title: 'Plan: Accept Ghost' },
  'durandal.plan.reject': { title: 'Plan: Reject Ghost' },
```

Leave `SERVER_NAMED_INFO`, `SERVER_NAMED` and `notYet` as they are.

`src/commands.ts`, whole file:

```ts
import * as vscode from 'vscode';
import { SERVER_NAMED, notYet } from './commandTable';
import type { Say } from './server';

// registerServerNamed: the commands the server names that no milestone builds yet say so (none
// today; SERVER_NAMED's type makes a new client command name a milestone). The command returns
// at once: the notice's promise settles only when it is dismissed.
export function registerServerNamed(context: vscode.ExtensionContext, say: Say): void {
  for (const [id, { title, milestone }] of Object.entries(SERVER_NAMED)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, () => { void say('info', notYet(title, milestone)); }));
  }
}
```

`src/extension.ts`: line 6 `import { registerServerNamed } from './commands';`; line 278 `registerServerNamed(context, say);`; line 190:

```ts
  const verbs = new PlanVerbs({ server: s, say, planDocs, options: () => plansOptions, landed, log });
```

and the `Api` comment at line 92: `// the plan verbs (M6b) and their ghosts (M7): the rows in the air, their marks, the flashes, the ghost rows`.

`package.json`: the two command titles (lines 249-257) become `"Plan: Accept Ghost"` and `"Plan: Reject Ghost"`. The `durandal.plans.reviewAnswers` `markdownDescription` (line 109) becomes:

```json
          "markdownDescription": "An ask's answer waits as a ghost under its row for `Ctrl+Alt+D P Y` or `P N`, as a validate's does. Off: it goes straight into the plan, and one undo takes it back."
```

`src/plans/settings.ts:34`, the comment: `// an ask's answer waits as a ghost under its row, as a validate's does (M7)`.

- [ ] **Step 4: The marker view**

Create `src/plans/ghostView.ts`:

```ts
import * as vscode from 'vscode';
import { Ghosts, hoverText, lineCount, markerText } from './ghosts';

// GhostView draws the ghost rows (M7 spec §3.2): each one ends in `ai · +N lines`, in VS Code's
// ghost-text colour, and its hover shows the row's proposal, so every ghost can be read without
// moving the cursor (nvim's "ai" sign and virtual lines).
export class GhostView implements vscode.Disposable {
  // drawn: the markers on each plan's visible editors, top to bottom (the e2e tests read them)
  private readonly drawn = new Map<string, { row: number; text: string }[]>();
  private readonly marker = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), margin: '0 0 0 1.5em' },
  });

  constructor(protected readonly d: { ghosts: Ghosts }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this, vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()));
  }

  markers(uri: string): { row: number; text: string }[] { return [...(this.drawn.get(uri) ?? [])]; }

  // paint: the markers of URI's ghost rows, in every editor on it
  paint(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  paintAll(): void {
    this.drawn.clear();
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  forget(uri: string): void { this.drawn.delete(uri); }

  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const marks = this.d.ghosts.rows(uri).filter(row => row < doc.lineCount).map(row => {
      const blocks = this.d.ghosts.at(uri, row);
      return { row, text: markerText(lineCount(blocks)), hover: hoverText(blocks) };
    });
    ed.setDecorations(this.marker, marks.map(m => {
      const end = doc.lineAt(m.row).range.end;
      return {
        range: new vscode.Range(end, end),
        hoverMessage: new vscode.MarkdownString(m.hover),
        renderOptions: { after: { contentText: m.text } },
      };
    }));
    if (marks.length > 0) this.drawn.set(uri, marks.map(m => ({ row: m.row, text: m.text })));
  }

  dispose(): void { this.marker.dispose(); }
}
```

- [ ] **Step 5: PlanVerbs holds ghosts and decides them**

Delete `src/plans/prompt.ts`. Replace `src/plans/verbs.ts` with:

```ts
import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { ErrandParams, ErrandResult, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { CANCELLED } from '../tdd/flights';
import { landing, Placed, placeBlocks, throughEdits, Verb } from './blocks';
import { applyLineEdits, factEdits, TextEdit0 } from './facts';
import { Ghost, Ghosts, lineCount, markerText, rowLines } from './ghosts';
import { GhostView } from './ghostView';
import { planHere, runningHere } from './here';
import { linesOf, writeLines } from './lineEdits';
import type { PlanDocs } from './planDocs';
import { LineChange, shiftRows } from './rows';
import type { PlansOptions } from './settings';
import {
  CANCELLED_WORD, doWord, landedWord, NO_GHOST, NO_PLAN, NOT_APPLIED, NOTHING_RUNNING, nothingBack, PENDING, RUNNING_HERE,
} from './words';

export interface VerbsDeps {
  server: Server; say: Say; planDocs: PlanDocs; options: () => PlansOptions; landed: Landed; log: ActionLog;
}

export interface PlanVerbsApi {
  // the verbs in the air on a plan, at their rows as they are now
  running(uri: string): { row: number; verb: Verb }[];
  // the pending marks drawn on a plan's visible editors now, top to bottom
  pending(uri: string): string[];
  // each landing's flashed row
  flashes: { uri: string; row: number }[];
  // the ghost blocks on a plan, one entry per row, top to bottom: the row as it is now, its
  // blocks' lines in answer order, the marker the row carries (M7)
  ghosts(uri: string): { row: number; lines: string[]; marker: string }[];
  // the markers drawn on a plan's visible editors now, top to bottom
  markers(uri: string): { row: number; text: string }[];
}

// Entry: a verb in the air. row follows the edits (nvim's extmark); request is the row sent; tick
// the plan's version then; gone: its answer is not wanted any more (cancelled, plan closed,
// server stopped).
interface Entry { uri: string; verb: Verb; row: number; request: number; tick: number; cts: vscode.CancellationTokenSource; gone: boolean }

const REQUEST = { ask: Olifant.plansAsk, validate: Olifant.plansValidate, do: Olifant.plansDo } as const;
const FLASH_MS = 300;

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === keyOf(uri));

// PlanVerbs: ask, validate and do on a plan row (durandal.nvim plans.lua dispatch, landed,
// cancel; M6 spec §4.1-4.2), and the ghosts their answers leave (M7; ghosts.lua). One request
// per row; the row shows a pending mark while it runs. The answer lands in nvim's order: facts
// (only at the version asked), a do's review notice, blocks (an ask's straight in, the others
// held as ghosts under their rows), the notice, a flash.
export class PlanVerbs {
  private readonly entries = new Set<Entry>();
  private readonly ghosts = new Ghosts();
  private readonly view: GhostView;
  // gen: bumped by every server stop; a ghost from an older start is gone
  private gen = 0;
  // the plan's reconcile, which Plan: Cancel also stops (set once both exist)
  private reconcile: { cancel(uri: string): boolean } | undefined;
  private readonly flashes: { uri: string; row: number }[] = [];
  // drawn: the pending marks' texts painted on each plan's visible editors, top to bottom
  private readonly drawn = new Map<string, string[]>();
  private readonly pending = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground') },
  });
  private readonly flash = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });

  constructor(private readonly d: VerbsDeps) {
    this.view = new GhostView({ ghosts: this.ghosts });
  }

  setReconcile(r: { cancel(uri: string): boolean }): void { this.reconcile = r; }

  register(context: vscode.ExtensionContext): void {
    this.view.register(context);
    context.subscriptions.push(
      this.pending,
      this.flash,
      vscode.commands.registerCommand('durandal.plan.ask', () => this.command('ask')),
      vscode.commands.registerCommand('durandal.plan.validate', () => this.command('validate')),
      vscode.commands.registerCommand('durandal.plan.do', () => this.command('do')),
      vscode.commands.registerCommand('durandal.plan.cancel', () => this.cancel()),
      vscode.commands.registerCommand('durandal.plan.accept', () => this.decide('accepted')),
      vscode.commands.registerCommand('durandal.plan.reject', () => this.decide('rejected')),
      vscode.workspace.onDidChangeTextDocument(e => this.moved(e)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()),
    );
  }

  api(): PlanVerbsApi {
    return {
      running: uri => [...this.entries].filter(e => e.uri === keyOf(uri)).map(e => ({ row: e.row, verb: e.verb })),
      pending: uri => [...(this.drawn.get(keyOf(uri)) ?? [])],
      flashes: this.flashes,
      ghosts: uri => {
        const key = keyOf(uri);
        return this.ghosts.rows(key).map(row => {
          const blocks = this.ghosts.at(key, row);
          return { row, lines: blocks.flatMap(b => b.lines), marker: markerText(lineCount(blocks)) };
        });
      },
      markers: uri => this.view.markers(keyOf(uri)),
    };
  }

  // command: the verb on the active plan's cursor row
  async command(verb: Verb): Promise<void> {
    const h = await runningHere({ planDocs: this.d.planDocs, server: this.d.server, say: this.d.say });
    if (h) await this.run(h.uri, verb, h.row);
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
      if (!(await writeLines(doc, lines, applyLineEdits(lines, facts)))) {
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      void this.d.say('info', doWord(r));
      this.d.landed.fire('do');
      return;
    }
    // the request row where it is once the facts are in, computed before the write (no event order)
    const tracked = throughEdits(facts, e.row);
    const withFacts = applyLineEdits(lines, facts);
    const placed = placeBlocks(withFacts, r.blocks, e.verb, e.request, tracked);
    const straight = e.verb === 'ask' && !this.d.options().reviewAnswers;
    let rows: number[];
    if (straight) {
      // an ask's answer goes straight in: facts and blocks in one edit, one undo step
      const written = await this.writeBlocks(doc, lines, facts, placed, r.id);
      if (!written) return;
      rows = written;
    } else {
      // the facts now; the blocks become ghosts, placed on the plan as the facts left it
      if (!(await writeLines(doc, lines, withFacts))) {
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      rows = placed.map(p => p.row);
    }
    const count = placed.reduce((k, p) => k + p.lines.length, 0);
    void this.d.say('info', landedWord(e.verb, count, r));
    this.flashRow(doc, rows.at(-1) ?? tracked);
    if (e.verb === 'do') this.d.landed.fire('do');
    if (!straight && placed.length > 0) this.hold(e.uri, e.verb, placed, typeof r.id === 'string' ? r.id : undefined);
  }

  // hold: the blocks as ghosts under their rows until a decision (M7 spec §3.1); a second
  // answer on a row goes after the first's blocks
  private hold(uri: string, verb: Verb, placed: readonly Placed[], id: string | undefined): void {
    this.ghosts.add(uri, verb, id, placed);
    this.d.log.write({ event: 'plan-ghost-shown', verb, blocks: placed.length });
    this.view.paint(uri);
  }

  // decide: p y / p n on the active plan's cursor row, for every ghost block there (spec §3.3,
  // decision 6). Accept writes them in one edit, one undo step; reject writes nothing. The
  // blocks are taken before the write: the write's own change moves the row.
  async decide(outcome: 'accepted' | 'rejected'): Promise<void> {
    const h = await planHere(this.d.planDocs);
    if (!h) {
      void this.d.say('error', NO_PLAN);
      return;
    }
    const blocks = this.ghosts.take(h.uri, h.row);
    if (blocks.length === 0) {
      void this.d.say('warn', NO_GHOST);
      return;
    }
    this.view.paint(h.uri);
    if (outcome === 'accepted') {
      const doc = h.editor.document;
      // read, compute and write with no await between
      const lines = linesOf(doc);
      const after = rowLines(lines[h.row] ?? '', blocks);
      if (!(await writeLines(doc, lines, [...lines.slice(0, h.row), ...after, ...lines.slice(h.row + 1)]))) {
        // nothing was written: the ghosts stay
        this.ghosts.put(h.uri, blocks);
        this.view.paint(h.uri);
        void this.d.say('error', NOT_APPLIED);
        return;
      }
      this.flashRow(doc, h.row + after.length - 1);
    }
    this.decided(h.uri, blocks, outcome, 'chord');
  }

  // decided: BLOCKS (taken from the store) are decided: each one's outcome to the server, the
  // decision logged, an accept landed (ghosts.lua accept_id / reject: also a block with no lines)
  private decided(uri: string, blocks: readonly Ghost[], outcome: 'accepted' | 'rejected', how: 'chord' | 'tab'): void {
    this.outcomes(uri, blocks, outcome);
    this.d.log.write({ event: outcome === 'accepted' ? 'plan-ghost-accepted' : 'plan-ghost-rejected', verb: blocks[0].verb, blocks: blocks.length, how });
    if (outcome === 'accepted') this.d.landed.fire('accept');
    this.view.paint(uri);
  }

  // writeBlocks: DOC's LINES (read just now, no await since) with FACTS and the PLACED blocks
  // written in one edit, one undo step; then, nvim's `if wrote`, outcome accepted for each block
  // that had lines and landed accept, only when some did. The blocks' rows in the result, or
  // undefined (said) when VS Code did not apply the edit. An ask straight in.
  private async writeBlocks(
    doc: vscode.TextDocument, lines: readonly string[], facts: readonly TextEdit0[], placed: readonly Placed[], id: unknown,
  ): Promise<number[] | undefined> {
    const l = landing(lines, facts, placed);
    if (!(await writeLines(doc, lines, l.lines))) {
      void this.d.say('error', NOT_APPLIED);
      return undefined;
    }
    const wrote = placed.filter(p => p.lines.length > 0);
    if (wrote.length > 0) {
      this.outcomes(doc.uri.toString(), wrote.map(p => ({ id, index: p.index })), 'accepted');
      this.d.landed.fire('accept');
    }
    return l.rows;
  }

  // outcomes: each block's outcome, to the server, against its answer's id
  private outcomes(uri: string, blocks: readonly { id?: unknown; index: number }[], outcome: 'accepted' | 'rejected'): void {
    if (!this.d.server.client()) return;
    for (const b of blocks) {
      if (typeof b.id !== 'string') continue;
      this.d.server.notify(Olifant.plansOutcome, { textDocument: { uri }, id: b.id, block: b.index, outcome }).catch(() => undefined);
    }
  }

  // cancel: every verb in the air on the active plan, and its reconcile (plans.lua cancel)
  cancel(): void {
    const uri = vscode.window.activeTextEditor?.document.uri.toString();
    const mine = [...this.entries].filter(e => e.uri === uri);
    const reconciling = uri !== undefined && (this.reconcile?.cancel(uri) ?? false);
    if (mine.length === 0 && !reconciling) {
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

  // the server stopped: nothing it said stands (spec §5.7): no verb in the air, no ghost
  stopped(): void {
    this.gen++;
    for (const e of [...this.entries]) {
      e.gone = true;
      this.drop(e);
    }
    this.ghosts.clear();
    this.paintAll();
    this.view.paintAll();
  }

  // a closed plan's verbs land nothing and say nothing; its ghosts go without an outcome
  private closed(uri: string): void {
    for (const e of [...this.entries]) {
      if (e.uri !== uri) continue;
      e.gone = true;
      this.drop(e);
    }
    this.ghosts.drop(uri);
    this.view.forget(uri);
  }

  private drop(e: Entry): void {
    if (!this.entries.delete(e)) return;
    e.cts.dispose();
    this.paint(e.uri);
  }

  // moved: the rows in the air and the ghosts' rows follow the plan's edits
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
    if (any) this.paint(uri);
    if (this.ghosts.shift(uri, cs)) this.view.paint(uri);
  }

  // paint: the pending marks at the end of the running rows, in every editor on URI
  private paint(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  private paintAll(): void {
    this.drawn.clear();
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const marks = [...this.entries].filter(e => e.uri === uri && e.row < doc.lineCount).sort((a, b) => a.row - b.row);
    ed.setDecorations(this.pending, marks.map(e => {
      const end = doc.lineAt(e.row).range.end;
      return { range: new vscode.Range(end, end), renderOptions: { after: { contentText: PENDING[e.verb] } } };
    }));
    if (marks.length > 0) this.drawn.set(uri, marks.map(e => PENDING[e.verb]));
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

- [ ] **Step 6: Run lint and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -20`
Expected: lint clean (no unused import of `VirtualDocs`, `Ui` or `prompt` left anywhere); unit PASS.

- [ ] **Step 7: Rewrite the prompt cases of `fake.15-verbs` for the ghosts**

In `test/e2e/fake.15-verbs.e2e.ts`:

1. Line 4's import: drop `tabsUnder`; add `actionLog`. Line 3: drop the `FakeUi` import if nothing else in the file uses it after this step (the new step cases below do not).
2. After `const lines = ...` (line 18), add:

```ts
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);
const outcomeParams = (from: number) => sent('olifant/plans/outcome').slice(from).map(m => m.params);
```

3. In `afterEach` (lines 41-48), before `const d = docOf(PLAN);`, reject every ghost a case left (they outlive the file's reset):

```ts
    const ed = vscode.window.activeTextEditor;
    if (ed && ed.document.uri.toString() === uriOf(PLAN)) {
      for (const g of a.planVerbs.ghosts(uriOf(PLAN))) {
        ed.selection = new vscode.Selection(g.row, 0, g.row, 0);
        await vscode.commands.executeCommand('durandal.plan.reject');
      }
    }
```

4. In the case at lines 169-189 (`'a validate: the facts land now, the blocks are held under the request row as the facts moved it'`), delete the two lines that set the `FakeUi` (lines 171-172) and add, after the flash assertion (line 185):

```ts
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 4, lines: ['  - checked'], marker: 'ai · +1 line' }]);
```

5. Replace lines 252-374 (`held()`, `VALIDATE`, and the cases from `'validate: the blocks beside the plan, then Accept all...'` through `'p y and p n are milestone 7'`) with:

```ts
  const VALIDATE = {
    id: 'V1', verb: 'validate', facts: [], blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - ok', fp: null }] }],
    dropped: 0, unresolved: 0, seconds: 1, cost: null, changed: [], review: null,
  };

  // validated: VALIDATE (or R) answered for the cursor on ROW; the plan's editor
  async function validated(row = 2, r: unknown = VALIDATE): Promise<vscode.TextEditor> {
    reply('olifant/plans/validate', r);
    const ed = await at(row);
    await vscode.commands.executeCommand('durandal.plan.validate');
    return ed;
  }

  const onRow = (ed: vscode.TextEditor, row: number, col = 0) => { ed.selection = new vscode.Selection(row, col, row, col); };

  it('validate: a ghost under the target row, marked, followed through typing; p y writes it as one undo step (plans_spec :631)', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    assert.ok(a.shown.some(s => s.text === 'validate: 1 lines · 0 not found · 1 s'));
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing written before the decision');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 5, text: 'ai · +1 line' }]);
    assert.deepEqual(events(from, 'plan-ghost-shown').map(e => [e.verb, e.blocks]), [['validate', 1]]);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes, 'no outcome before the decision');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), 'typed\n'));
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)).map(g => g.row), [6]);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 6, text: 'ai · +1 line' }]);
    const typed = docOf(PLAN)!.getText();
    const fired = a.landed.fired.length;
    onRow(ed, 6, 3);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(6, 8), ['- e target line', '  - ok']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' }]);
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
    assert.deepEqual(a.planVerbs.flashes.at(-1), { uri: uriOf(PLAN), row: 7 });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-accepted').map(e => [e.verb, e.blocks, e.how]), [['validate', 1, 'chord']]);
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), typed, 'one undo step');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [], 'the ghost does not come back');
  });

  it('p n sends rejected for the row and writes nothing; no landing', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    const fired = a.landed.fired.length;
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.reject');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'rejected' }]);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    assert.equal(a.landed.fired.length, fired);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-rejected').map(e => [e.verb, e.blocks, e.how]), [['validate', 1, 'chord']]);
  });

  it('p y and p n where there is no ghost say "no ghost here" (plans.lua :49-50)', async () => {
    const a = await running();
    await at(1);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['warn', 'no ghost here']);
    await vscode.commands.executeCommand('durandal.plan.reject');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('p y on a row whose validate still runs says "no ghost here"; the answer then leaves its ghost', async () => {
    const a = await running();
    reply('olifant/plans/validate', { ...VALIDATE, delay: 2 });
    await at(5);
    const p = vscode.commands.executeCommand('durandal.plan.validate');
    await until(() => a.planVerbs.running(uriOf(PLAN)).length === 1, 'the validate in the air');
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    await p;
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
  });

  it('two blocks of one validate under one row: one marker, both written in order by one p y, an outcome each', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const ed = await validated(2, {
      ...VALIDATE, blocks: [
        { after: 0, after_text: '- e target line', lines: [{ text: '  - one', fp: null }] },
        { after: 0, after_text: '- e target line', lines: [{ text: '  - two', fp: null }, { text: '  - three', fp: null }] },
      ],
    });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - one', '  - two', '  - three'], marker: 'ai · +3 lines' }]);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(5, 9), ['- e target line', '  - one', '  - two', '  - three']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 2, 'two outcomes');
    assert.deepEqual(outcomeParams(outcomes).map(p => [p.id, p.block, p.outcome]), [['V1', 0, 'accepted'], ['V1', 1, 'accepted']]);
  });

  it('a second answer on a ghost row goes after the first; p y writes both, each outcome against its own answer', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    await validated();
    const ed = await validated(2, { ...VALIDATE, id: 'V2', blocks: [{ after: 0, after_text: '- e target line', lines: [{ text: '  - again', fp: null }] }] });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok', '  - again'], marker: 'ai · +2 lines' }]);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(5, 8), ['- e target line', '  - ok', '  - again']);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 2, 'two outcomes');
    assert.deepEqual(outcomeParams(outcomes).map(p => [p.id, p.block]), [['V1', 0], ['V2', 0]]);
  });

  it('a do with no review (no git) leaves a ghost that replaces its step when accepted (plans_spec :641)', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D1', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    const ed = await at(8);
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('durandal.plan.do');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 8, lines: ['- [x] step @src/a.py:Foo', '  - did it'], marker: 'ai · +2 lines' }]);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    onRow(ed, 8);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(8, 10), ['- [x] step @src/a.py:Foo', '  - did it']);
    assert.deepEqual(a.landed.fired.slice(fired), ['do', 'accept']);
  });

  it('a block with no lines: a ghost marked +0 lines; p y writes nothing and still sends accepted and lands', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const ed = await validated(3, { ...VALIDATE, blocks: [{ after: 3, after_text: null, lines: [] }] });
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 3, lines: [], marker: 'ai · +0 lines' }]);
    const fired = a.landed.fired.length;
    onRow(ed, 3);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.equal(outcomeParams(outcomes)[0].outcome, 'accepted');
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
  });

  it('with reviewAnswers an ask leaves a ghost; p y lands it stamped (plans_spec :560)', async () => {
    const a = await running();
    await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', true, vscode.ConfigurationTarget.Global);
    try {
      await sleep(200);
      reply('olifant/plans/ask', {
        id: 'S4', verb: 'ask', facts: [], blocks: [{ after: 3, after_text: null, lines: [{ text: '  - a @src/a.py:F', fp: 'abc1234' }, { text: '  - so', fp: null }] }],
        dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123, changed: [], review: null,
      });
      const ed = await at(3);
      await vscode.commands.executeCommand('durandal.plan.ask');
      assert.ok(a.shown.some(s => s.text === 'ask: 2 lines · 1 not found · 9.1 s · $0.0123'));
      assert.equal(docOf(PLAN)!.getText(), TEXT);
      onRow(ed, 3);
      await vscode.commands.executeCommand('durandal.plan.accept');
      assert.deepEqual(lines().slice(4, 6), ['  - a @src/a.py:F ✓ abc1234', '  - so']);
    } finally {
      await vscode.workspace.getConfiguration('durandal.plans').update('reviewAnswers', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  it('a server stop drops the ghosts and their markers without an outcome; p y then finds none', async () => {
    const a = await running();
    await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    await restart();
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), []);
    const ed = await at(5);
    onRow(ed, 5);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.equal(a.shown.at(-1)!.text, 'no ghost here');
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('a plan reopened with another language drops its ghosts without an outcome or a word', async () => {
    const a = await running();
    const ed = await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = a.shown.length;
    // VS Code closes the document and opens a new one on a language change
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.shown.slice(from), []);
  });
```

- [ ] **Step 8: Run the verbs suite**

Run: `npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -40`
Expected: every `fake.15` case passes, the new ones included.

- [ ] **Step 9: Commit**

```bash
git add -A src test package.json
git commit -m "plans: answers wait as ghosts under their rows; p y writes a row's ghosts, p n drops them; the prompt goes"
```

---

### Task 3: The plan ghost drawn inline; Tab commits it; Esc hides it

**Files:**
- Create: `src/suggest/ghostItem.ts`
- Modify: `src/plans/ghostView.ts`, `src/plans/verbs.ts`, `src/suggest/inline.ts` (`asInline`), `src/server.ts`, `src/extension.ts`, `src/commandTable.ts`, `package.json`
- Test: `test/unit/ghostItem.test.ts` (new), `test/unit/manifest.test.ts`, `test/e2e/fake.15-verbs.e2e.ts`

**Interfaces:**
- Consumes: Task 1's `rowLines`, `Ghosts.at`, `Ghosts.takeKeys`; Task 2's `GhostView`, `PlanVerbs.decided`.
- Produces:
  - `src/suggest/ghostItem.ts`: `interface GhostItem { line: number; end: number; insertText: string; command: { title: string; command: string; arguments: unknown[] } }`; `interface Served { uri: string; line: number; insertText: string; args: unknown }`; `MAX_ITEM = 5000`; `ghostItem(line: number, lineText: string, insertText: string | undefined, command: string, arg: unknown): GhostItem | undefined`; `suggestionText(lineText: string, lines: readonly string[]): string | undefined`; `GHOST_INSERTED = 'durandal.suggest.ghostInserted'` (Task 4 registers it).
  - `src/suggest/inline.ts`: `asInline(g: GhostItem): vscode.InlineCompletionItem`.
  - `src/plans/ghostView.ts`: `GHOST_ACCEPTED = 'durandal.plan.ghostAccepted'`, `GHOST_ESCAPE = 'durandal.plan.ghostEscape'`, `interface GhostAcceptedArgs { uri: string; gen: number; keys: number[] }`; `GhostView` constructor deps become `{ ghosts: Ghosts; gen(): number }`; new `served: Served[]`, `item(document, position): vscode.InlineCompletionItem[] | undefined`, `shown(uri)`.
  - `ClientHooks.planGhost?: { item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined }`.
  - `PlanVerbs.item(document, position)` (the hook); `PlanVerbsApi.served: Served[]`.
  - Context key `durandal.planGhostRow`: the active editor's cursor is on a plan ghost row.

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/ghostItem.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghostItem, MAX_ITEM, suggestionText } from '../../src/suggest/ghostItem';

test('ghostItem: the whole line replaced by the new text; the command carries its one argument', () => {
  assert.deepEqual(ghostItem(5, '- e target line', '- e target line\n  - ok', 'durandal.plan.ghostAccepted', { uri: 'u', gen: 1, keys: [3] }), {
    line: 5, end: 15, insertText: '- e target line\n  - ok',
    command: { title: 'Ghost', command: 'durandal.plan.ghostAccepted', arguments: [{ uri: 'u', gen: 1, keys: [3] }] },
  });
});

// M7 plan checks §1: VS Code draws only text added after what the line holds
test('an extension of the line is an item: a do\'s step with words added', () => {
  assert.equal(ghostItem(8, '- [ ] s', '- [ ] s (step 3)\n  - did', 'c', 0)?.insertText, '- [ ] s (step 3)\n  - did');
});

test('no item where VS Code would draw nothing or the wrong thing', () => {
  assert.equal(ghostItem(3, '- c', '- c', 'c', 0), undefined, 'nothing added');
  assert.equal(ghostItem(3, '- c', undefined, 'c', 0), undefined, 'no text');
  assert.equal(ghostItem(8, '- [ ] s', '- [x] s\n  - did', 'c', 0), undefined, 'the line not kept as it is');
  assert.equal(ghostItem(2, 'do the thing', 'do another thing', 'c', 0), undefined, 'a subsequence is still a replace');
  assert.equal(ghostItem(1, 'x', 'x\n' + 'y'.repeat(MAX_ITEM), 'c', 0), undefined, 'past 5000 characters');
  assert.equal(MAX_ITEM, 5000);
});

test('suggestionText: the line, then the ghost\'s lines; none: no text', () => {
  assert.equal(suggestionText('x = 10', ['case A():', '    return x']), 'x = 10\ncase A():\n    return x');
  assert.equal(suggestionText('x = 10', []), undefined);
});
```

In `test/unit/manifest.test.ts`, line 143 becomes:

```ts
const KNOWN_KEYS = ['inProject', 'isPlan', 'pauseOpen', 'formOpen', 'ghostVisible', 'ghostKind', 'ghostBand', 'planGhostRow'];
```

and add:

```ts
test('M7: Esc on a plan ghost row hides the ghost until the cursor leaves the row; the command is registered, not contributed', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.plan.ghostEscape'), {
    command: 'durandal.plan.ghostEscape', key: 'escape',
    when: 'inlineSuggestionVisible && durandal.planGhostRow && editorTextFocus && !suggestWidgetVisible',
  });
  for (const id of ['durandal.plan.ghostEscape', 'durandal.plan.ghostAccepted']) {
    assert.ok(!pkg.contributes.commands.some(c => c.command === id), `${id} is registered, not contributed`);
  }
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL: `tsc` reports `Cannot find module '../../src/suggest/ghostItem'`.

- [ ] **Step 3: The item shape**

Create `src/suggest/ghostItem.ts`:

```ts
// The inline item of a ghost, a plan's or a suggestion's (M7 spec §2): the whole line replaced
// by itself and the ghost's lines, so VS Code draws only what is added, as ghost text under the
// line at any cursor column. No vscode import (inline.ts's asInline wraps it).

export const GHOST_INSERTED = 'durandal.suggest.ghostInserted';

// VS Code's ghost-text diff gives up past this many characters (M7 plan checks §1)
export const MAX_ITEM = 5000;

export interface GhostItem { line: number; end: number; insertText: string; command: { title: string; command: string; arguments: unknown[] } }

// Served: an item the middleware handed VS Code (the e2e tests read them)
export interface Served { uri: string; line: number; insertText: string; args: unknown }

// ghostItem: LINE (its text LINETEXT) becomes INSERTTEXT, with COMMAND(ARG) run on a full
// commit. undefined where VS Code would draw nothing or the wrong thing: nothing added, the
// line not kept as it is (VS Code draws no deletion, and draws a subsequence replace as
// scattered insertions), or past MAX_ITEM. The marker, the hover and the keys still work then.
export function ghostItem(line: number, lineText: string, insertText: string | undefined, command: string, arg: unknown): GhostItem | undefined {
  if (insertText === undefined || insertText === lineText || !insertText.startsWith(lineText) || insertText.length > MAX_ITEM) return undefined;
  return { line, end: lineText.length, insertText, command: { title: 'Ghost', command, arguments: [arg] } };
}

// suggestionText: a suggestion ghost's text: the line, then its lines under it
export const suggestionText = (lineText: string, lines: readonly string[]): string | undefined =>
  lines.length === 0 ? undefined : [lineText, ...lines].join('\n');
```

In `src/suggest/inline.ts`, add after `protoRange` (line 13), with `import type { GhostItem } from './ghostItem';` among the imports:

```ts
// asInline: a ghost's item as VS Code's. A plain string, never a snippet: a snippet with tab
// stops turns a word-wise accept into a whole one (M7 plan checks §4).
export const asInline = (g: GhostItem): vscode.InlineCompletionItem =>
  new vscode.InlineCompletionItem(g.insertText, new vscode.Range(g.line, 0, g.line, g.end), g.command);
```

- [ ] **Step 4: GhostView serves the row, re-asks on every move, remembers Esc**

In `src/plans/ghostView.ts`:

1. Imports become:

```ts
import * as vscode from 'vscode';
import { ghostItem, Served } from '../suggest/ghostItem';
import { asInline } from '../suggest/inline';
import { Ghosts, hoverText, lineCount, markerText, rowLines } from './ghosts';

export const GHOST_ACCEPTED = 'durandal.plan.ghostAccepted';
export const GHOST_ESCAPE = 'durandal.plan.ghostEscape';
const TRIGGER = 'editor.action.inlineSuggest.trigger';
const HIDE = 'editor.action.inlineSuggest.hide';

// GhostAcceptedArgs: the native commit's argument: the blocks it wrote by key (VS Code's own
// edit may move the row before the command runs), and the server start they came from
export interface GhostAcceptedArgs { uri: string; gen: number; keys: number[] }
```

2. Add to the class's comment: `At the cursor row it hands VS Code the row's ghost as an inline item (§3.2), asks again on every cursor move on the row, and remembers an Esc there until the cursor leaves.`
3. New fields, after `drawn`:

```ts
  // served: every item handed VS Code (the e2e tests read them)
  readonly served: Served[] = [];
  // escaped: the ghost row Esc hid; not asked for again until the cursor leaves it (spec §0.10)
  private escaped: { uri: string; row: number } | undefined;
  // onRow: durandal.planGhostRow as last set
  private onRow: boolean | undefined;
```

4. The constructor: `constructor(protected readonly d: { ghosts: Ghosts; gen(): number }) {}`
5. `register` becomes:

```ts
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this,
      vscode.commands.registerCommand(GHOST_ESCAPE, () => this.escape()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()),
      vscode.window.onDidChangeTextEditorSelection(e => this.selected(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor(ed => this.selected(ed)),
    );
    this.selected(vscode.window.activeTextEditor);
  }
```

6. `paint(uri)` gets a last line: `this.key(this.cursor());`. `paintAll()` gets the same last line.
7. New methods, before `paintEditor`:

```ts
  // item: the inline middleware's answer at POSITION: the row's ghost as an item; [] when VS
  // Code cannot draw it (the marker and the hover remain); undefined when the row has no ghost
  // (the suggestions' path runs)
  item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined {
    const uri = document.uri.toString();
    const blocks = this.d.ghosts.at(uri, position.line);
    if (blocks.length === 0) return undefined;
    const text = document.lineAt(position.line).text;
    const args: GhostAcceptedArgs = { uri, gen: this.d.gen(), keys: blocks.map(b => b.key) };
    const g = ghostItem(position.line, text, rowLines(text, blocks).join('\n'), GHOST_ACCEPTED, args);
    if (!g) return [];
    this.served.push({ uri, line: g.line, insertText: g.insertText, args });
    return [asInline(g)];
  }

  // shown: a new ghost on URI: drawn, Esc's memory of it forgotten, shown if the cursor is there
  shown(uri: string): void {
    if (this.escaped?.uri === uri) this.escaped = undefined;
    this.paint(uri);
    this.selected(vscode.window.activeTextEditor);
  }

  // selected: the cursor on a ghost row asks VS Code for its ghost. VS Code hides an inline
  // suggestion on every cursor move and does not ask again (M7 plan checks §2), so every move
  // on the row asks; after an Esc there, not until the cursor has left the row.
  private selected(ed: vscode.TextEditor | undefined): void {
    if (ed && ed !== vscode.window.activeTextEditor) return;
    const at = this.cursor(ed);
    if (this.escaped && (!at || at.uri !== this.escaped.uri || at.row !== this.escaped.row)) this.escaped = undefined;
    this.key(at);
    if (at && !this.escaped) void vscode.commands.executeCommand(TRIGGER);
  }

  // cursor: the active editor's cursor (its primary selection) when it is on a ghost row
  private cursor(ed = vscode.window.activeTextEditor): { uri: string; row: number } | undefined {
    if (!ed) return undefined;
    const uri = ed.document.uri.toString();
    const row = ed.selection.active.line;
    return this.d.ghosts.at(uri, row).length > 0 ? { uri, row } : undefined;
  }

  private key(at: { uri: string; row: number } | undefined): void {
    const on = at !== undefined;
    if (on === this.onRow) return;
    this.onRow = on;
    void vscode.commands.executeCommand('setContext', 'durandal.planGhostRow', on);
  }

  // escape: Esc on a ghost row: hidden, and the row remembered
  private async escape(): Promise<void> {
    this.escaped = this.cursor();
    await vscode.commands.executeCommand(HIDE);
  }
```

- [ ] **Step 5: PlanVerbs answers the middleware and hears the native commit**

In `src/plans/verbs.ts`:

1. Import: `import { GHOST_ACCEPTED, GhostAcceptedArgs, GhostView } from './ghostView';` and `import type { Served } from '../suggest/ghostItem';`.
2. `PlanVerbsApi` gains:

```ts
  // every inline item handed VS Code for a plan ghost
  served: Served[];
```

and `api()` returns `served: this.view.served` too.
3. The constructor: `this.view = new GhostView({ ghosts: this.ghosts, gen: () => this.gen });`
4. In `register`, after the `durandal.plan.reject` registration:

```ts
      vscode.commands.registerCommand(GHOST_ACCEPTED, (a: GhostAcceptedArgs) => this.ghostAccepted(a)),
```

5. In `hold`, replace `this.view.paint(uri);` with `this.view.shown(uri);`.
6. New methods, after `decide`:

```ts
  // item: the inline middleware's plan ghost at POSITION (ClientHooks.planGhost)
  item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined {
    return this.view.item(document, position);
  }

  // ghostAccepted: VS Code wrote a row's ghost itself (Tab, the hover toolbar's Accept): its
  // blocks are decided as by p y (spec §3.3). From an older server start, or already decided:
  // nothing.
  private ghostAccepted(a: GhostAcceptedArgs): void {
    if (a.gen !== this.gen) return;
    const blocks = this.ghosts.takeKeys(a.uri, a.keys);
    if (blocks.length === 0) return;
    this.decided(a.uri, blocks, 'accepted', 'tab');
  }
```

- [ ] **Step 6: The middleware asks the plan ghost first**

In `src/server.ts`, add to `ClientHooks` after `suggest?` (line 37):

```ts
  // plan ghost blocks (M7 spec §3.2): the cursor row's ghost as an inline item; undefined when
  // the row has no ghost (the suggestions' path then runs)
  planGhost?: { item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined };
```

and make `provideInlineCompletionItems` (lines 197-207) begin:

```ts
        provideInlineCompletionItems: async (document, position, context, token, next) => {
          const ghost = hooks.planGhost?.item(document, position);
          if (ghost) return ghost;
          const s = hooks.suggest;
```

(the rest unchanged). In `src/extension.ts`, after `verbs.register(context);` (line 192): `hooks.planGhost = verbs;`.

- [ ] **Step 7: The Esc binding**

In `src/commandTable.ts`, append to `SUGGEST_KEYS` (after the third entry):

```ts
  // Esc on a plan ghost row (M7 spec §0.10): hidden until the cursor leaves the row
  { command: 'durandal.plan.ghostEscape', key: 'escape', when: 'inlineSuggestionVisible && durandal.planGhostRow && editorTextFocus && !suggestWidgetVisible' },
```

In `package.json`, append the same entry to `contributes.keybindings` after the last `durandal.suggest.dismiss` entry (line 475):

```json
      {
        "command": "durandal.plan.ghostEscape",
        "key": "escape",
        "when": "inlineSuggestionVisible && durandal.planGhostRow && editorTextFocus && !suggestWidgetVisible"
      }
```

- [ ] **Step 8: Run lint and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -20`
Expected: lint clean; unit PASS (the manifest test finds `'setContext', 'durandal.planGhostRow'` in `ghostView.ts`).

- [ ] **Step 9: The inline cases in `fake.15-verbs`**

Append to the `describe` in `test/e2e/fake.15-verbs.e2e.ts` (they use Task 2's `validated`, `onRow`, `events`, `outcomeParams`):

```ts
  // servedAt: the plan ghost items handed VS Code for ROW, after the count FROM
  const servedAt = (a: Awaited<ReturnType<typeof api>>, from: number, row: number) =>
    a.planVerbs.served.slice(from).filter(s => s.uri === uriOf(PLAN) && s.line === row);

  it('the cursor on a ghost row hands VS Code the row and its lines, mid-line; a commit (Tab) accepts them', async () => {
    const a = await running();
    const outcomes = sent('olifant/plans/outcome').length;
    const from = actionLog().length;
    const ed = await validated();
    const n = a.planVerbs.served.length;
    onRow(ed, 5, 4);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    assert.equal(servedAt(a, n, 5).at(-1)!.insertText, '- e target line\n  - ok');
    await sleep(400);
    const fired = a.landed.fired.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => lines()[6] === '  - ok', 'the ghost committed');
    assert.equal(lines()[5], '- e target line');
    await until(() => sent('olifant/plans/outcome').length === outcomes + 1, 'the outcome');
    assert.deepEqual(outcomeParams(outcomes), [{ textDocument: { uri: uriOf(PLAN) }, id: 'V1', block: 0, outcome: 'accepted' }]);
    assert.deepEqual(a.landed.fired.slice(fired), ['accept']);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), []);
    assert.deepEqual(events(from, 'plan-ghost-accepted').map(e => e.how), ['tab']);
    await vscode.commands.executeCommand('undo');
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'one undo step');
  });

  it('typing on the ghost row: the item follows the row\'s text, and the commit lands under it', async () => {
    const a = await running();
    const ed = await validated();
    await ed.edit(b => b.insert(new vscode.Position(5, 15), ' more'));
    const n = a.planVerbs.served.length;
    onRow(ed, 5, 20);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    assert.equal(servedAt(a, n, 5).at(-1)!.insertText, '- e target line more\n  - ok');
    await sleep(400);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => lines()[6] === '  - ok', 'committed under the typed row');
    assert.equal(lines()[5], '- e target line more');
  });

  it('Esc on a ghost row hides it until the cursor leaves the row and comes back (spec §0.10)', async () => {
    const a = await running();
    const ed = await validated();
    const n = a.planVerbs.served.length;
    onRow(ed, 5, 2);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    await sleep(400);
    await vscode.commands.executeCommand('durandal.plan.ghostEscape');
    const m = a.planVerbs.served.length;
    onRow(ed, 5, 6);
    await sleep(500);
    assert.equal(a.planVerbs.served.length, m, 'not asked again on the row');
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await sleep(300);
    assert.equal(docOf(PLAN)!.getText(), TEXT, 'nothing to commit');
    onRow(ed, 1);
    await sleep(200);
    onRow(ed, 5, 6);
    await until(() => servedAt(a, m, 5).length > 0, 'asked again on return');
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)).map(g => g.row), [5], 'Esc decides nothing');
  });

  it('a do\'s step re-spelled is not drawn inline (no deletion in ghost text); its marker stays and p y writes it', async () => {
    const a = await running();
    reply('olifant/plans/do', {
      id: 'D2', verb: 'do', facts: [], dropped: 0, unresolved: 0, seconds: 2, cost: null, changed: [], review: null,
      blocks: [{ after: 8, after_text: null, lines: [{ text: '- [x] step @src/a.py:Foo', fp: null }, { text: '  - did it', fp: null }] }],
    });
    const ed = await at(8);
    const n = a.planVerbs.served.length;
    await vscode.commands.executeCommand('durandal.plan.do');
    onRow(ed, 8, 3);
    await sleep(600);
    assert.deepEqual(servedAt(a, n, 8), []);
    assert.deepEqual(a.planVerbs.markers(uriOf(PLAN)), [{ row: 8, text: 'ai · +2 lines' }]);
    await vscode.commands.executeCommand('durandal.plan.accept');
    assert.deepEqual(lines().slice(8, 10), ['- [x] step @src/a.py:Foo', '  - did it']);
  });

  it('a native commit from before a restart does nothing, even with a new ghost on the row', async () => {
    const a = await running();
    const ed = await validated();
    const n = a.planVerbs.served.length;
    onRow(ed, 5);
    await until(() => servedAt(a, n, 5).length > 0, 'the ghost served');
    const old = servedAt(a, n, 5).at(-1)!.args;
    await restart();
    await validated();
    const outcomes = sent('olifant/plans/outcome').length;
    await vscode.commands.executeCommand('durandal.plan.ghostAccepted', old);
    await sleep(300);
    assert.equal(sent('olifant/plans/outcome').length, outcomes);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)), [{ row: 5, lines: ['  - ok'], marker: 'ai · +1 line' }]);
  });
```

`api` is already imported in this file (line 4).

- [ ] **Step 10: Run the verbs and snippets suites**

Run: `npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -40`
Expected: every `fake.15` case passes.

Then: `DURANDAL_E2E_ONLY=fake.9 node out/test/e2e/run.js 2>&1 | tail -20`
Expected: `fake.9` (the snippet ghost through the same middleware) still passes.

- [ ] **Step 11: Commit**

```bash
git add -A src test package.json
git commit -m "plans: the cursor row's ghost drawn as VS Code ghost text; Tab commits it, Esc hides it until the cursor leaves"
```

---

### Task 4: Suggestion ghost lines under the line

**Files:**
- Modify: `src/suggest/types.ts`, `src/suggest/recognition.ts`, `src/suggest/controller.ts`, `src/suggest/inline.ts`, `src/suggest/editor.ts`, `src/commandTable.ts`, `package.json`
- Test: `test/unit/recognition.test.ts`, `test/unit/keys.test.ts`, `test/unit/controller.test.ts`, `test/unit/manifest.test.ts`, `test/e2e/fake.10-suggestions.e2e.ts`

**Interfaces:**
- Consumes: Task 3's `ghostItem`, `suggestionText`, `GHOST_INSERTED`, `Served`, `asInline`; Task 2's `ActionEvent` `ghost-inserted`.
- Produces:
  - `Offer.below?: boolean` (the ghost's block goes under the cursor line: server `line === at + 1`).
  - `recognition.ts`: `inlineGhost(o: Offer): boolean`.
  - `Controller.ghostAt(uri: string, line: number): Shown | undefined`; `View.keys` gets `inline?: true` for a ghost drawn inline.
  - `Inline.served: Served[]`; `Suggest.served: Served[]` (getter).
  - `GhostInsertedArgs { uri: string; key: string; generator: string }` (in `editor.ts`).
  - Context key `durandal.ghostInline`.

- [ ] **Step 1: Write the failing unit tests**

`test/unit/recognition.test.ts`: import `inlineGhost` too, and add:

```ts
// M7 spec §4, decision 8: server lines are 1-based; a block at at + 1 goes under the cursor line
test('a ghost knows whether its block goes under the cursor line; only then is it drawn inline', () => {
  const below = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a'], line: 3, at: 2 });
  assert.equal(below.below, true);
  assert.equal(inlineGhost(below), true);
  const above = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a'], line: 2, at: 2 });
  assert.equal(above.below, false);
  assert.equal(inlineGhost(above), false);
  assert.equal(ghostOf({ ...base, kind: 'ghost', lines: ['a'], line: null, at: 2 }).below, false);
  assert.equal(inlineGhost(followupOf({ ...base, kind: 'followup', line: 3, at: 2 })), false);
});
```

`test/unit/keys.test.ts`, add:

```ts
test('a ghost\'s dismiss key ignores where its block goes (M7 spec §2)', () => {
  const o = { generator: 'Arms', sets: {} };
  assert.equal(keyOf({ ...o, below: true } as typeof o, 'x = 10', 1), keyOf(o, 'x = 10', 1));
});
```

`test/unit/controller.test.ts`, add after `'a pushed ghost is shown with its lines, no plan asked'` (line 336). Note `considering()`'s cursor is line 6 (0-based) of `file:///p/a.py`, so `at: 7`:

```ts
test('a pushed ghost going under the line: ghostAt finds it, durandal.ghostInline is on, the inline ghost is asked for', async () => {
  const { c, st, lastKeys } = considering();
  c.pushed(sug({ kind: 'ghost', label: 'Arms', lines: ['a', 'b'], line: 8, at: 7 }));
  await flush();
  assert.equal(c.ghostAt('file:///p/a.py', 6)?.generator, 'Arms');
  assert.equal(c.ghostAt('file:///p/a.py', 5), undefined);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined, inline: true });
  assert.equal(st.triggered, 1);
});

test('a ghost going above the line: band only, no ghostAt, no ghostInline, nothing triggered (decision 8)', async () => {
  const { c, st, lastKeys } = considering();
  c.pushed(sug({ kind: 'ghost', label: 'Arms', lines: ['a', 'b'], line: 7, at: 7 }));
  await flush();
  assert.equal(c.state('file:///p/a.py')?.kind, 'ghost');
  assert.equal(c.ghostAt('file:///p/a.py', 6), undefined);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'ghost', band: undefined });
  assert.equal(st.triggered, 0);
});

test('a cursor move on the ghost\'s line asks for the inline ghost again; off the line it goes', async () => {
  const { c, st } = considering();
  c.pushed(sug({ kind: 'ghost', label: 'Arms', lines: ['a'], line: 8, at: 7 }));
  await flush();
  const n = st.triggered;
  c.moved('file:///p/a.py', 6, 'class Cancelled:');
  assert.equal(st.triggered, n + 1);
  c.moved('file:///p/a.py', 5, 'x');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(st.triggered, n + 1);
});
```

`test/unit/manifest.test.ts`: `KNOWN_KEYS` gains `'ghostInline'`, and add:

```ts
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
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: FAIL: `tsc` reports `inlineGhost` is not exported and `ghostAt` does not exist on `Controller`.

- [ ] **Step 3: The ghost knows where its block goes**

`src/suggest/types.ts`, in `Offer` after `score?: number;`:

```ts
  // a ghost's block goes under the cursor line (server line === at + 1): VS Code draws its lines
  below?: boolean;
```

`src/suggest/recognition.ts`, replace `ghostOf` (lines 21-23) with:

```ts
export function ghostOf(s: Suggestion): Offer {
  return {
    kind: 'ghost', generator: s.label, name: s.label, sets: {}, lines: Array.isArray(s.lines) ? s.lines : [], planId: s.planId,
    below: typeof s.line === 'number' && typeof s.at === 'number' && s.line === s.at + 1,
  };
}

// inlineGhost: a ghost whose block goes under the cursor line: its lines are drawn as VS Code
// ghost text (M7 spec §4); one going above keeps the band only (decision 8)
export const inlineGhost = (o: Offer): boolean => o.kind === 'ghost' && o.below === true;
```

- [ ] **Step 4: The controller**

In `src/suggest/controller.ts`:

1. Import `inlineGhost` with `followupOf, ghostOf, recognitionOf` from `./recognition`.
2. `View.keys`: `keys(k: { visible: boolean; kind?: SuggestKind; band?: string; inline?: true }): void;`
3. After `nonInline` (line 65):

```ts
  // ghostAt: the ghost drawn as ghost lines under this line (M7 spec §4), if any
  ghostAt(uri: string, line: number): Shown | undefined {
    const s = this.states.get(uri);
    return s && s.line === line && inlineGhost(s) ? s : undefined;
  }
```

4. In `set` (line 92), after `this.keys();`:

```ts
    // its lines are VS Code's inline suggestion: asked for now (the push can land after VS
    // Code's own request for the keystroke)
    if (inlineGhost(st)) this.c?.triggerInline();
```

5. `moved` (lines 97-100) becomes:

```ts
  moved(uri: string, line: number, lineText: string): void {
    const s = this.states.get(uri);
    if (s && (s.line !== line || s.lineText !== lineText)) this.clear(uri);
    // VS Code hides an inline suggestion on every cursor move and does not ask again (M7 plan
    // checks §2): the ghost lines are asked for again while the cursor stays on their line
    else if (s && inlineGhost(s)) this.c?.triggerInline();
  }
```

6. `keys()` (lines 151-154) becomes:

```ts
  private keys(): void {
    const s = this.active ? this.states.get(this.active) : undefined;
    this.d.view.keys(s
      ? { visible: true, kind: s.kind, band: s.choice ? 'choice' : s.band, ...(inlineGhost(s) ? { inline: true as const } : {}) }
      : { visible: false });
  }
```

- [ ] **Step 5: Run the unit tests**

Run: `npm run test:unit 2>&1 | tail -20`
Expected: the recognition, keys and controller tests PASS; the manifest test still FAILS (the keys are not contributed yet).

- [ ] **Step 6: `Inline` serves the ghost lines; the editor glue**

In `src/suggest/inline.ts`:

1. Imports: `import { GHOST_INSERTED, ghostItem, GhostItem, Served, suggestionText } from './ghostItem';` (replacing the `import type { GhostItem }` line from Task 3), and `import type { GhostInsertedArgs } from './editor';`.
2. In the class, before `inline(...)`:

```ts
  // served: every ghost-lines item handed VS Code (the e2e tests read them)
  readonly served: Served[] = [];
```

3. At the top of `inline(...)`, after `const uri = document.uri.toString();`:

```ts
    // a ghost going under this line: its lines, drawn by VS Code, not the server's snippet (M7
    // spec §4); a full commit inserts them as they stand (decision 9)
    const ghost = this.d.controller.ghostAt(uri, position.line);
    if (ghost) {
      if (context.selectedCompletionInfo || !this.d.enabled()) return [];
      const lineText = document.lineAt(position.line).text;
      const args: GhostInsertedArgs = { uri, key: ghost.key, generator: ghost.generator };
      const g = ghostItem(position.line, lineText, suggestionText(lineText, ghost.lines ?? []), GHOST_INSERTED, args);
      if (!g) return [];
      this.served.push({ uri, line: g.line, insertText: g.insertText, args });
      return [asInline(g)];
    }
```

In `src/suggest/editor.ts`:

1. Import `GHOST_INSERTED, Served` from `./ghostItem` and `inlineGhost` from `./recognition`.
2. Before the class:

```ts
// GhostInsertedArgs: the ghost lines' item command's argument (a full commit: Tab is ours, so
// this is the hover toolbar's Accept)
export interface GhostInsertedArgs { uri: string; key: string; generator: string }
```

3. After `get fills()` (line 90): `get served(): Served[] { return this.inline.served; }`
4. The `durandal.suggest.dismiss` and `durandal.suggest.accept` registrations (lines 98-110) become:

```ts
      vscode.commands.registerCommand('durandal.suggest.dismiss', async () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed) return;
        const uri = ed.document.uri.toString();
        const st = this.controller.state(uri);
        // the ghost lines first: they are VS Code's inline suggestion (M7 spec §4)
        if (st && inlineGhost(st)) await vscode.commands.executeCommand(HIDE_INLINE);
        this.controller.dismiss(uri);
        if (st?.kind === 'snippet') await vscode.commands.executeCommand(HIDE_INLINE);
      }),
      vscode.commands.registerCommand('durandal.suggest.accept', async () => {
        const ed = vscode.window.activeTextEditor;
        const st = ed && this.controller.state(ed.document.uri.toString());
        if (!st) return;
        if (inlineGhost(st)) await vscode.commands.executeCommand(HIDE_INLINE);
        await this.accept.run(st);
      }),
      vscode.commands.registerCommand(GHOST_INSERTED, (a: GhostInsertedArgs) => this.inserted(a)),
```

5. After `moved` (line 138):

```ts
  // inserted: the ghost lines inserted as they stand (the hover toolbar's Accept, decision 9):
  // logged, the band cleared if the insert has not cleared it already; no fill
  private inserted(a: GhostInsertedArgs): void {
    this.d.log.write({ event: 'ghost-inserted', generator: a.generator });
    if (this.controller.state(a.uri)?.key === a.key) this.controller.clear(a.uri);
  }
```

6. `keys(k)` (lines 140-144) takes `{ visible: boolean; kind?: SuggestKind; band?: string; inline?: true }` and gains:

```ts
    void vscode.commands.executeCommand('setContext', 'durandal.ghostInline', k.inline === true);
```

- [ ] **Step 7: The two sibling keys**

In `src/commandTable.ts`, replace `SUGGEST_KEYS`'s comment (lines 50-53) with:

```ts
// The keys of a suggestion (M3 spec §4, M7 spec §4): Esc dismisses the snippet ghost while VS
// Code shows it and it is Durandal's (VS Code's own Esc hides it; ours also remembers the line),
// and a decoration (⚡ at the line's end) wherever Esc means nothing else. Tab on the snippet
// ghost is VS Code's own (editor.action.inlineSuggest.commit). While a ghost's lines are VS
// Code's inline suggestion (durandal.ghostInline), Tab and Esc are ours: Tab reviews and fills,
// Esc dismisses. Esc on a plan ghost row hides it until the cursor leaves the row.
```

and append to `SUGGEST_KEYS`, after the `durandal.plan.ghostEscape` entry:

```ts
  { command: 'durandal.suggest.accept', key: 'tab', when: 'inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode' },
  { command: 'durandal.suggest.dismiss', key: 'escape', when: 'inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !renameInputVisible' },
```

In `package.json`, append after the `durandal.plan.ghostEscape` keybinding:

```json
      {
        "command": "durandal.suggest.accept",
        "key": "tab",
        "when": "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode"
      },
      {
        "command": "durandal.suggest.dismiss",
        "key": "escape",
        "when": "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus && !suggestWidgetVisible && !inSnippetMode && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !renameInputVisible"
      }
```

The existing pins keep passing: `find(k => k.command === 'durandal.suggest.accept')` returns the first (decoration) entry, and the snippet Esc entry comes before the new ones that also start with `inlineSuggestionVisible`.

- [ ] **Step 8: Run lint and the unit tests**

Run: `npm run lint && npm run test:unit 2>&1 | tail -20`
Expected: lint clean; unit PASS.

- [ ] **Step 9: The suggestion cases in `fake.10-suggestions`**

In `test/e2e/fake.10-suggestions.e2e.ts`, after `FOLLOWUP` (line 14) add:

```ts
// a ghost going under line 0 (at 1, line 2: server lines are 1-based)
const GHOST = { ...FOLLOWUP, kind: 'ghost', label: 'Arms', lines: ['case A():', '    return x'], line: 2, at: 1 };
const GHOST_TEXT = 'x = 10\ncase A():\n    return x';
```

Rename the case at line 138 to `'a ghost going above the line: the band only, reviewed first, Apply lands the filled plan (decision 8)'`, and after its `until(... 'the ghost block shown')` (line 146) add:

```ts
    assert.equal(a.suggest.decorated(uri()), '⚡ Tab: Arms (+2 lines)');
    await sleep(400);
    assert.ok(!a.suggest.served.some(s => s.uri === uri()), 'no ghost lines served');
```

Then add, after that case:

```ts
  it('a ghost going under the line: its lines served under it; Tab (ghostInline) hides them, reviews, Apply fills', async () => {
    push(GHOST);
    reply('olifant/plan', planned('x = 10\n', 'x = 12\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const n = a.suggest.served.length;
    const ed = await edited();
    await until(() => a.suggest.served.slice(n).some(s => s.uri === uri() && s.insertText === GHOST_TEXT), 'the ghost lines served');
    assert.equal(a.suggest.decorated(uri()), '⚡ Tab: Arms (+2 lines)', 'the band stays');
    const before = plans().length;
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 12\n', 'landed');
    assert.deepEqual(plans().slice(before).find(m => m.params.fill === true)!.params, { planId: 7, fill: true });
    assert.ok(ui.log.includes('review Arms'));
  });

  it('the hover toolbar\'s Accept (a commit) inserts the lines as they stand: ghost-inserted, the band gone, no fill', async () => {
    push(GHOST);
    const a = await api();
    const from = actionLog().length;
    const n = a.suggest.served.length;
    const ed = await edited();
    await until(() => a.suggest.served.slice(n).some(s => s.uri === uri() && s.insertText === GHOST_TEXT), 'the ghost lines served');
    await sleep(400);
    const before = plans().length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText() === GHOST_TEXT + '\n', 'inserted');
    await until(() => events(from, 'ghost-inserted').length === 1, 'logged');
    assert.equal(events(from, 'ghost-inserted')[0].generator, 'Arms');
    await until(async () => (await shownKind()) !== 'ghost', 'the band gone');
    await sleep(300);
    assert.ok(!plans().slice(before).some(m => m.params.fill === true), 'no fill');
  });

  it('Esc (ghostInline) on the ghost lines hides them and dismisses the ghost on that line', async () => {
    push(GHOST);
    const a = await api();
    const from = actionLog().length;
    const n = a.suggest.served.length;
    const ed = await edited();
    await until(() => a.suggest.served.slice(n).some(s => s.uri === uri() && s.insertText === GHOST_TEXT), 'the ghost lines served');
    await sleep(400);
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal(await shownKind(), undefined);
    assert.equal(events(from, 'ghost-dismissed').length, 1);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await sleep(300);
    assert.equal(ed.document.getText(), 'x = 10\n', 'nothing left to commit');
  });
```

`sleep` is already imported in this file (line 7).

- [ ] **Step 10: Run the suggestion suites**

Run: `npm run build && npx tsc -p . && DURANDAL_E2E_ONLY=fake.10 node out/test/e2e/run.js 2>&1 | tail -40`
Expected: every `fake.10` case passes.

Then: `DURANDAL_E2E_ONLY=fake.9 node out/test/e2e/run.js 2>&1 | tail -20` and `DURANDAL_E2E_ONLY=fake.15 node out/test/e2e/run.js 2>&1 | tail -20`
Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add -A src test package.json
git commit -m "suggest: a ghost going under the line shows its lines as VS Code ghost text; Tab and Esc stay ours there"
```

---

### Task 5: The README, the whole suite, the manual checklist, the PR

**Files:**
- Modify: `README.md`
- Create: `~/projects/notes/vscode-port/m7/m7-manual-checklist.md`, `~/projects/notes/vscode-port/m7/m7-pr.md` (outside the repo)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: the README's stale prompt text replaced; the PR title and body; the checklist for the user.

- [ ] **Step 1: The README**

In `README.md`, the **Verbs** bullet (lines 154-159) becomes:

```markdown
- **Verbs.** On a plan row, `Ctrl+Alt+D P Q` asks the model about it, `P V`
  validates it, `P D` does the step. The row shows `⋯ asking` while it runs; `Durandal: Plan:
  Cancel` stops it. An ask's answer goes straight in, fingerprints stamped, and one undo takes
  it back (`durandal.plans.reviewAnswers` makes it wait). A validate's blocks, and a do's in a
  project without git, wait under their row as a ghost: the row ends in `ai · +N lines` (hover
  it to read them), the lines show under the row while the cursor is on it, `P Y` (or `Tab`)
  writes them and `P N` drops them. A do in a git project opens its review.
```

The `durandal.plans.reviewAnswers` line in the settings list (line 188) becomes:

```markdown
- `durandal.plans.reviewAnswers`: an ask's answer waits as a ghost under its row (off by default).
```

In the **Follow-ups** bullet of "Ghost text and snippets" (around line 58), replace `a multi-line block as \`⚡ Tab: <name> (+N lines)\`.` with:

```markdown
  a multi-line block as `⚡ Tab: <name> (+N lines)`, its lines shown under the line when the
  block goes there. Accepting those lines from VS Code's hover toolbar inserts them as they
  stand, holes unfilled.
```

M8 writes the full ghost sections (spec §9).

- [ ] **Step 2: Run everything**

```bash
npm run lint
OLIFANT_REPO=~/projects/olifant-48f38ab npm run test:unit 2>&1 | tail -5
npm run test:e2e 2>&1 | tail -40
VSCODE_VERSION=1.145.2 DURANDAL_E2E_ONLY=fake.1 node out/test/e2e/run.js 2>&1 | tail -20
OLIFANT_BIN=$(cd ~/projects/olifant-48f38ab && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-48f38ab DURANDAL_E2E_ONLY=real npm run test:e2e 2>&1 | tail -40
npm run package 2>&1 | tail -5
```

Expected: lint clean; unit all pass (the protocol contract tests included); fake e2e all pass on stable, and `fake.1*` (fake.1 and fake.10-16) pass on 1.145.2; bare 1 pass; real all pass or pending as before M7 (`real.9`'s model-gated cases stay pending); the package builds. Each command runs in the foreground under its timeout; nothing is polled.

- [ ] **Step 3: The manual checklist**

Write `~/projects/notes/vscode-port/m7/m7-manual-checklist.md` for the user to walk in a real window (the tests cannot see pixels or press keys; plan checks §3 and §5):

```markdown
# M7 manual checklist (durandal-vscode m7-ghost-blocks)

Open a plan in an Olifant project with a model configured, the extension built from the branch.

1. `P V` on a row whose answer has blocks: the row ends in `ai · +N lines`; the cursor mid-row shows the lines under it in ghost-text colour.
2. Hover the marker of another ghost row: the lines show, fenced.
3. Esc on the ghost row: the lines hide; moving along the row does not bring them back; leaving the row and returning does.
4. A validate with blocks under two rows: two markers; each row shows its own lines when the cursor is on it.
5. `P Y`: the lines are written, the last one flashes, a reconcile follows. `Ctrl+Z` takes them back in one step and no ghost returns. `P N` on another ghost drops it.
6. A real Tab press on a ghost row (cursor at column 0, and mid-row) writes the lines, not an indent.
7. `⌘→` at the end of a ghost row: a line break and indent go in, the ghost hides, and it returns above the new line when the cursor comes back to the row (known limit, deviation 7).
8. A suggestion ghost below the line (a pushed ghost block): its lines show under the line with the `⚡ Tab: … (+N lines)` band; Tab opens the review and Apply lands the filled code; Esc dismisses it and it does not return on that line's text.
9. The hover toolbar's Accept on the suggestion ghost lines: the template goes in unfilled, the band goes.
10. `editor.inlineSuggest.enabled` off: no lines drawn; markers, hover, `P Y` / `P N` still work.
```

- [ ] **Step 4: The PR text, the branch left for the user**

Write `~/projects/notes/vscode-port/m7/m7-pr.md`: the title `M7: ghost blocks (plan ghosts and suggestion ghost lines as VS Code ghost text)`, a summary of Tasks 1-4, the 13 deviations from the plan header, the five Review Focus lines, the manual checklist's path, the test counts from Step 2, and the follow-ups (all ghosts visible at once through comment threads; a real ghost-kind e2e once olifant's python chain classifies one; the ⌘→ limit). End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Do not push or open the PR: the user picks the integration (merge, PR or keep), as in M6.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "README: plan ghosts and suggestion ghost lines replace the Accept all prompt"
```

---

## Plans

- Spec: `docs/superpowers/specs/2026-11-12-m7-ghost-blocks-design.md`
- This plan: `docs/superpowers/plans/2026-11-12-m7-ghost-blocks.md`
- Notes: `~/projects/notes/vscode-port/m7/` (facts, checks, checklist, PR text)
