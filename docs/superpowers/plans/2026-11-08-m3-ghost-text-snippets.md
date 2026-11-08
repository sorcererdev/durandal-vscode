# durandal-vscode M3: ghost text and snippets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** durandal.nvim's ghost text, snippets, follow-ups and recognitions on VS Code's own surfaces. The snippet anticipated at the cursor shows as an inline suggestion, and chosen snippets come from the completion widget; both get the model fill after insertion. What the server pushes or answers as a plan (`ghost`, `followup`, `recognition`) shows as an end-of-line `⚡` decoration with Tab, then M2's review window, then Apply. Shipped as two PRs: **M3a snippets** (Tasks 1–5) and **M3b pushed and pulled suggestions** (Tasks 6–11).

**Architecture:** As in M2, the rules sit in pure modules with no `vscode` import, unit-tested with `node --test`:
- `suggest/keys.ts`: the dismiss key and `short`.
- `suggest/span.ts`: the lines a snippet covers.
- `suggest/gate.ts`: which inline item is shown, and what its fill carries.
- `suggest/types.ts`
- `suggest/controller.ts`: state, dismiss memory, context keys, and in M3b the debounced pushed → pulled → inline consideration with stale drops.
- `suggest/store.ts`: the latest push per document.
- `suggest/recognition.ts`: the offers, decoration texts and accept way.
- `suggest/choices.ts`: the recognition choose loop over `Ui`.

The VS Code glue is thin and covered by the fake-lsp e2e:
- `suggest/inline.ts`: the inline and completion middleware hooks.
- `suggest/fill.ts`: `durandal.snippet.fill`, the resolve and the version guard.
- `suggest/editor.ts`: listeners, context keys, commands, the push handler.
- `suggest/decorate.ts`: the `after` decoration.
- `suggest/accept.ts`: review and Apply, choose, feedback.

`server.ts` gains middlewares and a notification hook; `hints.ts` hides the ⚡ hint on the suggestion's line; `land.ts` `Plans.review` gains a `refill` hook for Apply.

**Tech Stack:** as M1/M2: TypeScript 5.9 (`module: node16`), `vscode-languageclient` ^11, `vscode-languageserver-protocol` 3.18.5, esbuild, `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp, olifant at `.olifant-ref` for the real-server suite.

**Spec:** `docs/superpowers/specs/2026-11-07-m3-ghost-text-snippets-design.md` (this repository, at `cae3d97`). Umbrella: `docs/superpowers/specs/2026-11-06-durandal-vscode-design.md` §4 and §6 row 3. Facts with pointers: `~/projects/notes/vscode-port/m3/ghost-snippet-surface.md`. Read the spec before starting a task.

**Reference code (read, do not depend on):**
- durandal.nvim at `~/projects/durandal.nvim`:
  - `lua/durandal/suggest.lua`, the source of every rule here; line numbers below are its own.
  - `snippet.lua`, `picker.lua`, `actions.lua` :90-125.
  - `tests/suggest_spec.lua`, `tests/picker_spec.lua`, `tests/e2e_python_spec.lua`.
- olifant at `~/projects/olifant`, read at the pin with `git show 1ae076fc:src/Olifant/Lsp.hs`:
  - `snippetItems`, `ghostItems`, `suggestionFields`.
  - the `completionItem/resolve` handler, `olifant/suggest`, `olifant/plan`.

**Branches and models:** this plan is committed to `main` first ([[everything-on-main]]).
- **M3a:** branch `m3a-snippets` from `main`. Tasks 1–5, then PR 1.
- **M3b:** branch `m3b-suggestions` from `main` *after PR 1 is merged*. Tasks 6–11, then PR 2.
- Suggested implementer models (the user's policy):
  - Sonnet: Tasks 1, 2, 3, 5, 6, 7, 11.
  - Opus: Tasks 4, 8, 9, 10 (the middlewares and fill, the controller, the editor glue, the accept flows).
  - A final whole-branch review on Fable for each PR.

## Global Constraints

- No webview. No change to olifant. `.olifant-ref` stays `1ae076fc29455069fc32d2d7e48fa206cf033947`.
- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency.
- No file outside `src/protocol.ts` spells an `olifant/*` method string. Standard LSP types and requests (`InlineCompletionRequest`, `CompletionResolveRequest`, `CompletionItem`, `Range`, `CancellationTokenSource`) come from the library or `vscode-languageserver-protocol`.
- The extension never rewords the server: refusals and errors are shown as the server sent them.
- Lines: VS Code's are 0-based. olifant's `olifant/suggest {line}`, a push's `at` and `data.line` are 1-based (nvim sends its 1-based cursor row; `p.at == line`, suggest.lua :258). Convert at the boundary only: `line + 1` out, `at - 1` in.
- Max ghost lines **8**, a constant (`MAX_GHOST_LINES`).
- Settings added: `durandal.ghosts` (boolean, default `true`). `durandal.debounceMs` doubles as the controller's debounce (default 300).
- Context keys added: `durandal.ghostVisible`, `durandal.ghostKind` (`snippet | ghost | followup | recognition`, else `''`), `durandal.ghostBand` (`offer | hint`, else `''`).
- Commands added, each with category `Durandal`:
  - `durandal.ghosts.toggle` "Toggle Ghost Text".
  - `durandal.suggest.dismiss` "Dismiss Suggestion", `enablement: durandal.ghostVisible`.
  - `durandal.suggest.accept` "Accept Suggestion", `enablement: durandal.ghostVisible` (M3b).
  - Internal, not contributed: `durandal.snippet.fill`.
- Keybindings, with these `when` clauses verbatim (spec §4):
  - Esc → `durandal.suggest.dismiss` (M3a): `inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'`
  - Tab → `durandal.suggest.accept` (M3b): `durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !inSnippetMode && !editorReadonly`
  - Esc → `durandal.suggest.dismiss` (M3b): `durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible`
- Messages, verbatim:
  - Status bar: "holes left as they are: the text changed while the model filled".
  - Progress titles: "Filling holes" (the snippet fill) and the suggestion's name (`plan{fill:true}`).
  - Pick title: "Which is it?".
  - Menu items: "Show recognitions for <short> again" and "⚡ <label>  (<reason>; <reason>)".
  - Choose error: "no choices for <input>".
- Decoration texts (nvim :88-92, :149, :155):
  - Follow-up: `⚡ Tab: review <name> (<summary>)`.
  - Ghost block: `⚡ Tab: <name> (+N lines)`.
  - Recognition offer: `⚡ <label> — Tab: review`.
  - Recognition choice: `⚡ <label> or a <short(or)> — Tab: choose`.
  - Recognition hint: `⚡ <label>`.
- Action log events added (nvim's `util.log` calls in suggest.lua; fields `generator`, plus `band` and `score` when present):
  - `<kind>-shown`, `<kind>-dismissed`, `<kind>-reviewed` and `<kind>-applied` for kind ∈ {`snippet`, `ghost`, `followup`, `recognition`}.
  - `recognition-shown` for a hint also carries `model: <reasons include "the model agrees">`.
  - `snippet-anticipated {generator, line}` (line 1-based).
- Commit messages end with the attribution lines the session's system reminder gives.
- Working hours (the user's rule): no agent or background work 9am–5pm America/New_York, Monday to Friday; weekends are free.
- **Decisions this plan makes where the spec is silent or wrong (say each in the PR description):**
  1. **The inline middleware sends `textDocument/inlineCompletion` itself instead of calling `next`.** The library's converter (`protocolConverter.js` `asInlineCompletionItem`) builds a fresh `vscode.InlineCompletionItem` and drops `data` and `ghost`. The gate needs both, and so does the fill. The middleware uses `lc.code2ProtocolConverter.asInlineCompletionParams` and `InlineCompletionRequest.type`, then builds the item itself (spec §3.1 said "calls `next`").
  2. **The fill guard is the document version, not text.** The version is taken when the fill command runs, which is right after VS Code inserted the snippet, as nvim's changedtick (`snippet.lua` :10). The spec's textual guard (§3.1, §5) would compare the snippet *source* with the expanded document text. Placeholders, `$0` and VS Code's whitespace normalisation make those differ even when untouched. Walking tab stops changes no version; typing does.
  3. **A fill that returns the body unchanged replaces nothing.** That is the no-model case (CI), and it keeps the user's snippet session and tab stops. A changed body replaces the whole lines the unfilled body covers (`spanOf`).
  4. **`Plans.review` gains an optional `refill`** (spec §2 said `land.ts` stays unchanged). A follow-up's Apply must land `plan{planId, fill:true}`, not the plan reviewed. `refill` is asked on Apply, and its `{plan, edit}` is landed. Without it, review behaves exactly as in M2.
  5. **Pushed suggestions' `uri` is normalised** with `vscode.Uri.parse(uri).toString()` before it is stored, so it compares with `document.uri.toString()` whatever percent-encoding olifant used.
  6. **"No such plan" falls through to the pull** (`olifant/suggest`) instead of "clear and reconsider". The push is forgotten, so nothing loops. Other `olifant/plan` errors while showing end the consideration quietly, as nvim does.
  7. **Leaving an editor clears its suggestion** (nvim `BufLeave`), so a decoration never sits on a TextEditor that is no longer shown.
  8. **The fake server** gains `inlineCompletionProvider` and `completionProvider {resolveProvider: true, triggerCharacters: ["@", ":"]}`. A canned reply may also carry `"delay": <seconds>`, which answers after that pause, for the edit-while-filling e2e. This is the third vendored change.
  9. **e2e suite order:** `fake.10-…` would sort before `fake.2-…`, so `test/e2e/index.ts` sorts files by their numeric prefix (Task 9).
  10. **Test seam:** `Api.suggest` exposes `state(uri)` (the controller's current suggestion) and `fills` (each fill's outcome: `filled | same | changed | failed`). Context keys and the status bar cannot be read from tests.
  11. **The menu's ⚡ recognition item always opens the choose flow**, as nvim's `actions.lua` :122 does (an offer's Tab reviews; the menu chooses).
  12. **`inSnippetMode`** is used in the `when` clauses (spec §0, a deviation noted there). The decoration may still show during a snippet session.

## Review Focus

1. **Typing (or anything that changes the document) while the model fills an accepted snippet.** Expected: the user's text is kept, the unfilled snippet stays, and the status bar says "holes left as they are…". Nothing is replaced. Pinned by fake.9 "an edit while filling keeps the user's text" (Task 4), using the fake's `delay`.
2. **The cursor moves, the line is edited, or `ghosts` is switched off while `olifant/suggest` or `olifant/plan` is in flight.** Expected: the late answer draws nothing, and only the newest consideration's answer counts. Pinned by the controller tests "a stale answer is dropped" and "ghosts off drops an in-flight answer" (Task 8).
3. **Tab while VS Code's completion widget, another provider's inline ghost, or a snippet session holds it.** Expected: Tab is theirs, and Durandal's accept never fires. Pinned by the manifest test that asserts the exact `when` clauses (Tasks 3 and 10) and walked in the manual checklist (Copilot).
4. **The server restarts or stops while a suggestion is shown or a push is stored.** Expected: the controller goes idle, the suggestion is cleared, and a stale `planId` ("no such plan…") falls through to the pull without an error. Pinned by the controller tests "not running: nothing asked, cleared" and "no such plan falls through to the pull" (Task 8).
5. **Closing or switching documents.** Expected: dismiss memory is forgotten on close, the context keys follow the active editor, and no decoration or hidden ⚡ hint is left behind. Pinned by the controller tests "closed forgets the dismissals" and "the keys follow the active editor" (Task 2), and the fake.10 "the ⚡ hint is hidden on the suggestion's line and comes back" (Task 9).

---

## File structure

```
src/protocol.ts                  InlineItem, SnippetData (T1); Suggestion in full, SuggestResult, ChoicesInput, planId number (T6)
src/actionLog.ts                 suggest events (T1)
src/suggest/keys.ts              keyOf, recognitionKey, short, dataKey (T1)
src/suggest/span.ts              spanOf (T1)
src/suggest/types.ts             SuggestKind, Shown, Offer (T2)
src/suggest/gate.ts              inlineGate, snippetData, FillArgs, MAX_GHOST_LINES (T2)
src/suggest/controller.ts        state, dismiss, keys (T2); consider, offer, attach (T8)
src/suggest/editor.ts            Suggest: listeners, keys, toggle, dismiss (T3); fill+inline wiring (T4); push, decorations, hints (T9); accept (T10)
src/suggest/inline.ts            Inline: the middleware hooks (T4)
src/suggest/fill.ts              Fill: durandal.snippet.fill (T4)
src/suggest/store.ts             Store: pushes per document (T6)
src/suggest/recognition.ts       recognitionOf, followupOf, ghostOf, decorationText, acceptWay (T6)
src/suggest/choices.ts           nextInput, kind, complete, chooseGenerator (T7)
src/suggest/decorate.ts          Decorations (T9)
src/suggest/accept.ts            Accept: review/refill, choose, feedback (T10)
src/server.ts                    ClientHooks.suggest + middlewares (T4); suggestion hook (T9)
src/hints.ts                     hide/hiddenLine (T9)
src/land.ts                      Plans.review refill (T10)
src/actions/menu.ts              recognitionItems (T10)
src/actions/command.ts           the recognition first in the ⚡ menu (T10)
src/commandTable.ts              BUILT, SUGGEST_KEYS (T3, T9, T10)
src/extension.ts                 wiring, Api.suggest (T3, T4, T9, T10)
package.json                     setting, commands, keybindings (T3, T9, T10)
test/fake-lsp/fake-lsp           capabilities, delay (T4)
test/e2e/index.ts                numeric order (T9)
test/e2e/fake.9-snippets.e2e.ts  (T4)
test/e2e/real.6-snippets.e2e.ts  (T5)
test/e2e/fake.10-suggestions.e2e.ts (T9, T10)
test/e2e/real.7-suggestions.e2e.ts  (T11)
test/unit/{keys,span,gate,controller,store,recognition,choices}.test.ts, manifest/protocol/menu/actionLog updates
README.md, CHANGELOG.md          (T5, T11)
```

Run commands: `npm run lint`, `npm run test:unit`, `npm run test:e2e` (`DURANDAL_E2E_ONLY=fake.9` narrows the files; the real suite needs `OLIFANT_BIN` and `OLIFANT_REPO`, see README "Development").

---

# M3a — snippets (branch `m3a-snippets`)

### Task 1: Pure foundations — inline types, suggest log events, the dismiss key, the snippet span

**Files:**
- Modify: `src/protocol.ts` (the `// --- ghosts and follow-ups (milestone 3)` block)
- Modify: `src/actionLog.ts`
- Create: `src/suggest/keys.ts`, `src/suggest/span.ts`
- Test: `test/unit/keys.test.ts`, `test/unit/span.test.ts`, `test/unit/actionLog.test.ts` (add a case), `test/unit/protocol.test.ts` (compile check)

**Interfaces:**
- Produces:
  - `protocol.ts`: `interface SnippetData { kind: 'action'; path: string; generator: string; sets: Sets; line: number }` and `interface InlineItem { insertText: string | { kind: 'snippet'; value: string }; range: Range; filterText?: string; ghost?: unknown; data?: unknown }` (`Range` from `vscode-languageserver-protocol`).
  - `actionLog.ts`: `type SuggestKind = 'snippet' | 'ghost' | 'followup' | 'recognition'`, and `ActionEvent` gains `{ event: \`${SuggestKind}-${'shown'|'dismissed'|'reviewed'|'applied'}\`; generator: string; band?: string; score?: number; model?: boolean }` and `{ event: 'snippet-anticipated'; generator: string; line: number }`.
  - `keys.ts`: `keyOf(a: { generator: string; sets?: Record<string, unknown> }, lineText: string, line: number): string` (line 1-based), `recognitionKey(key: string, band?: string, choice?: string): string`, `short(id: string): string`, `dataKey(data: unknown): string`.
  - `span.ts`: `spanOf(line: number, body: string): { start: number; end: number }` (0-based, inclusive).

- [ ] **Step 1: Write the failing tests**

`test/unit/keys.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataKey, keyOf, recognitionKey, short } from '../../src/suggest/keys';

// ports durandal.nvim tests/suggest_spec.lua "dismissing on blank lines (review)"
test('a blank line\'s key names the line; a written line\'s does not', () => {
  const a = { generator: 'p/failure', sets: { app: 'bistro' } };
  assert.notEqual(keyOf(a, '', 3), keyOf(a, '', 5));
  assert.notEqual(keyOf(a, '   ', 3), keyOf(a, '   ', 5));
  assert.equal(keyOf(a, '    x,', 3), keyOf(a, '    x,', 5));
});

test('the key is the generator, its sets (in any order) and the line\'s text', () => {
  assert.equal(keyOf({ generator: 'g', sets: { a: '1', b: '2' } }, 'x', 1), keyOf({ generator: 'g', sets: { b: '2', a: '1' } }, 'x', 1));
  assert.notEqual(keyOf({ generator: 'g', sets: { a: '1' } }, 'x', 1), keyOf({ generator: 'g', sets: { a: '2' } }, 'x', 1));
  assert.notEqual(keyOf({ generator: 'g' }, 'x', 1), keyOf({ generator: 'h' }, 'x', 1));
  assert.equal(keyOf({ generator: 'g' }, 'x', 1), keyOf({ generator: 'g', sets: {} }, 'x', 1));
});

test('a recognition\'s band and choice are part of its key (a hint upgraded to an offer is new)', () => {
  const k = keyOf({ generator: 'p/command' }, 'def f():', 2);
  assert.notEqual(recognitionKey(k, 'hint'), recognitionKey(k, 'offer'));
  assert.notEqual(recognitionKey(k, 'offer'), recognitionKey(k, 'offer', 'p/query'));
  assert.equal(recognitionKey(k, 'offer'), recognitionKey(k, 'offer', undefined));
});

test('short: a generator id as people read it', () => {
  assert.equal(short('python-htmx/add-dependency'), 'add dependency');
  assert.equal(short('p/close_table'), 'close table');
  assert.equal(short('plain'), 'plain');
});

test('dataKey ignores key order', () => {
  assert.equal(dataKey({ generator: 'g', sets: { a: '1', b: '2' }, line: 3 }), dataKey({ line: 3, sets: { b: '2', a: '1' }, generator: 'g' }));
  assert.notEqual(dataKey({ generator: 'g', line: 3 }), dataKey({ generator: 'g', line: 4 }));
});
```

`test/unit/span.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spanOf } from '../../src/suggest/span';

test('spanOf: the whole lines a snippet inserted at a line start covers', () => {
  assert.deepEqual(spanOf(4, 'class ${1:Name}:'), { start: 4, end: 4 });
  assert.deepEqual(spanOf(4, 'class ${1:Name}:\n    ${2:reason}: str$0'), { start: 4, end: 5 });
  assert.deepEqual(spanOf(0, 'a\nb\nc\n'), { start: 0, end: 3 });
});
```

Add to `test/unit/actionLog.test.ts`:

```ts
test('the suggest events: undefined fields are left out, as nvim leaves nil out', () => {
  const at = new Date('2026-11-08T10:00:00.123Z');
  assert.equal(logLine({ event: 'snippet-shown', generator: 'p/failure', band: undefined, score: undefined }, at),
    '{"event":"snippet-shown","generator":"p/failure","t":"2026-11-08T10:00:00Z"}\n');
  assert.equal(logLine({ event: 'recognition-shown', generator: 'p/command', band: 'hint', score: 0.4, model: true }, at),
    '{"event":"recognition-shown","generator":"p/command","band":"hint","score":0.4,"model":true,"t":"2026-11-08T10:00:00Z"}\n');
  assert.equal(logLine({ event: 'snippet-anticipated', generator: 'p/failure', line: 12 }, at),
    '{"event":"snippet-anticipated","generator":"p/failure","line":12,"t":"2026-11-08T10:00:00Z"}\n');
});
```

(If `logLine` is not already imported in that file, add it to the import from `../../src/actionLog`.)

Add to `test/unit/protocol.test.ts` (extend the type import with `InlineItem, SnippetData`):

```ts
test('compile check: the inline item reads as olifant sends it (Lsp.hs ghostItems)', () => {
  const data: SnippetData = { kind: 'action', path: '/p/a.py', generator: 'p/failure', sets: {}, line: 12 };
  const it: InlineItem = {
    insertText: { kind: 'snippet', value: 'class ${1:Name}:' }, range: { start: { line: 11, character: 0 }, end: { line: 11, character: 0 } },
    filterText: '', ghost: ['class ⟨Name⟩:'], data,
  };
  assert.ok(it.range.start.line === 11);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. tsc reports that `../../src/suggest/keys`, `../../src/suggest/span`, `InlineItem` and `SnippetData` cannot be found, and that `'snippet-shown'` is not assignable to `ActionEvent`.

- [ ] **Step 3: Implement**

`src/protocol.ts`: add `Range` to the import from `vscode-languageserver-protocol`, and add at the top of the `// --- ghosts and follow-ups (milestone 3)` block:

```ts
// textDocument/inlineCompletion's item as olifant sends it (Lsp.hs ghostItems): the snippet's
// body over the cursor's whole line and, beyond LSP, the ghost (holes as ⟨name⟩) and the
// action completionItem/resolve fills (data, as a completion item's).
export interface SnippetData extends Open { kind: 'action'; path: string; generator: string; sets: Sets; line: number }
export interface InlineItem { insertText: string | { kind: 'snippet'; value: string }; range: Range; filterText?: string; ghost?: unknown; data?: unknown }
```

`src/actionLog.ts`: add the kind and the two event shapes:

```ts
export type SuggestKind = 'snippet' | 'ghost' | 'followup' | 'recognition';

export type ActionEvent =
  | { event: 'shown'; file: string; generators: string[] }
  | { event: 'picked' | 'fix-picked'; file: string; generator: string }
  | { event: 'generate-applied'; generator: string }
  | { event: 'applied'; generator: string; files: number }
  | { event: 'hinted'; generator: string }
  // ghost text and snippets (durandal.nvim suggest.lua's util.log calls)
  | { event: `${SuggestKind}-${'shown' | 'dismissed' | 'reviewed' | 'applied'}`; generator: string; band?: string; score?: number; model?: boolean }
  | { event: 'snippet-anticipated'; generator: string; line: number };
```

`src/suggest/keys.ts`:

```ts
// keys: what a dismissal remembers (durandal.nvim suggest.lua key_of, :26-31). Pure.

// stable is JSON with object keys sorted, so the same sets give the same key.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// keyOf: the suggestion and the line's text and, for a blank line, which line (one Esc is not
// every blank line's). line is 1-based, as nvim's.
export function keyOf(a: { generator: string; sets?: Record<string, unknown> }, lineText: string, line: number): string {
  const where = /^\s*$/.test(lineText) ? `\0${line}` : '';
  return `${a.generator}\0${stable(a.sets ?? {})}\0${lineText}${where}`;
}

// recognitionKey: a recognition's band and choice are part of what it is: a hint the model
// upgrades to an offer replaces the hint (suggest.lua :233).
export function recognitionKey(key: string, band?: string, choice?: string): string {
  return `${key}\0${band ?? 'nil'}\0${choice ?? 'nil'}`;
}

// short: a generator id as people read it (p/close_table → close table).
export const short = (id: string): string => id.replace(/^.*\//, '').replace(/[-_]/g, ' ');

// dataKey: a completion item's data as a map key (the resolved-fill stash).
export const dataKey = (data: unknown): string => stable(data);
```

`src/suggest/span.ts`:

```ts
// spanOf: the whole lines (0-based, inclusive) a snippet inserted at the start of line covers:
// as many as its body has. The fill replaces these lines when the model's body comes back.
export function spanOf(line: number, body: string): { start: number; end: number } {
  return { start: line, end: line + body.split('\n').length - 1 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run lint && npm run test:unit`
Expected: PASS (the new tests and every earlier one).

- [ ] **Step 5: Commit**

```bash
git add src/protocol.ts src/actionLog.ts src/suggest/keys.ts src/suggest/span.ts test/unit/keys.test.ts test/unit/span.test.ts test/unit/actionLog.test.ts test/unit/protocol.test.ts
git commit -m "suggest: inline item types, suggest log events, the dismiss key and the snippet span"
```

---

### Task 2: The inline gate and the controller's snippet subset (pure)

**Files:**
- Create: `src/suggest/types.ts`, `src/suggest/gate.ts`, `src/suggest/controller.ts`
- Test: `test/unit/gate.test.ts`, `test/unit/controller.test.ts`

**Interfaces:**
- Consumes (Task 1): `keyOf`, `SuggestKind`, `ActionEvent`, `SnippetData`, `InlineItem`.
- Produces:
  - `types.ts`:
    ```ts
    export type { SuggestKind } from '../actionLog';
    export interface Offer {
      kind: SuggestKind; generator: string; name: string; sets: Record<string, unknown>;
      label?: string; summary?: string; lines?: string[]; planId?: number; plan?: Plan;
      band?: 'offer' | 'hint'; choice?: string; reasons?: string[]; score?: number;
    }
    export interface Shown extends Offer { uri: string; line: number; lineText: string; version: number; key: string }
    ```
  - `gate.ts`: `MAX_GHOST_LINES = 8`; `snippetData(d: unknown): SnippetData | undefined`; `interface GateIn { enabled: boolean; inProject: boolean; completionOpen: boolean; nonInline: boolean; dismissed(key: string): boolean; line: number; lineText: string }` (line 0-based); `type Gate = { ok: true; data: SnippetData; body: string; key: string } | { ok: false; why: string }`; `early(g: GateIn): string | undefined`; `inlineGate(item: InlineItem | undefined, g: GateIn): Gate`; `interface FillArgs { uri: string; range: Range; body: string; data: SnippetData }`.
  - `controller.ts`: `interface View { keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void; show?(st: Shown): void; hide?(uri: string): void }`; `interface ControllerDeps { view: View; log(e: ActionEvent): void }`; `class Controller` with `state(uri)`, `isDismissed(uri, key)`, `nonInline(uri, line)`, `focus(uri | undefined)`, `inline(st: Shown)`, `moved(uri, line, lineText)`, `clear(uri)`, `clearSnippet(uri)`, `dismiss(uri)`, `closed(uri)`, `off()`.

- [ ] **Step 1: Write the failing tests**

`test/unit/gate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { early, GateIn, inlineGate, MAX_GHOST_LINES, snippetData } from '../../src/suggest/gate';
import { keyOf } from '../../src/suggest/keys';
import type { InlineItem } from '../../src/protocol';

const data = { kind: 'action', path: '/p/a.py', generator: 'p/failure', sets: { app: 'bistro' }, line: 5 };
const item = (o: Partial<InlineItem> = {}): InlineItem => ({
  insertText: { kind: 'snippet', value: 'class ${1:Name}:' }, range: { start: { line: 4, character: 0 }, end: { line: 4, character: 0 } },
  filterText: '', ghost: ['class ⟨Name⟩:'], data, ...o,
});
const g = (o: Partial<GateIn> = {}): GateIn => ({
  enabled: true, inProject: true, completionOpen: false, nonInline: false, dismissed: () => false, line: 4, lineText: '', ...o,
});

test('an action item with a short ghost is shown, its body and key with it', () => {
  const r = inlineGate(item(), g());
  assert.ok(r.ok);
  assert.equal(r.body, 'class ${1:Name}:');
  assert.equal(r.data.generator, 'p/failure');
  assert.equal(r.key, keyOf({ generator: 'p/failure', sets: { app: 'bistro' } }, '', 5));
});

test('nothing when ghosts are off, out of a project, the completion widget is open or a decoration holds the line', () => {
  for (const o of [{ enabled: false }, { inProject: false }, { completionOpen: true }, { nonInline: true }] as Partial<GateIn>[]) {
    assert.equal(inlineGate(item(), g(o)).ok, false, JSON.stringify(o));
    assert.ok(early(g(o)), JSON.stringify(o));
  }
  assert.equal(early(g()), undefined);
});

test('nothing for no item, data that is not an action, a ghost that is not lines, or one of more than 8 lines', () => {
  assert.equal(inlineGate(undefined, g()).ok, false);
  assert.equal(inlineGate(item({ data: { kind: 'other' } }), g()).ok, false);
  assert.equal(inlineGate(item({ data: undefined }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: 'class X:' }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: Array(MAX_GHOST_LINES + 1).fill('x') }), g()).ok, false);
  assert.equal(inlineGate(item({ ghost: Array(MAX_GHOST_LINES).fill('x') }), g()).ok, true);
});

test('nothing once dismissed on this line\'s text', () => {
  const key = keyOf({ generator: 'p/failure', sets: { app: 'bistro' } }, '', 5);
  assert.equal(inlineGate(item(), g({ dismissed: k => k === key })).ok, false);
});

test('a plain-text insertText is taken as the body', () => {
  const r = inlineGate(item({ insertText: 'pass' }), g());
  assert.ok(r.ok && r.body === 'pass');
});

test('snippetData: an action with a generator; sets default to {}', () => {
  assert.deepEqual(snippetData({ kind: 'action', path: 'p', generator: 'g', line: 1 })?.sets, {});
  assert.equal(snippetData({ kind: 'action', path: 'p', line: 1 }), undefined);
  assert.equal(snippetData(null), undefined);
});
```

`test/unit/controller.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ActionEvent } from '../../src/actionLog';
import { Controller } from '../../src/suggest/controller';
import type { Shown } from '../../src/suggest/types';

function setup() {
  const keys: { visible: boolean; kind?: string; band?: string }[] = [];
  const logged: ActionEvent[] = [];
  const c = new Controller({ view: { keys: k => keys.push(k) }, log: e => logged.push(e) });
  return { c, keys, logged, lastKeys: () => keys[keys.length - 1] };
}

const snippet = (o: Partial<Shown> = {}): Shown => ({
  kind: 'snippet', uri: 'file:///p/a.py', line: 4, lineText: '', version: 3, key: 'k1', generator: 'p/failure', name: 'p/failure', sets: {}, ...o,
});

test('an inline ghost is recorded and logged once per key; the keys follow', () => {
  const { c, logged, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.inline(snippet());
  assert.equal(c.state('file:///p/a.py')?.kind, 'snippet');
  assert.deepEqual(logged, [{ event: 'snippet-shown', generator: 'p/failure', band: undefined, score: undefined }]);
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
});

test('moving off the line, or editing it, clears it at once', () => {
  const { c, lastKeys } = setup();
  c.focus('file:///p/a.py');
  c.inline(snippet());
  c.moved('file:///p/a.py', 4, '');
  assert.ok(c.state('file:///p/a.py'));
  c.moved('file:///p/a.py', 4, 'c');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.deepEqual(lastKeys(), { visible: false });
  c.inline(snippet());
  c.moved('file:///p/a.py', 5, '');
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('dismiss remembers the key, logs it and clears', () => {
  const { c, logged } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.ok(c.isDismissed('file:///p/a.py', 'k1'));
  assert.ok(!c.isDismissed('file:///p/b.py', 'k1'));
  assert.deepEqual(logged.at(-1), { event: 'snippet-dismissed', generator: 'p/failure', band: undefined, score: undefined });
});

test('closed forgets the state and the dismissals', () => {
  const { c } = setup();
  c.inline(snippet());
  c.dismiss('file:///p/a.py');
  c.closed('file:///p/a.py');
  assert.ok(!c.isDismissed('file:///p/a.py', 'k1'));
});

test('the keys follow the active editor', () => {
  const { c, lastKeys } = setup();
  c.inline(snippet());
  c.focus('file:///p/b.py');
  assert.deepEqual(lastKeys(), { visible: false });
  c.focus('file:///p/a.py');
  assert.deepEqual(lastKeys(), { visible: true, kind: 'snippet', band: undefined });
  c.focus(undefined);
  assert.deepEqual(lastKeys(), { visible: false });
});

test('off clears every document; clearSnippet only a snippet; nonInline is a decoration kind on the line', () => {
  const { c } = setup();
  c.inline(snippet());
  c.inline(snippet({ uri: 'file:///p/b.py' }));
  assert.equal(c.nonInline('file:///p/a.py', 4), false);
  c.clearSnippet('file:///p/a.py');
  assert.equal(c.state('file:///p/a.py'), undefined);
  c.off();
  assert.equal(c.state('file:///p/b.py'), undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. tsc cannot find `../../src/suggest/gate`, `../../src/suggest/controller` and `../../src/suggest/types`.

- [ ] **Step 3: Implement**

`src/suggest/types.ts`:

```ts
import type { Plan } from '../protocol';
import type { SuggestKind } from '../actionLog';

export type { SuggestKind };

// Offer: a suggestion as the controller keeps it (durandal.nvim suggest.lua's st.shown and
// st.action). generator is what the log and dismiss key name: a follow-up's and a ghost's is
// the server's label (nvim :275), a recognition's its generator; name is shown.
export interface Offer {
  kind: SuggestKind; generator: string; name: string; sets: Record<string, unknown>;
  label?: string; summary?: string; lines?: string[]; planId?: number; plan?: Plan;
  band?: 'offer' | 'hint'; choice?: string; reasons?: string[]; score?: number;
}

// Shown: an offer drawn on a document's line (0-based) at a version, with its dismiss key.
export interface Shown extends Offer { uri: string; line: number; lineText: string; version: number; key: string }
```

`src/suggest/gate.ts`:

```ts
import type { Range } from 'vscode-languageserver-protocol';
import type { InlineItem, SnippetData } from '../protocol';
import { keyOf } from './keys';

// gate: which inline item (the snippet anticipated at the cursor) is shown (spec §3.1, nvim
// suggest.lua :241-255), and what its fill command carries. Pure.

export const MAX_GHOST_LINES = 8;

export interface GateIn {
  enabled: boolean; inProject: boolean;
  // VS Code's completion widget is open (context.selectedCompletionInfo): Tab is its
  completionOpen: boolean;
  // the controller shows a decoration kind on this line (a follow-up wins, nvim :334)
  nonInline: boolean;
  dismissed(key: string): boolean;
  line: number; lineText: string;
}

export type Gate = { ok: true; data: SnippetData; body: string; key: string } | { ok: false; why: string };

// FillArgs: durandal.snippet.fill's one argument (protocol range: the item's, the whole line).
export interface FillArgs { uri: string; range: Range; body: string; data: SnippetData }

export function snippetData(d: unknown): SnippetData | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const o = d as Record<string, unknown>;
  if (o.kind !== 'action' || typeof o.generator !== 'string') return undefined;
  return { ...(o as unknown as SnippetData), sets: o.sets && typeof o.sets === 'object' ? (o.sets as Record<string, unknown>) : {} };
}

// early: why nothing is asked at all (undefined: ask the server).
export function early(g: GateIn): string | undefined {
  if (!g.enabled) return 'ghosts are off';
  if (!g.inProject) return 'not in a project';
  if (g.completionOpen) return 'the completion widget is open';
  if (g.nonInline) return 'a suggestion is shown on this line';
  return undefined;
}

export function inlineGate(item: InlineItem | undefined, g: GateIn): Gate {
  const why = early(g);
  if (why) return { ok: false, why };
  if (!item) return { ok: false, why: 'no item' };
  const data = snippetData(item.data);
  if (!data) return { ok: false, why: 'not an action' };
  if (!Array.isArray(item.ghost) || item.ghost.length > MAX_GHOST_LINES) return { ok: false, why: 'no ghost of at most 8 lines' };
  const key = keyOf(data, g.lineText, g.line + 1);
  if (g.dismissed(key)) return { ok: false, why: 'dismissed here' };
  const body = typeof item.insertText === 'string' ? item.insertText : item.insertText.value;
  return { ok: true, data, body, key };
}
```

`src/suggest/controller.ts`:

```ts
import type { ActionEvent } from '../actionLog';
import type { Shown, SuggestKind } from './types';

// View is what the controller changes on screen: the context keys for the active editor's
// suggestion and (milestone 3b) the ⚡ decoration of a non-inline kind.
export interface View {
  keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void;
  show?(st: Shown): void;
  hide?(uri: string): void;
}

export interface ControllerDeps { view: View; log(e: ActionEvent): void }

// Controller is durandal.nvim suggest.lua's state: the suggestion shown per document, the
// dismissals remembered per document, the context keys. Pure: editor.ts feeds it.
export class Controller {
  protected readonly states = new Map<string, Shown>();
  private readonly dismissed = new Map<string, Set<string>>();
  private active: string | undefined;

  constructor(protected readonly d: ControllerDeps) {}

  state(uri: string): Shown | undefined { return this.states.get(uri); }
  isDismissed(uri: string, key: string): boolean { return this.dismissed.get(uri)?.has(key) ?? false; }

  // nonInline: a decoration kind is shown on this line (the inline ghost yields to it)
  nonInline(uri: string, line: number): boolean {
    const s = this.states.get(uri);
    return !!s && s.kind !== 'snippet' && s.line === line;
  }

  focus(uri: string | undefined): void {
    this.active = uri;
    this.keys();
  }

  // inline: the snippet ghost the inline provider handed VS Code
  inline(st: Shown): void {
    if (this.states.get(st.uri)?.key === st.key) return;
    this.set(st);
  }

  protected set(st: Shown): void {
    const before = this.states.get(st.uri);
    this.states.set(st.uri, st);
    if (st.kind !== 'snippet') this.d.view.show?.(st);
    else if (before && before.kind !== 'snippet') this.d.view.hide?.(st.uri);
    const hint = st.kind === 'recognition' && st.band === 'hint';
    this.d.log({
      event: `${st.kind}-shown`, generator: st.generator, band: st.band, score: st.score,
      ...(hint ? { model: (st.reasons ?? []).includes('the model agrees') } : {}),
    });
    this.keys();
  }

  // moved: the cursor or its line's text changed. Off the suggestion's line, or its text
  // changed, the suggestion goes at once (suggest.lua :451-455).
  moved(uri: string, line: number, lineText: string): void {
    const s = this.states.get(uri);
    if (s && (s.line !== line || s.lineText !== lineText)) this.clear(uri);
  }

  clear(uri: string): void {
    const s = this.states.get(uri);
    if (!s) return;
    this.states.delete(uri);
    if (s.kind !== 'snippet') this.d.view.hide?.(uri);
    this.keys();
  }

  clearSnippet(uri: string): void {
    if (this.states.get(uri)?.kind === 'snippet') this.clear(uri);
  }

  // dismiss is Esc: not offered again on this line's text (suggest.lua :103-112)
  dismiss(uri: string): void {
    const s = this.states.get(uri);
    if (!s) return;
    const set = this.dismissed.get(uri) ?? new Set<string>();
    set.add(s.key);
    this.dismissed.set(uri, set);
    this.d.log({ event: `${s.kind}-dismissed`, generator: s.generator, band: s.band, score: s.score });
    this.dismissedHook(s);
    this.clear(uri);
  }

  // dismissedHook: what else a dismissal does (milestone 3b: a recognition's feedback)
  protected dismissedHook(_s: Shown): void {}

  closed(uri: string): void {
    this.clear(uri);
    this.dismissed.delete(uri);
  }

  off(): void {
    for (const uri of [...this.states.keys()]) this.clear(uri);
  }

  private keys(): void {
    const s = this.active ? this.states.get(this.active) : undefined;
    this.d.view.keys(s ? { visible: true, kind: s.kind, band: s.band } : { visible: false });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/suggest/types.ts src/suggest/gate.ts src/suggest/controller.ts test/unit/gate.test.ts test/unit/controller.test.ts
git commit -m "suggest: the inline gate and the controller's snippet state (dismiss memory, context keys)"
```

---

### Task 3: The ghosts setting, toggle, dismiss command, Esc key and editor wiring

**Files:**
- Create: `src/suggest/editor.ts`
- Modify: `src/commandTable.ts`, `package.json`, `src/extension.ts`
- Test: `test/unit/manifest.test.ts`

**Interfaces:**
- Consumes (Task 2): `Controller`, `View`.
- Produces:
  - `commandTable.ts`: `BUILT` gains `'durandal.ghosts.toggle': { title: 'Toggle Ghost Text' }` and `'durandal.suggest.dismiss': { title: 'Dismiss Suggestion', enablement: 'durandal.ghostVisible' }`; `export const SUGGEST_KEYS: { command: string; key: string; when: string }[]`.
  - `editor.ts`: `class Suggest { readonly controller: Controller; constructor(d: { server: Server; log: ActionLog; say: Say }); enabled(): boolean; state(uri: string): Shown | undefined; register(context: vscode.ExtensionContext): void }`.
  - `extension.ts`: `Api.suggest: Suggest`.

- [ ] **Step 1: Write the failing manifest tests**

In `test/unit/manifest.test.ts`, import `SUGGEST_KEYS` too, and replace the enablement and keybinding tests and extend the settings test:

```ts
import { BUILT, FORM_KEYS, KEYS, NOT_YET, PREFIX, SERVER_NAMED, SUGGEST_KEYS } from '../../src/commandTable';

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
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  assert.ok(KEYS.filter(k => !k.keys.startsWith('p ')).every(k => k.when === 'durandal.inProject'));
  assert.ok(FORM_KEYS.every(k => k.when === 'durandal.formOpen && inQuickOpen'));
});

test('Esc dismisses the snippet ghost only while it is ours and visible (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.dismiss' && k.when.startsWith('inlineSuggestionVisible')), {
    command: 'durandal.suggest.dismiss', key: 'escape',
    when: "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'",
  });
});
```

In the existing `'the settings and the activation'` test, add `'durandal.ghosts'` to the expected key list (keep it sorted) and append:

```ts
  const ghosts = (pkg.contributes.configuration.properties as Record<string, { type: string; default: unknown }>)['durandal.ghosts'];
  assert.equal(ghosts.type, 'boolean');
  assert.equal(ghosts.default, true);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `SUGGEST_KEYS` is not exported, and once that compiles, the manifest lacks the commands, setting and keybinding.

- [ ] **Step 3: Implement the table and the manifest**

`src/commandTable.ts`: add to `BUILT` (after `'durandal.migration'`):

```ts
  'durandal.ghosts.toggle': { title: 'Toggle Ghost Text' },
  'durandal.suggest.dismiss': { title: 'Dismiss Suggestion', enablement: 'durandal.ghostVisible' },
```

Update `BUILT`'s comment to "The form keys' commands (spec §9) are enabled only while the generate form is open; the suggestion's only while one is shown (M3 spec §4)." Then append:

```ts
// The keys of a suggestion (M3 spec §4): Esc dismisses the snippet ghost while VS Code shows
// it and it is Durandal's (VS Code's own Esc hides it; ours also remembers the line). Tab on
// the snippet ghost is VS Code's own (editor.action.inlineSuggest.commit).
export const SUGGEST_KEYS: { command: string; key: string; when: string }[] = [
  { command: 'durandal.suggest.dismiss', key: 'escape', when: "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'" },
];
```

`package.json`, under `contributes.configuration.properties` after `durandal.hints`:

```json
        "durandal.ghosts": {
          "type": "boolean",
          "default": true,
          "markdownDescription": "Show the snippet Olifant anticipates at the cursor as ghost text: Tab inserts it and the model fills its holes, Esc dismisses it on that line. `Durandal: Toggle Ghost Text` flips it. Snippets in the completion list are unaffected."
        },
```

Under `contributes.commands`, after `durandal.migration`:

```json
      {
        "command": "durandal.ghosts.toggle",
        "title": "Toggle Ghost Text",
        "category": "Durandal"
      },
      {
        "command": "durandal.suggest.dismiss",
        "title": "Dismiss Suggestion",
        "category": "Durandal",
        "enablement": "durandal.ghostVisible"
      },
```

At the end of `contributes.keybindings`:

```json
      {
        "command": "durandal.suggest.dismiss",
        "key": "escape",
        "when": "inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostKind == 'snippet'"
      }
```

- [ ] **Step 4: Run the manifest tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Write `src/suggest/editor.ts`**

```ts
import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import type { Say, Server } from '../server';
import { Controller } from './controller';
import type { Shown, SuggestKind } from './types';

const HIDE_INLINE = 'editor.action.inlineSuggest.hide';

// Suggest is ghost text and snippets in VS Code (durandal.nvim suggest.lua, M3 spec): the
// controller fed by the active editor, the context keys, durandal.ghosts and its toggle
// (:DurandalGhosts), and Esc's dismissal.
export class Suggest {
  readonly controller: Controller;

  constructor(private readonly d: { server: Server; log: ActionLog; say: Say }) {
    this.controller = new Controller({ view: { keys: k => this.keys(k) }, log: e => d.log.write(e) });
  }

  enabled(): boolean {
    return vscode.workspace.getConfiguration('durandal').get<boolean>('ghosts', true);
  }

  state(uri: string): Shown | undefined { return this.controller.state(uri); }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.ghosts.toggle', async () => {
        const c = vscode.workspace.getConfiguration('durandal');
        const set = c.inspect<boolean>('ghosts');
        const target = set?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        await c.update('ghosts', !this.enabled(), target);
      }),
      vscode.commands.registerCommand('durandal.suggest.dismiss', async () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed) return;
        const uri = ed.document.uri.toString();
        const kind = this.controller.state(uri)?.kind;
        this.controller.dismiss(uri);
        if (kind === 'snippet') await vscode.commands.executeCommand(HIDE_INLINE);
      }),
      vscode.window.onDidChangeTextEditorSelection(e => this.moved(e.textEditor)),
      vscode.workspace.onDidChangeTextDocument(e => {
        const ed = vscode.window.activeTextEditor;
        if (ed && ed.document === e.document) this.moved(ed);
      }),
      vscode.window.onDidChangeActiveTextEditor(ed => this.controller.focus(ed?.document.uri.toString())),
      vscode.workspace.onDidCloseTextDocument(doc => this.controller.closed(doc.uri.toString())),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('durandal.ghosts') && !this.enabled()) {
          this.controller.off();
          void vscode.commands.executeCommand(HIDE_INLINE);
        }
      }),
    );
    this.controller.focus(vscode.window.activeTextEditor?.document.uri.toString());
  }

  private moved(ed: vscode.TextEditor): void {
    const line = ed.selection.active.line;
    this.controller.moved(ed.document.uri.toString(), line, ed.document.lineAt(line).text);
  }

  private keys(k: { visible: boolean; kind?: SuggestKind; band?: string }): void {
    void vscode.commands.executeCommand('setContext', 'durandal.ghostVisible', k.visible);
    void vscode.commands.executeCommand('setContext', 'durandal.ghostKind', k.kind ?? '');
    void vscode.commands.executeCommand('setContext', 'durandal.ghostBand', k.band ?? '');
  }
}
```

- [ ] **Step 6: Wire it into `src/extension.ts`**

Import `Suggest` from `./suggest/editor`. Add `suggest: Suggest;` to `Api` with the comment `// ghost text and snippets: the controller's state and the fills (the e2e tests read them)`. After `hooks.hints = hints;`:

```ts
  const suggest = new Suggest({ server: s, log, say });
  suggest.register(context);
```

Add `suggest` to the returned object.

- [ ] **Step 7: Lint, unit, and the existing e2e still pass**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS. Every earlier fake/bare suite still passes; the real suite is skipped unless `OLIFANT_BIN`/`OLIFANT_REPO` are set.

- [ ] **Step 8: Commit**

```bash
git add src/suggest/editor.ts src/commandTable.ts package.json src/extension.ts test/unit/manifest.test.ts
git commit -m "suggest: durandal.ghosts and its toggle, Dismiss Suggestion on Esc, the context keys"
```

---

### Task 4: The inline and completion middlewares, the fill, and the fake.9 e2e

**Files:**
- Create: `src/suggest/inline.ts`, `src/suggest/fill.ts`, `test/e2e/fake.9-snippets.e2e.ts`
- Modify: `src/server.ts` (`ClientHooks`, the `middleware` block), `src/suggest/editor.ts`, `src/extension.ts`, `test/fake-lsp/fake-lsp`

**Interfaces:**
- Consumes:
  - Task 1: `spanOf`, `dataKey`, `InlineItem`.
  - Task 2: `inlineGate`, `early`, `snippetData`, `FillArgs`, `Controller`.
  - Task 3: `Suggest`.
  - M1/M2: `Server.request`, `errorMessage`, `findRoot`, `Say`.
- Produces:
  - `server.ts`:
    ```ts
    ClientHooks.suggest?: {
      inline(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, fetch: () => Promise<InlineItem[]>): Promise<vscode.InlineCompletionItem[]>;
      completions(document: vscode.TextDocument, items: vscode.CompletionItem[]): void;
      resolved(item: vscode.CompletionItem): void;
    }
    ```
  - `fill.ts`: `FILL = 'durandal.snippet.fill'`, `CHANGED = 'holes left as they are: the text changed while the model filled'`, `class Fill { outcomes: FillOutcome[]; stash(data: unknown, body: string): void; register(context): void; run(a: FillArgs): Promise<FillOutcome> }` with `type FillOutcome = 'filled' | 'same' | 'changed' | 'failed'`; `fillCommand(a: FillArgs): vscode.Command`.
  - `inline.ts`: `class Inline implements NonNullable<ClientHooks['suggest']>`.
  - `Suggest` gains `readonly fill: Fill`, `readonly inline: Inline`, `get fills(): FillOutcome[]`.

- [ ] **Step 1: The fake server's capabilities and `delay` (third vendored change)**

In `test/fake-lsp/fake-lsp`, replace the header's first comment paragraph (lines 2-5) with:

```python
# Vendored from sorcererdev/durandal.nvim tests/fake-lsp at 7969a55; three changes: `--help`
# lists an `lsp` command and exits, so the fake passes durandal-vscode's binary gate; the
# capabilities add codeActionProvider (with resolve), inlayHintProvider, completionProvider
# (with resolve, triggers "@" ":") and inlineCompletionProvider, so the client registers each
# feature (olifant lsp has all of them); and a canned answer {"delay": seconds, …} is sent
# after that pause (the rest as the answer), as a slow model fill would be.
```

Add `import time` beside the other imports. In the `initialize` capabilities, after `"inlayHintProvider": True,` insert:

```python
"completionProvider": {"resolveProvider": True, "triggerCharacters": ["@", ":"]}, "inlineCompletionProvider": True,
```

In the generic `elif "id" in msg:` branch, right after `result = json.load(open(reply)) if os.path.exists(reply) else None`, insert:

```python
        if isinstance(result, dict) and "delay" in result:
            # a slow answer (a model fill): the rest of it, after the pause
            time.sleep(result.pop("delay"))
```

- [ ] **Step 2: Write the failing e2e `test/e2e/fake.9-snippets.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { actionLog, api, file, log, open, reply, revert, running, settle, sleep, until } from './helpers';

const MAIN = 'one/main.py';
const uri = () => file(MAIN).toString();
const BODY = 'class ${1:Name}:\n    ${2:pass}$0';
const FILLED = 'class ${1:Cancelled}:\n    ${2:reason: str}$0';
const RANGE = { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } };
const DATA = { kind: 'action', path: '/one/main.py', generator: 'p/failure', sets: { app: 'bistro' }, line: 2 };

const inline = (o: Record<string, unknown> = {}) => reply('textDocument/inlineCompletion', {
  items: [{ insertText: { kind: 'snippet', value: BODY }, range: RANGE, filterText: '', ghost: ['class ⟨Name⟩:', '    pass'], data: DATA, ...o }],
});
const resolved = (o: Record<string, unknown> = {}) => reply('completionItem/resolve', { label: 'p/failure', data: DATA, textEdit: { range: RANGE, newText: FILLED }, ...o });
const asked = () => log().filter(m => m.method === 'textDocument/inlineCompletion').length;
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);

// show opens main.py ("x = 1\n"), puts the cursor on the empty line 1 and asks VS Code for
// the inline suggestion until Durandal records it.
async function show(): Promise<vscode.TextEditor> {
  await settle(MAIN, 'x = 1\n');
  const ed = await open(file(MAIN));
  const at = new vscode.Position(1, 0);
  ed.selection = new vscode.Selection(at, at);
  const a = await api();
  await until(async () => {
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await sleep(300);
    return a.suggest.state(uri())?.kind === 'snippet';
  }, 'the snippet ghost recorded');
  return ed;
}

describe('ghost text and snippets (fake server)', () => {
  afterEach(async () => {
    reply('textDocument/inlineCompletion', null);
    reply('completionItem/resolve', null);
    reply('textDocument/completion', null);
    await vscode.workspace.getConfiguration('durandal').update('ghosts', undefined, vscode.ConfigurationTarget.Global);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uri());
    if (d?.isDirty) await revert(d);
  });

  it('the anticipated snippet: recorded and logged; Tab inserts it, resolve fills it in place', async () => {
    await running();
    inline();
    resolved();
    const from = actionLog().length;
    const ed = await show();
    assert.equal(events(from, 'snippet-shown').length, 1);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText().includes('class Cancelled:'), 'the filled body in place');
    assert.equal(ed.document.getText(), 'x = 1\nclass Cancelled:\n    reason: str');
    const r = log().filter(m => m.method === 'completionItem/resolve').at(-1)!;
    assert.deepEqual(r.params.label, 'p/failure');
    assert.deepEqual(r.params.data, DATA);
    assert.deepEqual(r.params.textEdit, { range: RANGE, newText: BODY });
    assert.equal((await api()).suggest.fills.at(-1), 'filled');
    assert.equal(events(from, 'snippet-applied').length, 1);
    assert.equal((await api()).suggest.state(uri()), undefined, 'the line changed: cleared');
  });

  it('an edit while the model fills keeps the user\'s text and the unfilled snippet', async () => {
    await running();
    inline();
    resolved({ delay: 2 });
    const ed = await show();
    const fills = (await api()).suggest.fills.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => ed.document.getText().includes('class Name:'), 'the unfilled body inserted');
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# '));
    await until(async () => (await api()).suggest.fills.length > fills, 'the fill done', 10_000);
    assert.equal((await api()).suggest.fills.at(-1), 'changed');
    assert.equal(ed.document.getText(), '# x = 1\nclass Name:\n    pass');
  });

  it('Esc remembers the line: dismissed, logged, not shown again there', async () => {
    await running();
    inline();
    const from = actionLog().length;
    await show();
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    const a = await api();
    assert.equal(a.suggest.state(uri()), undefined);
    assert.equal(events(from, 'snippet-dismissed').length, 1);
    const n = asked();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await until(() => asked() > n, 'asked again');
    await sleep(300);
    assert.equal(a.suggest.state(uri()), undefined, 'still dismissed');
  });

  it('ghosts off: nothing asked, nothing shown; the toggle flips the setting', async () => {
    await running();
    inline();
    await vscode.commands.executeCommand('durandal.ghosts.toggle');
    assert.equal(vscode.workspace.getConfiguration('durandal').get('ghosts'), false);
    await settle(MAIN, 'x = 1\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    const n = asked();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await sleep(800);
    assert.equal(asked(), n);
    assert.equal((await api()).suggest.state(uri()), undefined);
    await vscode.commands.executeCommand('durandal.ghosts.toggle');
    assert.equal(vscode.workspace.getConfiguration('durandal').get('ghosts'), true);
  });

  it('a ghost of 9 lines is not shown', async () => {
    await running();
    inline({ ghost: Array(9).fill('x') });
    await settle(MAIN, 'x = 1\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    const n = asked();
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    await until(() => asked() > n, 'asked');
    await sleep(300);
    assert.equal((await api()).suggest.state(uri()), undefined);
  });

  it('a snippet in the completion list carries the fill command', async () => {
    await running();
    reply('textDocument/completion', [{
      label: 'Failure', kind: 15, detail: 'p/failure', insertTextFormat: 2, filterText: 'Failure',
      textEdit: { range: RANGE, newText: BODY }, data: DATA,
    }]);
    await settle(MAIN, 'x = 1\n');
    await open(file(MAIN));
    const list = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', file(MAIN), new vscode.Position(1, 0));
    const it = list.items.find(i => i.label === 'Failure');
    assert.ok(it, JSON.stringify(list.items.map(i => i.label)));
    assert.equal(it.command?.command, 'durandal.snippet.fill');
    const arg = it.command?.arguments?.[0] as { body: string; data: { generator: string }; uri: string };
    assert.equal(arg.body, BODY);
    assert.equal(arg.data.generator, 'p/failure');
    assert.equal(arg.uri, uri());
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `DURANDAL_E2E_ONLY=fake.9 npm run test:e2e`
Expected: FAIL. tsc reports `Property 'fills' does not exist on type 'Suggest'`. Once that is stubbed, the cases time out waiting for "the snippet ghost recorded".

- [ ] **Step 4: Write `src/suggest/fill.ts`**

```ts
import * as vscode from 'vscode';
import { CompletionResolveRequest } from 'vscode-languageserver-protocol';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Say, Server } from '../server';
import type { FillArgs } from './gate';
import { dataKey } from './keys';
import { spanOf } from './span';

export const FILL = 'durandal.snippet.fill';
export const CHANGED = 'holes left as they are: the text changed while the model filled';
export type FillOutcome = 'filled' | 'same' | 'changed' | 'failed';

export const fillCommand = (a: FillArgs): vscode.Command => ({ title: 'Fill holes', command: FILL, arguments: [a] });

// Fill is the model fill after a snippet was inserted (M3 spec §3.1/3.2, decision 2): VS Code
// ignores a resolve that changes the insert text, so the inserted item's command resolves it
// (olifant fills the holes on completionItem/resolve, Lsp.hs :455-462) and, if the document is
// as the insertion left it, puts the filled body over the lines the unfilled one covers.
export class Fill {
  readonly outcomes: FillOutcome[] = [];
  private readonly stashed = new Map<string, string>();

  constructor(private readonly d: { server: Server; log: ActionLog; say: Say }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand(FILL, (a: FillArgs) => this.run(a)));
  }

  // stash keeps a completion item's resolved body (VS Code resolves the focused item, so the
  // fill is often ready by the time Enter inserts it).
  stash(data: unknown, body: string): void {
    if (this.stashed.size > 50) this.stashed.clear();
    this.stashed.set(dataKey(data), body);
  }

  async run(a: FillArgs): Promise<FillOutcome> {
    const out = await this.fill(a);
    this.outcomes.push(out);
    return out;
  }

  private async fill(a: FillArgs): Promise<FillOutcome> {
    const doc = vscode.workspace.textDocuments.find(x => x.uri.toString() === a.uri);
    if (!doc) return 'failed';
    // the document as the insertion left it (nvim's changedtick, snippet.lua :10)
    const version = doc.version;
    this.d.log.write({ event: 'snippet-applied', generator: a.data.generator });
    const key = dataKey(a.data);
    let filled = this.stashed.get(key);
    this.stashed.delete(key);
    if (filled === undefined) {
      try {
        filled = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Filling holes' }, () => this.resolve(a));
      } catch (err) {
        void this.d.say('error', errorMessage(err));
        return 'failed';
      }
    }
    if (filled === a.body) return 'same';
    if (doc.version !== version) {
      vscode.window.setStatusBarMessage(CHANGED, 5000);
      return 'changed';
    }
    const ed = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (!ed) return 'failed';
    const s = spanOf(a.range.start.line, a.body);
    const end = Math.min(s.end, doc.lineCount - 1);
    const range = new vscode.Range(s.start, 0, end, doc.lineAt(end).text.length);
    return (await ed.insertSnippet(new vscode.SnippetString(filled), range)) ? 'filled' : 'failed';
  }

  private async resolve(a: FillArgs): Promise<string> {
    const r = await this.d.server.request(CompletionResolveRequest.type, {
      label: a.data.generator, data: a.data, textEdit: { range: a.range, newText: a.body },
    });
    const te = r?.textEdit;
    return te && 'newText' in te ? te.newText : a.body;
  }
}
```

- [ ] **Step 5: Write `src/suggest/inline.ts`**

```ts
import * as vscode from 'vscode';
import type { Range } from 'vscode-languageserver-protocol';
import type { InlineItem } from '../protocol';
import { findRoot } from '../root';
import type { ClientHooks } from '../server';
import type { Controller } from './controller';
import { fillCommand, Fill } from './fill';
import { early, GateIn, inlineGate, snippetData } from './gate';

const asRange = (r: Range) => new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
const protoRange = (r: vscode.Range): Range => ({
  start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character },
});

// Inline is the client middleware's ghost and snippet hooks (M3 spec §3.1/3.2): the inline
// item olifant anticipates, gated and given the fill command; the completion list's snippets
// given the same command; resolved items' bodies stashed for the fill.
export class Inline implements NonNullable<ClientHooks['suggest']> {
  constructor(private readonly d: { controller: Controller; fill: Fill; enabled(): boolean }) {}

  async inline(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext,
    fetch: () => Promise<InlineItem[]>): Promise<vscode.InlineCompletionItem[]> {
    const uri = document.uri.toString();
    const g: GateIn = {
      enabled: this.d.enabled(),
      inProject: document.uri.scheme === 'file' && !!(await findRoot(document.uri.fsPath)),
      completionOpen: !!context.selectedCompletionInfo,
      nonInline: this.d.controller.nonInline(uri, position.line),
      dismissed: k => this.d.controller.isDismissed(uri, k),
      line: position.line,
      lineText: document.lineAt(position.line).text,
    };
    if (early(g)) {
      this.d.controller.clearSnippet(uri);
      return [];
    }
    let items: InlineItem[];
    try {
      items = await fetch();
    } catch {
      // cancelled (-32800) or refused: no ghost
      return [];
    }
    const raw = items[0];
    const r = inlineGate(raw, g);
    if (!r.ok) {
      this.d.controller.clearSnippet(uri);
      return [];
    }
    this.d.controller.inline({
      kind: 'snippet', uri, line: g.line, lineText: g.lineText, version: document.version, key: r.key,
      generator: r.data.generator, name: r.data.generator, sets: r.data.sets,
    });
    const item = new vscode.InlineCompletionItem(new vscode.SnippetString(r.body), asRange(raw.range),
      fillCommand({ uri, range: raw.range, body: r.body, data: r.data }));
    if (raw.filterText !== undefined) item.filterText = raw.filterText;
    return [item];
  }

  // completions gives the list's snippets (olifant's Snippet items with action data) the fill
  // command; durandal.ghosts does not apply to them (nvim).
  completions(document: vscode.TextDocument, items: vscode.CompletionItem[]): void {
    for (const it of items) {
      const data = snippetData((it as { data?: unknown }).data);
      if (!data || it.kind !== vscode.CompletionItemKind.Snippet || !(it.insertText instanceof vscode.SnippetString)) continue;
      const range = it.range instanceof vscode.Range ? it.range : it.range?.replacing;
      if (!range) continue;
      it.command = fillCommand({ uri: document.uri.toString(), range: protoRange(range), body: it.insertText.value, data });
    }
  }

  resolved(item: vscode.CompletionItem): void {
    const data = snippetData((item as { data?: unknown }).data);
    if (data && item.insertText instanceof vscode.SnippetString) this.d.fill.stash(data, item.insertText.value);
  }
}
```

- [ ] **Step 6: The middlewares in `src/server.ts`**

Imports: add `InlineCompletionRequest` to the `vscode-languageclient/node` import (if it is not re-exported there, import it from `vscode-languageserver-protocol`). Add `import type { InlineItem } from './protocol';` (extend the existing protocol import).

Extend `ClientHooks`:

```ts
  // ghost text and snippets (M3 spec §3.1/3.2): the inline item gated and given the fill
  // command (the middleware asks the server itself: the library drops olifant's data and
  // ghost); the completion list's snippets given the same command; resolved bodies stashed
  suggest?: {
    inline(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext,
      fetch: () => Promise<InlineItem[]>): Promise<vscode.InlineCompletionItem[]>;
    completions(document: vscode.TextDocument, items: vscode.CompletionItem[]): void;
    resolved(item: vscode.CompletionItem): void;
  };
```

In `middleware`, after `provideInlayHints`:

```ts
        provideInlineCompletionItems: async (document, position, context, token, next) => {
          const s = hooks.suggest;
          const lc = made.lc;
          if (!s || !lc) return next(document, position, context, token);
          return s.inline(document, position, context, async () => {
            const r = await lc.sendRequest(InlineCompletionRequest.type,
              lc.code2ProtocolConverter.asInlineCompletionParams(document, position, context), token);
            if (!r) return [];
            return (Array.isArray(r) ? r : r.items) as unknown as InlineItem[];
          });
        },
        provideCompletionItem: async (document, position, context, token, next) => {
          const r = await next(document, position, context, token);
          if (r && hooks.suggest) hooks.suggest.completions(document, Array.isArray(r) ? r : r.items);
          return r;
        },
        resolveCompletionItem: async (item, token, next) => {
          const r = await next(item, token);
          if (r && hooks.suggest) hooks.suggest.resolved(r);
          return r;
        },
```

- [ ] **Step 7: Wire `Fill` and `Inline` into `Suggest` and `extension.ts`**

In `src/suggest/editor.ts` import `Fill, FillOutcome` from `./fill` and `Inline` from `./inline`. Add the fields and the constructor lines:

```ts
  readonly fill: Fill;
  readonly inline: Inline;
```

```ts
    this.fill = new Fill({ server: d.server, log: d.log, say: d.say });
    this.inline = new Inline({ controller: this.controller, fill: this.fill, enabled: () => this.enabled() });
```

Add `get fills(): FillOutcome[] { return this.fill.outcomes; }` and, at the top of `register`, `this.fill.register(context);`.

In `src/extension.ts`, after `suggest.register(context);` add `hooks.suggest = suggest.inline;`.

- [ ] **Step 8: Run fake.9, then everything**

Run: `DURANDAL_E2E_ONLY=fake.9 npm run test:e2e`
Expected: 6 passing.

If the first case's final text differs only in whitespace, read VS Code's snippet whitespace adjustment: `insertSnippet` indents later lines by the leading whitespace before the start position, which is none at column 0. Fix the test's expectation only if VS Code really normalises it, and say why in a comment. Never loosen the guard.

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS (every suite).

- [ ] **Step 9: Commit**

```bash
git add src/suggest/inline.ts src/suggest/fill.ts src/suggest/editor.ts src/server.ts src/extension.ts test/fake-lsp/fake-lsp test/e2e/fake.9-snippets.e2e.ts
git commit -m "suggest: the inline ghost and completion snippets, filled by the model after Tab"
```

---

### Task 5: The real-server snippet e2e, README, CHANGELOG, PR 1

**Files:**
- Create: `test/e2e/real.6-snippets.e2e.ts`
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `Api.suggest.state`, `Api.suggest.fills` (Task 4); helpers `open`, `file`, `running`, `until`, `sleep`, `revert`, `ws`.

- [ ] **Step 1: Write `test/e2e/real.6-snippets.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { file, open, revert, running, sleep, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';

// durandal.nvim tests/e2e_python_spec.lua :167-203, the first half: a blank line under the
// last failure → the failure-variant ghost → Tab → `class Name:` (or the model's name). CI has
// no model and no [fills]: the holes are filled, or left intact.
describe('ghost text against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(BOOKING).toString());
    if (d?.isDirty) await revert(d);
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
  });

  it('a blank line under the last failure: the failure ghost, committed, filled or left', async () => {
    const ed = await open(file(BOOKING));
    const a = await running();
    const lines = ed.document.getText().split('\n');
    const cls = lines.findIndex(l => l.includes('class TableNotFound'));
    assert.ok(cls >= 0, 'create_booking.py has class TableNotFound');
    // `o` below its `reason: str`: a new blank line
    await ed.edit(b => b.insert(ed.document.lineAt(cls + 1).range.end, '\n'));
    const at = new vscode.Position(cls + 2, 0);
    ed.selection = new vscode.Selection(at, at);
    await until(async () => {
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      await sleep(1000);
      return a.suggest.state(ed.document.uri.toString())?.kind === 'snippet';
    }, 'the failure-variant ghost', 120_000);
    const fills = a.suggest.fills.length;
    await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    await until(() => a.suggest.fills.length > fills, 'the fill', 120_000);
    const out = a.suggest.fills.at(-1);
    assert.ok(out === 'filled' || out === 'same', `fill: ${out}`);
    const line = ed.document.lineAt(cls + 2).text;
    console.log(`py ghost committed: ${line} (${out})`);
    assert.match(line, /^class \w+:$/);
  });
});
```

- [ ] **Step 2: Run it against the pinned olifant**

Build olifant at `.olifant-ref` in a temp worktree, as M2 did:

```bash
git -C ~/projects/olifant worktree add /tmp/olifant-m3 $(cat .olifant-ref)
(cd /tmp/olifant-m3 && cabal build exe:olifant)
```

Then:

```bash
OLIFANT_BIN=$(cd /tmp/olifant-m3 && cabal list-bin olifant) OLIFANT_REPO=/tmp/olifant-m3 DURANDAL_E2E_ONLY=real.6 npm run test:e2e
```

Expected: 1 passing (the fake and bare suites run first, narrowed to nothing).

If the ghost never appears with a typed trigger, or the ghost shows but VS Code rejects it (the prefix rule, `d.ts` :5266-5270), stop. Record what was seen, which is spec §7's condition for olifant issue 3 (sorcererdev/olifant#5). Note it in the PR body. Do not change olifant.

- [ ] **Step 3: README and CHANGELOG**

In `README.md`, after the "Actions and generators" section and before "## Settings", add:

```markdown
## Ghost text and snippets

- **The snippet Olifant anticipates** at the cursor (a failure variant under the last failure,
  a test case in a describe block) shows as ghost text. `Tab` inserts it with its holes as tab
  stops, then the model fills the holes in place (status bar: "Filling holes"). If you type
  while it fills, your text is kept and the holes stay as they were. `Esc` dismisses it, and
  it is not offered again on that line's text.
- **Snippets in the completion list** (`Ctrl+Space`, or after `@` or `:`) are the same
  snippets by choice; picking one fills its holes the same way.
- `durandal.ghosts` or `Durandal: Toggle Ghost Text` turns the ghost text off (the completion
  list keeps its snippets). While VS Code's completion list, another extension's ghost text, or
  a snippet you are filling in has Tab, Tab is theirs.
```

In "## Settings", add `- \`durandal.ghosts\`: ghost text.` after the `durandal.hints` line, and change the `durandal.debounceMs` line to `- \`durandal.debounceMs\`: how long typing must pause before suggestions are worked out (the server's and the editor's).`.

In `CHANGELOG.md`, under `## Unreleased`, first line:

```markdown
- Ghost text for the snippet anticipated at the cursor and fill-on-accept for completion
  snippets, with Esc's per-line dismissal and `durandal.ghosts` (milestone 3a).
```

- [ ] **Step 4: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:e2e`, then the real suite as in Step 2 without `DURANDAL_E2E_ONLY`.
Expected: lint clean; unit all pass; fake, bare and real all pass. Record the counts for the PR.

- [ ] **Step 5: Commit, push, open PR 1**

```bash
git add test/e2e/real.6-snippets.e2e.ts README.md CHANGELOG.md
git commit -m "real-server snippet e2e (failure ghost → commit → filled or intact); README and CHANGELOG"
git push -u origin m3a-snippets
```

Open the PR with `gh pr create --title "M3a: ghost text and snippets" --body-file <file>`. The body holds:
- the goal in one paragraph;
- decisions 1, 2, 3, 8, 10 and 12 from Global Constraints;
- the verification counts;
- the olifant issue 3 finding from Step 2 (seen or not);
- the manual checklist below;
- the PR attribution footer.

Manual checklist:

```markdown
- [ ] The ghost looks like VS Code's own (grey, multi-line under a blank line)
- [ ] Tab inserts; the status bar shows "Filling holes"; with a model, the holes are replaced by the fill
- [ ] Typing during the fill leaves your text and shows "holes left as they are…"
- [ ] Esc hides the ghost and it does not come back on that line; on another blank line it does
- [ ] With Copilot (or another inline provider) on: Tab accepts whichever ghost is shown, Durandal's Esc only acts on its own
- [ ] Durandal: Toggle Ghost Text hides it; completion-list snippets still fill
- [ ] A completion-list snippet (Ctrl+Space) fills after Enter
```

Remove the olifant worktree: `git -C ~/projects/olifant worktree remove /tmp/olifant-m3`. Merging is the user's call; M3b starts from `main` after the merge.

---

# M3b — pushed and pulled suggestions (branch `m3b-suggestions`, from `main` after PR 1 merged)

### Task 6: Suggestion types, the push store, recognition texts and the accept way (pure)

**Files:**
- Modify: `src/protocol.ts`
- Create: `src/suggest/store.ts`, `src/suggest/recognition.ts`
- Test: `test/unit/store.test.ts`, `test/unit/recognition.test.ts`, `test/unit/protocol.test.ts`

**Interfaces:**
- Consumes: `Offer`, `Shown` (Task 2), `short` (Task 1).
- Produces:
  - `protocol.ts`:
    ```ts
    export type SuggestionKind = 'ghost' | 'followup' | 'recognition' | 'snippet';
    export interface Suggestion extends Open {
      uri: string; version: number; kind: SuggestionKind; label: string; summary: string;
      line: number | null; lines: string[] | null; at: number | null; planId: number;
      generator: string | null; sets: Sets;
      band?: 'offer' | 'hint'; or?: string | null; reasons?: string[]; score?: number;
    }
    export interface SuggestResult extends Suggestion { plan: Plan; edit?: WorkspaceEdit }
    export interface ChoicesInput extends Open { name: string; type?: string; optional?: boolean; default?: string | null; prompt?: string | null; choices?: string[] | null; errors?: Record<string, string> | string[] | null }
    export interface ChoicesResult extends Open { name?: string; inputs: ChoicesInput[] }
    ```
    `PlanParams`' middle arm becomes `{ planId: number; fill?: boolean }`; `Olifant.suggest` becomes `req<SuggestParams, SuggestResult | null>`.
  - `store.ts`: `interface Pushed { s: Suggestion; asked: boolean; plan?: Plan }`; `class Store { receive(s: Suggestion): void; current(uri: string, version: number, line: number): Pushed | undefined; forget(uri: string): void }` (line 0-based).
  - `recognition.ts`: `recognitionOf(s: Suggestion, plan?: Plan): Offer`, `followupOf(s: Suggestion, plan?: Plan): Offer`, `ghostOf(s: Suggestion): Offer`, `recognitionText(o: Offer): string`, `decorationText(o: Offer): string`, `acceptWay(o: Offer): 'review' | 'choose' | 'none'`.

- [ ] **Step 1: Write the failing tests**

`test/unit/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Suggestion } from '../../src/protocol';
import { Store } from '../../src/suggest/store';

const push = (o: Partial<Suggestion> = {}): Suggestion => ({
  uri: 'file:///p/a.py', version: 4, kind: 'followup', label: 'p/arms', summary: '2 files', line: 7, lines: null, at: 7, planId: 3,
  generator: null, sets: {}, ...o,
});

test('a push is current for its version and its line (at is 1-based, the cursor 0-based)', () => {
  const s = new Store();
  s.receive(push());
  assert.ok(s.current('file:///p/a.py', 4, 6));
  assert.equal(s.current('file:///p/a.py', 5, 6), undefined);
  assert.equal(s.current('file:///p/a.py', 4, 7), undefined);
  assert.equal(s.current('file:///p/b.py', 4, 6), undefined);
});

test('the latest push replaces the one before, asked afresh; forget drops it', () => {
  const s = new Store();
  s.receive(push());
  s.current('file:///p/a.py', 4, 6)!.asked = true;
  s.receive(push({ version: 5, planId: 4 }));
  const p = s.current('file:///p/a.py', 5, 6)!;
  assert.equal(p.asked, false);
  assert.equal(p.s.planId, 4);
  s.forget('file:///p/a.py');
  assert.equal(s.current('file:///p/a.py', 5, 6), undefined);
});
```

`test/unit/recognition.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan, Suggestion } from '../../src/protocol';
import { acceptWay, decorationText, followupOf, ghostOf, recognitionOf } from '../../src/suggest/recognition';

const base: Suggestion = { uri: 'u', version: 1, kind: 'recognition', label: 'Command', summary: 'a command', line: 2, lines: null, at: 2, planId: 9, generator: 'p/command', sets: { command: 'x' } };
const plan: Plan = { files: [], conflicts: [], warnings: [], holes: [], snippet: null };

// ports durandal.nvim tests/suggest_spec.lua "recognitions"
test('a recognition\'s offer, choice and hint texts', () => {
  assert.equal(decorationText(recognitionOf({ ...base, band: 'offer' })), '⚡ Command — Tab: review');
  assert.equal(decorationText(recognitionOf({ ...base, band: 'offer', or: 'p/add-query' })), '⚡ Command or a add query — Tab: choose');
  assert.equal(decorationText(recognitionOf({ ...base, band: 'hint' })), '⚡ Command');
});

test('a recognition offer keeps the generator, its sets, band, reasons, score and plan', () => {
  const o = recognitionOf({ ...base, band: 'hint', or: null, reasons: ['the name fits'], score: 0.4 }, plan);
  assert.deepEqual(o, {
    kind: 'recognition', generator: 'p/command', name: 'Command', sets: { command: 'x' }, label: 'Command', summary: 'a command',
    band: 'hint', choice: undefined, reasons: ['the name fits'], score: 0.4, plan, planId: 9,
  });
  assert.equal(recognitionOf({ ...base }).band, 'offer', 'no band reads as an offer');
});

test('a follow-up and a ghost are named by the server\'s label (nvim :275)', () => {
  const f = followupOf({ ...base, kind: 'followup', generator: null, label: 'Failure arms', summary: '2 files' }, plan);
  assert.equal(f.generator, 'Failure arms');
  assert.equal(decorationText(f), '⚡ Tab: review Failure arms (2 files)');
  const g = ghostOf({ ...base, kind: 'ghost', label: 'Arms', lines: ['a', 'b', 'c'] });
  assert.deepEqual(g.lines, ['a', 'b', 'c']);
  assert.equal(decorationText(g), '⚡ Tab: Arms (+3 lines)');
});

test('the accept way: a follow-up, a ghost and a planned offer review; a choice, a hint, an unplanned non-offer choose', () => {
  assert.equal(acceptWay(followupOf({ ...base, kind: 'followup' })), 'review');
  assert.equal(acceptWay(ghostOf({ ...base, kind: 'ghost', lines: [] })), 'review');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'offer' }, plan)), 'review');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'offer', or: 'p/q' }, plan)), 'choose');
  assert.equal(acceptWay(recognitionOf({ ...base, band: 'hint' })), 'choose');
  assert.equal(acceptWay({ kind: 'snippet', generator: 'g', name: 'g', sets: {} }), 'none');
});
```

Add to `test/unit/protocol.test.ts`. Extend the type import with `Suggestion, SuggestResult, ChoicesResult`, and add the keys `'uri', 'version', 'kind', 'lines', 'at', 'planId', 'band', 'or', 'reasons', 'score', 'insertText', 'filterText', 'ghost', 'data', 'optional', 'default', 'prompt', 'inputs'` to `KEYS`:

```ts
test('compile check: a suggestion, its pulled answer and the choices read as the server sends them', () => {
  const s: Suggestion = { uri: 'file:///a.py', version: 3, kind: 'recognition', label: 'Command', summary: 's', line: 2, lines: null, at: 2, planId: 7, generator: 'p/command', sets: {}, band: 'offer', or: null, reasons: ['r'], score: 0.9 };
  const r: SuggestResult = { ...s, plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } };
  const c: ChoicesResult = { name: 'Command', inputs: [{ name: 'command', optional: false, default: null, prompt: null, choices: ['a'] }] };
  assert.ok(r.planId === 7 && c.inputs.length === 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL. `../../src/suggest/store` and `recognition` are missing, and `label: string` etc. do not compile against the old `Suggestion`.

- [ ] **Step 3: Implement**

`src/protocol.ts`, in the milestone 3 block: replace the old `Suggestion` with the `SuggestionKind`/`Suggestion`/`SuggestResult` above (comment: `// olifant/suggestion (pushed) and olifant/suggest (pulled, with its plan and edit): Lsp.hs suggestionFields; at and line are 1-based; band, or, reasons and score only on a recognition.`). Replace `ChoicesResult` in the milestone 2 block with the `ChoicesInput` and `ChoicesResult` above (comment: `// one input as olifant/choices lists it (Output.hs): choices flat when known.`). Change `PlanParams`' middle arm to `{ planId: number; fill?: boolean }` and `Olifant.suggest` to `req<SuggestParams, SuggestResult | null>('olifant/suggest')`.

`src/suggest/store.ts`:

```ts
import type { Plan, Suggestion } from '../protocol';

// Pushed: the server's latest suggestion for a document (olifant/suggestion), and its plan
// once asked for (asked once per push: durandal.nvim suggest.lua M.pushed, :205-216).
export interface Pushed { s: Suggestion; asked: boolean; plan?: Plan }

export class Store {
  private readonly m = new Map<string, Pushed>();

  receive(s: Suggestion): void { this.m.set(s.uri, { s, asked: false }); }

  // current: the push for the document as it is, offered while the cursor (0-based) is on its line
  current(uri: string, version: number, line: number): Pushed | undefined {
    const p = this.m.get(uri);
    return p && p.s.version === version && p.s.at === line + 1 ? p : undefined;
  }

  forget(uri: string): void { this.m.delete(uri); }
}
```

`src/suggest/recognition.ts`:

```ts
import type { Plan, Suggestion } from '../protocol';
import { short } from './keys';
import type { Offer } from './types';

// recognition: what the server pushed or answered, as the controller keeps it, and how it
// reads (durandal.nvim suggest.lua :64-100, :135-158). Pure.

export function recognitionOf(s: Suggestion, plan?: Plan): Offer {
  return {
    kind: 'recognition', generator: s.generator ?? s.label, name: s.label, sets: s.sets && typeof s.sets === 'object' ? s.sets : {},
    label: s.label, summary: s.summary, band: s.band === 'hint' ? 'hint' : 'offer', choice: typeof s.or === 'string' ? s.or : undefined,
    reasons: Array.isArray(s.reasons) ? s.reasons : [], score: s.score, plan, planId: s.planId,
  };
}

// a follow-up's and a ghost's generator is the server's label (nvim :275)
export function followupOf(s: Suggestion, plan?: Plan): Offer {
  return { kind: 'followup', generator: s.label, name: s.label, sets: {}, summary: s.summary, plan, planId: s.planId };
}

export function ghostOf(s: Suggestion): Offer {
  return { kind: 'ghost', generator: s.label, name: s.label, sets: {}, lines: Array.isArray(s.lines) ? s.lines : [], planId: s.planId };
}

// recognitionText: an offer, a choice of two, or a quiet hint (nvim :88-92)
export function recognitionText(o: Offer): string {
  const label = o.label ?? o.name;
  if (o.band === 'hint') return `⚡ ${label}`;
  if (o.choice) return `⚡ ${label} or a ${short(o.choice)} — Tab: choose`;
  return `⚡ ${label} — Tab: review`;
}

export function decorationText(o: Offer): string {
  if (o.kind === 'recognition') return recognitionText(o);
  if (o.kind === 'ghost') return `⚡ Tab: ${o.name} (+${(o.lines ?? []).length} lines)`;
  if (o.kind === 'followup') return `⚡ Tab: review ${o.name} (${o.summary ?? ''})`;
  return '';
}

// acceptWay: Tab on it (nvim accept_server, :371-373). The snippet ghost is VS Code's own.
export function acceptWay(o: Offer): 'review' | 'choose' | 'none' {
  if (o.kind === 'snippet') return 'none';
  if (o.kind === 'recognition' && (o.choice || (!o.plan && o.band !== 'offer'))) return 'choose';
  return 'review';
}
```

- [ ] **Step 4: Run to verify**

Run: `npm run lint && npm run test:unit`
Expected: PASS. If the `OLIFANT_REPO` key scan runs locally and fails on a new key, find what olifant sends and fix `protocol.ts`; never drop the key from `KEYS`.

- [ ] **Step 5: Commit**

```bash
git add src/protocol.ts src/suggest/store.ts src/suggest/recognition.ts test/unit/store.test.ts test/unit/recognition.test.ts test/unit/protocol.test.ts
git commit -m "suggest: the Suggestion type in full, the push store, recognition texts and the accept way"
```

---

### Task 7: The choose loop (pure, over `Ui`)

**Files:**
- Create: `src/suggest/choices.ts`
- Test: `test/unit/choices.test.ts`

**Interfaces:**
- Consumes: `ChoicesInput`, `ChoicesResult`, `Sets` (Task 6); `Ui` (`src/uiTypes.ts`); `FakeUi` (`test/fakeUi.ts`); `errorMessage`; `short`.
- Produces: `nextInput(inputs: ChoicesInput[], sets: Sets): ChoicesInput | undefined`; `kind(input: ChoicesInput): 'menu' | 'text'`; `interface ChooseDeps { choices(generator: string, sets: Sets): Promise<ChoicesResult>; ui: Ui }`; `complete(d: ChooseDeps, generator: string, sets: Sets): Promise<Sets | undefined>`; `chooseGenerator(ui: Ui, generator: string, or: string): Promise<string | undefined>`.

- [ ] **Step 1: Write the failing tests**

`test/unit/choices.test.ts`:

```ts
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
  const served: ChoicesInput[] = [{ name: 'service', optional: false, default: null, choices: null, prompt: null, errors: null }];
  assert.equal(nextInput(served, {})?.name, 'service');
  assert.equal(kind(served[0]), 'text');
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL. `../../src/suggest/choices` is not found.

- [ ] **Step 3: Implement `src/suggest/choices.ts`**

```ts
import { errorMessage } from '../errors';
import type { ChoicesInput, ChoicesResult, Sets } from '../protocol';
import type { Ui } from '../uiTypes';
import { short } from './keys';

// choices: a recognition's choose flow (durandal.nvim picker.lua next_input, kind, complete
// :12-24, :92-121): ask each missing input, olifant/choices narrowing after each answer. Pure
// over Ui and the request.

const given = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export function nextInput(inputs: ChoicesInput[], sets: Sets): ChoicesInput | undefined {
  return inputs.find(i => !i.optional && !given(i.default) && sets[i.name] === undefined);
}

export const kind = (input: ChoicesInput): 'menu' | 'text' => (given(input.choices) ? 'menu' : 'text');

export interface ChooseDeps { choices(generator: string, sets: Sets): Promise<ChoicesResult>; ui: Ui }

// complete: the sets with every required input answered, or undefined (Escape, an input with
// no choices, the server's refusal: the last two said as the server put them).
export async function complete(d: ChooseDeps, generator: string, sets: Sets): Promise<Sets | undefined> {
  let cur: Sets = { ...sets };
  for (;;) {
    let shown: ChoicesResult;
    try {
      shown = await d.choices(generator, cur);
    } catch (err) {
      d.ui.error(errorMessage(err));
      return undefined;
    }
    const input = nextInput(shown.inputs ?? [], cur);
    if (!input) return cur;
    const title = input.name + (input.prompt ? `: ${input.prompt}` : '');
    let v: string | undefined;
    if (kind(input) === 'menu') {
      const cs = input.choices ?? [];
      if (cs.length === 0) {
        const errs = input.errors ? (Array.isArray(input.errors) ? input.errors : Object.values(input.errors)) : [];
        d.ui.error([`no choices for ${input.name}`, ...errs].join('\n'));
        return undefined;
      }
      v = await d.ui.pick<string>({ title, items: cs.map(c => ({ label: c, value: c })) });
    } else {
      v = await d.ui.text({ title, value: '' }).result;
    }
    if (!v) return undefined;
    cur = { ...cur, [input.name]: v };
  }
}

// chooseGenerator: two conventions fit; which is it (nvim :428-429)
export function chooseGenerator(ui: Ui, generator: string, or: string): Promise<string | undefined> {
  return ui.pick<string>({ title: 'Which is it?', items: [{ label: short(generator), value: generator }, { label: short(or), value: or }] });
}
```

- [ ] **Step 4: Run to verify**

Run: `npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/suggest/choices.ts test/unit/choices.test.ts
git commit -m "suggest: the recognition choose loop over olifant/choices"
```

---

### Task 8: The controller's consideration — debounce, pushed → pulled → inline, stale drops (pure)

**Files:**
- Modify: `src/suggest/controller.ts`
- Test: `test/unit/controller.test.ts` (add cases)

**Interfaces:**
- Consumes: `Store`, `Pushed` (Task 6); `recognitionOf`, `followupOf`, `ghostOf` (Task 6); `keyOf`, `recognitionKey` (Task 1); `SuggestResult`, `PlanResult`, `Suggestion`; `CancellationTokenSource`/`CancellationToken` from `vscode-languageserver-protocol`; `errorMessage`.
- Produces, in `controller.ts`:
  - `interface Cursor { uri: string; version: number; line: number; lineText: string; inProject: boolean }`.
  - `interface Timer { set(f: () => void, ms: number): unknown; clear(h: unknown): void }`.
  - `interface ConsiderDeps { enabled(): boolean; running(): boolean; cursor(): Cursor | undefined; suggest(uri: string, line: number, token: CancellationToken): Promise<SuggestResult | null>; plan(planId: number, token: CancellationToken): Promise<PlanResult>; triggerInline(): void; feedback(uri: string, generator: string, outcome: 'accepted' | 'dismissed' | 'reset'): void; debounceMs(): number; timer: Timer }` (`suggest`'s line is 1-based).
  - `Controller` gains `readonly store: Store`, `attach(c: ConsiderDeps): void`, `schedule(): void`, `pushed(s: Suggestion): void`, `consider(): Promise<void>`, `feedback(st: Shown, outcome): void`. A recognition's dismissal sends `'dismissed'`.
  - `export const noSuchPlan = (err: unknown): boolean`.

- [ ] **Step 1: Write the failing tests** (append to `test/unit/controller.test.ts`; move the two new `import` lines to the top of the file)

```ts
import { ConsiderDeps, Cursor, noSuchPlan } from '../../src/suggest/controller';
import type { PlanResult, SuggestResult, Suggestion } from '../../src/protocol';

const PLAN = { files: [{ path: 'a.py', before: 'x', after: 'y' }], conflicts: [], warnings: [], holes: [], snippet: null };

class FakeTimer {
  fns = new Map<number, () => void>();
  n = 0;
  set = (f: () => void) => { this.fns.set(++this.n, f); return this.n; };
  clear = (h: unknown) => { this.fns.delete(h as number); };
  fire() { const fs = [...this.fns.values()]; this.fns.clear(); for (const f of fs) f(); }
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

function considering(o: { cursor?: Cursor } = {}) {
  const base = setup();
  const shown: Shown[] = [];
  const hidden: string[] = [];
  const c = new Controller({ view: { keys: () => undefined, show: st => shown.push(st), hide: uri => hidden.push(uri) }, log: e => base.logged.push(e) });
  const st = {
    enabled: true, running: true,
    cursor: o.cursor ?? { uri: 'file:///p/a.py', version: 4, line: 6, lineText: 'class Cancelled:', inProject: true } as Cursor | undefined,
    suggests: [] as { uri: string; line: number; d: ReturnType<typeof deferred<SuggestResult | null>> }[],
    plans: [] as { planId: number; d: ReturnType<typeof deferred<PlanResult>> }[],
    triggered: 0,
    feedback: [] as string[],
  };
  const timer = new FakeTimer();
  const deps: ConsiderDeps = {
    enabled: () => st.enabled, running: () => st.running, cursor: () => st.cursor,
    suggest: (uri, line) => { const d = deferred<SuggestResult | null>(); st.suggests.push({ uri, line, d }); return d.promise; },
    plan: planId => { const d = deferred<PlanResult>(); st.plans.push({ planId, d }); return d.promise; },
    triggerInline: () => { st.triggered++; },
    feedback: (_uri, g, outcome) => { st.feedback.push(`${g} ${outcome}`); },
    debounceMs: () => 300, timer,
  };
  c.attach(deps);
  c.focus('file:///p/a.py');
  return { c, st, timer, shown, hidden, logged: base.logged };
}

const sug = (o: Partial<Suggestion> = {}): Suggestion => ({
  uri: 'file:///p/a.py', version: 4, kind: 'followup', label: 'Failure arms', summary: '2 files', line: 7, lines: null, at: 7, planId: 3,
  generator: null, sets: {}, ...o,
});

test('one request per burst: the cursor settles before anything is asked', async () => {
  const { c, st, timer } = considering();
  c.schedule(); c.schedule(); c.schedule();
  assert.equal(st.suggests.length, 0);
  timer.fire();
  await flush();
  assert.equal(st.suggests.length, 1);
  assert.equal(st.suggests[0].line, 7, 'olifant/suggest takes the 1-based line');
});

test('a pulled follow-up with its plan is shown and logged; nothing pulled triggers the inline ghost', async () => {
  const { c, st, shown, logged } = considering();
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  assert.equal(shown.at(-1)?.summary, '2 files');
  assert.deepEqual(logged.at(-1), { event: 'followup-shown', generator: 'Failure arms', band: undefined, score: undefined });
  c.clear('file:///p/a.py');
  const q = c.consider();
  await flush();
  st.suggests[1].d.resolve(null);
  await q;
  assert.equal(st.triggered, 1);
});

test('a stale answer is dropped: the cursor moved, the version changed, or a newer consideration began', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.cursor = { ...st.cursor!, line: 8 };
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined);
  assert.equal(st.triggered, 0);
  st.cursor = { ...st.cursor!, line: 6 };
  const first = c.consider();
  await flush();
  const second = c.consider();
  await flush();
  st.suggests[1].d.resolve({ ...sug(), plan: PLAN });
  await first;
  assert.equal(c.state('file:///p/a.py'), undefined, 'the older answer counts for nothing');
  st.suggests[2].d.resolve(null);
  await second;
});

test('ghosts off drops an in-flight answer', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.enabled = false;
  st.suggests[0].d.resolve({ ...sug(), plan: PLAN });
  await p;
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('not running: nothing asked, the suggestion cleared', async () => {
  const { c, st } = considering();
  c.inline({ ...snippet(), uri: 'file:///p/a.py' });
  st.running = false;
  await c.consider();
  assert.equal(st.suggests.length, 0);
  assert.equal(c.state('file:///p/a.py'), undefined);
});

test('order: a push for this version and line comes first; its plan is asked once', async () => {
  const { c, st } = considering();
  c.pushed(sug());
  await flush();
  assert.equal(st.plans.length, 1);
  assert.equal(st.plans[0].planId, 3);
  assert.equal(st.suggests.length, 0, 'no pull while the push is being planned');
  st.plans[0].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup');
  c.clear('file:///p/a.py');
  const p = c.consider();
  await flush();
  assert.equal(st.plans.length, 1, 'asked once per push');
  assert.equal(c.state('file:///p/a.py')?.kind, 'followup', 'shown again from the plan in hand');
  await p;
});

test('a push for another version or line is not used: the pull is asked', async () => {
  const { c, st } = considering();
  c.pushed(sug({ version: 3 }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.equal(st.suggests.length, 1);
  st.suggests[0].d.resolve(null);
  await flush();
});

test('a pushed snippet logs snippet-anticipated and triggers the inline ghost, without a pull', async () => {
  const { c, st, logged } = considering();
  c.pushed(sug({ kind: 'snippet', label: 'p/failure' }));
  await flush();
  assert.equal(st.triggered, 1);
  assert.equal(st.suggests.length, 0);
  assert.deepEqual(logged.at(-1), { event: 'snippet-anticipated', generator: 'p/failure', line: 7 });
});

test('a pushed ghost is shown with its lines, no plan asked', async () => {
  const { c, st } = considering();
  c.pushed(sug({ kind: 'ghost', label: 'Arms', lines: ['a', 'b'] }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.deepEqual(c.state('file:///p/a.py')?.lines, ['a', 'b']);
});

test('no such plan falls through to the pull, and the push is forgotten', async () => {
  const { c, st } = considering();
  c.pushed(sug());
  await flush();
  st.plans[0].d.reject(new Error('no such plan (offered plans last until their document changes)'));
  await flush();
  assert.equal(st.suggests.length, 1);
  assert.equal(c.store.current('file:///p/a.py', 4, 6), undefined);
  st.suggests[0].d.resolve(null);
  await flush();
  assert.ok(noSuchPlan(new Error('no such plan (x)')));
  assert.ok(!noSuchPlan(new Error('boom')));
});

test('recognitions: a hint needs no plan and logs model; the model\'s upgrade to an offer replaces it; a dismissed offer stays away and says so', async () => {
  const { c, st, logged } = considering();
  const rec = (o: Partial<Suggestion>) => sug({ kind: 'recognition', label: 'Command', generator: 'p/command', sets: { command: 'x' }, ...o });
  c.pushed(rec({ band: 'hint', reasons: ['the model agrees'], score: 0.5 }));
  await flush();
  assert.equal(st.plans.length, 0);
  assert.equal(c.state('file:///p/a.py')?.band, 'hint');
  assert.deepEqual(logged.at(-1), { event: 'recognition-shown', generator: 'p/command', band: 'hint', score: 0.5, model: true });
  c.pushed(rec({ band: 'offer', planId: 4 }));
  await flush();
  st.plans[0].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py')?.band, 'offer');
  c.dismiss('file:///p/a.py');
  assert.deepEqual(st.feedback, ['p/command dismissed']);
  c.pushed(rec({ band: 'offer', planId: 5 }));
  await flush();
  st.plans[1].d.resolve({ plan: PLAN });
  await flush();
  assert.equal(c.state('file:///p/a.py'), undefined, 'the dismissed offer is not shown again here');
});

test('a pulled recognition is offered with the plan the pull carries', async () => {
  const { c, st } = considering();
  const p = c.consider();
  await flush();
  st.suggests[0].d.resolve({ ...sug({ kind: 'recognition', label: 'Command', generator: 'p/command', band: 'offer' }), plan: PLAN });
  await p;
  assert.deepEqual(c.state('file:///p/a.py')?.plan, PLAN);
  assert.equal(st.plans.length, 0);
});

test('schedule clears at once when the line changed, before the pause', () => {
  const { c, st } = considering();
  c.inline({ ...snippet(), uri: 'file:///p/a.py', line: 6, lineText: 'class Cancelled:' });
  st.cursor = { ...st.cursor!, lineText: 'class Cancelled:x' };
  c.schedule();
  assert.equal(c.state('file:///p/a.py'), undefined);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL. `ConsiderDeps`, `Cursor`, `noSuchPlan`, `attach`, `schedule`, `pushed`, `consider` and `store` are missing.

- [ ] **Step 3: Implement**

Extend `src/suggest/controller.ts`. Add imports:

```ts
import { CancellationToken, CancellationTokenSource } from 'vscode-languageserver-protocol';
import { errorMessage } from '../errors';
import type { Plan, PlanResult, SuggestResult, Suggestion } from '../protocol';
import { keyOf, recognitionKey } from './keys';
import { followupOf, ghostOf, recognitionOf } from './recognition';
import { Pushed, Store } from './store';
import type { Offer, Shown, SuggestKind } from './types';
```

Add the exported types and helper above the class:

```ts
// Cursor: the active editor's file, its version, the cursor's line (0-based) and its text.
export interface Cursor { uri: string; version: number; line: number; lineText: string; inProject: boolean }
export interface Timer { set(f: () => void, ms: number): unknown; clear(h: unknown): void }

// ConsiderDeps: what the consideration (milestone 3b) asks of VS Code and the server.
export interface ConsiderDeps {
  enabled(): boolean;
  running(): boolean;
  cursor(): Cursor | undefined;
  // olifant/suggest at a 1-based line
  suggest(uri: string, line: number, token: CancellationToken): Promise<SuggestResult | null>;
  plan(planId: number, token: CancellationToken): Promise<PlanResult>;
  // editor.action.inlineSuggest.trigger: the inline provider answers with the snippet here
  triggerInline(): void;
  feedback(uri: string, generator: string, outcome: 'accepted' | 'dismissed' | 'reset'): void;
  debounceMs(): number;
  timer: Timer;
}

// noSuchPlan: olifant's answer for a planId whose document has moved on (Lsp.hs :542)
export const noSuchPlan = (err: unknown): boolean => errorMessage(err).startsWith('no such plan');
```

Add to the class (fields, then methods). `dismissedHook` is overridden in place: replace its empty body with the feedback line shown.

```ts
  readonly store = new Store();
  private c: ConsiderDeps | undefined;
  private cts: CancellationTokenSource | undefined;
  private timerHandle: unknown;

  attach(c: ConsiderDeps): void { this.c = c; }

  // schedule: the cursor moved or the text changed (suggest.lua schedule, :449-461): the
  // suggestion goes at once if its line was left or edited; the rest waits for the pause.
  schedule(): void {
    const c = this.c;
    const at = c?.cursor();
    if (!c || !at) return;
    this.moved(at.uri, at.line, at.lineText);
    if (this.timerHandle !== undefined) c.timer.clear(this.timerHandle);
    this.timerHandle = c.timer.set(() => {
      this.timerHandle = undefined;
      void this.consider();
    }, c.debounceMs());
  }

  // pushed: olifant/suggestion (suggest.lua receive, :209-216)
  pushed(s: Suggestion): void {
    this.store.receive(s);
    if (this.c?.cursor()?.uri === s.uri) void this.consider();
  }

  // consider: the cursor line's suggestion (suggest.lua consider_server, :220-320): what the
  // server pushed for the document as it is, else what it answers for the line, else the
  // snippet anticipated here (the inline provider). An answer for a cursor, version or line
  // that has moved on, or after ghosts went off, draws nothing.
  async consider(): Promise<void> {
    const c = this.c;
    if (!c) return;
    const at = c.cursor();
    if (!at || !at.inProject) return;
    if (!c.enabled() || !c.running()) {
      this.clear(at.uri);
      return;
    }
    this.cts?.cancel();
    const cts = new CancellationTokenSource();
    this.cts = cts;
    const stale = (): boolean => {
      if (cts.token.isCancellationRequested || !c.enabled()) return true;
      const now = c.cursor();
      return !now || now.uri !== at.uri || now.version !== at.version || now.line !== at.line;
    };
    const p = this.store.current(at.uri, at.version, at.line);
    if (p && (await this.fromPush(c, p, at, stale, cts.token))) return;
    if (stale()) return;
    let sg: SuggestResult | null = null;
    try {
      sg = await c.suggest(at.uri, at.line + 1, cts.token);
    } catch {
      sg = null;
    }
    if (stale()) return;
    if (sg && this.fromAnswer(sg, at)) return;
    this.anticipated(at);
  }

  // fromPush: true when the push decided (shown, or its plan was asked for); false: pull.
  private async fromPush(c: ConsiderDeps, p: Pushed, at: Cursor, stale: () => boolean, token: CancellationToken): Promise<boolean> {
    const s = p.s;
    if (s.kind === 'snippet') {
      // the push has no body: the inline completion at this line has it (nvim :276-281)
      this.d.log({ event: 'snippet-anticipated', generator: s.label, line: at.line + 1 });
      this.anticipated(at);
      return true;
    }
    if (s.kind === 'ghost') return this.offer(at, ghostOf(s));
    const make = (plan?: Plan): Offer => (s.kind === 'recognition' ? recognitionOf(s, plan) : followupOf(s, plan));
    const first = make(p.plan);
    // a hint or a choice needs no plan; an offer and a follow-up are shown with theirs in hand
    if (first.kind === 'recognition' && (first.band !== 'offer' || first.choice)) return this.offer(at, first);
    if (p.plan) return this.offer(at, first);
    if (p.asked) return false;
    p.asked = true;
    try {
      p.plan = (await c.plan(s.planId, token)).plan;
    } catch (err) {
      if (!noSuchPlan(err)) return true;
      this.store.forget(at.uri);
      return false;
    }
    if (stale() || !p.plan) return true;
    this.offer(at, make(p.plan));
    return true;
  }

  // fromAnswer: olifant/suggest's answer (nvim :302-319): true when shown.
  private fromAnswer(sg: SuggestResult, at: Cursor): boolean {
    if (sg.kind === 'recognition') return this.offer(at, recognitionOf(sg, sg.plan));
    if (sg.kind === 'snippet') {
      this.d.log({ event: 'snippet-anticipated', generator: sg.label, line: at.line + 1 });
      return false;
    }
    if (!sg.plan || typeof sg.plan !== 'object') return false;
    return this.offer(at, sg.kind === 'ghost' ? ghostOf(sg) : followupOf(sg, sg.plan));
  }

  // anticipated: nothing else here; VS Code asks the inline provider (a decoration yields)
  private anticipated(at: Cursor): void {
    const s = this.states.get(at.uri);
    if (s && s.kind !== 'snippet') this.clear(at.uri);
    this.c?.triggerInline();
  }

  // offer: shown unless dismissed on this line (nvim offer, :229-239); true when it is shown
  private offer(at: Cursor, o: Offer): boolean {
    let key = keyOf(o, at.lineText, at.line + 1);
    if (o.kind === 'recognition') key = recognitionKey(key, o.band, o.choice);
    if (this.isDismissed(at.uri, key)) return false;
    if (this.states.get(at.uri)?.key === key) return true;
    this.set({ ...o, key, uri: at.uri, line: at.line, lineText: at.lineText, version: at.version });
    return true;
  }

  // feedback: what happened to a recognition (its earned quietness, nvim :95-100)
  feedback(st: Shown, outcome: 'accepted' | 'dismissed' | 'reset'): void {
    if (st.kind === 'recognition') this.c?.feedback(st.uri, st.generator, outcome);
  }

  protected dismissedHook(s: Shown): void { this.feedback(s, 'dismissed'); }
```

If `tsc` rejects `import { CancellationToken, … }` because `CancellationToken` is only a type, use `import { CancellationTokenSource } from 'vscode-languageserver-protocol'; import type { CancellationToken } from 'vscode-languageserver-protocol';`.

- [ ] **Step 4: Run to verify**

Run: `npm run lint && npm run test:unit`
Expected: PASS. Every controller test passes, Task 2's included.

- [ ] **Step 5: Commit**

```bash
git add src/suggest/controller.ts test/unit/controller.test.ts
git commit -m "suggest: the controller's consideration (debounce, pushed then pulled then inline, stale drops, plans asked once)"
```

---

### Task 9: Pushes, decorations, the hidden ⚡ hint, Esc for decorations, and fake.10 (shown/dismissed)

**Files:**
- Create: `src/suggest/decorate.ts`, `test/e2e/fake.10-suggestions.e2e.ts`
- Modify: `src/server.ts` (`ClientHooks.suggestion`, `ClientHooks.hints.hiddenLine`, the notification and hints middleware), `src/hints.ts`, `src/suggest/editor.ts`, `src/extension.ts`, `src/commandTable.ts`, `package.json`, `test/e2e/index.ts`, `test/unit/manifest.test.ts`

**Interfaces:**
- Consumes:
  - Task 8: `Controller.attach`, `schedule`, `pushed`, `ConsiderDeps`.
  - Task 6: `decorationText`.
  - M1/M2: `Server.request`, `Server.notify`, `Server.state`, `settingsFrom`, `Olifant`.
- Produces:
  - `server.ts`: `ClientHooks.suggestion?(s: Suggestion): void`; `ClientHooks.hints` gains `hiddenLine(uri: string): number | undefined`.
  - `hints.ts`: `Hints.hide(uri: string, line: number | undefined): void`, `Hints.hiddenLine(uri: string): number | undefined`.
  - `decorate.ts`: `class Decorations { show(st: Shown): void; hide(uri: string): void; dispose(): void }`.
  - `Suggest` constructor deps gain `hints: Hints` and `inProject(): boolean`; `Suggest.pushed(s: Suggestion): void`.
  - `SUGGEST_KEYS` gains the decoration Esc entry.

- [ ] **Step 1: Suite order (decision 9)**

In `test/e2e/index.ts`, replace `.sort()` with a numeric-prefix sort:

```ts
  // by the number after the suite's name (fake.10 after fake.9), then by name
  const order = (f: string) => Number(/^[a-z]+\.(\d+)/.exec(f)?.[1] ?? 0);
  const files = readdirSync(__dirname)
    .filter(f => f.startsWith(`${suite}.`) && f.endsWith('.e2e.js') && (!only || f.startsWith(only)))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  for (const f of files) mocha.addFile(join(__dirname, f));
```

- [ ] **Step 2: The manifest test for the decoration Esc**

Append to `test/unit/manifest.test.ts`:

```ts
test('Esc dismisses a decoration suggestion only where Esc means nothing else (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.dismiss' && k.when.startsWith('durandal.ghostVisible')), {
    command: 'durandal.suggest.dismiss', key: 'escape',
    when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible",
  });
});
```

Run: `npm run test:unit`. Expected: FAIL (the entry does not exist yet).

Add the entry to `SUGGEST_KEYS` in `src/commandTable.ts` after the snippet Esc:

```ts
  { command: 'durandal.suggest.dismiss', key: 'escape', when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible" },
```

Add the same object as the last entry of `contributes.keybindings` in `package.json`. Run `npm run test:unit`. Expected: PASS.

- [ ] **Step 3: Write the failing e2e `test/e2e/fake.10-suggestions.e2e.ts` (the shown/dismissed half)**

```ts
import * as assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { actionLog, api, file, log, open, reply, restart, revert, settle, sleep, until } from './helpers';

const MAIN = 'one/main.py';
const uri = () => file(MAIN).toString();
const pushFile = join(mkdtempSync(join(tmpdir(), 'durandal-push-')), 'suggestion.json');
// push sets what the fake pushes after every edit (FAKE_LSP_SUGGEST: its uri and version filled)
const push = (s: Record<string, unknown>) => writeFileSync(pushFile, JSON.stringify(s));
const FOLLOWUP = { kind: 'followup', label: 'Failure arms', summary: '1 file', line: 1, lines: null, at: 1, planId: 7, generator: null, sets: {} };
const plans = () => log().filter(m => m.method === 'olifant/plan');
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);

// edited opens main.py as "x = 1\n", types on line 0 (the fake pushes for that version) and
// leaves the cursor at its end.
async function edited(): Promise<vscode.TextEditor> {
  await settle(MAIN, 'x = 1\n');
  const ed = await open(file(MAIN));
  await ed.edit(b => b.insert(new vscode.Position(0, 5), '0'));
  const at = new vscode.Position(0, 6);
  ed.selection = new vscode.Selection(at, at);
  return ed;
}

const shownKind = async () => (await api()).suggest.state(uri())?.kind;

describe('pushed and pulled suggestions (fake server)', () => {
  before(async () => {
    push(FOLLOWUP);
    process.env.FAKE_LSP_SUGGEST = pushFile;
    await restart();
  });
  after(async () => {
    delete process.env.FAKE_LSP_SUGGEST;
    await restart();
  });
  afterEach(async () => {
    for (const m of ['olifant/plan', 'olifant/suggest', 'textDocument/inlayHint', 'olifant/choices', 'textDocument/codeAction']) reply(m, null);
    push(FOLLOWUP);
    (await api()).setUi(undefined);
    await vscode.workspace.getConfiguration('durandal').update('ghosts', undefined, vscode.ConfigurationTarget.Global);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uri());
    if (d?.isDirty) await revert(d);
  });

  it('a push shows for its version and line only; its plan is asked once', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const before = plans().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.deepEqual(plans().slice(before).map(m => m.params), [{ planId: 7 }]);
    assert.equal(events(from, 'followup-shown').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await until(async () => (await shownKind()) === undefined, 'cleared off its line');
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await until(async () => (await shownKind()) === 'followup', 'shown again on its line');
    assert.equal(plans().length - before, 1, 'the plan asked once per push');
  });

  it('the ⚡ hint is hidden on the suggestion\'s line and comes back', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    reply('textDocument/inlayHint', [{ position: { line: 0, character: 6 }, label: '⚡ Wire', paddingLeft: true }]);
    const hintsAt = () => vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', file(MAIN), new vscode.Range(0, 0, 1, 0));
    await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.equal((await hintsAt()).length, 0);
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal((await hintsAt()).length, 1);
  });

  it('Esc dismisses and remembers the line; the action log says so', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal(await shownKind(), undefined);
    assert.equal(events(from, 'followup-dismissed').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await sleep(500);
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await sleep(1000);
    assert.equal(await shownKind(), undefined, 'not offered again on this line\'s text');
  });

  it('ghosts off: nothing pulled, nothing shown', async () => {
    await vscode.workspace.getConfiguration('durandal').update('ghosts', false, vscode.ConfigurationTarget.Global);
    const n = log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length;
    await edited();
    await sleep(1000);
    assert.equal(log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length, n);
    assert.equal(await shownKind(), undefined);
  });
});
```

Run: `DURANDAL_E2E_ONLY=fake.10 npm run test:e2e`
Expected: FAIL (time-outs: nothing listens for pushes yet).

- [ ] **Step 4: `src/suggest/decorate.ts`**

```ts
import * as vscode from 'vscode';
import { decorationText } from './recognition';
import type { Shown } from './types';

// Decorations: the end-of-line ⚡ of a ghost block, a follow-up or a recognition (M3 spec
// §2), in VS Code's ghost-text colour; one per document.
export class Decorations {
  private readonly type = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), margin: '0 0 0 1.5em' },
  });

  show(st: Shown): void {
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() !== st.uri || st.line >= ed.document.lineCount) continue;
      const end = ed.document.lineAt(st.line).range.end;
      ed.setDecorations(this.type, [{ range: new vscode.Range(end, end), renderOptions: { after: { contentText: decorationText(st) } } }]);
    }
  }

  hide(uri: string): void {
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === uri) ed.setDecorations(this.type, []);
    }
  }

  dispose(): void { this.type.dispose(); }
}
```

- [ ] **Step 5: Hints hide the suggestion's line (`src/hints.ts`, `src/server.ts`)**

In `src/hints.ts`, add to `Hints`:

```ts
  private readonly hidden = new Map<string, number>();

  // hiddenLine: the line whose ⚡ a suggestion replaces (nvim suggest.lua :117-121)
  hiddenLine(uri: string): number | undefined { return this.hidden.get(uri); }

  // hide hides the ⚡ on line (undefined: puts it back) and has VS Code ask again
  hide(uri: string, line: number | undefined): void {
    if (line === undefined) this.hidden.delete(uri);
    else this.hidden.set(uri, line);
    this.refresh();
  }
```

In `src/server.ts`, change the `hints` hook type to `hints?: { enabled(): boolean; shown(uri: string, lines: number[]): void; hiddenLine(uri: string): number | undefined };`. Change `provideInlayHints` to:

```ts
        provideInlayHints: async (document, viewPort, token, next) => {
          const h = hooks.hints;
          if (h && !h.enabled()) return [];
          const uri = document.uri.toString();
          const hidden = h?.hiddenLine(uri);
          const hints = ((await next(document, viewPort, token)) ?? []).filter(x => x.position.line !== hidden);
          h?.shown(uri, hints.map(x => x.position.line));
          return hints;
        },
```

- [ ] **Step 6: The push hook (`src/server.ts`)**

Add `Suggestion` to the protocol import and `Olifant` to it as well. Add to `ClientHooks`:

```ts
  // olifant/suggestion: what follows the last edit, pushed (M3 spec §3.3)
  suggestion?(s: Suggestion): void;
```

Right after `made.lc = lc;` and before `this.lc = lc;`:

```ts
    lc.onNotification(Olifant.suggestion.method, (p: Suggestion) => hooks.suggestion?.(p));
```

- [ ] **Step 7: `Suggest` attaches the consideration (`src/suggest/editor.ts`)**

Add the imports: `Olifant`, `Suggestion` from `../protocol`; `settingsFrom` from `../settings`; `Hints` (type) from `../hints`; `Decorations` from `./decorate`.

Change the constructor's deps to `{ server: Server; log: ActionLog; say: Say; hints: Hints; inProject(): boolean }`. Add a field `private readonly decorations = new Decorations();`. Replace the controller construction with:

```ts
    this.controller = new Controller({
      view: {
        keys: k => this.keys(k),
        show: st => { this.decorations.show(st); d.hints.hide(st.uri, st.line); },
        hide: uri => { this.decorations.hide(uri); d.hints.hide(uri, undefined); },
      },
      log: e => d.log.write(e),
    });
```

At the end of the constructor:

```ts
    this.controller.attach({
      enabled: () => this.enabled(),
      running: () => d.server.state() === 'running',
      cursor: () => {
        const ed = vscode.window.activeTextEditor;
        if (!ed || ed.document.uri.scheme !== 'file') return undefined;
        const line = ed.selection.active.line;
        return { uri: ed.document.uri.toString(), version: ed.document.version, line, lineText: ed.document.lineAt(line).text, inProject: d.inProject() };
      },
      suggest: (uri, line, token) => d.server.request(Olifant.suggest, { textDocument: { uri }, line }, token as unknown as vscode.CancellationToken),
      plan: (planId, token) => d.server.request(Olifant.plan, { planId }, token as unknown as vscode.CancellationToken),
      triggerInline: () => void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger'),
      feedback: (uri, generator, outcome) => {
        d.server.notify(Olifant.recognitionFeedback, { textDocument: { uri }, generator, outcome }).catch(() => undefined);
      },
      debounceMs: () => {
        const c = vscode.workspace.getConfiguration('durandal');
        return settingsFrom((k, fallback) => c.get(k, fallback)).debounceMs;
      },
      timer: { set: (f, ms) => setTimeout(f, ms), clear: h => clearTimeout(h as NodeJS.Timeout) },
    });
```

Add the push entry (decision 5):

```ts
  // pushed: olifant/suggestion, its uri read as VS Code spells it
  pushed(s: Suggestion): void {
    this.controller.pushed({ ...s, uri: vscode.Uri.parse(s.uri).toString() });
  }
```

In `register`:
- `moved(ed)` also calls `this.controller.schedule()` after `this.controller.moved(...)`.
- The active-editor listener clears the editor left (decision 7):

```ts
      vscode.window.onDidChangeActiveTextEditor(ed => {
        if (this.focused && this.focused !== ed?.document.uri.toString()) this.controller.clear(this.focused);
        this.focused = ed?.document.uri.toString();
        this.controller.focus(this.focused);
      }),
```

- Add a field `private focused: string | undefined;` and set it with the initial `focus(...)` call at the end of `register`.
- Push `{ dispose: () => this.decorations.dispose() }` onto `context.subscriptions`.

- [ ] **Step 8: Wire into `src/extension.ts`**

Construct `Suggest` with `{ server: s, log, say, hints, inProject: () => projects.inProject() }`. `projects` is created later (`trackProjects`), so either move `const projects = trackProjects(context, s);` above the `Suggest` construction, or pass `inProject: () => projectsRef?.inProject() ?? false` with a `let projectsRef` assigned after `trackProjects`. Prefer moving the call up, if nothing between depends on its position. After `hooks.suggest = suggest.inline;` add `hooks.suggestion = s2 => suggest.pushed(s2);`.

- [ ] **Step 9: Run fake.10, then everything**

Run: `DURANDAL_E2E_ONLY=fake.10 npm run test:e2e`
Expected: 4 passing.

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS. The fake suites now run in numeric order, fake.9 and fake.10 last.

- [ ] **Step 10: Commit**

```bash
git add src/suggest/decorate.ts src/suggest/editor.ts src/hints.ts src/server.ts src/extension.ts src/commandTable.ts package.json test/e2e/index.ts test/e2e/fake.10-suggestions.e2e.ts test/unit/manifest.test.ts
git commit -m "suggest: pushed and pulled suggestions as an end-of-line ⚡, the hint hidden beneath, Esc to dismiss"
```

---

### Task 10: Accept — review then Apply with the model, choose, feedback, the ⚡ menu, Tab

**Files:**
- Create: `src/suggest/accept.ts`
- Modify: `src/land.ts` (`Plans.review`), `src/suggest/editor.ts`, `src/actions/menu.ts`, `src/actions/command.ts`, `src/extension.ts`, `src/commandTable.ts`, `package.json`, `test/unit/menu.test.ts`, `test/unit/manifest.test.ts`, `test/e2e/fake.10-suggestions.e2e.ts`

**Interfaces:**
- Consumes:
  - Task 6: `acceptWay`.
  - Task 7: `complete`, `chooseGenerator`.
  - Task 8: `noSuchPlan`, `Controller.feedback`, `Controller.schedule`, `Controller.clear`.
  - M2: `Plans.review`, `findRoot`/`realRoot`, `errorMessage`.
- Produces:
  - `land.ts`: `review(ui, root, plan, edit, o: { title: string; landed(): void; refill?(): Promise<{ plan: Plan; edit?: WorkspaceEdit }> })`.
  - `accept.ts`: `class Accept { constructor(d: { server: Server; plans: Plans; controller: Controller; log: ActionLog; ui(): Ui }); run(st: Shown): Promise<void>; choose(st: Shown): Promise<void> }`.
  - `menu.ts`: `type RecognitionPick = 'recognition' | 'reset'`; `recognitionItems(rec: Offer): { label: string; pick: RecognitionPick }[]`.
  - `ActionsDeps.recognition?: { at(uri: string, line: number): Shown | undefined; choose(st: Shown): Promise<void>; reset(st: Shown): void }`.
  - `BUILT['durandal.suggest.accept'] = { title: 'Accept Suggestion', enablement: 'durandal.ghostVisible' }`; `SUGGEST_KEYS` gains the Tab entry.

- [ ] **Step 1: Failing unit tests (menu items, Tab binding)**

Append to `test/unit/menu.test.ts` (import `recognitionItems`):

```ts
test('the line\'s recognition comes first in the ⚡ menu; a hint can be shown again', () => {
  const rec = { kind: 'recognition' as const, generator: 'p/add-query', name: 'Query', label: 'Query', sets: {}, band: 'offer' as const, reasons: ['the name fits', 'it reads a repo'] };
  assert.deepEqual(recognitionItems(rec), [{ label: '⚡ Query  (the name fits; it reads a repo)', pick: 'recognition' }]);
  assert.deepEqual(recognitionItems({ ...rec, band: 'hint', reasons: [] }), [
    { label: '⚡ Query', pick: 'recognition' },
    { label: 'Show recognitions for add query again', pick: 'reset' },
  ]);
});
```

Append to `test/unit/manifest.test.ts`:

```ts
test('Tab accepts a decoration suggestion only when nothing else has Tab (spec §4)', () => {
  assert.deepEqual(SUGGEST_KEYS.find(k => k.command === 'durandal.suggest.accept'), {
    command: 'durandal.suggest.accept', key: 'tab',
    when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !inSnippetMode && !editorReadonly",
  });
  assert.equal(BUILT['durandal.suggest.accept'].enablement, 'durandal.ghostVisible');
});
```

Run: `npm run test:unit`. Expected: FAIL.

- [ ] **Step 2: Menu items, table and manifest**

`src/actions/menu.ts`: add `import { short } from '../suggest/keys';` and `import type { Offer } from '../suggest/types';`, then:

```ts
export type RecognitionPick = 'recognition' | 'reset';

// recognitionItems: what the server recognised on this line, first in the menu (nvim
// actions.lua :104-112); a quiet hint can be asked for again.
export function recognitionItems(rec: Offer): { label: string; pick: RecognitionPick }[] {
  const reasons = rec.reasons ?? [];
  const why = reasons.length > 0 ? `  (${reasons.join('; ')})` : '';
  const items: { label: string; pick: RecognitionPick }[] = [{ label: `⚡ ${rec.label ?? rec.name}${why}`, pick: 'recognition' }];
  if (rec.band === 'hint') items.push({ label: `Show recognitions for ${short(rec.generator)} again`, pick: 'reset' });
  return items;
}
```

`src/commandTable.ts`: add `'durandal.suggest.accept': { title: 'Accept Suggestion', enablement: 'durandal.ghostVisible' },` to `BUILT`, and add first in `SUGGEST_KEYS`:

```ts
  { command: 'durandal.suggest.accept', key: 'tab', when: "durandal.ghostVisible && durandal.ghostKind != 'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible && !suggestWidgetVisible && !inSnippetMode && !editorReadonly" },
```

`package.json`: add the command after `durandal.suggest.dismiss`:

```json
      {
        "command": "durandal.suggest.accept",
        "title": "Accept Suggestion",
        "category": "Durandal",
        "enablement": "durandal.ghostVisible"
      },
```

Insert the Tab keybinding object in `contributes.keybindings` right after the `ctrl+o` form key, so the order matches `[...FORM_KEYS, ...SUGGEST_KEYS]`.

Run: `npm run test:unit`. Expected: PASS.

- [ ] **Step 3: `Plans.review` refill (decision 4)**

In `src/land.ts`, import `errorMessage` from `./errors`. Change `review`'s options type to `o: { title: string; landed(): void; refill?(): Promise<{ plan: Plan; edit?: WorkspaceEdit }> }` and its tail to:

```ts
    if (a.kind !== 'apply' || !m.canApply) return;
    // refill: what Apply lands, planned again (a suggestion's plan{planId, fill:true})
    let landing = { plan, edit };
    if (o.refill) {
      try {
        landing = await o.refill();
      } catch (err) {
        ui.error(errorMessage(err));
        return;
      }
    }
    const err = await this.land(root, landing.plan, landing.edit, o.title);
    if (err) ui.error(err);
    else o.landed();
```

Update the method comment: "…Apply lands the plan (refill, when given, plans it again first; landed runs when it landed)…".

- [ ] **Step 4: `src/suggest/accept.ts`**

```ts
import * as vscode from 'vscode';
import type { ActionLog } from '../actionLog';
import { errorMessage } from '../errors';
import type { Plans } from '../land';
import { Olifant, type Plan } from '../protocol';
import { findRoot, realRoot } from '../root';
import type { Server } from '../server';
import type { Ui } from '../uiTypes';
import { chooseGenerator, complete } from './choices';
import { Controller, noSuchPlan } from './controller';
import { short } from './keys';
import { acceptWay } from './recognition';
import type { Shown } from './types';

// Accept is Tab on a decoration suggestion (M3 spec §3.3-3.5, nvim accept_server :352-401,
// choose_recognition :406-433): the review window on its plan, Apply landing the plan asked for
// again with the model (nothing lands unseen); a choice or a hint chooses the convention and
// its inputs first. A recognition's outcome goes back to the server.
export class Accept {
  constructor(private readonly d: { server: Server; plans: Plans; controller: Controller; log: ActionLog; ui(): Ui }) {}

  async run(st: Shown): Promise<void> {
    const way = acceptWay(st);
    if (way === 'none') return;
    if (way === 'choose') return this.choose(st);
    const root = await this.root(st);
    if (!root || st.planId === undefined) return;
    const ui = this.d.ui();
    this.d.log.write({ event: `${st.kind}-reviewed`, generator: st.generator });
    let plan: Plan | undefined = st.plan;
    if (!plan) {
      try {
        plan = (await this.d.server.request(Olifant.plan, { planId: st.planId })).plan;
      } catch (err) {
        if (noSuchPlan(err)) {
          this.d.controller.clear(st.uri);
          this.d.controller.schedule();
          return;
        }
        ui.error(errorMessage(err));
        return;
      }
    }
    let landed = false;
    const planId = st.planId;
    await this.d.plans.review(ui, root, plan, undefined, {
      title: st.name,
      refill: () => {
        this.d.controller.clear(st.uri);
        return Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: st.name },
          () => this.d.server.request(Olifant.plan, { planId, fill: true })));
      },
      landed: () => {
        landed = true;
        this.d.log.write({ event: `${st.kind}-applied`, generator: st.generator });
        this.d.controller.feedback(st, 'accepted');
      },
    });
    // closed without applying: the suggestion is considered again (nvim on_cancel)
    if (!landed) this.d.controller.schedule();
  }

  // choose: which convention, then its inputs, then its plan as a recognition, reviewed
  async choose(st: Shown): Promise<void> {
    const root = await this.root(st);
    if (!root) return;
    const ui = this.d.ui();
    const gen = st.choice ? await chooseGenerator(ui, st.generator, st.choice) : st.generator;
    if (!gen) return;
    const sets = await complete({
      ui,
      choices: (generator, s) => this.d.server.request(Olifant.choices, { textDocument: { uri: st.uri }, generator, sets: s }),
    }, gen, gen === st.generator ? { ...st.sets } : {});
    if (!sets) return;
    let r;
    try {
      r = await this.d.server.request(Olifant.plan, { textDocument: { uri: st.uri }, generator: gen, sets, recognize: true });
    } catch (err) {
      ui.error(errorMessage(err));
      return;
    }
    await this.d.plans.review(ui, root, r.plan, r.edit, {
      title: short(gen),
      landed: () => {
        this.d.controller.clear(st.uri);
        this.d.log.write({ event: 'recognition-applied', generator: gen });
        this.d.controller.feedback({ ...st, generator: gen }, 'accepted');
      },
    });
  }

  private async root(st: Shown): Promise<string | undefined> {
    const u = vscode.Uri.parse(st.uri);
    const found = u.scheme === 'file' ? await findRoot(u.fsPath) : undefined;
    return found ? realRoot(found) : undefined;
  }
}
```

- [ ] **Step 5: The accept command, and the menu's recognition**

In `src/suggest/editor.ts`, import `Accept` and `type Plans` and `type Ui`. The deps gain `plans: Plans; ui(): Ui`. Add a field `readonly accept: Accept;`, constructed after the controller: `this.accept = new Accept({ server: d.server, plans: d.plans, controller: this.controller, log: d.log, ui: d.ui });`. Register the command:

```ts
      vscode.commands.registerCommand('durandal.suggest.accept', async () => {
        const ed = vscode.window.activeTextEditor;
        const st = ed && this.controller.state(ed.document.uri.toString());
        if (st) await this.accept.run(st);
      }),
```

Add the menu's hook object:

```ts
  // recognitions: the ⚡ menu's view of the line's recognition (actions/command.ts)
  readonly recognitions = {
    at: (uri: string, line: number): Shown | undefined => {
      const st = this.controller.state(uri);
      return st && st.kind === 'recognition' && st.line === line ? st : undefined;
    },
    choose: (st: Shown) => this.accept.choose(st),
    reset: (st: Shown) => this.controller.feedback(st, 'reset'),
  };
```

In `src/actions/command.ts`:
- Extend `ActionsDeps` with `recognition?: { at(uri: string, line: number): Shown | undefined; choose(st: Shown): Promise<void>; reset(st: Shown): void }`.
- Import `Item` from `../uiTypes`, `recognitionItems`/`RecognitionPick` from `./menu`, and `type Shown` from `../suggest/types`.
- In `at`, replace from `if (actions.length === 0) return this.miss(uri, rel, ui);` through `const a = picked.action;` with:

```ts
    // what the server recognised on this line comes first (an offer, a choice, a hint)
    const rec = this.d.recognition?.at(uri.toString(), pos.line);
    if (actions.length === 0 && !rec) return this.miss(uri, rel, ui);
    const items = menuItems(actions);
    this.d.log.write({ event: 'shown', file: rel, generators: items.map(i => generatorOf(i.action)) });
    type Pick = { kind: 'action'; item: MenuItem } | { kind: RecognitionPick };
    const picks: Item<Pick>[] = [
      ...(rec ? recognitionItems(rec).map(r => ({ label: r.label, value: { kind: r.pick } as Pick })) : []),
      ...items.map(i => ({ label: i.label, description: i.description, value: { kind: 'action', item: i } as Pick })),
    ];
    const picked = await ui.pick<Pick>({ title: 'Olifant', items: picks });
    if (!picked) return;
    if (picked.kind === 'recognition') return this.d.recognition!.choose(rec!);
    if (picked.kind === 'reset') return this.d.recognition!.reset(rec!);
    const a = picked.item.action;
```

In `src/extension.ts`, pass `plans` and `ui` to `Suggest`, and `recognition: suggest.recognitions` to `new Actions({...})`. `Suggest` must be constructed before `Actions`; move the lines if needed.

- [ ] **Step 6: The accept e2e cases (append inside the `describe` of `fake.10-suggestions.e2e.ts`)**

Add `import { FakeUi } from '../fakeUi';` at the top, then:

```ts
  // planned: main.py's plan as the fake answers it, against the text as it is now
  const planned = (before: string, after: string) => ({
    plan: { files: [{ path: 'main.py', before, after }], conflicts: [], warnings: [], holes: [], snippet: null },
    edit: { changes: { [uri()]: [{ range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } }, newText: after.split('\n')[0] + '\n' }] } },
  });

  it('Tab reviews the follow-up; Apply asks plan{planId, fill:true} and lands it', async () => {
    reply('olifant/plan', planned('x = 10\n', 'x = 11\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const from = actionLog().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    const before = plans().length;
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => plans().slice(before).some(m => m.params.fill === true), 'plan{fill:true} sent');
    assert.deepEqual(plans().slice(before).find(m => m.params.fill === true)!.params, { planId: 7, fill: true });
    await until(() => ed.document.getText() === 'x = 11\n', 'landed');
    assert.ok(ui.log.includes('review Failure arms'));
    assert.equal(events(from, 'followup-reviewed').length, 1);
    assert.equal(events(from, 'followup-applied').length, 1);
  });

  it('a ghost block likewise: reviewed first, Apply lands the filled plan', async () => {
    push({ ...FOLLOWUP, kind: 'ghost', label: 'Arms', lines: ['case A():', '    return x'] });
    reply('olifant/plan', planned('x = 10\n', 'x = 12\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const ed = await edited();
    await until(async () => (await shownKind()) === 'ghost', 'the ghost block shown');
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 12\n', 'landed');
    assert.ok(ui.log.includes('review Arms'));
  });

  const REC = { ...FOLLOWUP, kind: 'recognition', label: 'Command', generator: 'p/command', sets: { command: 'x' }, band: 'offer', or: null, reasons: ['the name fits'], score: 0.8, planId: 8 };
  const feedback = () => log().filter(m => m.method === 'olifant/recognitionFeedback').map(m => m.params.outcome as string);

  it('a recognition offer: Tab reviews, Apply lands and says accepted; Esc says dismissed', async () => {
    push(REC);
    reply('olifant/plan', planned('x = 10\n', 'x = 13\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    const n = feedback().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'recognition', 'the offer shown');
    await vscode.commands.executeCommand('durandal.suggest.accept');
    await until(() => ed.document.getText() === 'x = 13\n', 'landed');
    await until(() => feedback().length > n, 'feedback');
    assert.deepEqual(feedback().slice(n), ['accepted']);
    await revert(ed.document);
    await edited();
    await until(async () => (await shownKind()) === 'recognition', 'offered again after the revert');
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    await until(() => feedback().length > n + 1, 'dismissed said');
    assert.equal(feedback().at(-1), 'dismissed');
  });

  it('a recognition choice: Which is it?, the choices loop, then plan{recognize: true}', async () => {
    push({ ...REC, or: 'p/add-query' });
    reply('olifant/choices', { inputs: [{ name: 'query', optional: false, default: null, prompt: 'its name', choices: null }] });
    reply('olifant/plan', planned('x = 10\n', 'x = 14\n'));
    const a = await api();
    const ui = new FakeUi();
    ui.onPick = o => (o.title === 'Which is it?' ? o.items[1].value : undefined);
    a.setUi(ui);
    await edited();
    await until(async () => (await shownKind()) === 'recognition', 'the choice shown');
    const run = vscode.commands.executeCommand('durandal.suggest.accept');
    const t = await until(() => ui.texts.at(-1), 'the input asked');
    assert.equal(t.title, 'query: its name');
    t.finish('find_tables');
    await run;
    const choices = log().filter(m => m.method === 'olifant/choices').at(-1)!;
    assert.deepEqual(choices.params, { textDocument: { uri: uri() }, generator: 'p/add-query', sets: { query: 'find_tables' } });
    const p = plans().at(-1)!;
    assert.deepEqual(p.params, { textDocument: { uri: uri() }, generator: 'p/add-query', sets: { query: 'find_tables' }, recognize: true });
    assert.ok(ui.log.includes('review add query'));
  });

  it('a recognition hint: quiet (no plan asked), first in the ⚡ menu, and "show again" says reset', async () => {
    push({ ...REC, band: 'hint' });
    reply('textDocument/codeAction', []);
    const a = await api();
    const ui = new FakeUi();
    let menu: string[] = [];
    ui.onPick = o => {
      if (o.title !== 'Olifant') return undefined;
      menu = o.items.map(i => i.label);
      return o.items[1].value;
    };
    a.setUi(ui);
    const before = plans().length;
    const n = feedback().length;
    await edited();
    await until(async () => (await api()).suggest.state(uri())?.band === 'hint', 'the hint shown');
    assert.equal(plans().length, before, 'a hint asks no plan');
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(menu, ['⚡ Command  (the name fits)', 'Show recognitions for command again']);
    await until(() => feedback().length > n, 'reset said');
    assert.equal(feedback().at(-1), 'reset');
  });
```

Run: `DURANDAL_E2E_ONLY=fake.10 npm run test:e2e`
Expected: 9 passing.

If `applyServerEdit` refuses the unversioned `changes` edit, use the same edit shape as `test/e2e/fake.4-plans.e2e.ts` (`documentChanges` with the document's version) and say so in a comment.

- [ ] **Step 7: Everything**

Run: `npm run lint && npm run test:unit && npm run test:e2e`
Expected: PASS. fake.6 still passes: with no recognition, the menu is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/suggest/accept.ts src/suggest/editor.ts src/land.ts src/actions/menu.ts src/actions/command.ts src/extension.ts src/commandTable.ts package.json test/unit/menu.test.ts test/unit/manifest.test.ts test/e2e/fake.10-suggestions.e2e.ts
git commit -m "suggest: Tab reviews then applies with the model; recognitions choose, send feedback and lead the ⚡ menu"
```

---

### Task 11: The real-server follow-up e2e, README, CHANGELOG, PR 2

**Files:**
- Create: `test/e2e/real.7-suggestions.e2e.ts`
- Modify: `README.md`, `CHANGELOG.md`, `package.json` (the `durandal.ghosts` description)

**Interfaces:**
- Consumes: `Api.suggest`, `Api.setUi`, `FakeUi`; olifant at `.olifant-ref` (python-htmx sandbox `py`).

- [ ] **Step 1: Write `test/e2e/real.7-suggestions.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { file, open, revert, running, sleep, until, ws } from './helpers';

const BOOKING = 'py/src/bistro/booking/commands/create_booking.py';
const FAILURES = 'py/src/bistro/web/bookings/failures.py';

// durandal.nvim tests/e2e_python_spec.lua :167-222, the second half: a failure class named
// Cancelled → the failure-arms follow-up → review → Apply (plan{fill:true}) → the arm written.
// CI has no model: the arm's body may be a hole; the case and the union member are asserted.
describe('follow-ups against olifant lsp (python-htmx)', () => {
  afterEach(async () => {
    (await running()).setUi(undefined);
    for (const rel of [BOOKING, FAILURES]) {
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(rel).toString());
      if (d?.isDirty) await revert(d);
    }
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
  });

  it('class Cancelled → the failure-arms follow-up → review → apply', async () => {
    const ed = await open(file(BOOKING));
    const a = await running();
    const lines = ed.document.getText().split('\n');
    const cls = lines.findIndex(l => l.includes('class TableNotFound'));
    assert.ok(cls >= 0);
    // a new failure after the last one, as the ghost and its Name tab stop would leave it
    await ed.edit(b => b.insert(ed.document.lineAt(cls + 1).range.end, '\n\n\nclass Cancelled:\n    reason: str'));
    const row = cls + 4;
    assert.equal(ed.document.lineAt(row).text, 'class Cancelled:');
    const at = new vscode.Position(row, 8);
    ed.selection = new vscode.Selection(at, at);
    await until(async () => {
      // nudge the controller as nvim's settle() does: a cursor move on the line
      ed.selection = new vscode.Selection(at.translate(0, 1), at.translate(0, 1));
      ed.selection = new vscode.Selection(at, at);
      await sleep(1500);
      return a.suggest.state(ed.document.uri.toString())?.kind === 'followup';
    }, 'the failure-arms follow-up', 180_000);
    const st = a.suggest.state(ed.document.uri.toString())!;
    console.log(`py then: ⚡ Tab: review ${st.name} (${st.summary})`);
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    a.setUi(ui);
    await vscode.commands.executeCommand('durandal.suggest.accept');
    const failures = await until(() => {
      const t = readFileSync(join(ws(), FAILURES), 'utf8');
      return /case create_booking\.Cancelled\(\):/.test(t) ? t : undefined;
    }, 'the arm written', 240_000);
    console.log(`py arm: ${/case create_booking\.Cancelled\(\):\n\s+return ([^\n]+)/.exec(failures)?.[1]}`);
    assert.ok(readFileSync(join(ws(), BOOKING), 'utf8').includes('| Cancelled'));
  });
});
```

If the pinned olifant's failure class differs from this setup (the follow-up never comes), run nvim's spec setup by hand once with `olifant lsp` to see what the snippet inserts. Make the inserted lines match what the snippet produces, and keep the test's shape.

Then try the recognition case. Find the first caller of `recognised(` in `~/projects/durandal.nvim/tests/e2e_python_spec.lua`, port its setup as a second `it(...)` in this file, and run it.
- If it needs the model to show anything, keep it as `it.skip('…', …)` with the comment `// needs the local model (CI has none): nvim e2e_python_spec <line>`.
- Either way, say which in the PR.

- [ ] **Step 2: Run against the pinned olifant**

As in Task 5, Step 2, with `DURANDAL_E2E_ONLY=real.7`.
Expected: 1 passing (plus the recognition case, passing or skipped).

- [ ] **Step 3: README, CHANGELOG, setting text**

Add to `README.md`'s "Ghost text and snippets" section:

```markdown
- **Follow-ups**: after an edit settles, what follows from it (the match arms for a new failure,
  a test for a new command) shows at the end of the line as `⚡ Tab: review <name> (<summary>)`;
  a multi-line block as `⚡ Tab: <name> (+N lines)`. `Tab` opens the review window on the plan;
  Apply plans it again with the model and applies it. `Esc` dismisses it on that line.
- **Recognitions**: code written your own way that a convention covers shows as
  `⚡ <name> — Tab: review` (an offer), `⚡ <name> or a <other> — Tab: choose` (two fit: pick
  one, then answer its inputs) or a quiet `⚡ <name>` (no Tab; it leads the ⚡ menu, where
  "Show recognitions for … again" undoes the quiet). Accepting or dismissing tells Olifant, which
  goes quiet about conventions you keep dismissing.
- The ⚡ hint of a line steps aside while a suggestion is shown there.
```

In `package.json`, set the `durandal.ghosts` `markdownDescription` to: "Show what Olifant suggests at the cursor: the anticipated snippet as ghost text (Tab inserts it and the model fills its holes), follow-ups and recognitions as ⚡ at the end of the line (Tab reviews). Esc dismisses a suggestion on that line. `Durandal: Toggle Ghost Text` flips it. Snippets in the completion list are unaffected."

`CHANGELOG.md`, first line under `## Unreleased`:

```markdown
- Follow-ups, ghost blocks and recognitions pushed or answered by the server: an end-of-line ⚡,
  Tab to review and apply with the model, Esc to dismiss, recognitions' choose flow and feedback,
  and the ⚡ menu's recognition (milestone 3b).
```

- [ ] **Step 4: Full verification**

Run: `npm run lint && npm run test:unit && npm run test:e2e`, then the real suite.
Expected: all pass. Record the counts.

- [ ] **Step 5: Commit, push, PR 2**

```bash
git add test/e2e/real.7-suggestions.e2e.ts README.md CHANGELOG.md package.json
git commit -m "real-server follow-up e2e (Cancelled → failure arms → apply); README and CHANGELOG"
git push -u origin m3b-suggestions
```

Open the PR (`gh pr create --title "M3b: follow-ups and recognitions" --body-file <file>`). The body holds:
- the goal;
- decisions 4, 5, 6, 7, 9, 11 and 12;
- the verification counts;
- the recognition real-e2e outcome;
- the manual checklist below;
- the PR attribution footer.

Manual checklist:

```markdown
- [ ] A follow-up's ⚡ reads `⚡ Tab: review … (…)` in the ghost-text colour, and the line's ⚡ hint steps aside
- [ ] Tab opens the review; Escape there keeps the suggestion; Apply shows the suggestion's name in the status bar while it plans, then applies
- [ ] Esc dismisses it on that line only
- [ ] With the completion list open, or Copilot's ghost shown, or inside a snippet: Tab is theirs
- [ ] A recognition offer, a choice (Which is it?, then its inputs) and a quiet hint (no Tab; first in Ctrl+Alt+D A)
- [ ] Switching editors leaves no ⚡ behind; Durandal: Toggle Ghost Text clears it
```

Merging is the user's call.

---

## Self-review notes (for the plan's author; executors may skip)

- Spec coverage:
  - §3.1 → Tasks 2 and 4.
  - §3.2 → Task 4 (`completions`, `resolved`, the stash).
  - §3.3 and §3.4 → Tasks 8, 9 and 10.
  - §3.5 → Tasks 6, 7 and 10.
  - §4 keys → Tasks 3, 9 and 10.
  - §5 staleness and errors → Task 8 (stale, no such plan, not running), Task 4 (the fill guard, resolve error), Task 10 (plan errors, conflicts through `Plans.land`).
  - §5's interplay (hint suppression, the decoration vs inline) → Tasks 2 (`nonInline`), 4 (`early`) and 9.
  - §6 testing: unit → Tasks 1, 2 and 6–8; fake e2e → Tasks 4, 9 and 10; real → Tasks 5 and 11.
  - §7 split → the two halves.
  - Logging → Tasks 1, 2, 4, 8 and 10.
- The `withProgress` for the fill (Task 4) and `plan{fill}` (Task 10) cover §0's "Progress".
- `-32800` answers are ignored: the inline fetch catches them, `consider` catches and drops them, and `Server.request` callers with tokens see the cancel only when a newer consideration supersedes them.
