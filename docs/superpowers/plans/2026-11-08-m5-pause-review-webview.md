# durandal-vscode M5: the pause / review webview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** durandal.nvim's pause and review window in VS Code. A conjure that pauses opens one webview tab beside the file. It shows the situation, the offers as keyed rows and the diff the selected entry would land. One letter or click answers, the tab shows the run, then the next pause or the landing. The same tab reviews a plan's do, an errand and a reconcile's readings. `d` opens the details as a markdown document beside it.

**Architecture:** As in M2 to M4, the rules sit in pure modules with no `vscode` import, unit-tested with `node --test`:
- `pause/viewModel.ts`: the types the extension and the page share (`View`, `Line`, `Span`, `Row`, page messages).
- `pause/text.ts`: display-cell width, wrap, pad, cut, `given` (null and missing are the same).
- `pause/model.ts`: pause.lua's pure half. Entries, rows and keys, row columns, the situation, the diff pane, the legend, the help lines, the running view, and `conjureView` (paused payload → `View`).
- `pause/details.ts`: details.lua. Paused → markdown; a review's sections → markdown.
- `pause/resume.ts`: conjure.lua's resume builder, the answer classifier, the running round and the progress words.
- `pause/store.ts`: one pause per document and its drop rules.
- `pause/progress.ts`: the "conjuring" progress claim (title-matched, first come).
- `pause/reviewModel.ts`: review.lua. Do, errand and reconcile payloads → `View`; `pickAtCursor`.
- `plans/facts.ts`: a choose answer's `facts` → text edits on a plan. `plans/isPlan.ts`: the plan path rule.
- `webview/render.ts`: `View` → HTML string (no DOM), unit-tested.

The VS Code glue is thin and covered by the fake-lsp e2e (`fake.12-pause`, `fake.13-review`):
- `pause/panel.ts`: the singleton `WebviewPanel`, its HTML shell, CSP and nonce, messages in and out.
- `pause/controller.ts`: the source shown (conjure or review), the key tables, page events → actions, the running view, notices.
- `pause/reminder.ts`: the end-of-line decoration under a paused unit.
- `pause/review.ts`: open a review, the reviews pick, choose and its answer, reopen.
- `webview/main.ts` + `webview/pause.css`: the page script (second esbuild bundle) and its stylesheet.

`tdd/conjure.ts` loses M4's Continue / Stop warning and hands a pause to the controller; a resume goes back through `Conjure.ask` so a landing reuses `land()`. `server.ts` gains the `progress` and `reviewReady` hooks. `extension.ts` builds the pieces and exposes `Api.pause`.

**Tech Stack:** as M1 to M4: TypeScript 5.9 (`module: node16`), `vscode-languageclient` 11.0.0, `vscode-languageserver-protocol` 3.18.5, esbuild 0.28 (now two bundles), `node:test` (unit), `@vscode/test-electron` + mocha ^11 (e2e), the vendored Python fake-lsp.

**Spec:** `docs/superpowers/specs/2026-11-08-m5-pause-review-webview-design.md` (this repository, at `0323b7f`). Umbrella: `docs/superpowers/specs/2026-11-06-durandal-vscode-design.md` §4 and §6 row 5. Facts with pointers: `~/projects/notes/vscode-port/m5/nvim-pause-review-surface.md` and `protocol-and-port-state.md`. Read the spec before starting a task.

**Reference code (read, do not depend on):**
- durandal.nvim at `~/projects/durandal.nvim`:
  - `lua/durandal/pause.lua` (1598 lines): `given` :11, `wrap` :19-44, `round_diff` :67, `failure_of` :82, `test_lines` :251, `wire_places` :319, `wire_file_words` :335, `step_columns` :365, `entries` :386, `short_name` :437, `default_selected` :446, `rows` :455, `row_lines` :506, `situation` :590-789, diff pane :791-858, legend :966-995, `no_row` :1033, `M.keys` :1095-1126, `help_lines` :1142, running view :1462-1510.
  - `lua/durandal/review.lua` (533): `titles` :41, `one_command` :60, `situation` :70, keys :217-293, `readings_situation` :319, reading keys :383-430, `show` :433, `at_cursor` :481-500.
  - `lua/durandal/details.lua` (405): `build` :69, `build_sections` :325.
  - `lua/durandal/conjure.lua` (234): resume :28-70, `show_paused` :75-95, `answered` :159-207, `run` :212-232.
  - Specs: `tests/pause_spec.lua`, `review_spec.lua`, `details_spec.lua`, `conjure_spec.lua` (paused block :161-330).
  - Fixtures: `tests/fixtures/cancel_booking{,_wired,_steps,_check}_paused.json`.
- olifant at `~/projects/olifant`, read at the pin with `git show 1ae076fc:src/Olifant/<file>`: `ConjureNext.hs` :865-955 (`pausedJson`), `Review.hs` :565-619, `ReviewReadings.hs` :249-338, `Lsp.hs` :694-737 (reviews, review, choose), :1813-1816 (`review/ready`), :2040-2236 (choose answers).
- vscode-languageclient 11.0.0: `Middleware.handleWorkDoneProgress` (`lib/common/client.d.ts:223`, called in `client.js:778-783` for every token the library's progress part registered).

**Branches, PRs and models:** this plan is committed to `main` first ([[everything-on-main]]). Execution lands as two PRs, as M3 did:
- **M5a** (Tasks 1-6): branch `m5a-pause` from `main`. The shared types, the conjure source, the webview, the details document, the pause lifecycle and the running view.
- **M5b** (Tasks 7-8): branch `m5b-reviews` from `main` after M5a merges. The review sources and their entry points.
- Suggested implementer models (the user's policy):
  - Sonnet: Tasks 1, 3, 7.
  - Opus: Tasks 2, 4, 5, 6, 8 (the large port, the webview, the lifecycle, the running view, the review glue).
  - A final whole-branch review on Fable for each PR.

## Global Constraints

- One webview, `viewType` `durandal.pause`. No change to olifant. `.olifant-ref` stays `1ae076fc29455069fc32d2d7e48fa206cf033947`.
- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; no new runtime dependency. `@types/vscode-webview` is not added (the page declares `acquireVsCodeApi` itself).
- No file outside `src/protocol.ts` spells an `olifant/*` method string; messages that name a method use `Olifant.<x>.method`.
- The extension never rewords the server: refusals and errors are shown as the server sent them (`errorMessage(err)`).
- No new settings. No action-log events.
- `null` and missing are the same in every payload field (`given()` in `src/pause/text.ts`).
- Widths are display cells (`width()`), never UTF-16 length: CJK and emoji count 2.
- Lines: VS Code's are 0-based. `paused.lines.first/last` and `problems[].line` are 1-based. Review `row` fields, `facts` rows and `ReviewListItem.row` are 0-based (plan lines). Convert at the boundary only.
- Webview: `enableScripts: true`, `localResourceRoots: [<extension>/dist]`, `retainContextWhenHidden: false`. CSP exactly: `default-src 'none'; script-src 'nonce-<nonce>'; style-src <cspSource>; font-src <cspSource>`. No inline `style` attributes; colours only from `--vscode-*` variables.
- Bundles: `dist/extension.js` (unchanged call) and `dist/webview.js` (`esbuild webview/main.ts --bundle --outfile=dist/webview.js --format=iife --platform=browser --target=es2022`), plus `dist/pause.css` copied from `webview/pause.css`. `.vscodeignore` whitelists both.
- Context keys set by the extension: `durandal.pauseOpen` (the panel exists and is visible), `durandal.isPlan` (the active editor is a plan file).
- Commands: `durandal.plan.review` "Plan: Review" moves from `NOT_YET` to `BUILT` (chord `p r`, `when: durandal.isPlan`); `olifant.plans.review` (the lens command) gets its real handler. No other command or keybinding is added.
- Messages, verbatim (spec §3 to §6):
  - `conjure paused · <why>` (info, on every pause shown).
  - Reminder after the unit's last line: `conjure paused · <chord> C reopens` where chord is `Cmd+Alt+D` on macOS, `Ctrl+Alt+D` elsewhere (`chordLabel(platform, 'C')` reads `Cmd+Alt+D C`).
  - `conjure: the file changed, the pause is gone`; `the earlier pause is forgotten`.
  - `conjure cancelled · nothing landed`; `stopped · nothing landed`; landings as M4's `conjureNotice`.
  - Hint prompt: title `hint`, prompt `goes to the model with the next round`. Reopen prompt: title `more`, prompt `what the do should change`.
  - Footer notices `<key>: <why>` for 1.5 s; running legend `x cancel · q hide (it goes on) · ? help`; why-nots `a run is going on · x cancels it`, `the last answer is still on its way`.
  - Review: `do: <said>`, `reconcile: <said>`, `plans: nothing to review`; busy words `keeping…`, `reverting…`, `running the step's tests…`, `allowing…`, `…`.
- Details documents: `durandal-doc` path `details/<token or review id>.md`, language markdown.

## Review Focus

1. **The person types in the unit's file while the window is open.** Expected: the pause, its reminder and the panel go, with `conjure: the file changed, the pause is gone`, and no resume carries the dead token. Pinned by Task 5's store test "a change drops" and the `fake.12` e2e "an edit drops".
2. **A key pressed twice fast, or a click and a key together.** Expected: one resume goes out (the store drops the pause before the request), and the second press says `a run is going on · x cancels it`. Pinned by Task 5's e2e "a second press during the run".
3. **The tab closed during a run, then the run pauses or lands.** Expected: the run goes on; a pause reopens the panel beside the file; a landing lands with no panel. Pinned by Task 6's e2e "q during the run".
4. **A narrow panel and a resize.** Expected: below 110 cells the layout stacks, texts switch to their narrow forms, `Tab` moves between panes, and a resize re-lays out the model at the new width. Pinned by Task 2's narrow tests, Task 4's render test and Task 6's e2e "size".
5. **A review answered after the plan was edited** (the server's edit names an older version of the plan). Expected: the edit is refused whole with the version check's reason, the review stays open, and the footer says why. Pinned by Task 8's e2e "a stale plan". (Unsaved edits alone do not refuse it: the server has heard them through `didChange`, so its version matches; spec §5.3 says otherwise.)

## Plan decisions (flag in the PR)

1. **Progress hook = the library's `handleWorkDoneProgress` middleware** (spec §3.6 option a). It sees every begin, report and end for tokens the library registered from the server's `window/workDoneProgress/create`. olifant sends `create` (lsp-library `withIndefiniteProgress`); the fake did not, so a `hold` reply now sends `window/workDoneProgress/create` as a server request first. Options b and c of the spec are not viable: a second `onRequest` for `create` replaces the library's, and a `$/progress` notification handler replaces jsonrpc's dispatcher.
2. **`View` is laid-out text.** The model lays out every pane in display cells at the width the page reports, as nvim does, so the ported assertions stay exact. A row carries its rendered `lines` besides key, label and detail; the situation's entry rows are lines with `entryAt` naming their entry. The spec's `Entry` type is folded into this.
3. **Span kinds** add `paused`, `proposal`, `section` and `spinner` to the spec's closed list: nvim gives the badge, the proposal and the section words their own colours, and the spinner is the one animated glyph.
4. **The running view is part of `View`** (`status` line, `state: 'running'`), re-sent each second. The spec's separate `running` message is dropped; one message type keeps the page dumb.
5. **Cell width** is measured in the page with a hidden 100-character `<span>` in the editor font. `ch` units would miss the font's real advance.
6. **`plans/do` for reopen sends `line`** (the existing `ErrandParams` extends `Row { line }`), not `row` as spec §5.3 says; nvim sends `line` too. `ErrandParams.resume` becomes `string`.
7. **Store and claim are pure** (`store.ts`, `progress.ts`) with unit tests; the spec lists them as glue.
8. **`Api.pause.receive(message)`** joins the spec's `press`: it plays any page message (`select`, `press` a row, `size`), so clicks are tested the same way as keys.
9. **`View.tab`** names the panel's tab as spec §4.1 does (`conjure · <unit>`, `do · step N · <unit>`, `reconcile · N to review`, `do · past`); the page's own title line stays nvim's full title.
10. **The CSP shell is pure** (`src/pause/shell.ts`: `csp`, `nonce`, `shell`) and unit-tested; `panel.ts` only wires it.
11. **Panel focus:** `show()` reveals an existing tab only when asked to focus, so the running view re-sent each second never pulls a hidden tab forward. `close()` never calls `closed()`; `closed()` fires only when the person (or VS Code) closes the tab.
12. **Keys with Ctrl, Cmd or Alt pass through** to VS Code untouched, so the chords work while the tab has focus. `j` `k` `PageUp` `PageDown` scroll in the page and are reported too.
13. **Review why-nots are per source** (`NOT_OFFERED.do`, `NOT_OFFERED.reading`, `notOffered(review, key)`): `a` and `r` mean different things for a do and a reading.
14. **`denied` is a list** (`Review.hs:211`), not the string the fact sheet says; both are read. Facts come in three shapes, `{from, to, lines}` included (`to` inclusive); nvim ignores that one, the port applies it.
15. **The details' expiry** shows the server's `expires` as sent (no clock): the document is a snapshot when `d` is pressed.

## File structure

```
src/protocol.ts                 modify: Paused, resume, landed, review family types (Task 1)
src/pause/viewModel.ts          create (Task 1): shared types, page messages
src/pause/text.ts               create (Task 1): width, wrap, pad, cut, given, plain
src/pause/model.ts              create (Task 2): conjure view model
src/pause/details.ts            create (Task 3): details markdown
src/pause/resume.ts             create (Task 3): resume builder, classifier, running words
webview/tsconfig.json           create (Task 4)
webview/render.ts               create (Task 4): View → HTML
webview/main.ts                 create (Task 4): the page script
webview/pause.css               create (Task 4)
src/pause/panel.ts              create (Task 4)
src/pause/store.ts              create (Task 5)
src/pause/reminder.ts           create (Task 5)
src/pause/controller.ts         create (Task 5), modify (Tasks 6, 8)
src/pause/progress.ts           create (Task 6)
src/pause/reviewModel.ts        create (Task 7)
src/plans/facts.ts              create (Task 7)
src/plans/isPlan.ts             create (Task 7): the pure rule
src/pause/review.ts             create (Task 8)
src/tdd/conjure.ts              modify (Task 5): pause sink, resume hooks; paused() goes
src/tdd/landing.ts              modify (Task 5): pausedNotice, firstSentence go
src/server.ts                   modify (Task 6 progress hook, Task 8 reviewReady hook)
src/uiTypes.ts                  modify (Task 5): ask's comment (the paused use goes)
src/commandTable.ts             modify (Task 8)
src/commands.ts                 unchanged (SERVER_NAMED shrinks by itself)
src/extension.ts                modify (Tasks 5, 6, 8): Api.pause
package.json                    modify (Task 4 scripts; Task 8 nothing new but manifest check)
.vscodeignore, tsconfig.json   modify (Task 4); eslint.config.mjs unchanged (it lints webview/ already)
src/pause/shell.ts              create (Task 4): CSP, nonce, the HTML shell (pure)
test/unit/shell.test.ts         create (Task 4)
src/plans/trackIsPlan.ts        create (Task 8): durandal.isPlan
test/fake-lsp/fake-lsp          modify (Task 6): create before a hold's progress
test/fixtures/paused/*.json     create (Task 1): the four nvim fixtures
test/fixtures/review/*.json     create (Task 7): do, errand, reconcile
test/unit/text.test.ts          create (Task 1)
test/unit/protocol.test.ts      modify (Task 1)
test/unit/model.test.ts         create (Task 2)
test/unit/details.test.ts       create (Task 3)
test/unit/resume.test.ts        create (Task 3)
test/unit/render.test.ts        create (Task 4)
test/unit/manifest.test.ts      modify (Tasks 4, 8)
test/unit/store.test.ts         exists (suggest store) → name ours pauseStore.test.ts (Task 5)
test/unit/progress.test.ts      create (Task 6)
test/unit/reviewModel.test.ts   create (Task 7)
test/unit/facts.test.ts         create (Task 7)
test/unit/isPlan.test.ts        create (Task 7)
test/unit/landing.test.ts       modify (Task 5): pausedNotice tests go
test/e2e/fake.11-tdd.e2e.ts     modify (Task 5): the two paused tests go
test/e2e/fake.12-pause.e2e.ts   create (Tasks 5, 6)
test/e2e/fake.13-review.e2e.ts  create (Task 8)
README.md, CHANGELOG.md         modify (Tasks 6, 8)
```

How to run things (every task):
- Lint: `npm run lint` (now also type-checks `webview/` with its own tsconfig).
- Unit: `npm run test:unit`.
- One fake e2e file: `DURANDAL_E2E_ONLY=fake.12 npm run test:e2e`. It also runs `bare`, which is quick. On Linux wrap it in `xvfb-run -a`.
- No real-server e2e is added (spec §8): a pause needs a `[decide]` model and a review needs `claude -p`.

---

## M5a: the pause window (branch `m5a-pause`)

### Task 1: Shared types, text helpers, protocol and fixtures (pure)

**Files:**
- Create: `src/pause/viewModel.ts`
- Create: `src/pause/text.ts`
- Create: `test/unit/text.test.ts`
- Create: `test/pauseFixtures.ts`
- Create: `test/fixtures/paused/plain.json`, `wired.json`, `steps.json`, `check.json` (copied)
- Modify: `src/protocol.ts:126-135` (the conjure types) and `:137-150` (the plans block) and the request table
- Modify: `test/unit/protocol.test.ts:5`, `:114-147`

**Interfaces:**
- Consumes: nothing new.
- Produces (every later task imports these; names are fixed):
  - `src/pause/viewModel.ts` (`View` has `tab`, the panel tab's words): `SpanKind`, `Span`, `Line`, `ViewState`, `Row`, `View`, `ToPage`, `FromPage`, `PAGE_KEYS`, `plain(l: Line): string`. No imports: the webview bundle compiles it too.
  - `src/pause/text.ts`: `given<T>(v): v is T`, `width(s): number`, `cut(s, w): string`, `pad(s, w): string`, `wrap(text, w, cont?): string[]`, `shortTest(id): string`; re-exports `plain`.
  - `src/protocol.ts`: `ResumeChoice`, `ConjureResume`, `ConjureLanded` (`stopped` required), `Paused` and its parts (`PausedFile`, `PausedFailed`, `PausedDecide`, `PausedRound`, `PausedTest`, `PausedWired`, `PausedOffer`, `PausedStep`, `PausedProblem`, `PausedFailure`, `PausedProposal`, `PausedTitle`), `ConjurePaused { paused: Paused }`; the review family `ReviewEntryRef`, `ReviewListItem`, `ReviewsResult`, `ReviewOffer`, `DetailsSection`, `DoTitle`, `DoReview`, `ReadingEntry`, `ReconcileReview`, `Review`, `Fact`, `ChooseResult`, `ReviewChooseParams`, `ReviewReady`, `ErrandParams` (`resume?: string`). Request types: `plansReviews: req<Doc, ReviewsResult>`, `plansReview: req<ReviewParams, Review>`, `plansReviewChoose: req<ReviewChooseParams, ChooseResult>`.
  - `test/pauseFixtures.ts`: `fixture(name: 'plain' | 'wired' | 'steps' | 'check'): Paused` (a fresh copy each call), `wrapped(name): ConjurePaused` (the file as it is, for the e2e replies).

The four fixtures are durandal.nvim's, captured from a real run. Each file is `{ "paused": { … } }`, the conjure answer as it arrives (spec §8 says "bare paused objects"; they are not). `fixture()` unwraps them.

- [ ] **Step 1: Vendor the fixtures**

```bash
mkdir -p test/fixtures/paused
cp ~/projects/durandal.nvim/tests/fixtures/cancel_booking_paused.json test/fixtures/paused/plain.json
cp ~/projects/durandal.nvim/tests/fixtures/cancel_booking_wired_paused.json test/fixtures/paused/wired.json
cp ~/projects/durandal.nvim/tests/fixtures/cancel_booking_steps_paused.json test/fixtures/paused/steps.json
cp ~/projects/durandal.nvim/tests/fixtures/cancel_booking_check_paused.json test/fixtures/paused/check.json
git -C ~/projects/durandal.nvim log -1 --format=%h -- tests/fixtures
```

Write the printed commit into the README of the folder, `test/fixtures/paused/README.md`:

```markdown
The four `olifant/conjure` paused answers durandal.nvim's pause tests use
(`tests/fixtures/cancel_booking{,_wired,_steps,_check}_paused.json` at durandal.nvim <commit>),
captured from a real run. Each is `{ "paused": … }` as the server answers. Do not edit them: build
variants in code (`test/pauseFixtures.ts`, the model tests' `proposed()` / `refused()`).
```

- [ ] **Step 2: Write the shared types**

Create `src/pause/viewModel.ts`:

```ts
// viewModel: what the extension and the pause page share (spec §2, §4.2). No imports: the
// webview bundle (webview/tsconfig.json) compiles this file too. The extension lays out every
// pane in display cells at the width the page reports (plan decision 2); the page only paints.

// Span kinds are a closed list; the page maps kind k to class `k-<k>`. Words and glyphs carry the
// meaning, colour never does alone.
export type SpanKind =
  | 'strong' | 'dim' | 'red' | 'green' | 'check' | 'place' | 'key' | 'running' | 'title'
  | 'paused' | 'proposal' | 'section' | 'spinner';
export interface Span { text: string; kind?: SpanKind }
export type Line = Span[];

export type ViewState = 'paused' | 'proposal' | 'running' | 'review' | 'busy';

// Row: an offers row; lines are its rendered columns at the view's width (pause.lua row_lines)
export interface Row { key?: string; label: string; detail: string; pressable: boolean; lines: Line[] }

export interface View {
  state: ViewState;
  // the panel tab's words (spec §4.1: conjure · <unit>, do · step N · <unit>, reconcile · N to
  // review, do · past); the page shows title (narrow: short) as its first line
  tab: string;
  title: Line;
  short: Line;
  // the situation pane at `width` cells; entryAt[i] is the entry lines[i] shows, -1 for none
  lines: Line[];
  entryAt: number[];
  entries: number;
  selected: number;
  rows: Row[];
  // a proposal's one-line reason above the rows
  reason?: Line;
  // running: the one status line that stands instead of the rows
  status?: Line;
  diff: { title: Line; lines: Line[] };
  legend: string;
  // while ? is on: the key table, in the diff pane
  help?: Line[];
  narrow: boolean;
  // narrow only: the diff pane is the one in view
  flipped: boolean;
  width: number;
}

// extension → page
export type ToPage =
  | { type: 'view'; view: View; flash?: 'row' | 'entry' }
  | { type: 'notice'; text: string };

// page → extension
export type FromPage =
  | { type: 'ready' }
  | { type: 'size'; cols: number }
  | { type: 'key'; key: string }
  | { type: 'press'; row: number }
  | { type: 'select'; entry: number };

// PAGE_KEYS: the keys the page reports, by KeyboardEvent.key; the page lets every other key
// through (spec §4.2)
export const PAGE_KEYS: readonly string[] = [
  'a', 'b', 'c', 'd', 'h', 'i', 'j', 'k', 'n', 'o', 'p', 'q', 'r', 's', 't', 'w', 'x',
  'C', 'P', 'T', 'W', '[', ']', '?',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'Tab', 'Escape', 'PageUp', 'PageDown',
];

// plain: a line's text
export const plain = (l: Line): string => l.map(s => s.text).join('');
```

- [ ] **Step 3: Write the failing text tests**

Create `test/unit/text.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cut, given, pad, plain, shortTest, width, wrap } from '../../src/pause/text';

test('given: null and missing are the same', () => {
  assert.equal(given(null), false);
  assert.equal(given(undefined), false);
  assert.equal(given(0), true);
  assert.equal(given(''), true);
  assert.equal(given(false), true);
});

test('width: display cells, as nvim_strwidth', () => {
  assert.equal(width('abc'), 3);
  assert.equal(width(''), 0);
  assert.equal(width('日本'), 4);
  assert.equal(width('⚡x'), 3);
  assert.equal(width('é'), 1);
  // the window's own glyphs are one cell each
  assert.equal(width('●◆✓✗▶→…⠋·—'), 10);
});

test('cut: fits the cells, ending in … when cut', () => {
  assert.equal(cut('abcdef', 6), 'abcdef');
  assert.equal(cut('abcdef', 4), 'abc…');
  assert.equal(cut('日本語', 4), '日…');
  assert.equal(cut('abc', 1), '…');
});

test('pad: spaces to the cells, never a cut', () => {
  assert.equal(pad('ab', 4), 'ab  ');
  assert.equal(pad('日', 4), '日  ');
  assert.equal(pad('abcdef', 4), 'abcdef');
});

test('wrap: at spaces, long words broken, continuation prefix, leading spaces kept (pause.lua :19-44)', () => {
  assert.deepEqual(wrap('one two three four', 10), ['one two', 'three four']);
  assert.deepEqual(wrap('aaaaaaaaaaaaaaa', 10), ['aaaaaaaaaa', 'aaaaa']);
  assert.deepEqual(wrap('one two three four five six', 18, '    '), ['one two three four', '    five six']);
  assert.deepEqual(wrap('  indented words here', 12), ['  indented', 'words here']);
  assert.deepEqual(wrap('first\nsecond', 20), ['first', 'second']);
  assert.deepEqual(wrap('', 10), ['']);
  // the width never drops below the continuation plus ten cells
  assert.deepEqual(wrap('abcdefghijkl', 2), ['abcdefghij', 'kl']);
  assert.deepEqual(wrap('日本語日本語日本語', 10), ['日本語日本', '語日本語']);
});

test('shortTest: what follows the last ::', () => {
  assert.equal(shortTest('tests/a_test.py::test_x'), 'test_x');
  assert.equal(shortTest('plain'), 'plain');
});

test('plain: a line\'s text', () => {
  assert.equal(plain([{ text: 'a' }, { text: 'b', kind: 'dim' }]), 'ab');
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at compile, `Cannot find module '../../src/pause/text'`.

- [ ] **Step 5: Write the text helpers**

Create `src/pause/text.ts`:

```ts
// text: display-cell text for the pause window (durandal.nvim pause.lua :11-61). Every width is
// in cells (nvim_strwidth): East Asian wide and emoji-presentation characters take two, marks
// and joiners none. The models lay their panes out with these (plan decision 2).
export { plain } from './viewModel';

// given: the server's null is nothing (pause.lua given); null and missing are the same
export function given<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

const ZERO = /[\p{Mn}\p{Me}​-‏︀-️]/u;
const WIDE = /[\p{Emoji_Presentation}ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}]/u;

function cell(ch: string): number {
  if (ZERO.test(ch)) return 0;
  return WIDE.test(ch) ? 2 : 1;
}

export function width(s: string): number {
  let n = 0;
  for (const ch of s) n += cell(ch);
  return n;
}

// head: the longest start of s that fits w cells
function head(s: string, w: number): string {
  let out = '';
  let n = 0;
  for (const ch of s) {
    const c = cell(ch);
    if (n + c > w) break;
    out += ch;
    n += c;
  }
  return out;
}

// cut: s in w cells, ending in … when it was cut (pause.lua cut)
export function cut(s: string, w: number): string {
  if (width(s) <= w) return s;
  return head(s, Math.max(w - 1, 0)) + '…';
}

// pad: s with spaces to w cells; a longer s stays whole (pause.lua pad)
export function pad(s: string, w: number): string {
  return s + ' '.repeat(Math.max(w - width(s), 0));
}

// wrap: text in lines of at most w cells, broken at spaces and inside a word too long for a
// line; continued lines start with cont; each of text's own lines keeps its leading spaces
// (pause.lua M.wrap :19-44)
export function wrap(text: string, w: number, cont = ''): string[] {
  const limit = Math.max(w, width(cont) + 10);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = /^\s*/.exec(para)![0];
    let fresh = true;
    for (const word of para.split(/\s+/).filter(x => x !== '')) {
      const joined = fresh ? line + word : `${line} ${word}`;
      if (!fresh && width(joined) > limit) {
        out.push(line);
        line = cont + word;
      } else {
        line = joined;
      }
      fresh = false;
      while (width(line) > limit) {
        const h = head(line, limit);
        out.push(h);
        line = cont + line.slice(h.length);
      }
    }
    out.push(line);
  }
  return out;
}

// shortTest: a test id's short name, what follows the last `::` (pause.lua short)
export function shortTest(id: string): string {
  const m = /([^:]+)$/.exec(String(id));
  return m ? m[1] : String(id);
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: the seven `text.test` tests PASS; the rest of the suite stays green.

- [ ] **Step 7: Write the failing protocol checks**

In `test/unit/protocol.test.ts`, replace the import on line 5 with:

```ts
import type {
  Field, PreviewResult, Plan, FileActionsResult, ModelResult, GeneratorItem, InlineItem, SnippetData, Suggestion, SuggestResult,
  ChoicesResult, ConjureLanded, ConjurePaused, ConjureResume, MutateResult, StubResult, TestsRunResult, TestsRunParams, WaiveResult,
  ChooseResult, DoReview, ReconcileReview, ReviewsResult, ErrandParams, ReviewChooseParams,
} from '../../src/protocol';
import { fixture, wrapped } from '../pauseFixtures';
```

Replace the line `const paused: ConjurePaused = { paused: { token: 't', diagnosis: 'd', offers: [] } };` with:

```ts
  const paused: ConjurePaused = { paused: { token: 't', lines: { first: 3, last: 9 }, offers: [], diagnosis: ['d'] } };
```

Then add after that test:

```ts
test('compile check: a resume, the reviews and a choose read as the server sends them (Lsp.hs :694-737, :1066-1090)', () => {
  const resume: ConjureResume = { token: 'conjure-1', choice: 'stop', land: true, arg: '2' };
  const list: ReviewsResult = { reviews: [
    { id: 'R1', kind: 'do', row: 2, step: '- [ ] a step', status: 'answered' },
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: 'done|a.py|f|abc', kind: 'done', row: 4 }] },
  ] };
  const done: DoReview = {
    id: 'R1', kind: 'do', plan: 'plans/t.md', row: 2, title: { verb: 'do', step: 1, unit: 'T.label', badge: '◆ answered', model: 'sonnet', seconds: 42, cost: 0.06 },
    summary: 's', step: '- [ ] a step', said: [], tests: { ran: false, passed: 0, failed: 0, list: [] }, denials: [], denied: '',
    landing: { diff: '', files: [], edit: null }, offers: [{ choice: 'keep', key: 'a', label: 'keep', detail: 'd' }], details: [{ title: 'the step', text: 't' }],
  };
  const readings: ReconcileReview = {
    id: 'reconcile', kind: 'reconcile', title: { verb: 'reconcile', count: 1 }, summary: '1 reading to review', details: [],
    entries: [{ id: 'k', kind: 'unplaced', row: null, step: null, summary: 'Not in any step', offers: [{ choice: 'place', key: '2', label: 'under Step 3', detail: '', step: 3 }], landing: { edit: null, diff: '' } }],
  };
  const chosen: ChooseResult = { done: false, said: '1 passed · 0 failed', facts: [{ row: 2, text: '- [x] a step' }, { after: 2, lines: ['  ✓ t'] }], review: done };
  const choose: ReviewChooseParams = { textDocument: { uri: 'file:///p/plans/t.md' }, id: 'reconcile', choice: 'place', entry: 'k', step: 3 };
  const reopen: ErrandParams = { textDocument: { uri: 'file:///p/plans/t.md' }, line: 2, resume: 'R1', text: 'more' };
  assert.ok(resume.land && list.reviews.length === 2 && readings.entries[0].offers[0].step === 3 && chosen.review === done);
  assert.ok(choose.step === 3 && reopen.resume === 'R1');
});

// PAUSED_FIELDS: every field Paused names (protocol.ts); a fixture field outside it means the
// server sends something the models cannot read yet
const PAUSED_FIELDS = [
  'token', 'lines', 'offers', 'file', 'round', 'rung', 'summary', 'why', 'title', 'diagnosis', 'trigger', 'rounds', 'tests',
  'unit', 'landing', 'wired', 'expires', 'outcome', 'steps', 'failure', 'checker', 'snippet', 'proposal',
];

test('the four pause fixtures: paused answers whose fields Paused names', () => {
  for (const name of ['plain', 'wired', 'steps', 'check'] as const) {
    const p = fixture(name);
    assert.equal(typeof p.token, 'string', name);
    assert.ok(p.lines.first >= 1 && p.lines.last >= p.lines.first, name);
    assert.ok(Array.isArray(p.offers) && p.offers.length > 0, name);
    assert.ok(Array.isArray(p.diagnosis), `${name}: diagnosis is a list`);
    assert.deepEqual(Object.keys(p).filter(k => !PAUSED_FIELDS.includes(k)), [], name);
    assert.deepEqual(Object.keys(wrapped(name)), ['paused'], name);
  }
  // a copy each call: a test that edits one does not change the next
  const a = fixture('plain');
  a.token = 'changed';
  assert.notEqual(fixture('plain').token, 'changed');
});
```

Extend `TDD_KEYS` with the pause and review keys (the list's comment already says never to drop one to make it pass):

```ts
const TDD_KEYS = [
  'passed', 'scope', 'test', 'failed', 'broken', 'seconds', 'output', 'exists',
  'edits', 'green', 'tests', 'rounds', 'rungs', 'stopped', 'paused', 'token', 'diagnosis',
  'lines', 'first', 'last', 'killed', 'survived', 'waived', 'survivors', 'operator', 'from', 'to', 'mutated', 'dim',
  'unit', 'reason', 'selection', 'resume', 'choice', 'position', 'summary',
  // the pause (ConjureNext.hs pausedJson)
  'why', 'trigger', 'offers', 'expires', 'outcome', 'steps', 'failure', 'checker', 'wired', 'landing', 'verdict',
  'attempt', 'decide', 'probabilities', 'confidence', 'flipped', 'note', 'proposal', 'refused', 'arg', 'land', 'hint',
  'problems', 'tool', 'param', 'port', 'failing', 'got', 'expected', 'assertion',
  // the reviews (Review.hs, ReviewReadings.hs, Lsp.hs choose)
  'reviews', 'entries', 'key', 'label', 'detail', 'said', 'denied', 'files', 'status', 'facts', 'done', 'reopen',
  'review', 'details', 'badge', 'cost', 'after',
];
```

- [ ] **Step 8: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at compile: `Cannot find module '../pauseFixtures'`, and `Object literal may only specify known properties` / missing `lines` for the new `ConjurePaused`, and the review types are not exported.

- [ ] **Step 9: Write the fixture helper**

Create `test/pauseFixtures.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConjurePaused, Paused } from '../src/protocol';

// pauseFixtures: durandal.nvim's four paused answers (test/fixtures/paused). Compiled to
// out/test/, so the repository is two folders up.
export type PausedName = 'plain' | 'wired' | 'steps' | 'check';

const root = join(__dirname, '..', '..');

// wrapped: the file as the server answers it, { paused }
export function wrapped(name: PausedName): ConjurePaused {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'paused', `${name}.json`), 'utf8')) as ConjurePaused;
}

// fixture: the paused object, a fresh copy each call
export function fixture(name: PausedName): Paused {
  return wrapped(name).paused;
}
```

- [ ] **Step 10: Tighten the protocol types**

In `src/protocol.ts`, replace the four lines from `export interface ConjureResume` to `export type ConjureResult = ConjureLanded | ConjurePaused;` with:

```ts
// a resume's choice: exactly what resumeOf accepts (Lsp.hs :1077)
export type ResumeChoice = 'continue' | 'climb' | 'stop' | 'reconjure' | 'accept' | 'reject' | 'wire' | 'port';
export interface ConjureResume { token: string; choice: ResumeChoice; arg?: string; land?: boolean; hint?: string }
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
// landed: edits null when nothing changed; tests the after-run (scope "file"); stopped always sent
export interface ConjureLanded extends Open {
  file: string; unit: string; edits: WorkspaceEdit | null; summary: string; green: boolean;
  tests: TestsRunResult; rounds: number; rungs: string[]; stopped: boolean;
}
// The pause (ConjureNext.hs pausedJson :865-955). lines 1-based inclusive; file absolute; a
// round's, wire's or step's files root-relative. A thin answer may carry only token, lines and
// offers; nullable fields arrive as null. Read every field through given() (src/pause/text.ts).
export interface PausedFile { file: string; diff: string }
export interface PausedFailed {
  test: string; message: string; summary?: string | null; at?: number | string | null; assertion?: string | null;
  got?: string | null; expected?: string | null; output?: string | null;
}
export interface PausedDecide { choice: string; confidence: number; probabilities: Record<string, number> }
export interface PausedRound {
  round: number; rung: string; attempt?: string | null; line: string; verdict: 'green' | 'red';
  failing: string[]; failed: PausedFailed[]; passed: string[]; check?: string | null;
  decide?: PausedDecide | null; diff: string | null; files: PausedFile[];
}
// flipped: the round the test's status changed in (0 = before round 1)
export interface PausedTest {
  test: string; source?: string | null; status: 'failing' | 'passing'; flipped?: number | null; assertion?: string | null; note?: string | null;
}
export interface PausedWired { param: string; port: string; test?: string | null; files: PausedFile[] }
// an offer: choice `proposal` is an entry, not a resume verb; land and hint only on stop / continue
export interface PausedOffer { choice: string; arg?: string | null; label: string; detail: string; land?: boolean | null; hint?: boolean | null }
export interface PausedStep { after: number; kind?: 'wire' | 'test' | 'hint' | 'port' | null; text: string; files: PausedFile[]; test?: string | null }
export interface PausedProblem { file: string; line?: number | null; message: string }
export type PausedFailure =
  | { round: number; kind: 'check'; tool: string; problems: PausedProblem[] }
  | { round: number; kind: 'tests'; tests: string[] };
export interface PausedProposal {
  file: string; test: string; before?: string | null; after?: string | null; diff: string; refused?: string | null;
  step?: string | null; kind?: 'test' | 'port' | null; files?: string[] | null;
}
export interface PausedTitle { unit?: string | null; round?: number | null; of?: number | null; rung?: string | null; model?: string | null; seconds?: number | null }
export interface Paused {
  token: string; lines: { first: number; last: number }; offers: PausedOffer[];
  file?: string; round?: number; rung?: string; summary?: string; why?: string; title?: PausedTitle;
  diagnosis?: string[]; trigger?: string; rounds?: PausedRound[]; tests?: PausedTest[];
  unit?: { header: string; ports: string[] }; landing?: { diff: string }; wired?: PausedWired[];
  expires?: number; outcome?: string | null; steps?: PausedStep[]; failure?: PausedFailure | null;
  checker?: string | null; snippet?: { file: string; line: number; ghost: unknown; body: string } | null;
  proposal?: PausedProposal | null;
}
export interface ConjurePaused { paused: Paused }
export type ConjureResult = ConjureLanded | ConjurePaused;
```

In the `// --- plans (milestones 5 and 6)` block, replace the `ErrandParams`, `ReviewChooseParams` and `ReviewReady` lines with these, and add the review family after `ReviewParams`:

```ts
// plans/do: `resume` is a review id (reopen), text what the do should change
export interface ErrandParams extends Row { resume?: string; text?: string }
```

```ts
// --- reviews (milestone 5): Review.hs :565-619, ReviewReadings.hs :249-338, Lsp.hs :694-737, :2040-2236.
// row fields are 0-based plan lines.
export interface ReviewEntryRef { id: string; kind: string; row: number | null }
export interface ReviewListItem { id: string; kind: 'do' | 'reconcile'; row?: number | null; step?: string; status?: string; entries?: ReviewEntryRef[] }
export interface ReviewsResult { reviews: ReviewListItem[] }
// an offer: key is the letter (a reading's place offers carry digits and the open step's row)
export interface ReviewOffer { choice: string; key: string; label: string; detail: string; step?: number | null }
export interface DetailsSection { title: string; text: string; lang?: string | null }
export interface DoTitle { verb?: string; step?: number | null; unit?: string | null; badge?: string | null; model?: string | null; seconds?: number | null; cost?: number | null }
export interface DoReview {
  id: string; kind: 'do' | 'errand'; plan?: string; row?: number | null; title: DoTitle; summary: string; step?: string;
  said: string[]; tests?: { ran: boolean; passed: number; failed: number; list: { test: string; status: string }[] } | null;
  denials?: unknown[]; denied?: string | string[] | null;
  landing: { diff: string; files: { file: string; status: 'modified' | 'added' | 'deleted'; diff: string }[]; edit?: WorkspaceEdit | null };
  offers: ReviewOffer[]; details: DetailsSection[];
}
export interface ReadingEntry {
  id: string; kind: string; row: number | null; step?: number | null; unit?: { path: string; unit: string } | null;
  summary: string; offers: ReviewOffer[]; landing: { edit: WorkspaceEdit | null; diff: string; facts?: number };
}
export interface ReconcileReview {
  id: 'reconcile'; kind: 'reconcile'; plan?: string; title: { verb?: string; count?: number }; summary: string;
  entries: ReadingEntry[]; details: DetailsSection[];
}
export type Review = DoReview | ReconcileReview;
// facts: plan lines the client writes (nvim plans.apply_facts); Task 7 pins the shapes the server sends
export type Fact = { row: number; text: string } | { after: number; lines: string[] } | { from: number; to: number; lines: string[] };
export interface ChooseResult {
  done: boolean; said?: string; edit?: WorkspaceEdit | null; facts?: Fact[]; files?: string[]; review?: Review | null; reopen?: { id: string } | null;
}
export interface ReviewChooseParams extends Doc { id: string; choice: string; entry?: string; step?: number }
export interface ReviewReady { id: string; kind: string; textDocument: TextDocumentIdentifier }
```

In the `Olifant` table, change three request types:

```ts
  plansReviews: req<Doc, ReviewsResult>('olifant/plans/reviews'),
  plansReview: req<ReviewParams, Review>('olifant/plans/review'),
  plansReviewChoose: req<ReviewChooseParams, ChooseResult>('olifant/plans/review/choose'),
```

`src/tdd/conjure.ts` still compiles: its `paused()` reads `p.diagnosis` through `String(…)` and builds the choice from two literals. Task 5 removes it.

- [ ] **Step 11: Run the tests to see them pass**

Run: `npm run lint && npm run test:unit`
Expected: lint clean; all unit tests PASS (the OLIFANT_REPO scans skip without it).

With an olifant checkout at the pin, run the key scan too:

```bash
git -C ~/projects/olifant worktree add "$TMPDIR/olifant-pin" 1ae076fc
OLIFANT_REPO="$TMPDIR/olifant-pin" npm run test:unit
git -C ~/projects/olifant worktree remove "$TMPDIR/olifant-pin"
```

Expected: `the TDD keys are olifant's` PASS. If a key is missing, find what the server sends (`grep -rn '"<key>"' $TMPDIR/olifant-pin/src`) and fix the type and the list together; never drop the key.

- [ ] **Step 12: Commit**

```bash
git add src/pause/viewModel.ts src/pause/text.ts src/protocol.ts test/pauseFixtures.ts test/fixtures/paused test/unit/text.test.ts test/unit/protocol.test.ts
git commit -m "pause: shared view types, cell-width text, the pause and review protocol, the four fixtures"
```

---

### Task 2: The conjure view model (pure)

**Files:**
- Create: `src/pause/model.ts`
- Create: `test/unit/model.test.ts`

**Interfaces:**
- Consumes (Task 1): `given`, `width`, `cut`, `pad`, `wrap` from `src/pause/text.ts` (`wrap` is pause.lua's: words, hard breaks, `cont`, width at least `width(cont) + 10`); `Line`, `Span`, `SpanKind`, `Row`, `View`, `plain` from `src/pause/viewModel.ts`; `Paused`, `PausedOffer`, `PausedRound`, `PausedStep`, `PausedFile`, `PausedTest`, `PausedFailed` from `src/protocol.ts`; `fixture(name)` from `test/pauseFixtures.ts`.
- Produces (`src/pause/model.ts`), the contract's Task 2 API with these settled details:
  - `type EntryKind`, `interface PauseEntry`, `interface PauseRow`, `interface Running`, `interface KeyHelp` exactly as the contract. `PauseRow` and `Row` objects never carry an `undefined` property: `key`, `arg`, `land`, `hint` are absent when not given (deep-equal tests rely on it).
  - `entries(p)`, `defaultSelected(es)` (0-based, -1 when empty), `rows(p, entry, narrow)` (`pressable` = has a key), `shortName(p, id)`.
  - `NO_ROW: Record<string, string>` and **added** `noRow(rows: PauseRow[], key: string): string` (pause.lua `no_row`: with a proposal's two rows shown any key but `a`/`r` says `answer the proposal first: a accepts, r rejects`; else `NO_ROW[key]`, else `nothing to do here`). The controller (Task 5) calls `noRow`.
  - `rowLines(rows, width): { lines: Line[]; starts: number[] }`; `starts[i]` is the 0-based line row `i` starts on. A keyed row's first line starts with the span `{ text: key, kind: 'key' }` (the page's `<kbd>` badge).
  - **Changed:** `conjureKeys(chord: string): KeyHelp[]` replaces `CONJURE_KEYS` (the `q Esc` line says `close; the pause stays, <chord> reopens it`; `chord` is the whole label, e.g. `Cmd+Alt+D C`). `KeyHelp.keys` are the page's key names (`Escape`, `PageDown`, `PageUp`, `Tab`, letters, `[`, `]`) except the digit range, written `'0-9'` (the controller expands it). The help shows `Escape` as `Esc`, `PageDown PageUp` as `PgDn PgUp`.
  - `helpLines(width, keys): Line[]`; `conjureLegend(o): string`.
  - `layout(cols): { narrow; text; right }`: `right` is the diff pane's width, the whole panel width when narrow (`min(cols - 4, 150)`), else `width - left`. The help is laid out at `right - 4`, the diff title cut to `max(right - 4, 8)`.
  - `conjureView(p, o): View`: `o.selected` 0-based; out of range (e.g. `-1`) means the default. `View.lines` never includes the title (the page draws `view.title`, or `view.short` when narrow, as the pane's first line; the panel's tab title is `view.tab`, `conjure · <unit>`). `title` is the first of full / short / bare that fits `text` cells, cut with `…` when even bare does not (pause.lua `edge`). `legend` is the whole legend when it fits `text` cells, else its short form without ` (the pause stays)` (the page wraps it); running: `x cancel · q hide (it goes on) · ? help`. While running, `rows` is `[]`, `reason` is absent and `status` is the `▶ <label> — <message> · N s · x cancels` line. `help` is set only when `o.help`.

**Port notes (read before starting):**
- Every text, width and key letter is pause.lua's, except where VS Code's page keys differ: the page reports `PageDown`/`PageUp`, not `^d`/`^u` (viewModel `PAGE_KEYS`), so the legend says `j k PgDn PgUp scroll` and the help has two lines `j k  scroll the diff: a line` and `PgDn PgUp  scroll the diff: a page` (one combined token would push the help past its width); `d` says `details, in a document beside this one` (spec §6: a markdown document, not a split).
- Highlight groups become span kinds: DurandalStrong → `strong`, Legend/Comment → `dim`, Red → `red`, Green → `green`, Check → `check`, Place → `place`, Key → `key`, Running → `running`, Section → `section`, Paused → `paused`, Proposal → `proposal`, Title → `title`. The spinner frame is the fixed glyph `⠋` with kind `spinner` (the page animates it). The selected entry's band is `entryAt[i] === selected`, not a span.
- The status line keeps nvim's em dash: `▶ continue — asking local (q)…` (pause.lua :978).
- The `(d details)` placeholder in the stale-tests line is U+E000 (nvim used `\1`, whose display width differs between nvim and `width()`).
- The literal expectations below were checked against durandal.nvim's own `pause.situation` / `row_lines` output (nvim headless, 24 payloads at widths 58, 74 and narrow 90): lines, spans, rows, row lines, starts, reasons, diff lines and titles match.

The tests are written in five red/green cycles; each cycle's test step gives the whole import block to put at the top of the file (replacing the previous one) and the tests to append.

- [ ] **Step 1: Write the failing tests for entries, rows and keys**

Create `test/unit/model.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { defaultSelected, entries, NO_ROW, noRow, rows, shortName } from '../../src/pause/model';
import type { PauseRow } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';

// Ported from durandal.nvim tests/pause_spec.lua (the data tests). The builders below are the
// Lua spec's proposed(), refused(), wall() and the in-test variants, on the same fixtures.
const NOT_FOUND = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_not_found';
const SUCCEEDS = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_succeeds';
const TEST_FIX_DIFF = '--- a/src/bistro/booking/commands/cancel_booking__test.py\n+++ b/src/bistro/booking/commands/cancel_booking__test.py\n@@ -27,1 +27,1 @@\n-    cancel_booking = command()\n+    cancel_booking = command(bookings=repository)\n';
const PORT_DETAIL = 'find_by_id(self, id: str) -> Booking | None in the port and its adapters, then round 3';

const keyed = (rs: PauseRow[]): string[] => rs.map(r => `${r.key ?? ' '} ${r.label}`);
const offer = (o: Partial<PausedOffer> & { choice: string }): PausedOffer => ({ label: o.choice, detail: '', ...o });

// the wired pause as it is after `t`: the proposal waiting
function proposed(): Paused {
  const p = fixture('wired');
  p.proposal = {
    file: 'src/bistro/booking/commands/cancel_booking__test.py', test: NOT_FOUND, before: '', after: '', refused: null,
    diff: [
      '--- a/src/bistro/booking/commands/cancel_booking__test.py',
      '+++ b/src/bistro/booking/commands/cancel_booking__test.py',
      '@@ -27,6 +27,6 @@',
      ' def test_cancel_booking_not_found() -> None:',
      '     repository = Mock()',
      '-    cancel_booking = command()',
      '+    cancel_booking = command(bookings=repository)',
    ].join('\n'),
  };
  p.offers = [
    { choice: 'accept', label: 'accept', detail: 'the test lands with the conjure; round 3 runs against it' },
    { choice: 'reject', label: 'reject', detail: 'back to the rows; the test stands as it was' },
  ];
  return p;
}

// the wired pause after a refused re-conjure
function refused(): Paused {
  const p = proposed();
  p.proposal!.refused = 'it adds `"BAD" is not defined` at line 23';
  p.outcome = 'Your re-conjure of not_found was refused: it adds `"BAD" is not defined` at line 23.';
  p.offers = fixture('wired').offers;
  p.offers.splice(2, 0, { choice: 'proposal', label: 'see the refused proposal', detail: '…' });
  p.offers[3] = { choice: 'reconjure', arg: NOT_FOUND, label: 'fix the test: not_found, again', detail: 're-conjure it once more; you see its diff' };
  return p;
}

// the screenshot-10 pause: round 2 refused by pyright at the port's wall, the test fixed
// after round 1, p offered
function wall(): Paused {
  const p = fixture('wired');
  const w = fixture('wired');
  const msg = 'Cannot access attribute "find_by_id" for class "BookingRepository"';
  for (const r of p.rounds!) {
    r.failed = []; r.failing = []; r.passed = [];
    r.line = 'booking = self.bookings.find_by_id(input.id)';
    r.check = `src/bistro/booking/commands/cancel_booking.py: ${msg}`;
  }
  p.steps = [{ after: 1, kind: 'test', test: NOT_FOUND, text: 'test fixed: not_found (command(bookings=repository))',
    files: [{ file: 'src/bistro/booking/commands/cancel_booking__test.py', diff: TEST_FIX_DIFF }] }];
  const here = 'src/bistro/booking/commands/cancel_booking.py';
  p.failure = { round: 2, kind: 'check', tool: 'pyright', problems: [
    { file: here, line: 30, message: msg },
    { file: here, line: 30, message: 'Type of "booking" is unknown' },
    { file: here, line: 30, message: 'Type of "find_by_id" is unknown' },
  ] };
  p.checker = 'pyright';
  p.diagnosis = ["BookingRepository has no find_by_id: pyright refuses round 2's body before the tests run (cancel_booking.py:30)."];
  p.why = p.diagnosis[0];
  p.title!.seconds = 31;
  p.tests = [w.tests![0], { test: SUCCEEDS, status: 'passing', flipped: null, assertion: 'assert isinstance(result, Ok)', note: null, source: '' }];
  p.offers = [w.offers[0], w.offers[1],
    { choice: 'port', arg: 'BookingRepository.find_by_id', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL },
    w.offers[3], w.offers[4]];
  return p;
}

// the wired pause with a port-method proposal waiting (`p`'s answer)
function portProposal(): Paused {
  const q = fixture('wired');
  q.proposal = {
    kind: 'port', file: 'src/bistro/booking/ports/booking_repository/booking_repository.py', test: 'BookingRepository.find_by_id',
    step: 'port method: BookingRepository.find_by_id(id: str) -> Booking | None', refused: null,
    files: ['src/bistro/booking/ports/booking_repository/booking_repository.py', 'src/bistro/booking/adapters/a.py', 'src/bistro/booking/adapters/b.py'],
    diff: '--- a/src/bistro/booking/ports/booking_repository/booking_repository.py\n+++ b/src/bistro/booking/ports/booking_repository/booking_repository.py\n@@ -30,1 +30,3 @@\n     def save(self, booking: Booking) -> None: ...\n+\n+    def find_by_id(self, id: str) -> Booking | None: ...\n',
  };
  q.offers = [{ choice: 'accept', label: 'accept', detail: '…' }, { choice: 'reject', label: 'reject', detail: '…' }];
  return q;
}

// wired with a third round and the test's fix accepted after round 2 (the wire step skipped)
function withStep(): Paused {
  const p = fixture('wired');
  const r3 = structuredClone(p.rounds![1]);
  r3.round = 3;
  r3.line = 'booking = self.bookings.find_by_id(input.id)';
  p.rounds!.push(r3);
  p.steps = [
    { after: 0, kind: 'wire', text: 'wire bookings: BookingRepository', files: [] },
    { after: 2, kind: 'test', test: NOT_FOUND, text: 'test fixed: not_found (command(bookings=repository))',
      files: [{ file: 'src/bistro/booking/commands/cancel_booking__test.py', diff: TEST_FIX_DIFF }] },
  ];
  return p;
}

// wired with rounds 3..14: more than nine entries
function many(): Paused {
  const p = fixture('wired');
  for (let n = 3; n <= 14; n++) {
    const r = structuredClone(p.rounds![0]);
    r.round = n;
    r.line = `return ${n}`;
    p.rounds!.push(r);
  }
  return p;
}

const thin = (): Paused => ({ token: 't', lines: { first: 1, last: 1 }, offers: [] });

test('entries: the wire is 0, then the rounds; the default is the last round', () => {
  const es = entries(fixture('wired'));
  assert.deepEqual(es.map(e => [e.kind, e.n, e.label]), [['wire', 0, 'wire'], ['round', 1, 'red'], ['round', 2, 'red']]);
  assert.equal(es[0].body, 'bookings: BookingRepository → __init__, command()');
  assert.equal(es[0].text, 'wire  bookings: BookingRepository → __init__, command()');
  assert.equal(es[2].body, '(the same as round 1)');
  assert.equal(defaultSelected(es), 2);
});

test('no wire: no 0 entry; the old golden\'s rows on their keys (Review Focus 1)', () => {
  const p = fixture('plain');
  const es = entries(p);
  assert.equal(es[0].kind, 'round');
  assert.deepEqual(keyed(rows(p, es[defaultSelected(es)], false)),
    ['c continue', 'h continue with a hint…', 't fix the test: not_found', 'T fix the test: succeeds', 's stop', 'a keep round 3']);
});

test('§10.1: every row on its key; the keep row names the selected round', () => {
  const p = fixture('wired');
  const es = entries(p);
  assert.deepEqual(keyed(rows(p, es[2], false)), ['c continue', 'h continue with a hint…', 't fix the test: not_found', 's stop', 'a keep round 2']);
});

test('§10.2: round 1 selected, then the wire: the a row follows', () => {
  const p = fixture('wired');
  const es = entries(p);
  const one = rows(p, es[1], false);
  const a1 = one[one.length - 1];
  assert.deepEqual([a1.key, a1.label, a1.arg], ['a', 'keep round 1', '1']);
  const w = rows(p, es[0], false);
  const a = w[w.length - 1];
  assert.deepEqual([a.key, a.label, a.detail, a.choice, a.land, a.arg],
    ['a', 'keep nothing but the wire', "lands the wire's files alone, your body stands", 'stop', true, '0']);
});

test('the rows carry what a resume needs: arg only when given, land only from the offer', () => {
  const p = fixture('wired');
  const rs = rows(p, entries(p)[2], false);
  assert.deepEqual(rs[0], { key: 'c', label: 'continue', detail: '6 more rounds with local, from round 3', choice: 'continue', pressable: true });
  assert.deepEqual(rs[1], { key: 'h', label: 'continue with a hint…', detail: 'your sentence goes to local with round 3', choice: 'continue', hint: true, pressable: true });
  assert.deepEqual(rs[2], { key: 't', label: 'fix the test: not_found', detail: 'hand repository to command(bookings=repository); you see the diff', choice: 'reconjure', arg: NOT_FOUND, pressable: true });
  assert.deepEqual(rs[3], { key: 's', label: 'stop', detail: 'nothing lands, not the wire either; your text stands', choice: 'stop', land: false, pressable: true });
  assert.deepEqual(rs[4], { key: 'a', label: 'keep round 2', detail: 'lands the diff on the right, red (saved; u undoes it)', choice: 'stop', land: true, arg: '2', pressable: true });
});

test('§10.3: a proposal is the default entry, a and r its rows', () => {
  const p = proposed();
  const es = entries(p);
  assert.equal(defaultSelected(es), 3);
  assert.deepEqual([es[3].kind, es[3].label, es[3].body, es[3].text], ['proposal', 'proposal', 'fix the test: not_found', 'proposal for not_found']);
  assert.deepEqual(keyed(rows(p, es[3], false)), ['a accept', 'r reject']);
});

test('a refused proposal leads: ✗ entry selected, the proposal offer skipped, a accepts it anyway, t again', () => {
  const p = refused();
  const es = entries(p);
  const sel = defaultSelected(es);
  assert.equal(es[sel].kind, 'refused');
  assert.equal(es[sel].body, 'fix the test: not_found · it adds `"BAD" is not defined` at line 23');
  const rs = rows(p, es[sel], false);
  assert.deepEqual(keyed(rs), ['c continue', 'h continue with a hint…', 't fix the test: not_found, again', 's stop', 'a accept it anyway']);
  assert.equal(rs[4].choice, 'accept');
  assert.ok(!rs.some(r => r.choice === 'proposal'));
});

test('a refusal of several lines is one entry line', () => {
  const p = refused();
  p.proposal!.refused = 'it adds `x`\n  Type "A" is not assignable\n    "size" is not present` at line 26';
  const e = entries(p).find(x => x.kind === 'refused')!;
  assert.equal(e.body, 'fix the test: not_found · it adds `x` Type "A" is not assignable "size" is not present` at line 26');
  assert.ok(!e.text.includes('\n'));
});

test('keys: C climbs, w W wire the candidates, t T the first two tests; a third test row has no key and is not pressable', () => {
  const p = fixture('plain');
  p.offers = [
    offer({ choice: 'continue', label: 'continue' }), offer({ choice: 'climb', label: 'climb to claude' }),
    offer({ choice: 'wire', arg: 'bookings: BookingRepository', label: 'wire bookings: BookingRepository' }),
    offer({ choice: 'wire', arg: 'ids: IdGenerator', label: 'wire ids: IdGenerator' }),
    offer({ choice: 'reconjure', arg: NOT_FOUND, label: 'fix the test: not_found' }),
    offer({ choice: 'reconjure', arg: SUCCEEDS, label: 'fix the test: succeeds' }),
    offer({ choice: 'reconjure', arg: 'x::test_x', label: 'fix the test: x' }),
    offer({ choice: 'stop', land: false, label: 'stop' }), offer({ choice: 'stop', land: true, arg: '3', label: 'keep round 3' }),
  ];
  const es = entries(p);
  const rs = rows(p, es[defaultSelected(es)], false);
  assert.deepEqual(keyed(rs), ['c continue', 'C climb to claude', 'w wire bookings: BookingRepository', 'W wire ids: IdGenerator',
    't fix the test: not_found', 'T fix the test: succeeds', '  fix the test: x', 's stop', 'a keep round 3']);
  assert.equal(rs[6].pressable, false);
  assert.equal(rs[6].key, undefined);
});

test('a third wire and a third port get no key; an unknown choice is a row without a key', () => {
  const p = fixture('wired');
  p.offers = [
    offer({ choice: 'wire', label: 'w1' }), offer({ choice: 'wire', label: 'w2' }), offer({ choice: 'wire', label: 'w3' }),
    offer({ choice: 'port', label: 'p1' }), offer({ choice: 'port', label: 'p2' }), offer({ choice: 'port', label: 'p3' }),
    offer({ choice: 'teleport', label: 'teleport', detail: 'a choice this client does not know' }),
  ];
  const rs = rows(p, entries(p)[1], false);
  assert.deepEqual(keyed(rs), ['w w1', 'W w2', '  w3', 'p p1', 'P p2', '  p3', '  teleport']);
  assert.deepEqual(rs.map(r => r.pressable), [true, true, false, true, true, false, false]);
  assert.equal(rs[6].choice, 'teleport');
  assert.equal(rs[6].detail, 'a choice this client does not know');
});

test('a bare string offer is its own label and choice', () => {
  const p = fixture('wired');
  (p as { offers: unknown[] }).offers = ['continue', 'stop'];
  assert.deepEqual(keyed(rows(p, entries(p)[1], false)), ['c continue', 's stop']);
});

test('the next wall gets a step: p adds the method a port lacks, in the server\'s order', () => {
  const p = fixture('wired');
  p.offers.splice(2, 0, { choice: 'port', arg: 'BookingRepository.find_by_id', label: 'add find_by_id to BookingRepository', detail: PORT_DETAIL });
  const es = entries(p);
  assert.deepEqual(keyed(rows(p, es[2], false)),
    ['c continue', 'h continue with a hint…', 'p add find_by_id to BookingRepository', 't fix the test: not_found', 's stop', 'a keep round 2']);
  const q = portProposal();
  const e = entries(q)[3];
  assert.deepEqual([e.kind, e.body, e.text], ['proposal', 'add find_by_id to BookingRepository → port, 2 adapters', 'proposal: add find_by_id to BookingRepository']);
});

test('steps are entries: an accepted fix sits between the rounds it divides; no keep row on it', () => {
  const p = withStep();
  const es = entries(p);
  assert.deepEqual(es.map(e => e.kind), ['wire', 'round', 'round', 'step', 'round']);
  assert.deepEqual([es[3].label, es[3].body], ['test fixed', 'not_found → command(bookings=repository)']);
  assert.equal(defaultSelected(es), 4);
  const rs = rows(p, es[3], false);
  assert.ok(rs.every(r => r.key !== 'a'));
  assert.equal(noRow(rs, 'a'), 'nothing to keep on this entry');
});

test('the steps fixture: the wire step is entry 0 once, the test fix and the port method after their rounds', () => {
  const es = entries(fixture('steps'));
  assert.deepEqual(es.map(e => `${e.kind}:${e.label}:${e.body}`), [
    'wire:wire:bookings: BookingRepository → __init__, command()',
    'round:red:booking = self.bookings.find_by_id(input.id)',
    'step:test fixed:not_found → command(bookings=repository)',
    'round:red:booking = self.bookings.find_by_id(input.id)',
    'step:port method:find_by_id → BookingRepository, 3 adapters',
    'round:red:booking = self.bookings.find_by_id(input.id)',
  ]);
});

test('a round without a diff has no keep row', () => {
  const p = fixture('wired');
  p.rounds![1].diff = null;
  const rs = rows(p, entries(p)[2], false);
  assert.ok(rs.every(r => r.key !== 'a'));
  assert.equal(noRow(rs, 'a'), 'nothing to keep on this entry');
});

test('a round whose diff is empty text still keeps', () => {
  const p = fixture('wired');
  p.rounds![1].diff = '';
  const rs = rows(p, entries(p)[2], false);
  assert.equal(rs[rs.length - 1].label, 'keep round 2');
});

test('narrow: the keep row says Tab shows the diff', () => {
  const p = fixture('wired');
  const rs = rows(p, entries(p)[2], true);
  assert.equal(rs[rs.length - 1].detail, 'lands the diff (Tab shows it), red (saved; u undoes it)');
});

test('a thin answer: no entries, nothing selected, no rows', () => {
  const es = entries(thin());
  assert.deepEqual(es, []);
  assert.equal(defaultSelected(es), -1);
  assert.deepEqual(rows(thin(), undefined, false), []);
});

test('why a key has no row: the letters, the proposal first, else nothing to do', () => {
  assert.equal(NO_ROW.c, 'no more rounds to run');
  assert.equal(NO_ROW.C, 'no stronger model to climb to');
  assert.equal(NO_ROW.W, 'no second port to wire');
  assert.equal(NO_ROW.P, 'no second port method to add');
  const p = proposed();
  const rs = rows(p, entries(p)[3], false);
  assert.equal(noRow(rs, 'c'), 'answer the proposal first: a accepts, r rejects');
  const w = fixture('wired');
  const ws = rows(w, entries(w)[2], false);
  assert.equal(noRow(ws, 'r'), 'no proposal to reject');
  assert.equal(noRow(ws, 'W'), 'no second port to wire');
  assert.equal(noRow(ws, 'z'), 'nothing to do here');
});

test('shortName drops test_ and the paused file\'s stem, whatever the language', () => {
  assert.equal(shortName({ ...thin(), file: 'src/x/cancel_booking.py' }, 'src/x/cancel_booking__test.py::test_cancel_booking_not_found'), 'not_found');
  assert.equal(shortName({ ...thin(), file: 'src/x/cancel_booking.rs' }, 'src/x/cancel_booking.rs::tests::test_cancel_booking_not_found'), 'not_found');
  assert.equal(shortName(thin(), 'a__test.py::test_other'), 'other');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at `tsc`: `test/unit/model.test.ts(4,…): error TS2307: Cannot find module '../../src/pause/model'`.

- [ ] **Step 3: Write entries, rows and keys**

Create `src/pause/model.ts`:

```ts
// The conjure pause's view model: durandal.nvim pause.lua's pure half, ported. A paused
// payload becomes a View laid out in display cells at the width the page reports, so the
// texts, widths, key letters and paging are nvim's. Highlight groups become span kinds.
// No vscode import: unit-tested with node --test.
import type { Paused, PausedFailed, PausedFile, PausedRound, PausedStep, PausedTest } from '../protocol';
import { cut, given, pad, width, wrap } from './text';
import type { Line, Row, Span, SpanKind, View } from './viewModel';

// ---------------------------------------------------------------------------------------
// entries, rows and keys (pause.lua :304-495)

export type EntryKind = 'wire' | 'round' | 'step' | 'proposal' | 'refused';
export interface PauseEntry { kind: EntryKind; n?: number; label: string; body: string; text: string; round?: PausedRound; step?: PausedStep }
// PauseRow: an offers row with what a resume needs
export interface PauseRow { key?: string; label: string; detail: string; choice: string; arg?: string; land?: boolean; hint?: boolean; pressable: boolean }
export interface Running { label: string; message?: string; seconds: number; round?: number; accepted: boolean }
export interface KeyHelp { keys: string[]; help: string }

const rep = (n: number): string => ' '.repeat(Math.max(n, 0));
const str = (v: unknown, otherwise = ''): string => (given(v) ? String(v) : otherwise);
// Lua's tonumber: a number, or a numeric string; else undefined
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
// a test id's last part: what follows the last `:`
const lastPart = (id: unknown): string => {
  const s = String(id);
  return /([^:]+)$/.exec(s)?.[1] ?? s;
};

// Where a wire's files wrote, as the rounds list says it (`__init__, command()`).
function wirePlaces(files: PausedFile[]): string[] {
  const places: string[] = [];
  for (const f of files) {
    for (const l of str(f.diff).split('\n')) {
      const name = /^\+\s*def\s+(\w+)\s*\(/.exec(l)?.[1];
      if (name) {
        const place = name === '__init__' ? name : `${name}()`;
        if (!places.includes(place)) places.push(place);
      }
    }
  }
  return places;
}

// What the wire did to each file, as the diff pane's title says it.
function wireFileWords(w: { param?: unknown; files?: PausedFile[] | null }): string {
  const param = str(w.param, '?');
  const out: string[] = [];
  for (const f of list(w.files)) {
    const did: string[] = [];
    for (const l of str(f.diff).split('\n')) {
      if (/^\+\s*from\s/.test(l) || /^\+\s*import\s/.test(l)) {
        if (!did.includes('+import')) did.push('+import');
      }
      const name = /^\+\s*def\s+(\w+)\s*\(/.exec(l)?.[1];
      if (name) {
        const words = name === '__init__' ? `+${param} in __init__` : `${name} takes ${param}`;
        if (!did.includes(words)) did.push(words);
      }
    }
    const file = basename(str(f.file, '?'));
    out.push(did.length > 0 ? `${file} (${did.join(', ')})` : file);
  }
  return out.join(', ');
}

// How many adapters a port's change touches beside the port.
function adaptersWords(n: number): string {
  if (n < 1) return '';
  return `, ${n}${n === 1 ? ' adapter' : ' adapters'}`;
}

// A step's kind column and body (§7.3).
function stepColumns(st: { kind?: unknown; text?: unknown; files?: unknown[] | null }): [string, string] {
  const text = str(st.text);
  const kind = given(st.kind) ? String(st.kind) : undefined;
  if (kind === 'test') {
    const m = /^test fixed: (\S+) \((.+)\)$/.exec(text);
    if (m) return ['test fixed', `${m[1]} → ${m[2]}`];
    return ['test fixed', text.replace(/^test fixed:\s*/, '')];
  }
  if (kind === 'port') {
    const m = /^port method: (\w+)\.(\w+)/.exec(text);
    const files = list(st.files).length;
    if (m) return ['port method', `${m[2]} → ${m[1]}${adaptersWords(files - 1)}`];
    return ['port method', text.replace(/^port method:\s*/, '')];
  }
  if (kind === 'hint') return ['hint', text.replace(/^hint:\s*/, '')];
  return [kind ?? 'step', text.replace(/^[^:]+:\s*/, '')];
}

// A test's short name as the engine writes it (`not_found` for
// test_cancel_booking_not_found when the paused file is cancel_booking.py, or .rs, …).
export function shortName(p: Paused, id: string): string {
  const name = lastPart(id);
  const stem = /([^/]+)\.[A-Za-z0-9]+$/.exec(str(p.file))?.[1];
  if (stem && name.startsWith(`test_${stem}_`)) return name.slice(`test_${stem}_`.length);
  return name.replace(/^test_/, '');
}

// The entries of the rounds list: the wire (0), each round, each accepted step after the
// round it follows, a proposal; in order.
export function entries(p: Paused): PauseEntry[] {
  const out: PauseEntry[] = [];
  const steps = list(p.steps).filter(st => typeof st === 'object' && st !== null && st.kind !== 'wire');
  const stepsAfter = (n: number): void => {
    for (const st of steps) {
      if (num(st.after) === n) {
        const [label, body] = stepColumns(st);
        out.push({ kind: 'step', step: st, text: str(st.text), label, body });
      }
    }
  };
  const w = list(p.wired)[0];
  if (typeof w === 'object' && w !== null) {
    const places = wirePlaces(list(w.files));
    const body = `${str(w.param, '?')}: ${str(w.port, '?')}${places.length > 0 ? ` → ${places.join(', ')}` : ''}`;
    out.push({ kind: 'wire', n: 0, text: `wire  ${body}`, label: 'wire', body });
  }
  stepsAfter(0);
  for (const r of list(p.rounds)) {
    const n = num(r.round);
    const text = str(r.line);
    const e: PauseEntry = { kind: 'round', round: r, text, label: str(r.verdict), body: text };
    if (n !== undefined) e.n = n;
    out.push(e);
    if (n !== undefined) stepsAfter(n);
  }
  const pr = given(p.proposal) && typeof p.proposal === 'object' ? p.proposal : undefined;
  if (pr) {
    const m = /^([^.]+)\.(.+)$/.exec(String(pr.test));
    const isPort = pr.kind === 'port' && m !== null;
    const what = isPort && m ? `add ${m[2]} to ${m[1]}` : `fix the test: ${shortName(p, pr.test)}`;
    if (given(pr.refused)) {
      // the reason may be a checker's message of several lines: the entry is one line
      const why = String(pr.refused).replace(/\s*\n\s*/g, ' ');
      out.push({ kind: 'refused', text: `proposal for ${shortName(p, pr.test)}, refused: ${why}`, label: 'refused', body: `${what} · ${why}` });
    } else {
      const files = list(pr.files).length;
      const body = isPort ? what + (files > 1 ? ` → port${adaptersWords(files - 1)}` : '') : what;
      out.push({ kind: 'proposal', text: isPort ? `proposal: ${what}` : `proposal for ${shortName(p, pr.test)}`, label: 'proposal', body });
    }
  }
  return out;
}

// The entry shown by default: a proposal waiting, else the last round, else the first.
export function defaultSelected(es: PauseEntry[]): number {
  const p = es.findIndex(e => e.kind === 'proposal' || e.kind === 'refused');
  if (p >= 0) return p;
  for (let i = es.length - 1; i >= 0; i--) if (es[i].kind === 'round') return i;
  return es.length > 0 ? 0 : -1;
}

// The keyed rows with ENTRY selected (design §4, §6): the server's offers in its order, each
// on its key; the keep row follows the selection; a proposal shown is its two rows.
export function rows(p: Paused, entry: PauseEntry | undefined, narrow: boolean): PauseRow[] {
  const out: PauseRow[] = [];
  const counts: Record<string, number> = {};
  type Offer = { choice?: unknown; label?: unknown; detail?: unknown; arg?: unknown; land?: unknown; hint?: unknown };
  const keyed = (o: Offer, key: string | undefined): void => {
    const row: PauseRow = {
      label: given(o.label) ? String(o.label) : given(o.choice) ? String(o.choice) : '?',
      detail: str(o.detail), choice: str(o.choice), pressable: key !== undefined,
    };
    if (key !== undefined) row.key = key;
    if (given(o.arg)) row.arg = String(o.arg);
    if (typeof o.land === 'boolean') row.land = o.land;
    if (given(o.hint)) row.hint = Boolean(o.hint);
    out.push(row);
  };
  const nth = (kind: string, keys: string[]): string | undefined => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return keys[counts[kind] - 1];
  };
  let keep: Offer | undefined;
  for (const raw of list(p.offers) as unknown[]) {
    const o: Offer = typeof raw === 'string' ? { label: raw, choice: raw } : (raw as Offer);
    const choice = given(o.choice) ? String(o.choice) : undefined;
    if (choice === 'proposal') continue; // the refused proposal is an entry, not a row
    else if (choice === 'continue') keyed(o, given(o.hint) && o.hint !== false ? 'h' : 'c');
    else if (choice === 'climb') keyed(o, 'C');
    else if (choice === 'wire') keyed(o, nth('wire', ['w', 'W']));
    else if (choice === 'reconjure') keyed(o, nth('reconjure', ['t', 'T']));
    else if (choice === 'port') keyed(o, nth('port', ['p', 'P']));
    else if (choice === 'stop' && o.land === true) keep = o;
    else if (choice === 'stop') keyed(o, 's');
    else if (choice === 'accept') keyed(o, 'a');
    else if (choice === 'reject') keyed(o, 'r');
    else keyed(o, undefined);
  }
  if (entry && entry.kind === 'refused') {
    keyed({ label: 'accept it anyway', detail: 'the test lands with the conjure as it was written; the rounds go on over it', choice: 'accept' }, 'a');
  } else if (keep && entry && entry.kind === 'wire') {
    keyed({ label: 'keep nothing but the wire', detail: "lands the wire's files alone, your body stands", choice: 'stop', land: true, arg: '0' }, 'a');
  } else if (keep && entry && entry.kind === 'round' && entry.round && given(entry.round.diff)) {
    const n = String(entry.n ?? '?');
    keyed({ label: `keep round ${n}`, detail: keep.detail, choice: 'stop', land: true, arg: n }, 'a');
  }
  if (narrow) for (const r of out) r.detail = r.detail.replaceAll('the diff on the right', 'the diff (Tab shows it)');
  return out;
}

// Why key K has no row (pause.lua no_row :1033-1044); noRow adds the proposal rule.
export const NO_ROW: Record<string, string> = {
  c: 'no more rounds to run', h: 'no more rounds to run', C: 'no stronger model to climb to',
  w: 'no port to wire', W: 'no second port to wire', t: 'no test to fix', T: 'no second test to fix',
  p: 'no port method to add', P: 'no second port method to add', s: 'nothing to stop',
  a: 'nothing to keep on this entry', r: 'no proposal to reject',
};
export function noRow(rs: PauseRow[], key: string): string {
  const answering = rs.length === 2 && rs.some(r => r.choice === 'accept' && r.key === 'a');
  if (answering && key !== 'a' && key !== 'r') return 'answer the proposal first: a accepts, r rejects';
  return NO_ROW[key] ?? 'nothing to do here';
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS (the 20 model tests and every earlier suite).

- [ ] **Step 5: Write the failing tests for the offers' lines**

Replace the import block at the top of `test/unit/model.test.ts` with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import type { Line } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { defaultSelected, entries, NO_ROW, noRow, rowLines, rows, shortName } from '../../src/pause/model';
import type { PauseRow } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';
```

Append to `test/unit/model.test.ts`:

```ts
// --- the offers' lines (row_lines)

const W = 74; // the left pane's text width at 200 columns
// a row line in three columns: the key and label, then the detail from column 31
const col = (label: string, detail: string): string => label + ' '.repeat(31 - width(label)) + detail;
// a line's marked stretches: { text: kind } (the Lua spec's marked())
const marked = (l: Line): Record<string, string> => Object.fromEntries(l.filter(s => s.kind).map(s => [s.text, s.kind as string]));
const wiredRows = (): PauseRow[] => { const p = fixture('wired'); return rows(p, entries(p)[2], false); };

test('§10.1: rows in three columns: the key, the label in 28 cells, the detail wrapped under itself', () => {
  const { lines, starts } = rowLines(wiredRows(), W);
  const text = lines.map(plain);
  assert.equal(text[0], col('c  continue', '6 more rounds with local, from round 3'));
  assert.equal(text[1], col('h  continue with a hint…', 'your sentence goes to local with round 3'));
  // the scan knows the test's fix: the row says the edit
  assert.equal(text[2], col('t  fix the test: not_found', 'hand repository to'));
  assert.equal(text[3], col('', 'command(bookings=repository); you see the'));
  assert.equal(text[4], col('', 'diff'));
  assert.equal(text[text.length - 2], col('a  keep round 2', 'lands the diff on the right, red (saved; u'));
  assert.equal(text[text.length - 1], col('', 'undoes it)'));
  assert.deepEqual(starts, [0, 1, 2, 5, 7]);
  for (const l of text) assert.ok(width(l) <= W, l);
});

test('each row\'s first line starts with its key as a span of its own (the page\'s badge)', () => {
  const rs = wiredRows();
  const { lines, starts } = rowLines(rs, W);
  rs.forEach((r, i) => assert.deepEqual(lines[starts[i]][0], { text: r.key, kind: 'key' }));
  const narrow = rowLines(rs, 58);
  rs.forEach((r, i) => assert.deepEqual(narrow.lines[narrow.starts[i]][0], { text: r.key, kind: 'key' }));
});

test('§6.1: the rows in columns, the p row whole; keys key, labels plain, details dimmed', () => {
  const p = wall();
  const { lines, starts } = rowLines(rows(p, entries(p)[4], false), W);
  const text = lines.map(plain);
  const at = text.findIndex(l => l.startsWith('p  '));
  assert.equal(text[at], 'p  add find_by_id to BookingRepository');
  assert.equal(text[at + 1], col('', 'find_by_id(self, id: str) -> Booking | None'));
  assert.equal(text[at + 2], col('', 'in the port and its adapters, then round 3'));
  assert.ok(starts.includes(at));
  assert.deepEqual(marked(lines[at]), { p: 'key' });
  assert.deepEqual(marked(lines[at + 1]), { 'find_by_id(self, id: str) -> Booking | None': 'dim' });
  assert.deepEqual(marked(lines[0]), { c: 'key', '6 more rounds with local, from round 3': 'dim' });
  for (const l of text) assert.ok(!l.endsWith('…'), l);
});

test('the p row is whole in two lines at 74', () => {
  const p = fixture('check');
  const prow = rows(p, entries(p)[1], false).filter(r => r.key === 'p');
  const text = rowLines(prow, W).lines.map(plain);
  assert.deepEqual(text, [
    'p  add find_by_id to BookingRepository',
    col('', 'find_by_id(self, id: str) -> Booking | None'),
    col('', 'in the port and its adapters, then round 2'),
  ]);
});

test('narrower than 70: label — detail wrapped under the label, the detail dimmed from its dash', () => {
  const { lines, starts } = rowLines(wiredRows(), 58);
  assert.deepEqual(lines.map(plain), [
    'c  continue — 6 more rounds with local, from round 3',
    'h  continue with a hint… — your sentence goes to local',
    '   with round 3',
    't  fix the test: not_found — hand repository to',
    '   command(bookings=repository); you see the diff',
    's  stop — nothing lands, not the wire either; your text',
    '   stands',
    'a  keep round 2 — lands the diff on the right, red (saved;',
    '   u undoes it)',
  ]);
  assert.deepEqual(starts, [0, 1, 3, 5, 7]);
  assert.deepEqual(marked(lines[1]), { h: 'key', '— your sentence goes to local': 'dim' });
  assert.deepEqual(marked(lines[2]), { 'with round 3': 'dim' });
});

test('a detail too long for three lines ends its third with …; an unkeyed row has a blank key column', () => {
  const long = rowLines([{ key: 'c', label: 'continue', detail: 'word '.repeat(40) }], 40);
  assert.equal(long.lines.length, 3);
  assert.ok(plain(long.lines[2]).endsWith('…'), plain(long.lines[2]));
  const bare = rowLines([{ label: 'fix the test: x', detail: '' }], W);
  assert.deepEqual(bare.lines.map(plain), ['   fix the test: x']);
  assert.deepEqual(marked(bare.lines[0]), {});
});

test('a label too long for its column has the line to itself', () => {
  const { lines } = rowLines([{ key: 't', label: 'fix the test: a_very_long_test_name_indeed', detail: 'then the rounds go on' }], W);
  assert.deepEqual(lines.map(plain), ['t  fix the test: a_very_long_test_name_indeed', col('', 'then the rounds go on')]);
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at `tsc`: `error TS2305: Module '"../../src/pause/model"' has no exported member 'rowLines'`.

- [ ] **Step 7: Write the sheet and rowLines**

Append to `src/pause/model.ts`:

```ts
// ---------------------------------------------------------------------------------------
// lines and their colours as data (pause.lua sheet :136-201)

type Chunk = [string, SpanKind?];
type Mark = [number, number, SpanKind];
interface Raw { text: string; marks: Mark[] }

const rtrim = (s: string): string => s.replace(/[ \t\n\v\f\r]+$/, '');

// RAW as spans: the marked stretches with their kind, the rest plain (a later mark wins).
function spansOf(r: Raw): Line {
  if (r.text === '') return [];
  const kinds: (SpanKind | undefined)[] = new Array(r.text.length).fill(undefined);
  for (const [a, b, k] of r.marks) for (let i = a; i < b; i++) kinds[i] = k;
  const out: Span[] = [];
  let start = 0;
  for (let i = 1; i <= r.text.length; i++) {
    if (i === r.text.length || kinds[i] !== kinds[start]) {
      const span: Span = { text: r.text.slice(start, i) };
      if (kinds[start]) span.kind = kinds[start];
      out.push(span);
      start = i;
    }
  }
  return out;
}

class Sheet {
  rows: Raw[] = [];
  // one line from CHUNKS, cut to W (when given), its trailing spaces dropped; its index
  put(chunks: Chunk[], w?: number): number {
    let text = '';
    const spans: Mark[] = [];
    for (const [t, k] of chunks) {
      if (k && t !== '') spans.push([text.length, text.length + t.length, k]);
      text += t;
    }
    if (w !== undefined) text = cut(text, w);
    text = rtrim(text);
    const marks: Mark[] = [];
    for (const [a, b, k] of spans) {
      const e = Math.min(b, text.length);
      if (a < e) marks.push([a, e, k]);
    }
    this.rows.push({ text, marks });
    return this.rows.length - 1;
  }
  blank(): number { return this.put([]); }
  mark(n: number, a: number, b: number, k: SpanKind): void {
    const e = Math.min(b, this.rows[n].text.length);
    if (a < e) this.rows[n].marks.push([a, e, k]);
  }
  // TEXT wrapped at W (continued lines start with CONT), each line in KIND from its first letter
  wrapped(text: string, w: number, cont = '', kind?: SpanKind): void {
    for (const l of wrap(text, w, cont)) {
      const n = this.put([[l]]);
      if (kind) {
        const t = this.rows[n].text;
        this.mark(n, /^[ \t\n\v\f\r]*/.exec(t)![0].length, t.length, kind);
      }
    }
  }
  // line N dimmed from FROM to its end, `(d details)`'s d in the key colour
  dim(n: number, from: number): void {
    const l = this.rows[n].text;
    const at = l.indexOf('(d details)', from);
    if (at >= 0) {
      this.mark(n, from, at + 1, 'dim');
      this.mark(n, at + 1, at + 2, 'key');
      this.mark(n, at + 2, l.length, 'dim');
    } else {
      this.mark(n, from, l.length, 'dim');
    }
  }
  // OTHER's lines (at most MAX) after this sheet's
  append(other: Sheet, max?: number): void {
    other.rows.forEach((r, i) => { if (max === undefined || i < max) this.rows.push({ text: r.text, marks: [...r.marks] }); });
  }
  lines(): Line[] { return this.rows.map(spansOf); }
}

// ---------------------------------------------------------------------------------------
// the offers' lines (pause.lua row_lines :497-558)

// The label column at 70 cells and wider: a label up to 26 cells, then two.
const LABEL = 28;

// ROWS as the offers pane's lines at WIDTH (§7.5): at 70 cells and wider three columns (the
// key, the label in its column, the detail wrapped under itself; a label too long for its
// column has the line to itself); narrower, `label — detail` wrapped under the label. A
// detail takes at most three lines, the third cut with … only when even that is not
// enough. starts[i]: the line row i starts on.
export function rowLines(rs: { key?: string; label: string; detail: string }[], w: number): { lines: Line[]; starts: number[] } {
  const s = new Sheet();
  const starts: number[] = [];
  const columns = w >= 70;
  const three = (ls: string[], cw: number): string[] => (ls.length > 3 ? [ls[0], ls[1], cut(ls.slice(2).join(' '), cw)] : ls);
  for (const r of rs) {
    const key = r.key ?? ' ';
    const detail = r.detail ?? '';
    starts.push(s.rows.length);
    if (columns) {
      const dw = w - 3 - LABEL;
      const ds = detail !== '' ? three(wrap(detail, dw), dw) : [];
      const lead = width(r.label) <= LABEL - 2;
      const rowLine = (label: string, d: string | undefined): void => {
        const dt = d === undefined ? undefined : rtrim(d);
        let text: string;
        if (label !== '' && dt !== undefined) text = `${key}  ${pad(label, LABEL)}${dt}`;
        else if (label !== '') text = `${key}  ${label}`;
        else text = rep(3 + LABEL) + (dt ?? '');
        const n = s.put([[text]]);
        if (label !== '' && r.key) s.mark(n, 0, r.key.length, 'key');
        if (dt) s.mark(n, s.rows[n].text.length - dt.length, s.rows[n].text.length, 'dim');
      };
      if (lead) {
        rowLine(r.label, ds[0]);
        for (let i = 1; i < ds.length; i++) rowLine('', ds[i]);
      } else {
        rowLine(cut(r.label, w - 3), undefined);
        for (const d of ds) rowLine('', d);
      }
    } else {
      const text = r.label + (detail !== '' ? ` — ${detail}` : '');
      const wl = three(wrap(text, w - 3), w - 3);
      let dimmed = false;
      wl.forEach((l, i) => {
        const n = s.put([[(i === 0 ? `${key}  ` : '   ') + l]]);
        if (i === 0 && r.key) s.mark(n, 0, r.key.length, 'key');
        const line = s.rows[n].text;
        if (dimmed) {
          s.mark(n, 3, line.length, 'dim');
        } else {
          const dash = line.indexOf(' — ');
          if (dash >= 0) {
            s.mark(n, dash + 1, line.length, 'dim');
            dimmed = true;
          }
        }
      });
    }
  }
  return { lines: s.lines(), starts };
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS (27 model tests).

- [ ] **Step 9: Write the failing tests for the situation pane**

Replace the import block with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import type { Line, View } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { conjureView, defaultSelected, entries, layout, NO_ROW, noRow, rowLines, rows, shortName } from '../../src/pause/model';
import type { PauseRow } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';
```

Append:

```ts
// --- the situation pane (situation)

const CHORD = 'Cmd+Alt+D C';
// the view at 200 columns (the situation 74 cells wide) unless O says otherwise
const view = (p: Paused, o: Partial<Parameters<typeof conjureView>[1]> = {}): View =>
  conjureView(p, { cols: 200, selected: -1, flipped: false, help: false, chord: CHORD, ...o });
const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: string[], text: string): boolean => ls.some(l => l.includes(text));
const lineOf = (ls: string[], re: RegExp): number => ls.findIndex(l => re.test(l));

test('layout: two panes from 110 columns, the left 52 % (at least 60), a cell of margin each side of the text', () => {
  assert.deepEqual(layout(200), { narrow: false, text: 74, right: 72 });
  assert.deepEqual(layout(124), { narrow: false, text: 58, right: 58 });
  assert.deepEqual(layout(110), { narrow: false, text: 56, right: 46 });
  assert.deepEqual(layout(98), { narrow: true, text: 90, right: 94 });
  assert.deepEqual(layout(400), { narrow: false, text: 74, right: 72 });
});

test('§10.1: the first pause after the wire — the situation, the rounds with the wire as 0', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  assert.equal(v.width, W);
  assert.equal(v.state, 'paused');
  // the title is not a line of the pane: the page draws it
  assert.equal(L[0], 'local wrote the same body in rounds 1 and 2.');
  assert.equal(L[1], '');
  assert.ok(L[2].startsWith('No body can pass not_found: it builds repository = Mock()'), L[2]);
  for (const want of [
    `rounds${' '.repeat(W - 6 - 19)}[ ] page · 0-9 jump`,
    '  0  wire         bookings: BookingRepository → __init__, command()',
    'failing  test_cancel_booking_not_found            failed before round 1',
    '    assert isinstance(result, NotFound)',
    '    got       Ok(value=None)',
    '    expected  NotFound',
  ]) assert.ok(L.includes(want), want);
  // verdict first, in its column; the body whole; the failing names right-aligned
  assert.ok(has(L, '  1  red          booking = self.bookings.find_by_id(input.id)'));
  assert.ok(has(L, '> 2  red          (the same as round 1)'));
  for (const l of L) {
    if (l.includes('(the same as round 1)')) {
      assert.ok(l.endsWith('  not_found'), l);
      assert.equal(width(l), W, l);
    }
    assert.ok(width(l) <= W, l);
  }
  assert.deepEqual(L.slice(7, 11), [
    'rounds                                                 [ ] page · 0-9 jump',
    '  0  wire         bookings: BookingRepository → __init__, command()',
    '  1  red          booking = self.bookings.find_by_id(input.id)   not_found',
    '> 2  red          (the same as round 1)                          not_found',
  ]);
});

test('the title: the model goes first, then the seconds, to fit the pane; short drops the model', () => {
  const v = view(fixture('wired'));
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local');
  assert.equal(plain(v.short), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local · 16 s');
  assert.deepEqual(v.title, [
    { text: 'conjure · CancelBooking.handle · ', kind: 'title' },
    { text: '● paused', kind: 'paused' },
    { text: ' after round 2 of 6 · local', kind: 'dim' },
  ]);
  // wide enough for the model: the whole title (the pane is never wider than 74 cells)
  const thinTitle = view(thin());
  assert.equal(plain(thinTitle.title), 'conjure · ● paused');
});

test('§10.5: narrow — no model in the title; flipped only when narrow', () => {
  const v = view(fixture('wired'), { cols: 98, flipped: true });
  assert.equal(v.narrow, true);
  assert.equal(v.flipped, true);
  assert.equal(v.width, 90);
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ● paused after round 2 of 6 · local · 16 s');
  assert.equal(v.tab, 'conjure · CancelBooking.handle');
  assert.equal(view(fixture('wired'), { flipped: true }).flipped, false);
});

test('the selected entry: its line marked >, entryAt names it; other lines -1 or their entry', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  assert.equal(v.entries, 3);
  assert.equal(v.selected, 2);
  const at = lineOf(L, /^> 2 /);
  assert.equal(v.entryAt[at], 2);
  assert.equal(v.entryAt[lineOf(L, /^ {2}0 {2}wire/)], 0);
  assert.equal(v.entryAt[0], -1);
  assert.equal(v.entryAt.length, v.lines.length);
  assert.ok(v.entryAt.filter(i => i >= 0).length === 3);
});

test('§10.2: round 1 selected, then the wire', () => {
  assert.ok(has(texts(view(fixture('wired'), { selected: 1 }).lines), '> 1  red          booking = self.bookings.find_by_id(input.id)'));
  assert.ok(texts(view(fixture('wired'), { selected: 0 }).lines).includes('> 0  wire         bookings: BookingRepository → __init__, command()'));
  // out of range: the default
  assert.equal(view(fixture('wired'), { selected: 9 }).selected, 2);
});

test('§10.3: a proposal is the selected entry; the badge says proposal', () => {
  const v = view(proposed());
  const L = texts(v.lines);
  assert.ok(L.includes('> ◆  proposal     fix the test: not_found'), L.join('\n'));
  assert.ok(has(L, '  2  red          (the same as round 1)'));
  assert.ok(plain(v.short).startsWith('conjure · CancelBooking.handle · ◆ proposal after round 2 of 6'), plain(v.short));
  assert.equal(v.state, 'proposal');
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`), ['a accept', 'r reject']);
});

test('a refused proposal leads the pause: the outcome first, the ✗ entry selected', () => {
  const v = view(refused());
  const L = texts(v.lines);
  assert.ok(L[0].startsWith('Your re-conjure of not_found was refused: it adds `"BAD" is not defined`'), L[0]);
  assert.ok(has(L, '> ✗  refused      fix the test: not_found · it adds'), L.join('\n'));
  assert.equal(v.state, 'paused');
});

test('no wire: no wire line', () => {
  assert.ok(!has(texts(view(fixture('plain')).lines), 'wire'));
});

test('the rows in the view: their columns at the pane\'s width, pressable when keyed', () => {
  const v = view(fixture('wired'));
  assert.equal(v.rows.length, 5);
  assert.deepEqual(texts(v.rows[0].lines), [col('c  continue', '6 more rounds with local, from round 3')]);
  assert.deepEqual(texts(v.rows[2].lines), [col('t  fix the test: not_found', 'hand repository to'), col('', 'command(bookings=repository); you see the'), col('', 'diff')]);
  assert.deepEqual([v.rows[4].key, v.rows[4].label, v.rows[4].pressable], ['a', 'keep round 2', true]);
  const odd = fixture('wired');
  odd.offers = [offer({ choice: 'teleport', label: 'teleport' })];
  const r = view(odd).rows[0];
  assert.equal(r.pressable, false);
  assert.ok(!('key' in r));
});

test('steps are entries: an accepted fix sits between the rounds it divides', () => {
  const L = texts(view(withStep()).lines);
  const at2 = lineOf(L, /^ {2}2 {2}/);
  const atStep = L.indexOf('  ✓  test fixed   not_found → command(bookings=repository)');
  const at3 = lineOf(L, /^> 3 {2}/);
  assert.ok(at2 >= 0 && atStep >= 0 && at3 >= 0, L.join('\n'));
  assert.ok(at2 < atStep && atStep < at3);
});

test('the steps fixture: the wire, the fix and the port method among the rounds; the checker on the refused rounds', () => {
  const L = texts(view(fixture('steps')).lines);
  assert.deepEqual(L.slice(5, 12), [
    'rounds                                                 [ ] page · 0-9 jump',
    '  0  wire         bookings: BookingRepository → __init__, command()',
    '  1  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '  ✓  test fixed   not_found → command(bookings=repository)',
    '  2  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '  ✓  port method  find_by_id → BookingRepository, 3 adapters',
    '> 3  red          booking = self.bookings.find_by_id(input.id)    succeeds',
  ]);
  assert.equal(L[13], 'failing  test_cancel_booking_succeeds             passed before round 1');
  assert.equal(L[18], 'passing  test_cancel_booking_not_found            failed before round 1');
});

test('the failing section is the latest round\'s real failure: the check\'s refusal; the tests as they last ran', () => {
  const p = fixture('wired');
  const msg = 'Cannot access attribute "find_by_id" for class "BookingRepository"';
  for (const r of p.rounds!) {
    r.failed = []; r.failing = []; r.passed = [];
    r.check = `src/bistro/booking/commands/cancel_booking.py: ${msg}`;
  }
  p.failure = { round: 2, kind: 'check', tool: 'pyright', problems: [
    { file: 'src/bistro/booking/commands/cancel_booking.py', line: 30, message: msg },
    { file: 'src/bistro/booking/commands/cancel_booking.py', line: 30, message: 'Type of "booking" is unknown' },
  ] };
  const L = texts(view(p).lines);
  assert.ok(L.includes('failing  round 2 · pyright refused it before the tests ran'), L.join('\n'));
  assert.ok(has(L, '    cancel_booking.py:30  Cannot access attribute "find_by_id"'));
  assert.ok(L.includes('    cancel_booking.py:30  Type of "booking" is unknown'));
  // the tests did not run in the latest round: one dimmed line, their last state
  assert.ok(L.includes('tests    not run in round 2 · before round 1: not_found failing'), L.join('\n'));
  assert.ok(L.includes('         (d details)'));
  assert.ok(!has(L, '    assert isinstance(result, NotFound)'));
  // the rounds say what refused them, on the right
  const refusedBy = (ls: string[]): boolean => ls.some(l => /^ {2}1 {2}red {2}.+ {2}pyright$/.test(l));
  assert.ok(refusedBy(L), L.join('\n'));
  // the before-run's got/expected are no round's failure
  assert.ok(!has(L, '    got       Ok(value=None)'));
  // a later pause whose last round ran its tests still names the checker that refused the earlier rounds
  p.failure = { round: 3, kind: 'tests', tests: [] };
  p.checker = 'pyright';
  assert.ok(refusedBy(texts(view(p).lines)));
});

test('the check fixture: the wall\'s three problems at their place, the stale tests one line', () => {
  const L = texts(view(fixture('check')).lines);
  assert.deepEqual(L.slice(10, 20), [
    '> 1  red          booking = self.bookings.find_by_id(input.id)     pyright',
    '',
    'failing  round 1 · pyright refused it before the tests ran',
    '    cancel_booking.py:30  Cannot access attribute "find_by_id" for class',
    '                          "BookingRepository"',
    '    cancel_booking.py:30  Type of "booking" is unknown',
    '    cancel_booking.py:30  Type of "find_by_id" is unknown',
    '',
    'tests    not run in round 1 · before round 1: not_found failing',
    '         (d details)',
  ]);
});

test('more than three problems: the rest under d', () => {
  const p = fixture('check');
  const f = p.failure as { problems: { file: string; line: number; message: string }[] };
  f.problems.push({ file: 'src/a.py', line: 1, message: 'four' }, { file: 'src/a.py', line: 2, message: 'five' });
  const v = view(p);
  const L = texts(v.lines);
  const at = L.indexOf('    … 2 more (d details)');
  assert.ok(at >= 0, L.join('\n'));
  assert.deepEqual(marked(v.lines[at]), { '… 2 more (': 'dim', d: 'key', ' details)': 'dim' });
});

test('§6.1: the cause bold, the verdicts red, the checker check, the step green, the places place, the stale tests one dimmed line', () => {
  const v = view(wall());
  const L = texts(v.lines);
  const M = v.lines;
  assert.equal(L[0], "BookingRepository has no find_by_id: pyright refuses round 2's body before");
  assert.equal(L[1], 'the tests run (cancel_booking.py:30).');
  assert.deepEqual(marked(M[0]), { [L[0]]: 'strong' });
  assert.deepEqual(marked(M[1]), { [L[1]]: 'strong' });
  const r = lineOf(L, /^rounds/);
  assert.deepEqual(marked(M[r]), { rounds: 'section', '[ ]': 'key', '0-9': 'key', ' page · ': 'dim', ' jump': 'dim' });
  assert.equal(L[r + 1], '  0  wire         bookings: BookingRepository → __init__, command()');
  assert.deepEqual(marked(M[r + 1]), { 0: 'key', wire: 'strong' });
  assert.equal(L[r + 2], '  1  red          booking = self.bookings.find_by_id(input.id)     pyright');
  assert.deepEqual(marked(M[r + 2]), { 1: 'key', red: 'red', pyright: 'check' });
  assert.equal(L[r + 3], '  ✓  test fixed   not_found → command(bookings=repository)');
  assert.deepEqual(marked(M[r + 3]), { '✓': 'green', 'test fixed': 'strong' });
  assert.equal(L[r + 4], '> 2  red          booking = self.bookings.find_by_id(input.id)     pyright');
  assert.deepEqual(marked(M[r + 4]), { 2: 'key', red: 'red', pyright: 'check' });
  assert.equal(v.entryAt[r + 4], v.selected);
  const f = lineOf(L, /^failing/);
  assert.equal(L[f], 'failing  round 2 · pyright refused it before the tests ran');
  assert.deepEqual(marked(M[f]), { failing: 'red', pyright: 'check' });
  assert.equal(L[f + 1], '    cancel_booking.py:30  Cannot access attribute "find_by_id" for class');
  assert.equal(L[f + 2], '                          "BookingRepository"');
  assert.deepEqual(marked(M[f + 1]), { 'cancel_booking.py:30': 'place' });
  const t = lineOf(L, /^tests /);
  assert.equal(L[t], 'tests    not run in round 2 · before round 1: not_found failing, succeeds');
  assert.equal(L[t + 1], '         passing (d details)');
  assert.equal(marked(M[t]).tests, 'section');
  assert.equal(marked(M[t])['not run in round 2 · before round 1: not_found failing, succeeds'], 'dim');
  assert.deepEqual(marked(M[t + 1]), { 'passing (': 'dim', d: 'key', ' details)': 'dim' });
  for (const l of L) assert.ok(width(l) <= W, l);
});

test('the tests that ran: the status words red and green, got red, expected green, their labels dimmed', () => {
  const v = view(fixture('wired'));
  const L = texts(v.lines);
  const f = lineOf(L, /^failing {2}test_/);
  assert.equal(marked(v.lines[f]).failing, 'red');
  assert.equal(marked(v.lines[f])['failed before round 1'], 'dim');
  const got = lineOf(L, /^ {4}got /);
  assert.deepEqual(marked(v.lines[got]), { got: 'dim', 'Ok(value=None)': 'red' });
  assert.deepEqual(marked(v.lines[got + 1]), { expected: 'dim', NotFound: 'green' });
  const pass = lineOf(texts(view(fixture('plain')).lines), /^passing/);
  assert.equal(marked(view(fixture('plain')).lines[pass]).passing, 'green');
});

test('a failure without got/expected: error, its summary, the line', () => {
  const p = fixture('wired');
  const f = p.rounds![1].failed[0];
  f.got = null; f.expected = null; f.message = 'TypeError: boom'; f.summary = 'boom'; f.at = 26;
  const v = view(p);
  const at = texts(v.lines).indexOf('    error     boom · line 26');
  assert.ok(at >= 0, texts(v.lines).join('\n'));
  assert.deepEqual(marked(v.lines[at]), { error: 'dim', boom: 'red', ' · line 26': 'dim' });
});

test('more than three failing tests: the rest under d', () => {
  const p = fixture('wired');
  const t = p.tests![0];
  p.tests = [1, 2, 3, 4, 5].map(i => ({ ...t, test: `x__test.py::test_${i}`, note: null, assertion: null }));
  const L = texts(view(p).lines);
  assert.ok(L.includes('  … and 2 more (d details)'), L.join('\n'));
  assert.ok(!has(L, 'test_4'));
});

test('a test\'s lines past six end in … (d details)', () => {
  const p = fixture('wired');
  p.rounds![1].failed[0].got = null;
  p.rounds![1].failed[0].message = ['assert False', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7'].join('\n');
  const L = texts(view(p).lines);
  const at = L.indexOf('    assert False');
  assert.ok(at >= 0, L.join('\n'));
  // six lines: the assertion, then the message's first five
  assert.equal(L[at - 1], '    assert isinstance(result, NotFound)');
  assert.deepEqual(L.slice(at, at + 6), ['    assert False', '    line 2', '    line 3', '    line 4', '    line 5', '    … (d details)']);
});

test('more than nine entries: nine around the selection, the rest paged (Review Focus 2)', () => {
  const v = view(many());
  const L = texts(v.lines);
  assert.ok(L.includes('  … 6 earlier ([ pages)'), L.join('\n'));
  assert.ok(has(L, '> 14  red          return 14'), L.join('\n'));
  assert.deepEqual(marked(v.lines[L.indexOf('  … 6 earlier ([ pages)')]), { '  … 6 earlier (': 'dim', '[': 'key', ' pages)': 'dim' });
  // a number past 9 is no jump key: dimmed
  assert.equal(marked(v.lines[lineOf(L, /^> 14/)])['14'], 'dim');
  const mid = texts(view(many(), { selected: 3 }).lines);
  assert.ok(mid.includes('  … 6 later (] pages)'), mid.join('\n'));
  assert.ok(has(mid, '  0  wire'), mid.join('\n'));
  assert.equal(view(many()).entries, 15);
});

test('a thin answer renders: no lines, no rows, every line in a 58-cell pane (Review Focus 3)', () => {
  const v = view(thin(), { cols: 124 });
  assert.equal(plain(v.title), 'conjure · ● paused');
  assert.equal(v.tab, 'conjure');
  assert.deepEqual(v.lines, []);
  assert.deepEqual(v.rows, []);
  assert.equal(v.selected, -1);
  assert.equal(v.entries, 0);
  const n = view(fixture('wired'), { cols: 124 });
  assert.equal(n.width, 58);
  for (const l of texts(n.lines)) assert.ok(width(l) <= 58, l);
  for (const r of n.rows) for (const l of texts(r.lines)) assert.ok(width(l) <= 58, l);
  for (const name of ['plain', 'steps', 'check'] as const) {
    for (const l of texts(view(fixture(name), { cols: 124 }).lines)) assert.ok(width(l) <= 58, `${name}: ${l}`);
  }
});

test('§6.2: the proposal waits: its badge, its entry', () => {
  const q = wall();
  q.proposal = { kind: 'port', file: 'src/bistro/booking/ports/booking_repository/booking_repository.py', test: 'BookingRepository.find_by_id', refused: null,
    files: ['src/bistro/booking/ports/booking_repository/booking_repository.py', 'a.py', 'b.py'],
    diff: '--- a/x.py\n+++ b/x.py\n@@ -30,1 +30,3 @@\n     def save(self, booking: Booking) -> None: ...\n+\n+    def find_by_id(self, id: str) -> Booking | None: ...\n' };
  q.offers = [{ choice: 'accept', label: 'accept', detail: 'the method lands with the conjure; round 3 runs against it' }, { choice: 'reject', label: 'reject', detail: 'back to the rows; the port stands as it was' }];
  const v = view(q);
  assert.deepEqual(v.short, [
    { text: 'conjure · CancelBooking.handle · ', kind: 'title' },
    { text: '◆ proposal', kind: 'proposal' },
    { text: ' after round 2 of 6 · local · 31 s', kind: 'dim' },
  ]);
  const L = texts(v.lines);
  const e = lineOf(L, /^> ◆/);
  assert.equal(L[e], '> ◆  proposal     add find_by_id to BookingRepository → port, 2 adapters');
  assert.deepEqual(marked(v.lines[e]), { '◆': 'proposal', proposal: 'strong' });
  assert.equal(v.entryAt[e], v.selected);
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at `tsc`: `has no exported member 'conjureView'` and `has no exported member 'layout'`.

- [ ] **Step 11: Write the layout, the titles, the situation lines and a first conjureView**

Append to `src/pause/model.ts` (the running parts of the title and the rounds list are part of the ported `situation()` and come with it; Step 17 pins them):

```ts
// Chunks with their neighbours of one kind joined, the empty ones dropped.
function joined(chunks: Chunk[]): Line {
  const out: Span[] = [];
  for (const [t, k] of chunks) {
    if (t === '') continue;
    const last = out[out.length - 1];
    if (last && last.kind === k) last.text += t;
    else out.push(k ? { text: t, kind: k } : { text: t });
  }
  return out;
}

const lineText = (l: Line): string => l.map(s => s.text).join('');

// LINE cut to W display cells, ending in … when cut.
function cutLine(l: Line, w: number): Line {
  const full = lineText(l);
  if (width(full) <= w) return l;
  const keep = cut(full, w).length - 1;
  const out: Span[] = [];
  let used = 0;
  for (const s of l) {
    if (used >= keep) break;
    const part = s.text.slice(0, keep - used);
    out.push(s.kind ? { text: part, kind: s.kind } : { text: part });
    used += part.length;
  }
  if (out.length === 0) out.push({ text: '' });
  out[out.length - 1].text += '…';
  return out;
}

// ---------------------------------------------------------------------------------------
// the situation pane (pause.lua situation :590-789)

// The spinner's glyph: the page turns it (kind 'spinner').
const SPIN = '⠋';
const VERDICT: Record<string, SpanKind> = { red: 'red', green: 'green' };

// layout: the panel's geometry from its width in cells (pause.lua geometry :922-934). right is
// the diff pane's width: the whole panel when narrow (one pane at a time).
export function layout(cols: number): { narrow: boolean; text: number; right: number } {
  const w = Math.min(cols - 4, 150);
  const narrow = cols < 110;
  const left = narrow ? w : Math.max(60, Math.floor(w * 0.52));
  return { narrow, text: left - 4, right: narrow ? w : w - left };
}

// A test's last failure in the rounds.
function failureOf(p: Paused, id: string): PausedFailed | undefined {
  const rs = list(p.rounds);
  for (let i = rs.length - 1; i >= 0; i--) {
    for (const f of list(rs[i].failed)) if (f.test === id) return f;
  }
  return undefined;
}

// The lines under one involved test's status line, at most 6 (then `… (d details)`): got in
// red, expected in green, their labels dimmed.
function testLines(p: Paused, t: PausedTest, w: number): Sheet {
  const s = new Sheet();
  const labelled = (label: string, value: string, kind: SpanKind, tail?: string): void => {
    const head = `    ${label.padEnd(10)}`;
    const text = head + value + (tail ?? '');
    if (width(text) <= w) {
      s.put([['    '], [label, 'dim'], [rep(10 - label.length)], [value, kind], [tail ?? '', 'dim']]);
      return;
    }
    wrap(text, w, '      ').forEach((l, i) => {
      const n = s.put([[l]]);
      const len = s.rows[n].text.length;
      if (i === 0) {
        s.mark(n, 4, 4 + label.length, 'dim');
        s.mark(n, head.length, len, kind);
      } else {
        s.mark(n, 6, len, kind);
      }
    });
  };
  const plainLine = (text: string): void => {
    if (width(text) <= w) s.put([[text]]);
    else s.wrapped(text, w, '      ');
  };
  if (given(t.assertion)) plainLine(`    ${t.assertion}`);
  if (t.status === 'failing') {
    const f = failureOf(p, t.test);
    if (f) {
      const message = str(f.message);
      const first = message.split('\n')[0];
      if (given(f.got) && given(f.expected)) {
        labelled('got', String(f.got), 'red');
        labelled('expected', String(f.expected), 'green');
      } else if (!first.startsWith('assert')) {
        labelled('error', given(f.summary) ? String(f.summary) : first, 'red', given(f.at) ? ` · line ${f.at}` : undefined);
      } else {
        for (const l of message.split('\n')) plainLine(`    ${l}`);
      }
    }
  }
  if (given(t.note)) s.wrapped(`    ${t.note}`, w, '    ');
  if (s.rows.length > 6) {
    const out = new Sheet();
    out.append(s, 6);
    out.dim(out.put([['    … (d details)']]), 4);
    return out;
  }
  return s;
}

interface Titles { full: Line; short: Line; bare: Line }

// The title: the unit, the state's badge (§3.5), then the facts dimmed; the short one drops
// the model, the bare one the seconds too.
function titles(p: Paused, entry: PauseEntry | undefined, narrow: boolean, running: Running | undefined): Titles {
  const t = given(p.title) ? p.title : {};
  const head = ['conjure'];
  if (given(t.unit)) head.push(String(t.unit));
  const round = given(t.round) ? t.round : given(p.round) ? p.round : undefined;
  const of = given(t.of) ? ` of ${t.of}` : '';
  let badge: Chunk[];
  let after: string;
  if (running) {
    badge = [[SPIN, 'spinner'], [' running', 'running']];
    after = running.round !== undefined ? ` · round ${running.round}${of}` : round !== undefined ? ` after round ${round}${of}` : '';
  } else if (entry && entry.kind === 'proposal') {
    badge = [['◆ proposal', 'proposal']];
    after = round !== undefined ? ` after round ${round}${of}` : '';
  } else {
    badge = [['● paused', 'paused']];
    after = round !== undefined ? ` after round ${round}${of}` : '';
  }
  const rung = given(t.rung) ? t.rung : given(p.rung) ? p.rung : undefined;
  const seconds = given(t.seconds) ? (num(t.seconds) ?? 0) + (running ? running.seconds : 0) : undefined;
  const facts = (model: boolean, secs: boolean): string => {
    let f = after;
    if (rung !== undefined) f += ` · ${rung}${model && given(t.model) ? ` (${t.model})` : ''}`;
    if (secs && seconds !== undefined) f += ` · ${seconds} s`;
    return f;
  };
  const titleOf = (model: boolean, secs: boolean): Line =>
    joined([[`${head.join(' · ')} · `, 'title'], ...badge, [facts(model, secs), 'dim']]);
  return { full: titleOf(!narrow, true), short: titleOf(false, true), bare: titleOf(false, false) };
}

// The situation's lines at W cells: the outcome, the diagnosis, the rounds list (nine entries
// around SEL, the rest paged), the tests or the check's refusal. entryAt[i]: the entry line i
// shows, -1 none.
function situationLines(p: Paused, w: number, es: PauseEntry[], sel: number, running: Running | undefined): { lines: Line[]; entryAt: number[] } {
  const s = new Sheet();
  const at = new Map<number, number>();

  // what the person's last choice came to (a refused re-conjure), first
  if (given(p.outcome)) {
    s.wrapped(String(p.outcome), w);
    s.blank();
  }
  // why it stopped: the cause's sentence on its own and bold, the rest after a blank line
  const diagnosis = p.diagnosis;
  const sentences = Array.isArray(diagnosis) && diagnosis.length > 0 ? diagnosis : given(p.why) ? [p.why] : [];
  if (sentences.length > 0) {
    s.wrapped(String(sentences[0]), w, '', 'strong');
    if (sentences.length > 1) {
      s.blank();
      s.wrapped(sentences.slice(1).join(' '), w);
    }
    s.blank();
  }

  // the rounds list: nine entries around the selection, verdict first (§5)
  const failure = given(p.failure) ? p.failure : undefined;
  if (es.length > 0) {
    const jump = es[0].kind === 'wire' ? '0-9' : '1-9';
    const right = `[ ] page · ${jump} jump`;
    s.put([['rounds', 'section'], [rep(Math.max(w - 6 - width(right), 1))], ['[ ]', 'key'], [' page · ', 'dim'], [jump, 'key'], [' jump', 'dim']]);
    const from = Math.max(0, Math.min(sel - 4, es.length - 9));
    const to = Math.min(es.length - 1, from + 8);
    let numw = 1;
    for (let i = from; i <= to; i++) { const n = es[i].n; if (n !== undefined) numw = Math.max(numw, String(n).length); }
    if (running?.round !== undefined) numw = Math.max(numw, String(running.round).length);
    // one entry: the mark, its number (or glyph), its kind column, its body cut at its end,
    // what failed it on the right at 70 cells and wider
    const row = (mark: string, n: string, nKind: SpanKind, label: string, labelKind: SpanKind, body: string, bodyKind?: SpanKind, what?: string, whatKind?: SpanKind): number => {
      const lead = `${mark} ${rep(numw - width(n))}`;
      const kind = label + rep(Math.max(12 - width(label), 0) + 1);
      const used = width(`${lead}${n}  ${kind}`);
      const tail = what && what !== '' && w >= 70 ? what : undefined;
      const room = Math.max(w - used - (tail ? 2 + width(tail) : 0), 8);
      const b = cut(body, room);
      const chunks: Chunk[] = [[lead], [n, nKind], ['  '], [label, labelKind], [kind.slice(label.length)], [b, bodyKind]];
      if (tail) {
        chunks.push([rep(Math.max(w - used - width(b) - width(tail), 2))]);
        chunks.push([tail, whatKind]);
      }
      return s.put(chunks, w);
    };
    if (from > 0) s.put([[`  … ${from} earlier (`, 'dim'], ['[', 'key'], [' pages)', 'dim']]);
    for (let i = from; i <= to; i++) {
      const e = es[i];
      const mark = i === sel ? '>' : ' ';
      let n: number;
      if (e.kind === 'round' && e.round) {
        const r = e.round;
        const failingNames = list(r.failing);
        // a round the check refused before its tests ran: the check's name, in the wall's colour
        const checked = failingNames.length === 0 && given(r.check);
        const tool = failure && failure.kind === 'check' ? failure.tool : (failure as { tool?: unknown } | undefined)?.tool;
        const what = checked ? (given(p.checker) ? String(p.checker) : given(tool) ? String(tool) : 'check') : failingNames.join(', ');
        n = row(mark, e.n !== undefined ? String(e.n) : '?', e.n !== undefined && e.n <= 9 ? 'key' : 'dim', e.label, VERDICT[e.label] ?? 'dim', e.body, undefined,
          what, checked ? 'check' : undefined);
      } else if (e.kind === 'wire') {
        n = row(mark, '0', 'key', 'wire', 'strong', e.body);
      } else if (e.kind === 'step') {
        n = row(mark, '✓', 'green', e.label, 'strong', e.body);
      } else if (e.kind === 'refused') {
        n = row(mark, '✗', 'red', 'refused', 'red', e.body);
      } else if (running?.accepted && given(p.proposal)) {
        // accepted: in force for the round going on, a step as the next pause will say it
        const pr = p.proposal;
        const [label, b] = stepColumns({ kind: pr.kind === 'port' ? 'port' : 'test', text: given(pr.step) ? pr.step : e.body, files: pr.files });
        n = row(mark, '✓', 'green', label, 'strong', b);
      } else {
        n = row(mark, '◆', 'proposal', 'proposal', 'strong', e.body);
      }
      at.set(n, i);
    }
    if (to < es.length - 1) s.put([[`  … ${es.length - 1 - to} later (`, 'dim'], [']', 'key'], [' pages)', 'dim']]);
    // a run going on: its round, the spinner turning, what it is doing
    if (running?.round !== undefined) {
      const message = (running.message ?? 'starting…').replace(/^round \d+ of \d+ · /, '').replace(/^round \d+ · /, '');
      row(' ', String(running.round), running.round <= 9 ? 'key' : 'dim', SPIN, 'spinner', message, 'running');
    }
    s.blank();
  }

  const tests = list(p.tests);
  if (failure && failure.kind === 'check') {
    // the latest round's real failure: the check that refused its body before the tests ran
    const tool = str(failure.tool, 'the check');
    s.put([['failing', 'red'], [`  round ${str(failure.round, '?')} · `], [tool, 'check'], [' refused it before the tests ran']], w);
    const problems = list(failure.problems);
    for (let i = 0; i < problems.length; i++) {
      if (i >= 3) {
        s.dim(s.put([[`    … ${problems.length - 3} more (d details)`]]), 4);
        break;
      }
      const pr = problems[i];
      const where = basename(str(pr.file, '?')) + (given(pr.line) ? `:${pr.line}` : '');
      const indent = 4 + width(where) + 2;
      wrap(str(pr.message), Math.max(w - indent, 20)).forEach((l, j) => {
        if (j === 0) s.put([['    '], [where, 'place'], [`  ${l}`]], w);
        else s.put([[rep(indent) + l]], w);
      });
    }
    s.blank();
    // the tests did not run in that round: one dimmed line, their last state
    if (tests.length > 0) {
      let last = 0;
      for (const r of list(p.rounds)) {
        if (list(r.failed).length + list(r.passed).length > 0) last = num(r.round) ?? last;
      }
      const states = tests.map(x => `${shortName(p, x.test)} ${x.status}`);
      const text = `not run in round ${str(failure.round, '?')} · ${last === 0 ? 'before round 1' : `in round ${last}`}: ${states.join(', ')} (d details)`;
      // `(d details)` stays on one line (U+E000 holds its space through the wrap)
      wrap(text.replaceAll('(d details)', '(ddetails)'), w - 9).forEach((l, j) => {
        const n = s.put([[(j === 0 ? 'tests    ' : rep(9)) + l.replaceAll('', ' ')]]);
        if (j === 0) s.mark(n, 0, 5, 'section');
        s.dim(n, 9);
      });
    }
  } else {
    // the tests involved, failing first (at most 3), then passing
    const failing = tests.filter(x => x.status === 'failing');
    const passing = tests.filter(x => x.status !== 'failing');
    const show = (x: PausedTest): void => {
      const n = num(x.flipped);
      let flipped: string;
      if (n !== undefined) {
        const was = x.status === 'failing' ? 'passed' : 'failed';
        flipped = n === 0 ? `${was} before round 1` : `${was} in round ${n}`;
      } else {
        flipped = x.status === 'failing' ? 'failed before round 1' : '';
      }
      const room = Math.max(Math.min(40, w - 7 - 2 - 1 - width(flipped)), 8);
      const status = String(x.status);
      s.put([[status, x.status === 'failing' ? 'red' : 'green'], [`${rep(7 - status.length)}  ${pad(cut(lastPart(x.test), room), room)} `], [flipped, 'dim']], w);
      s.append(testLines(p, x, w));
      s.blank();
    };
    for (let i = 0; i < failing.length; i++) {
      if (i >= 3) {
        s.dim(s.put([[`  … and ${failing.length - 3} more (d details)`]]), 2);
        s.blank();
        break;
      }
      show(failing[i]);
    }
    for (const x of passing) show(x);
  }
  while (s.rows.length > 0 && s.rows[s.rows.length - 1].text === '') s.rows.pop();
  return { lines: s.lines(), entryAt: s.rows.map((_, i) => at.get(i) ?? -1) };
}

// conjureView: the whole View for a paused payload at COLS cells, entry SELECTED (0-based; out
// of range: the default), a run going on, the narrow pane flipped, the help shown.
export function conjureView(p: Paused, o: { cols: number; selected: number; running?: Running; flipped: boolean; help: boolean; chord: string }): View {
  const g = layout(o.cols);
  const running = o.running;
  const es = entries(p);
  const sel = o.selected >= 0 && o.selected < es.length ? o.selected : defaultSelected(es);
  const entry = sel >= 0 ? es[sel] : undefined;
  const t = titles(p, entry, g.narrow, running);
  // the title fits the pane: the model goes first, then the seconds, then it is cut
  let title = t.bare;
  for (const c of [t.full, t.short]) if (width(lineText(c)) <= g.text) { title = c; break; }
  const sit = situationLines(p, g.text, es, sel, running);
  const rs = rows(p, entry, g.narrow);
  const rl = rowLines(rs, g.text);
  return {
    state: running ? 'running' : entry?.kind === 'proposal' ? 'proposal' : 'paused',
    tab: `conjure${given(p.title?.unit) ? ` · ${p.title?.unit}` : ''}`,
    title: cutLine(title, Math.max(g.text, 8)),
    short: t.short,
    lines: sit.lines,
    entryAt: sit.entryAt,
    entries: es.length,
    selected: sel,
    rows: rs.map((r, i): Row => {
      const row: Row = { label: r.label, detail: r.detail, pressable: r.pressable, lines: rl.lines.slice(rl.starts[i], rl.starts[i + 1] ?? rl.lines.length) };
      if (r.key !== undefined) row.key = r.key;
      return row;
    }),
    diff: { title: [], lines: [] },
    legend: '',
    narrow: g.narrow,
    flipped: g.narrow && o.flipped,
    width: g.text,
  };
}
```

- [ ] **Step 12: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS (50 model tests).

- [ ] **Step 13: Write the failing tests for the diff pane, the reason, the legend and the help**

Replace the import block with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import type { Line, View } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { conjureKeys, conjureLegend, conjureView, defaultSelected, entries, helpLines, layout, NO_ROW, noRow, rowLines, rows, shortName } from '../../src/pause/model';
import type { PauseRow } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';
```

Append:

```ts
// --- the diff pane, the reason, the legend and the help

test('§10.1: the right pane: round 2\'s change, every file it lands; the legend', () => {
  const v = view(fixture('wired'));
  const D = texts(v.diff.lines);
  assert.equal(plain(v.diff.title), 'round 2 · a keeps this · cancel_booking.py, cancel_booking__test.py');
  assert.equal(D[0], '(the same body as round 1: the diff is the same)');
  assert.equal(D[1], '--- a/src/bistro/booking/commands/cancel_booking.py');
  assert.ok(D.includes('+        booking = self.bookings.find_by_id(input.id)'));
  assert.ok(D.includes('--- a/src/bistro/booking/commands/cancel_booking__test.py'));
  // the whole legend is wider than the 74-cell pane: its short form (the page wraps it)
  assert.equal(v.legend, '[ ] rounds · 0-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('the diff title\'s keys in the key colour', () => {
  assert.deepEqual(view(fixture('wired')).diff.title, [
    { text: 'round 2 · ', kind: 'title' },
    { text: 'a', kind: 'key' },
    { text: ' keeps this · cancel_booking.py, cancel_booking__test.py', kind: 'title' },
  ]);
});

test('§10.2: round 1, then the wire: the diff follows the selection', () => {
  const g = view(fixture('wired'), { selected: 1 });
  assert.equal(plain(g.diff.title), 'round 1 · a keeps this · cancel_booking.py, cancel_booking__test.py');
  assert.equal(plain(g.diff.lines[0]), '(the same body as round 2: the diff is the same)');
  const w = view(fixture('wired'), { selected: 0 });
  // the wire's title is wider than the 72-cell diff pane: cut with …
  assert.equal(plain(w.diff.title), 'before round 1 · the wire · cancel_booking.py (+import, +bookings i…');
  const D = texts(w.diff.lines);
  assert.equal(D[0], '--- a/src/bistro/booking/commands/cancel_booking.py');
  assert.ok(!D.includes('+        booking = self.bookings.find_by_id(input.id)'));
  assert.ok(D.includes('--- a/src/bistro/booking/commands/cancel_booking__test.py'));
});

test('narrow: the diff pane takes the panel\'s width, its title cut there', () => {
  const w = view(fixture('wired'), { selected: 0, cols: 109 });
  assert.equal(plain(w.diff.title), 'before round 1 · the wire · cancel_booking.py (+import, +bookings in __init__), cancel_booking__test.py (+import, command takes bookings) · Tab back'.slice(0, 100) + '…');
});

test('§10.3: a proposal\'s diff on the right, its reason above its rows; no jump in the legend', () => {
  const v = view(proposed());
  assert.equal(plain(v.diff.title), 'proposal · fix the test: not_found · a accept · r reject');
  assert.equal(plain(v.diff.lines[5]), '-    cancel_booking = command()');
  assert.deepEqual(v.reason, [{ text: 'not_found now: cancel_booking = command(bookings=repository)', kind: 'strong' }]);
  assert.equal(conjureLegend({ narrow: false, proposal: true, running: false, wire: true }),
    '[ ] rounds · j k PgDn PgUp scroll · d details · ? help · q close (the pause stays)');
  // wider than the pane: the short form
  assert.equal(v.legend, '[ ] rounds · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('a refused proposal: the refusal first in the diff pane, red; a accepts it anyway', () => {
  const v = view(refused());
  assert.equal(plain(v.diff.title), 'proposal · fix the test: not_found, refused · a accept anyway');
  assert.deepEqual(v.diff.lines[0], [{ text: 'refused: it adds `"BAD" is not defined` at line 23', kind: 'red' }]);
  assert.deepEqual(v.diff.lines[1], []);
  assert.equal(plain(v.diff.lines[2]), '--- a/src/bistro/booking/commands/cancel_booking__test.py');
  assert.equal(v.reason, undefined);
});

test('a refusal whose reason is several lines is that many lines, all red', () => {
  const p = refused();
  const why = [
    'it adds `Argument of type "InMemoryBookingRepository" cannot be assigned to parameter "bookings"',
    '  Type "InMemoryBookingRepository" is not assignable to type "BookingRepository | None"',
    '    "size" is not present` at line 26',
  ].join('\n');
  p.proposal!.refused = why;
  const v = view(p);
  assert.deepEqual(texts(v.diff.lines.slice(0, 3)), [`refused: ${why.split('\n')[0]}`, ...why.split('\n').slice(1)]);
  assert.ok(v.diff.lines.slice(0, 3).every(l => l[0].kind === 'red'));
  for (const l of texts(v.lines)) assert.ok(!l.includes('\n'), l);
});

test('the diff pane\'s own notes: the same body dimmed', () => {
  assert.deepEqual(view(fixture('wired')).diff.lines[0], [{ text: '(the same body as round 1: the diff is the same)', kind: 'dim' }]);
  assert.deepEqual(view(fixture('wired')).diff.lines[1], [{ text: '--- a/src/bistro/booking/commands/cancel_booking.py' }]);
});

test('a round with no diff of its own shows the landing; with none at all, the body is your text (spec §7)', () => {
  // plain's round 1: its diff and its file's diff are empty text
  const p = fixture('plain');
  const v = view(p, { selected: 0 });
  assert.equal(plain(v.diff.title), 'round 1 · a keeps this · cancel_booking.py');
  assert.equal(plain(v.diff.lines[0]), '--- a/src/bistro/booking/commands/cancel_booking.py');
  delete p.landing;
  const n = view(p, { selected: 0 });
  assert.equal(plain(n.diff.title), 'round 1 · a keeps this');
  assert.deepEqual(texts(n.diff.lines), ['(none: the body is your text)']);
  assert.equal(n.rows[n.rows.length - 1].label, 'keep round 1');
});

test('steps: the step\'s files, after the round it follows; a hint step has no file', () => {
  const s = view(withStep(), { selected: 3 });
  assert.equal(plain(s.diff.title), 'after round 2 · test fixed: not_found (command(bookings=repository))');
  assert.ok(texts(s.diff.lines).includes('+    cancel_booking = command(bookings=repository)'));
  const h = withStep();
  h.steps!.push({ after: 0, kind: 'hint', text: 'hint: use the repository', files: [] });
  const hv = view(h, { selected: 1 });
  assert.ok(texts(hv.lines).includes('> ✓  hint         use the repository'), texts(hv.lines).join('\n'));
  assert.equal(plain(hv.diff.title), 'before round 1 · hint: use the repository');
  assert.deepEqual(texts(hv.diff.lines), ['(no file: it goes to the model with every round from here on)']);
});

test('a thin answer: nothing to show yet', () => {
  const v = view(thin(), { cols: 124 });
  assert.equal(plain(v.diff.title), 'nothing to show yet');
  assert.deepEqual(texts(v.diff.lines), ['nothing to show yet']);
  assert.equal(v.legend, '[ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('§10.5: narrow — Tab in the legend, the keep row and the diff title', () => {
  const v = view(fixture('wired'), { cols: 98 });
  assert.equal(v.legend, 'Tab diff · [ ] rounds · 0-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
  assert.equal(v.rows[v.rows.length - 1].detail, 'lands the diff (Tab shows it), red (saved; u undoes it)');
  assert.equal(plain(v.diff.title), 'round 2 · a keeps this · cancel_booking.py, cancel_booking__test.py · Tab back');
  assert.deepEqual(v.diff.title.slice(-2), [{ text: 'Tab', kind: 'key' }, { text: ' back', kind: 'title' }]);
  assert.equal(conjureLegend({ narrow: true, proposal: true, running: false, wire: false }),
    'Tab diff · [ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close');
});

test('no wire: 1-9 in the legend', () => {
  assert.equal(conjureLegend({ narrow: false, proposal: false, running: false, wire: false }),
    '[ ] rounds · 1-9 jump · j k PgDn PgUp scroll · d details · ? help · q close (the pause stays)');
});

test('the port proposal: its title, the signature as its reason, not the Protocol\'s stub body', () => {
  const s = view(portProposal());
  assert.ok(has(texts(s.lines), '> ◆  proposal     add find_by_id to BookingRepository → port, 2 adapters'));
  assert.equal(plain(s.diff.title), 'proposal · add find_by_id to BookingRepository · a accept · r reject');
  assert.deepEqual(s.reason, [{ text: 'BookingRepository now: def find_by_id(self, id: str) -> Booking | None', kind: 'strong' }]);
});

test('§6.2: the diff title\'s keys and the proposal word in their colours', () => {
  assert.deepEqual(view(portProposal()).diff.title, [
    { text: 'proposal', kind: 'proposal' },
    { text: ' · add find_by_id to BookingRepository · ', kind: 'title' },
    { text: 'a', kind: 'key' },
    { text: ' accept · ', kind: 'title' },
    { text: 'r', kind: 'key' },
    { text: ' reject', kind: 'title' },
  ]);
});

test('§10.6: ? lists every key, one a line, its words wrapped under themselves', () => {
  const h = texts(helpLines(68, conjureKeys(CHORD)));
  assert.equal(h[0], 'keys');
  for (const k of ['c ', 'h ', 'C ', 'w W', 't T', 'p P', 's ', 'a ', 'r ', '[ ]', '0-9', 'Tab', 'd ', 'x ', 'j k', 'PgDn PgUp', 'q Esc']) {
    assert.ok(has(h, `  ${k}`), k);
  }
  assert.ok(has(h, 'scroll the diff'));
  assert.ok(has(h, 'close; the pause stays, Cmd+Alt+D C reopens it'));
  assert.ok(has(h, 'add the method a port lacks'));
  for (const l of h) assert.ok(width(l) <= 68, l);
  assert.deepEqual(h.slice(6, 8), [
    '  p P       add the method a port lacks (the first / second; the',
    "            pack's port-method), then the rounds go on",
  ]);
  const narrow = texts(helpLines(36, conjureKeys(CHORD)));
  narrow.forEach((l, i) => {
    assert.ok(width(l) <= 36, l);
    if (i > 0) assert.ok(/^ {2}\S/.test(l) || /^ {12}\S/.test(l), l);
  });
  assert.ok(narrow.length > h.length);
});

test('? is built from the one keys table: its section word, its key column', () => {
  const keys = conjureKeys(CHORD);
  const h = helpLines(68, keys);
  assert.deepEqual(marked(h[0]), { keys: 'section' });
  assert.deepEqual(marked(h[1]), { c: 'key' });
  assert.deepEqual(marked(h[texts(h).findIndex(l => l.startsWith('  q Esc'))]), { 'q Esc': 'key' });
  assert.equal(h.length, 1 + keys.length + 1); // p P takes two lines at 68
  assert.deepEqual(keys.map(k => k.keys.join(' ')), ['c', 'h', 'C', 'w W', 't T', 'p P', 's', 'a', 'r', '[ ]', '0-9', 'j k', 'PageDown PageUp', 'Tab', 'd', 'x', 'q Escape', '?']);
});

test('help: the view carries the key table at the diff pane\'s width; the diff title says any key closes it', () => {
  const v = view(fixture('wired'), { help: true });
  assert.deepEqual(v.help, helpLines(68, conjureKeys(CHORD)));
  assert.deepEqual(v.diff.title, [{ text: 'keys', kind: 'section' }, { text: ' · any key closes this', kind: 'title' }]);
  assert.equal(view(fixture('wired')).help, undefined);
  const n = view(fixture('wired'), { help: true, cols: 98 });
  assert.deepEqual(n.help, helpLines(90, conjureKeys(CHORD)));
});
```

- [ ] **Step 14: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at `tsc`: `has no exported member 'conjureKeys'`, `'conjureLegend'`, `'helpLines'`.

- [ ] **Step 15: Write the diff pane, the reason, the legend and the help; conjureView fills them**

In `src/pause/model.ts`, insert before the `// conjureView:` comment:

```ts
// ---------------------------------------------------------------------------------------
// the diff pane, the reason, the legend and the help (pause.lua :563-583, :791-875, :1095-1156)

// Every file keeping round R lands, as one diff; the landing when the round carries none.
function roundDiff(p: Paused, r: PausedRound | undefined): string {
  const parts: string[] = [];
  for (const f of list(r?.files)) {
    const d = str(f.diff);
    if (d !== '') parts.push(d.replace(/\n$/, ''));
  }
  if (parts.length === 0 && r && given(r.diff) && r.diff !== '') parts.push(String(r.diff).replace(/\n$/, ''));
  if (parts.length === 0) {
    const landing = p.landing;
    if (given(landing) && typeof landing === 'object' && given(landing.diff)) parts.push(String(landing.diff).replace(/\n$/, ''));
  }
  return parts.join('\n');
}

// The file names a diff touches, in order, as their last path part.
function diffFiles(diff: string): string[] {
  const names: string[] = [];
  for (const l of diff.split('\n')) {
    const f = /^--- a\/(.+)$/.exec(l)?.[1] ?? /^\+\+\+ b\/(.+)$/.exec(l)?.[1];
    if (f) {
      const name = basename(f);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

// The diff pane's title as spans: its keys (`a keeps this`, `a accept`, `r reject`, `Tab
// back`) in the key colour, `proposal` in the proposal's.
function titleSpans(title: string): Line {
  const out: Chunk[] = [];
  title.split(' · ').forEach((part, i) => {
    if (i > 0) out.push([' · ', 'title']);
    const m = /^([ar]) (.+)$/.exec(part);
    if (part === 'proposal') out.push([part, 'proposal']);
    else if (m) out.push([m[1], 'key'], [` ${m[2]}`, 'title']);
    else if (part === 'Tab back') out.push(['Tab', 'key'], [' back', 'title']);
    else out.push([part, 'title']);
  });
  return joined(out);
}

// What the selected entry would land: its title and lines, its own notes first, dimmed (a
// refusal red).
function diffPane(p: Paused, es: PauseEntry[], entry: PauseEntry | undefined, narrow: boolean): { title: string; lines: Line[] } {
  const lines: Line[] = [];
  const note = (text: string, kind: SpanKind = 'dim'): void => {
    for (const l of text.split('\n')) lines.push(l === '' ? [] : [{ text: l, kind }]);
  };
  const push = (text: unknown): void => {
    const ls = str(text).split('\n');
    while (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
    for (const l of ls) lines.push(l === '' ? [] : [{ text: l }]);
  };
  const back = narrow ? ' · Tab back' : '';
  let title: string;
  if (!entry) {
    title = 'nothing to show yet';
    note('nothing to show yet');
  } else if (entry.kind === 'wire') {
    const w = list(p.wired)[0];
    title = `before round 1 · the wire · ${wireFileWords(w)}${back}`;
    for (const f of list(w.files)) push(f.diff);
  } else if (entry.kind === 'step' && entry.step) {
    const after = num(entry.step.after) ?? 0;
    title = `${after === 0 ? 'before round 1' : `after round ${after}`} · ${entry.text}${back}`;
    for (const f of list(entry.step.files)) push(f.diff);
    if (lines.length === 0) note('(no file: it goes to the model with every round from here on)');
  } else if (entry.kind === 'round' && entry.round) {
    const d = roundDiff(p, entry.round);
    const files = diffFiles(d);
    title = `round ${entry.n ?? '?'}${given(entry.round.diff) ? ' · a keeps this' : ''}${files.length > 0 ? ` · ${files.join(', ')}` : ''}${back}`;
    // the same body as another round: said first
    let same = /^\(the same as round (\d+)\)$/.exec(entry.text)?.[1];
    if (!same) {
      const other = es.find(e => e.kind === 'round' && e.text === `(the same as round ${entry.n})`);
      if (other) same = String(other.n);
    }
    if (same) note(`(the same body as round ${same}: the diff is the same)`);
    if (d === '') note('(none: the body is your text)');
    push(d);
  } else {
    const pr = p.proposal!;
    const method = /^[^.]+\.(.+)$/.exec(String(pr.test))?.[1];
    const port = /^([^.]+)\./.exec(String(pr.test))?.[1];
    const label = pr.kind === 'port' ? `add ${method} to ${port}` : `fix the test: ${shortName(p, pr.test)}`;
    if (entry.kind === 'refused') {
      title = `proposal · ${label}, refused · a accept anyway${back}`;
      // a reason of several lines is that many lines
      note(`refused: ${pr.refused}`, 'red');
      lines.push([]);
    } else {
      title = `proposal · ${label} · a accept · r reject${back}`;
    }
    push(pr.diff);
  }
  return { title, lines };
}

// A proposal shown: what it changes, in one line, above its two rows.
function reasonOf(p: Paused, entry: PauseEntry | undefined): string | undefined {
  if (!entry || entry.kind !== 'proposal' || !given(p.proposal)) return undefined;
  const pr = p.proposal;
  const ls = str(pr.diff).split('\n');
  for (const l of ls) {
    if (/^\+[^+]/.test(l) && !/^\+\s*from\s/.test(l) && !/^\+\s*import\s/.test(l)) {
      const who = pr.kind === 'port' ? (/^([^.]+)\./.exec(String(pr.test))?.[1] ?? String(pr.test)) : shortName(p, pr.test);
      // the signature, not a Protocol's stub body
      return `${who} now: ${l.slice(1).trim().replace(/\s*:\s*\.\.\.$/, '').replace(/:$/, '')}`;
    }
  }
  return undefined;
}

const PAUSE_STAYS = ' (the pause stays)';

// legend: the footer for a state (pause.lua :860-869, the running one :1266-1267). The scroll
// keys are the page's: j k a line, PgDn PgUp a page.
export function conjureLegend(o: { narrow: boolean; proposal: boolean; running: boolean; wire: boolean }): string {
  if (o.running) return 'x cancel · q hide (it goes on) · ? help';
  const parts: string[] = [];
  if (o.narrow) parts.push('Tab diff');
  parts.push('[ ] rounds');
  if (o.narrow || !o.proposal) parts.push(`${o.wire ? '0-9' : '1-9'} jump`);
  parts.push('j k PgDn PgUp scroll', 'd details', '? help', 'q close');
  const short = parts.join(' · ');
  return o.narrow ? short : short + PAUSE_STAYS;
}

// The one table of keys (pause.lua M.keys :1095-1126), as the page names them; CHORD is the
// reopen chord's label (`Cmd+Alt+D C`).
export function conjureKeys(chord: string): KeyHelp[] {
  return [
    { keys: ['c'], help: 'continue: more rounds with this model' },
    { keys: ['h'], help: 'continue with a hint: your sentence goes to the model' },
    { keys: ['C'], help: 'climb to the stronger model' },
    { keys: ['w', 'W'], help: 'wire the first / second port candidate' },
    { keys: ['t', 'T'], help: 'fix the first / second test, then the rounds go on' },
    { keys: ['p', 'P'], help: "add the method a port lacks (the first / second; the pack's port-method), then the rounds go on" },
    { keys: ['s'], help: 'stop: nothing lands, not the wire either' },
    { keys: ['a'], help: 'accept the diff on the right: keep it, or the proposal' },
    { keys: ['r'], help: 'reject the proposal' },
    { keys: ['[', ']'], help: 'previous / next entry; the diff follows' },
    { keys: ['0-9'], help: 'jump to an entry (0 is the wire)' },
    { keys: ['j', 'k'], help: 'scroll the diff: a line' },
    { keys: ['PageDown', 'PageUp'], help: 'scroll the diff: a page' },
    { keys: ['Tab'], help: 'narrow: flip the situation and the diff' },
    { keys: ['d'], help: 'details, in a document beside this one' },
    { keys: ['x'], help: 'cancel a run (nothing lands)' },
    { keys: ['q', 'Escape'], help: `close; the pause stays, ${chord} reopens it` },
    { keys: ['?'], help: 'this help; any key closes it' },
  ];
}

// A key as the help shows it.
const SHOWN: Record<string, string> = { Escape: 'Esc', PageDown: 'PgDn', PageUp: 'PgUp' };
const keyText = (keys: string[]): string => keys.map(k => SHOWN[k] ?? k).join(' ');

// The help (?): every key on a line of its own, its words after it, wrapped at W under the words.
export function helpLines(w: number, keys: KeyHelp[]): Line[] {
  const s = new Sheet();
  s.put([['keys', 'section']]);
  for (const k of keys) {
    const tok = keyText(k.keys);
    wrap(k.help, w - 12).forEach((l, i) => {
      if (i === 0) s.put([['  '], [tok, 'key'], [rep(Math.max(10 - width(tok), 1)) + l]]);
      else s.put([[rep(12) + l]]);
    });
  }
  return s.lines();
}
```

Then replace the whole `conjureView` function (with its comment) with:

```ts
// conjureView: the whole View for a paused payload at COLS cells, entry SELECTED (0-based; out
// of range: the default), a run going on, the narrow pane flipped, the help shown.
export function conjureView(p: Paused, o: { cols: number; selected: number; running?: Running; flipped: boolean; help: boolean; chord: string }): View {
  const g = layout(o.cols);
  const running = o.running;
  const es = entries(p);
  const sel = o.selected >= 0 && o.selected < es.length ? o.selected : defaultSelected(es);
  const entry = sel >= 0 ? es[sel] : undefined;
  const t = titles(p, entry, g.narrow, running);
  // the title fits the pane: the model goes first, then the seconds, then it is cut
  let title = t.bare;
  for (const c of [t.full, t.short]) if (width(lineText(c)) <= g.text) { title = c; break; }
  const sit = situationLines(p, g.text, es, sel, running);
  const d = diffPane(p, es, entry, g.narrow);
  const proposal = entry?.kind === 'proposal';
  // the legend whole when it fits the pane, else without its tail (the page wraps it)
  let legend = conjureLegend({ narrow: g.narrow, proposal, running: running !== undefined, wire: es[0]?.kind === 'wire' });
  if (!running && width(legend) > g.text) legend = legend.slice(0, -PAUSE_STAYS.length);
  const rs = rows(p, entry, g.narrow);
  const rl = rowLines(rs, g.text);
  const view: View = {
    state: running ? 'running' : proposal ? 'proposal' : 'paused',
    tab: `conjure${given(p.title?.unit) ? ` · ${p.title?.unit}` : ''}`,
    title: cutLine(title, Math.max(g.text, 8)),
    short: t.short,
    lines: sit.lines,
    entryAt: sit.entryAt,
    entries: es.length,
    selected: sel,
    rows: rs.map((r, i): Row => {
      const row: Row = { label: r.label, detail: r.detail, pressable: r.pressable, lines: rl.lines.slice(rl.starts[i], rl.starts[i + 1] ?? rl.lines.length) };
      if (r.key !== undefined) row.key = r.key;
      return row;
    }),
    diff: {
      title: o.help ? joined([['keys', 'section'], [' · any key closes this', 'title']]) : cutLine(titleSpans(d.title), Math.max(g.right - 4, 8)),
      lines: d.lines,
    },
    legend,
    narrow: g.narrow,
    flipped: g.narrow && o.flipped,
    width: g.text,
  };
  const reason = reasonOf(p, entry);
  if (reason !== undefined) view.reason = [{ text: cut(reason, g.text), kind: 'strong' }];
  if (o.help) view.help = helpLines(g.right - 4, conjureKeys(o.chord));
  return view;
}
```

- [ ] **Step 16: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS (68 model tests).

- [ ] **Step 17: Write the failing tests for the running view**

Replace the import block with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused, PausedOffer } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import type { Line, View } from '../../src/pause/viewModel';
import { width } from '../../src/pause/text';
import { conjureKeys, conjureLegend, conjureView, defaultSelected, entries, helpLines, layout, NO_ROW, noRow, rowLines, rows, shortName } from '../../src/pause/model';
import type { PauseRow, Running } from '../../src/pause/model';
import { fixture } from '../pauseFixtures';
```

Append:

```ts
// --- the running view

const run = (o: Partial<Running> = {}): Running => ({ label: 'continue', seconds: 21, accepted: false, ...o });

test('the running state: its badge and entry in the running colour, the spinner its own span', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'asking local (qwen3-coder:30b)…' }) });
  assert.equal(v.state, 'running');
  assert.deepEqual(v.short.slice(1), [
    { text: '⠋', kind: 'spinner' },
    { text: ' running', kind: 'running' },
    { text: ' · round 3 of 6 · local · 37 s', kind: 'dim' },
  ]);
  assert.equal(plain(v.title), 'conjure · CancelBooking.handle · ⠋ running · round 3 of 6 · local · 37 s');
  const L = texts(v.lines);
  const e = lineOf(L, /^ {2}3 {2}⠋/);
  assert.equal(L[e], '  3  ⠋            asking local (qwen3-coder:30b)…');
  assert.deepEqual(marked(v.lines[e]), { 3: 'key', '⠋': 'spinner', 'asking local (qwen3-coder:30b)…': 'running' });
  assert.equal(v.entryAt[e], -1);
});

test('the running entry drops the round words from the message; no message is starting…', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'round 3 of 8 · asking local (q)…' }) });
  assert.ok(texts(v.lines).includes('  3  ⠋            asking local (q)…'), texts(v.lines).join('\n'));
  const s = view(fixture('wired'), { running: run({ round: 3 }) });
  assert.ok(texts(s.lines).includes('  3  ⠋            starting…'));
  // a run with no round (stop, reject, a re-conjure): no running entry, the badge after the last round
  const n = view(fixture('wired'), { running: run({ label: 'fix the test: not_found' }) });
  assert.ok(!texts(n.lines).some(l => l.includes('⠋')));
  assert.equal(plain(n.short), 'conjure · CancelBooking.handle · ⠋ running after round 2 of 6 · local · 37 s');
});

test('§6.3: an accepted proposal is a ✓ step while the round it lets run goes on', () => {
  const q = wall();
  q.proposal = { kind: 'port', file: 'x.py', test: 'BookingRepository.find_by_id', refused: null, diff: '',
    step: 'port method: BookingRepository.find_by_id(id: str) -> Booking | None', files: ['x.py', 'a.py', 'b.py'] };
  const v = view(q, { running: run({ label: 'accept', round: 3, accepted: true, seconds: 0 }) });
  // still selected: the diff pane keeps it until the round's own diff comes
  const L = texts(v.lines);
  const e = lineOf(L, /^> ✓ {2}port method/);
  assert.equal(L[e], '> ✓  port method  find_by_id → BookingRepository, 2 adapters');
  assert.equal(L[e + 1], '  3  ⠋            starting…');
  assert.equal(lineOf(L, /◆/), -1);
  assert.equal(v.entryAt[e], v.selected);
});

test('the status line replaces the rows: ▶ the label — what it does · seconds · x cancels', () => {
  const v = view(fixture('wired'), { running: run({ round: 3, message: 'round 3 of 8 · asking local (q)…' }) });
  assert.deepEqual(v.rows, []);
  assert.equal(v.reason, undefined);
  assert.deepEqual(v.status, [
    { text: '▶', kind: 'running' },
    { text: ' ' },
    { text: 'continue', kind: 'strong' },
    { text: ' — asking local (q)…' },
    { text: ' · 21 s · ', kind: 'dim' },
    { text: 'x', kind: 'key' },
    { text: ' cancels', kind: 'dim' },
  ]);
  assert.equal(v.legend, 'x cancel · q hide (it goes on) · ? help');
  assert.equal(conjureLegend({ narrow: true, proposal: false, running: true, wire: true }), 'x cancel · q hide (it goes on) · ? help');
  assert.equal(view(fixture('wired')).status, undefined);
});

test('the status line: the label\'s own prefix goes, starting… before any word; a long message is cut first', () => {
  const v = view(fixture('wired'), { running: run({ label: 'stop', message: 'stop · landing nothing' }) });
  assert.equal(plain(v.status!), '▶ stop — landing nothing · 21 s · x cancels');
  assert.equal(plain(view(fixture('wired'), { running: run({ seconds: 3.7 }) }).status!), '▶ continue — starting… · 3 s · x cancels');
  const long = plain(view(fixture('wired'), { running: run({ message: 'word '.repeat(30) }) }).status!);
  assert.ok(long.endsWith('… · 21 s · x cancels'), long);
  assert.ok(width(long) <= W, long);
});
```

- [ ] **Step 18: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL: 2 tests, `the status line replaces the rows: …` (`v.rows` holds 5 rows, not `[]`) and `the status line: the label's own prefix goes, …` (`TypeError` on `v.status!` being undefined). The three badge and entry tests already pass: they pin Step 11's port.

- [ ] **Step 19: Write the status line; conjureView shows it instead of the rows**

In `src/pause/model.ts`, insert before the `// conjureView:` comment:

```ts
// The running status line that replaces the rows (pause.lua offer_lines :969-984): the
// seconds and the way out always show; the message is cut first.
function statusLine(r: Running, w: number): Line {
  let message = r.message ?? 'starting…';
  if (message.startsWith(`${r.label} · `)) message = message.slice(`${r.label} · `.length);
  message = message.replace(/^round \d+ of \d+ · /, '');
  const secs = Math.floor(r.seconds);
  const tail = ` · ${secs} s · x cancels`;
  const head = `▶ ${r.label} — `;
  const s = new Sheet();
  s.put([['▶', 'running'], [' '], [r.label, 'strong'], [' — '], [cut(message, Math.max(w - width(head + tail), 8))],
    [` · ${secs} s · `, 'dim'], ['x', 'key'], [' cancels', 'dim']]);
  return s.lines()[0];
}
```

Then replace the whole `conjureView` function (with its comment) with:

```ts
// conjureView: the whole View for a paused payload at COLS cells, entry SELECTED (0-based; out
// of range: the default), a run going on, the narrow pane flipped, the help shown.
export function conjureView(p: Paused, o: { cols: number; selected: number; running?: Running; flipped: boolean; help: boolean; chord: string }): View {
  const g = layout(o.cols);
  const running = o.running;
  const es = entries(p);
  const sel = o.selected >= 0 && o.selected < es.length ? o.selected : defaultSelected(es);
  const entry = sel >= 0 ? es[sel] : undefined;
  const t = titles(p, entry, g.narrow, running);
  // the title fits the pane: the model goes first, then the seconds, then it is cut
  let title = t.bare;
  for (const c of [t.full, t.short]) if (width(lineText(c)) <= g.text) { title = c; break; }
  const sit = situationLines(p, g.text, es, sel, running);
  const d = diffPane(p, es, entry, g.narrow);
  const proposal = entry?.kind === 'proposal';
  // the legend whole when it fits the pane, else without its tail (the page wraps it)
  let legend = conjureLegend({ narrow: g.narrow, proposal, running: running !== undefined, wire: es[0]?.kind === 'wire' });
  if (!running && width(legend) > g.text) legend = legend.slice(0, -PAUSE_STAYS.length);
  const view: View = {
    state: running ? 'running' : proposal ? 'proposal' : 'paused',
    tab: `conjure${given(p.title?.unit) ? ` · ${p.title?.unit}` : ''}`,
    title: cutLine(title, Math.max(g.text, 8)),
    short: t.short,
    lines: sit.lines,
    entryAt: sit.entryAt,
    entries: es.length,
    selected: sel,
    rows: [],
    diff: {
      title: o.help ? joined([['keys', 'section'], [' · any key closes this', 'title']]) : cutLine(titleSpans(d.title), Math.max(g.right - 4, 8)),
      lines: d.lines,
    },
    legend,
    narrow: g.narrow,
    flipped: g.narrow && o.flipped,
    width: g.text,
  };
  if (running) {
    view.status = statusLine(running, g.text);
  } else {
    const rs = rows(p, entry, g.narrow);
    const rl = rowLines(rs, g.text);
    view.rows = rs.map((r, i): Row => {
      const row: Row = { label: r.label, detail: r.detail, pressable: r.pressable, lines: rl.lines.slice(rl.starts[i], rl.starts[i + 1] ?? rl.lines.length) };
      if (r.key !== undefined) row.key = r.key;
      return row;
    });
    const reason = reasonOf(p, entry);
    if (reason !== undefined) view.reason = [{ text: cut(reason, g.text), kind: 'strong' }];
  }
  if (o.help) view.help = helpLines(g.right - 4, conjureKeys(o.chord));
  return view;
}
```

- [ ] **Step 20: Run lint and the tests to see them pass**

Run: `npm run lint && npm run test:unit`
Expected: PASS (73 model tests; no lint error: every helper is used by now).

- [ ] **Step 21: Commit**

```bash
git add src/pause/model.ts test/unit/model.test.ts
git commit -m "pause: the conjure view model, ported from pause.lua (entries, rows and keys, row columns, situation, diff pane, legend, help, running view)"
```

---

### Task 3: Details and resume (pure)

**Files:**
- Create: `src/pause/details.ts`, `src/pause/resume.ts`
- Create: `test/unit/details.test.ts`, `test/unit/resume.test.ts`

**Interfaces:**
- Consumes: `Paused`, `PausedOffer`, `DetailsSection`, `ConjureParams`, `ConjureResume`, `ResumeChoice`, `ConjureResult`, `ConjureLanded` (Task 1, `src/protocol.ts`); `given` (Task 1, `src/pause/text.ts`); `fixture(name)` (Task 1, `test/pauseFixtures.ts`); `PauseRow` (Task 2, `src/pause/model.ts`, type only); `conjureNotice` (M4, `src/tdd/landing.ts`, reused by the landing test, not copied).
- Produces (exactly the contract's Task 3 API; every helper below is module-private):
  - `details.ts`: `conjureDetails(p: Paused, o: { root?: string; lang: string; now?: number }): string`; `reviewDetails(title: string, sections: DetailsSection[]): string`; `shortPath(file: string, unitFile: string | undefined, root: string | undefined): string`.
  - `resume.ts`: `interface Held { uri; position: { line; character }; token }`; `resumeParams(h, row, hint?): ConjureParams`; `type Answer`; `classify(v): Answer`; `runningRound(choice, p): number | undefined`; `progressWords(message, label): { text; round? }`; `runningLabel(row): string`.

**Pinned here (the markdown the details tab shows, spec §6; Task 5's `d` and the e2e rely on it):**
- The document opens with `# conjure · <title.unit>` (no unit: the file's name; neither: `# conjure`). Then `## situation`, `## rounds`, `## tests`, `## unit`, `## steps`, `## diffs` in nvim's order; `situation` always, the others only when they have something (as `details.build`). Every block is separated by one blank line, so the headings have a blank line on both sides.
- The footer is a `---` rule, then `token <token> · expires in <N> s`. `o.now` is **the seconds since the pause arrived** (the controller passes it; default 0). N is `max(0, expires − floor(now))`, and `?` when the server sent no `expires`. nvim prints `expires` as it came. The tab can be reopened later, which is why the count goes down.
- Rounds and tests are `###` headings: `### round N · rung · verdict` and `### <path>::<name> · status`. The verdict stays a word, since markdown has no colour. The attempt (else `line`), the test sources and the unit header are fenced in `o.lang` (the document's languageId; `''` gives a plain fence). `decide: <choice> <confidence>` and the `Jev:` line are separate paragraphs. A round's `failed[].output` goes in one plain fence (blank lines dropped, paths shortened).
- Fences: when a body contains a run of backticks, the fence is one backtick longer than the longest run, so no body line can close it.
- Situation: the outcome; diagnosis[0] bold, line by line (`why` stands in when the diagnosis is empty); the remaining sentences as one paragraph; `trigger: …`; for a check failure, `round N: <tool> refused it before the tests ran`, then a list with one `- <place>  <message>` per problem; the `hint:` lines. Hints come from the steps of kind `hint`. Their text already reads `hint: <h>` (olifant `Conjure.hs` :670), so it is shown as it is. Only a text without that prefix gets `hint: ` added. nvim reads `paused.hint`, which never arrives.
- Steps: `each in force from the next round on` (only when there are steps), then a list: `- ✓ before round 1 · text` / `- ✓ after round N · text`, then `- wired <param>: <port> · <files>`.
- Unit: `ports: a, b`. With no ports it reads `ports: none`, where nvim prints a bare `ports: `.
- Diffs: `### <title>` then a ```` ```diff ```` fence. A round whose diff is `''` (not null) gets the line `(none: the body is your text)` instead of a fence, matching the pane's words (spec §7). A step or wire file whose diff is `''` is skipped, since there is nothing to show.
- Review details: `# <title>`, then for each section `## <section.title>` and its text. `lang: 'diff'` is fenced as diff; any other lang is prose, as it came.
- Nothing in the text is markdown-escaped. The tab shows the markdown source with its highlighting, and escapes would make it harder to read.

- [ ] **Step 1: Write the failing details tests**

`test/unit/details.test.ts` (ported from durandal.nvim `tests/details_spec.lua`, assertion for assertion where the data is the same; highlight groups become words, headings and fences):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Paused } from '../../src/protocol';
import { conjureDetails, reviewDetails, shortPath } from '../../src/pause/details';
import { fixture } from '../pauseFixtures';

// ported from durandal.nvim tests/details_spec.lua: the data assertions (section order, the
// check's wall, place rows, the landing's dedup, path shortening, verdicts as words, fence
// languages), as markdown lines instead of buffer rows and highlight groups

const ROOT = '/demo';
const md = (p: Paused, o: { lang?: string; now?: number; root?: string } = {}): string[] =>
  conjureDetails(p, { root: ROOT, lang: 'python', ...o }).split('\n');
// the lines of section NAME: after its `## name` heading, up to the next `## ` or the footer rule
function section(ls: string[], name: string): string[] {
  const from = ls.indexOf(`## ${name}`);
  assert.ok(from >= 0, `no ## ${name} in:\n${ls.join('\n')}`);
  let to = from + 1;
  while (to < ls.length && !ls[to].startsWith('## ') && ls[to] !== '---') to++;
  return ls.slice(from + 1, to);
}
const headings = (ls: string[], level: string): string[] =>
  ls.filter(l => l.startsWith(`${level} `)).map(l => l.slice(level.length + 1));
const copy = (p: Paused): Paused => JSON.parse(JSON.stringify(p)) as Paused;

test('sections in a fixed order: situation, rounds, tests, unit, steps, diffs; a blank line around each heading', () => {
  const ls = md(fixture('steps'));
  assert.equal(ls[0], '# conjure · CancelBooking.handle');
  assert.deepEqual(headings(ls, '##'), ['situation', 'rounds', 'tests', 'unit', 'steps', 'diffs']);
  for (const h of headings(ls, '##')) {
    const at = ls.indexOf(`## ${h}`);
    assert.equal(ls[at - 1], '');
    assert.equal(ls[at + 1], '');
  }
});

test('the footer: a rule, then the token and its expiry; the text ends in a newline', () => {
  const text = conjureDetails(fixture('steps'), { root: ROOT, lang: 'python' });
  assert.ok(text.endsWith('\n\n---\n\ntoken conjure-3 · expires in 600 s\n'), text.slice(-80));
  // NOW: seconds since the pause arrived count the expiry down, never below 0
  assert.equal(md(fixture('steps'), { now: 25.7 }).at(-2), 'token conjure-3 · expires in 575 s');
  assert.equal(md(fixture('steps'), { now: 700 }).at(-2), 'token conjure-3 · expires in 0 s');
});

test('a thin pause: the title, an empty situation and the footer, nothing else', () => {
  const thin = { token: 'conjure-1', lines: { first: 3, last: 4 }, offers: [] } as Paused;
  assert.equal(conjureDetails(thin, { lang: '' }), '# conjure\n\n## situation\n\n---\n\ntoken conjure-1 · expires in ? s\n');
});

test('the title names the unit; without one, the file\'s name', () => {
  const p = copy(fixture('plain'));
  p.title = null as unknown as Paused['title'];
  assert.equal(md(p)[0], '# conjure · cancel_booking.py');
});

test('situation: the first diagnosis sentence bold, the rest plain, the trigger', () => {
  const s = section(md(fixture('check')), 'situation');
  assert.deepEqual(s.slice(0, 6), [
    '',
    '**BookingRepository has no find_by_id: pyright refuses round 1\'s body before the tests run (cancel_booking.py:30).**',
    '',
    'No body can pass not_found: it builds repository = Mock() and never hands it to command(), so handle never sees it. CancelBooking takes bookings: BookingRepository since the wire; the test should pass its fake as command(bookings=…).',
    '',
    'trigger: a port lacks a method: BookingRepository.find_by_id',
  ]);
});

test('situation: the outcome first; why stands in for an empty diagnosis', () => {
  const p = copy(fixture('plain'));
  p.outcome = 'the re-conjure of succeeds was refused';
  p.diagnosis = [];
  assert.deepEqual(section(md(p), 'situation'), [
    '',
    'the re-conjure of succeeds was refused',
    '',
    '**local wrote the same body in rounds 2 and 3.**',
    '',
    'trigger: repeat',
    '',
  ]);
});

test('a check\'s wall: the round and the tool, then each problem as `- place  message`', () => {
  const ls = md(fixture('check'));
  const wall = ls.indexOf('round 1: pyright refused it before the tests ran');
  assert.ok(wall > 0, ls.join('\n'));
  assert.deepEqual(ls.slice(wall + 1, wall + 5), [
    '',
    '- cancel_booking.py:30  Cannot access attribute "find_by_id" for class "BookingRepository"',
    '- cancel_booking.py:30  Type of "booking" is unknown',
    '- cancel_booking.py:30  Type of "find_by_id" is unknown',
  ]);
  // a problem without a line: the place alone; elsewhere in the project: its relative path
  const p = copy(fixture('check'));
  p.failure = { round: 1, kind: 'check', tool: 'pyright', problems: [{ file: '/demo/src/bistro/main.py', line: null, message: 'boom' }] };
  assert.ok(md(p).includes('- src/bistro/main.py  boom'));
  // a tests failure has no wall
  assert.ok(!md(fixture('steps')).some(l => l.includes('refused it before the tests ran')));
});

test('hints: the hint steps in the situation as said (the server\'s text reads hint: …), and in the steps', () => {
  const p = copy(fixture('steps'));
  p.steps = [...(p.steps ?? []), { after: 3, kind: 'hint', text: 'hint: use the repository', files: [] }, { after: 3, kind: 'hint', text: 'mind the id', files: [] }];
  const ls = md(p);
  const s = section(ls, 'situation');
  assert.deepEqual(s.slice(-3), ['hint: use the repository', 'hint: mind the id', '']);
  assert.ok(section(ls, 'steps').includes('- ✓ after round 3 · hint: use the repository'));
  assert.ok(!section(md(fixture('steps')), 'situation').some(l => l.startsWith('hint:')));
});

test('rounds: a heading per round with its verdict as a word, the body fenced in the file\'s language', () => {
  const ls = md(fixture('steps'));
  const r = section(ls, 'rounds');
  assert.deepEqual(headings(r, '###'), ['round 1 · local · red', 'round 2 · local · red', 'round 3 · local · red']);
  const at = r.indexOf('### round 3 · local · red');
  assert.deepEqual(r.slice(at + 1, at + 8), [
    '',
    '```python',
    'booking = self.bookings.find_by_id(input.id)',
    'if booking is None:',
    '    return NotFound("Booking not found")',
    'return Ok(None)',
    '```',
  ]);
});

test('rounds: the runner\'s output in a plain fence, its paths shortened', () => {
  const r = section(md(fixture('steps')), 'rounds');
  const at = r.indexOf('### round 3 · local · red');
  assert.deepEqual(r.slice(at + 8, at + 15), [
    '',
    '```',
    'cancel_booking__test.py:24: in test_cancel_booking_succeeds',
    '    assert result == Ok(None)',
    'E   AssertionError: assert NotFound(reason=\'Booking not found\') == Ok(value=None)',
    'E    +  where Ok(value=None) = Ok(None)',
    '```',
  ]);
});

test('rounds: the decider\'s choice and confidence; Jev highest first, then by name, no leading zero', () => {
  const plain = section(md(fixture('plain')), 'rounds');
  assert.ok(plain.includes('decide: again 0.21'));
  assert.ok(plain.includes('decide: ask 0.19'));
  assert.equal(plain.filter(l => l.startsWith('decide:')).length, 2);   // round 3 has no decide
  assert.ok(!plain.some(l => l.startsWith('Jev:')));                      // its probabilities are {}
  const p = copy(fixture('plain'));
  p.rounds![0].decide = { choice: 'ask', confidence: 0.68, probabilities: { again: 0.29, port: 0.02, ask: 0.68, zed: 0.29, all: 1 } };
  assert.ok(md(p).includes('Jev: all 1.00 · ask .68 · again .29 · zed .29 · port .02'));
});

test('round bodies, test sources and the unit header fence in LANG; plain fences when LANG is empty; diffs fence as diff', () => {
  const count = (ls: string[], f: string) => ls.filter(l => l === f).length;
  const ls = md(fixture('steps'));
  // three bodies, two test sources, the unit's header
  assert.equal(count(ls, '```python'), 6);
  assert.equal(count(ls, '```diff'), 10);
  const bare = md(fixture('steps'), { lang: '' });
  assert.equal(count(bare, '```python'), 0);
  // the six code blocks and round 3's output open and close plain; the ten diffs close
  assert.equal(count(bare, '```'), 7 * 2 + 10);
});

test('a fence is longer than any backtick run inside it', () => {
  const p = copy(fixture('plain'));
  p.rounds![0].attempt = 'doc = """\n```\nx\n```\n"""';
  p.rounds![1].attempt = 'a = "````"';
  const r = section(md(p), 'rounds');
  const one = r.indexOf('````python');
  assert.deepEqual(r.slice(one, one + 7), ['````python', 'doc = """', '```', 'x', '```', '"""', '````']);
  assert.ok(r.includes('`````python'));
});

test('tests: place::name · status, the note, the source fenced', () => {
  const t = section(md(fixture('plain')), 'tests');
  assert.deepEqual(headings(t, '###'), [
    'cancel_booking__test.py::test_cancel_booking_succeeds · failing',
    'cancel_booking__test.py::test_cancel_booking_not_found · passing',
  ]);
  const at = t.indexOf('### cancel_booking__test.py::test_cancel_booking_not_found · passing');
  assert.deepEqual(t.slice(at + 1, at + 6), [
    '',
    'builds repository = Mock() and never hands it to command(); CancelBooking() takes no ports',
    '',
    '```python',
    'def test_cancel_booking_not_found() -> None:',
  ]);
});

test('unit: the header fenced, then its ports (none when it has none)', () => {
  assert.deepEqual(section(md(fixture('check')), 'unit'), [
    '',
    '```python',
    'class CancelBooking:',
    '    def __init__(self, bookings: BookingRepository) -> None:',
    '```',
    '',
    'ports: bookings: BookingRepository',
    '',
  ]);
  assert.ok(section(md(fixture('plain')), 'unit').includes('ports: none'));
});

test('steps: each in force from the next round on; the accepted steps, then the wired ports and their files', () => {
  assert.deepEqual(section(md(fixture('steps')), 'steps'), [
    '',
    'each in force from the next round on',
    '',
    '- ✓ before round 1 · wire bookings: BookingRepository',
    '- ✓ after round 1 · test fixed: not_found (command(bookings=repository))',
    '- ✓ after round 2 · port method: BookingRepository.find_by_id(id: str) -> Booking | None',
    '- wired bookings: BookingRepository · cancel_booking.py, cancel_booking__test.py',
    '',
  ]);
  // wired without steps: no in-force line; no steps and nothing wired: no section
  assert.deepEqual(section(md(fixture('wired')), 'steps'), ['', '- wired bookings: BookingRepository · cancel_booking.py, cancel_booking__test.py', '']);
  assert.ok(!md(fixture('plain')).includes('## steps'));
});

test('diffs: rounds, then step files, wired files only when no wire step listed them; keep\'s landing said on the kept round, not repeated', () => {
  const steps = fixture('steps');
  assert.equal(steps.landing!.diff, steps.rounds![2].diff);
  assert.deepEqual(headings(section(md(steps), 'diffs'), '###'), [
    'round 1',
    'round 2',
    'round 3 · what keep round 3 lands',
    'wire bookings: BookingRepository · cancel_booking.py',
    'wire bookings: BookingRepository · cancel_booking__test.py',
    'test fixed: not_found (command(bookings=repository)) · cancel_booking__test.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/booking_repository.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/booking_repository__test.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/in_memory_booking_repository.py',
    'port method: BookingRepository.find_by_id(id: str) -> Booking | None · src/bistro/booking/ports/booking_repository/sqlite_booking_repository.py',
  ]);
  assert.deepEqual(headings(section(md(fixture('wired')), 'diffs'), '###'), [
    'round 1',
    'round 2 · what keep round 2 lands',
    'wire bookings · cancel_booking.py',
    'wire bookings · cancel_booking__test.py',
  ]);
});

test('diffs: a landing that is not the kept round\'s diff comes last; a round diff of \'\' says the body is your text', () => {
  const p = copy(fixture('steps'));
  p.landing = { diff: '--- a/x.py\n+++ b/x.py\n@@ -1 +1 @@\n-a\n+b\n' };
  const d = section(md(p), 'diffs');
  assert.equal(headings(d, '###')[2], 'round 3');
  assert.equal(headings(d, '###').at(-1), 'keep round 3 would land');
  assert.deepEqual(d.slice(-10, -1), ['### keep round 3 would land', '', '```diff', '--- a/x.py', '+++ b/x.py', '@@ -1 +1 @@', '-a', '+b', '```']);
  const plain = section(md(fixture('plain')), 'diffs');
  assert.deepEqual(headings(plain, '###'), ['round 1', 'round 2', 'round 3 · what keep round 3 lands']);
  assert.deepEqual(plain.slice(1, 4), ['### round 1', '', '(none: the body is your text)']);
});

test('paths relative to the project, a file beside the unit by its name; no line holds the root', () => {
  for (const name of ['plain', 'wired', 'steps', 'check'] as const) {
    for (const l of md(fixture(name))) assert.ok(!l.includes('/demo'), `${name}: ${l}`);
  }
  // absolute paths inside the runner's output shorten too
  const p = copy(fixture('steps'));
  p.rounds![2].failed[0].output = '/demo/src/bistro/booking/commands/cancel_booking__test.py:24: in x\n/demo/lib/other.py:3: in y\n';
  const r = section(md(p), 'rounds');
  assert.ok(r.includes('cancel_booking__test.py:24: in x'));
  assert.ok(r.includes('lib/other.py:3: in y'));
});

test('shortPath: relative to the root, bare beside the unit, untouched outside the project', () => {
  const unit = '/demo/src/a/c.py';
  assert.equal(shortPath('/demo/src/a/b.py', unit, ROOT), 'b.py');
  assert.equal(shortPath('src/a/b.py', unit, ROOT), 'b.py');
  assert.equal(shortPath('/demo/src/a/sub/b.py', unit, ROOT), 'src/a/sub/b.py');
  assert.equal(shortPath('/demo/lib/x.py', unit, ROOT), 'lib/x.py');
  assert.equal(shortPath('/elsewhere/x.py', unit, ROOT), '/elsewhere/x.py');
  assert.equal(shortPath('/demo/src/a/b.py', unit, '/demo/'), 'b.py');
  // no root: beside the unit still bare; no unit file: relative only
  assert.equal(shortPath('/demo/src/a/b.py', unit, undefined), 'b.py');
  assert.equal(shortPath('src/a/b.py', unit, undefined), 'src/a/b.py');
  assert.equal(shortPath('/demo/src/a/b.py', undefined, ROOT), 'src/a/b.py');
});

test('reviewDetails: the title, then each section under ## with its text; a diff section fenced as diff', () => {
  assert.equal(reviewDetails('do · step 3 · cancel', [
    { title: 'the step', text: 'Add a cancel command.\nIt returns NotFound.\n' },
    { title: 'diff · src/a.py', text: '--- a/src/a.py\n+++ b/src/a.py\n@@ -1 +1 @@\n-a\n+b\n', lang: 'diff' },
    { title: 'readings', text: '', lang: null },
  ]), [
    '# do · step 3 · cancel',
    '',
    '## the step',
    '',
    'Add a cancel command.',
    'It returns NotFound.',
    '',
    '## diff · src/a.py',
    '',
    '```diff',
    '--- a/src/a.py',
    '+++ b/src/a.py',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    '```',
    '',
    '## readings',
    '',
  ].join('\n'));
  assert.equal(reviewDetails('reconcile · 2 to review', []), '# reconcile · 2 to review\n');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:unit`
Expected: FAIL, tsc cannot find module `../../src/pause/details`.

- [ ] **Step 3: Write `src/pause/details.ts`**

```ts
import type { DetailsSection, Paused } from '../protocol';
import { given } from './text';

// details: the d document (durandal.nvim details.lua): everything a pause holds, or a review's
// details sections, as one markdown text that VS Code shows read-only beside the panel.
// Spec §6. The sections keep nvim's order (situation, rounds, tests, unit, steps, diffs); each
// is a `##` heading so the outline, breadcrumbs and sticky scroll navigate them.

const SEP = ' · ';
// a round whose diff is '' (not null): its body is the person's own text
const NO_DIFF = '(none: the body is your text)';

// lines: TEXT split on newlines, one trailing newline dropped; '' is no lines
function lines(text: string): string[] {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body === '' ? [] : body.split('\n');
}

// fence: TEXT as a fenced block in LANG ('' a plain fence); none for empty text. The fence is
// one backtick longer than the longest run inside, so no line of the text can close it.
function fence(text: string, lang: string): string[] {
  const body = lines(text);
  if (body.length === 0) return [];
  let longest = 0;
  for (const run of body.join('\n').match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return [ticks + lang, ...body, ticks];
}

// writer: blocks of lines, one blank line between blocks; an empty block adds nothing
function writer(): { out: string[]; block(ls: string[]): void } {
  const out: string[] = [];
  return {
    out,
    block(ls: string[]): void {
      if (ls.length === 0) return;
      if (out.length > 0) out.push('');
      out.push(...ls);
    },
  };
}

// jevLine: the decider's probabilities, highest first then by name, two decimals without the
// leading zero (details.lua jev_line); none when there are none
function jevLine(probabilities: Record<string, number> | null | undefined): string | undefined {
  const list = Object.entries(probabilities ?? {}).map(([k, v]): [string, number] => [k, Number(v) || 0]);
  if (list.length === 0) return undefined;
  list.sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `Jev: ${list.map(([k, v]) => `${k} ${v.toFixed(2).replace(/^0/, '')}`).join(SEP)}`;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// shorteners: a path relative to ROOT, and by its name alone when it sits beside the unit's
// own file (details.lua short); TEXT: every such path inside free text (short_text)
function shorteners(unitFile: string | undefined, rootIn: string | undefined): { path(p: string): string; text(t: string): string } {
  const root = rootIn ? rootIn.replace(/\/+$/, '') : '';
  const strip = (s: string): string => (root !== '' && s.startsWith(`${root}/`) ? s.slice(root.length + 1) : s);
  const unit = strip(unitFile ?? '');
  const slash = unit.lastIndexOf('/');
  const dir = slash >= 0 ? unit.slice(0, slash + 1) : '';
  const beside = dir === '' ? undefined : new RegExp(`${escapeRe(dir)}([^/\\s]+)`, 'g');
  return {
    path(p: string): string {
      const s = strip(p);
      return dir !== '' && s.startsWith(dir) && !s.slice(dir.length).includes('/') ? s.slice(dir.length) : s;
    },
    text(t: string): string {
      let s = root === '' ? t : t.split(`${root}/`).join('');
      if (beside) s = s.replace(beside, '$1');
      return s;
    },
  };
}

// shortPath: FILE as the details show it: relative to ROOT, bare beside UNITFILE (the paused file)
export function shortPath(file: string, unitFile: string | undefined, root: string | undefined): string {
  return shorteners(unitFile, root).path(file);
}

// conjureDetails: PAUSED as markdown (details.lua build). ROOT: the project's folder (paths
// shorten against it); LANG: the unit's document languageId, the fence language of its code
// ('' a plain fence); NOW: seconds since the pause arrived (the footer counts its expiry down).
export function conjureDetails(p: Paused, o: { root?: string; lang: string; now?: number }): string {
  const { path, text } = shorteners(p.file, o.root);
  const w = writer();
  const heading = (word: string): void => w.block([`## ${word}`]);

  const file = p.file ?? '';
  const unit = p.title?.unit || file.slice(file.lastIndexOf('/') + 1);
  w.block([unit ? `# conjure${SEP}${unit}` : '# conjure']);

  // situation: what the last choice came to, why it paused, the check's wall and its places
  heading('situation');
  if (given(p.outcome)) w.block(lines(p.outcome));
  let diagnosis = p.diagnosis ?? [];
  if (diagnosis.length === 0 && given(p.why) && p.why !== '') diagnosis = [p.why];
  if (diagnosis.length > 0) {
    w.block(lines(diagnosis[0]).map(l => (l.trim() === '' ? '' : `**${l.trim()}**`)));
    w.block(diagnosis.slice(1).flatMap(lines));
  }
  if (given(p.trigger) && p.trigger !== '') w.block([`trigger: ${p.trigger}`]);
  const failure = p.failure;
  if (given(failure) && failure.kind === 'check') {
    w.block([`round ${failure.round ?? '?'}: ${failure.tool || 'the check'} refused it before the tests ran`]);
    w.block((failure.problems ?? []).map(pr =>
      `- ${path(pr.file || '?')}${given(pr.line) ? `:${pr.line}` : ''}  ${pr.message ?? ''}`));
  }
  // the person's hints are steps of kind hint (the server sends no top-level hint); their text
  // already reads 'hint: …' (Conjure.hs :670)
  const steps = p.steps ?? [];
  w.block(steps.filter(s => s.kind === 'hint').map(s => (s.text.startsWith('hint:') ? s.text : `hint: ${s.text}`)));

  // rounds: each round's verdict, body, the decider's choice and the runner's output
  const rounds = p.rounds ?? [];
  if (rounds.length > 0) {
    heading('rounds');
    for (const r of rounds) {
      w.block([`### round ${r.round}${SEP}${r.rung || '?'}${SEP}${r.verdict || '?'}`]);
      w.block(fence(given(r.attempt) ? r.attempt : (r.line ?? ''), o.lang));
      const d = r.decide;
      if (given(d)) {
        w.block([`decide: ${d.choice || '?'} ${given(d.confidence) ? d.confidence : ''}`.trimEnd()]);
        const jev = jevLine(d.probabilities);
        if (jev !== undefined) w.block([jev]);
      }
      const output = (r.failed ?? []).flatMap(f => text(f.output ?? '').split('\n')).filter(l => l !== '');
      w.block(fence(output.join('\n'), ''));
    }
  }

  // tests: each involved test's place and status, the scan's note, its source
  const tests = p.tests ?? [];
  if (tests.length > 0) {
    heading('tests');
    for (const x of tests) {
      const id = String(x.test);
      const at = id.indexOf('::');
      const shown = at < 0 ? id : `${path(id.slice(0, at))}::${id.slice(at + 2)}`;
      w.block([`### ${shown}${SEP}${x.status ?? '?'}`]);
      if (given(x.note)) w.block(lines(x.note));
      w.block(fence(x.source ?? '', o.lang));
    }
  }

  // unit: its header and its ports
  if (given(p.unit)) {
    heading('unit');
    w.block(fence(p.unit.header ?? '', o.lang));
    const ports = p.unit.ports ?? [];
    w.block([`ports: ${ports.length > 0 ? ports.join(', ') : 'none'}`]);
  }

  // steps: what was accepted, each in force from the next round on, and what is wired
  const wired = p.wired ?? [];
  if (steps.length > 0 || wired.length > 0) {
    heading('steps');
    if (steps.length > 0) w.block(['each in force from the next round on']);
    w.block([
      ...steps.map(s => {
        const after = Number(s.after) || 0;
        return `- ✓ ${after === 0 ? 'before round 1' : `after round ${after}`}${SEP}${s.text ?? ''}`;
      }),
      ...wired.map(x => {
        const files = (x.files ?? []).map(f => path(f.file ?? ''));
        return `- wired ${x.param || '?'}: ${x.port || '?'}${files.length > 0 ? `${SEP}${files.join(', ')}` : ''}`;
      }),
    ]);
  }

  // diffs: each round's (keep's landing said on the kept round when it is that round's own
  // diff), each step's files', the wire's unless a wire step listed them, then the landing
  const diffs: { title: string; diff: string }[] = [];
  let landing = given(p.landing) && given(p.landing.diff) ? p.landing.diff : undefined;
  const kept = String(p.round ?? '?');
  for (const r of rounds) {
    if (!given(r.diff)) continue;
    let title = `round ${r.round}`;
    if (landing !== undefined && String(r.round) === kept && r.diff === landing) {
      title += `${SEP}what keep round ${kept} lands`;
      landing = undefined;
    }
    diffs.push({ title, diff: r.diff });
  }
  let wireStep = false;
  for (const s of steps) {
    if (s.kind === 'wire') wireStep = true;
    for (const f of s.files ?? []) {
      if (given(f.diff) && f.diff !== '') diffs.push({ title: `${s.text || 'step'}${SEP}${path(f.file ?? '')}`, diff: f.diff });
    }
  }
  if (!wireStep) {
    for (const x of wired) {
      for (const f of x.files ?? []) {
        if (given(f.diff) && f.diff !== '') diffs.push({ title: `wire ${x.param || '?'}${SEP}${path(f.file ?? '')}`, diff: f.diff });
      }
    }
  }
  if (landing !== undefined) diffs.push({ title: `keep round ${kept} would land`, diff: landing });
  if (diffs.length > 0) {
    heading('diffs');
    for (const d of diffs) {
      w.block([`### ${d.title}`]);
      const body = fence(d.diff, 'diff');
      w.block(body.length > 0 ? body : [NO_DIFF]);
    }
  }

  // the footer: the token and how long the server keeps it
  w.block(['---']);
  const expires = given(p.expires) ? String(Math.max(0, p.expires - Math.floor(o.now ?? 0))) : '?';
  w.block([`token ${p.token || '?'}${SEP}expires in ${expires} s`]);
  return w.out.join('\n') + '\n';
}

// reviewDetails: a review's details sections (details.lua build_sections) under TITLE: each
// section's title a `##` heading, a diff section fenced as diff, any other as prose
export function reviewDetails(title: string, sections: DetailsSection[]): string {
  const w = writer();
  w.block([`# ${title}`]);
  for (const s of sections) {
    w.block([`## ${s.title ?? ''}`]);
    w.block(s.lang === 'diff' ? fence(s.text ?? '', 'diff') : lines(s.text ?? ''));
  }
  return w.out.join('\n') + '\n';
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS, with the 21 details tests among them.

- [ ] **Step 5: Write the failing resume tests**

`test/unit/resume.test.ts`: the seven resume shapes pinned in durandal.nvim (`pause_spec.lua` :651-750, `conjure_spec.lua` :204-272), plus the wire and port args, the answer's two kinds, the landing wording through M4's `conjureNotice` (reused, not duplicated), the running round, the progress words and the label:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConjureLanded, Paused, PausedOffer } from '../../src/protocol';
import type { PauseRow } from '../../src/pause/model';
import { classify, progressWords, resumeParams, runningLabel, runningRound, type Held } from '../../src/pause/resume';
import { conjureNotice } from '../../src/tdd/landing';
import { fixture } from '../pauseFixtures';

// the seven resume shapes durandal.nvim pins (pause_spec.lua :651-750, conjure_spec.lua
// :204-272), the answer's two kinds, and the running view's round and words

const NOT_FOUND = 'src/bistro/booking/commands/cancel_booking__test.py::test_cancel_booking_not_found';
const held: Held = { uri: 'file:///demo/src/bistro/booking/commands/cancel_booking.py', position: { line: 28, character: 8 }, token: 'conjure-1' };
// row: an offer as the model's row carries it, its nulls as the server sent them
const row = (o: PausedOffer): PauseRow => ({
  label: o.label, detail: o.detail, choice: o.choice, arg: o.arg as string | undefined, land: o.land as boolean | undefined,
  hint: o.hint as boolean | undefined, pressable: true,
});
const offer = (p: Paused, label: string): PauseRow => {
  const o = p.offers.find(x => x.label === label);
  assert.ok(o, `no offer ${label}`);
  return row(o);
};
const resume = (r: PauseRow, hint?: string) => resumeParams(held, r, hint).resume;

test('the whole params: the document, the opening conjure\'s position, the resume', () => {
  assert.deepEqual(resumeParams(held, offer(fixture('plain'), 'continue')), {
    textDocument: { uri: held.uri },
    position: { line: 28, character: 8 },
    resume: { token: 'conjure-1', choice: 'continue' },
  });
});

test('keep round N: stop, land true, the round as arg', () => {
  assert.deepEqual(resume(offer(fixture('check'), 'keep round 1')), { token: 'conjure-1', choice: 'stop', land: true, arg: '1' });
  // 0 then a keeps the wire alone: the model's row carries arg '0'
  assert.deepEqual(resume({ label: 'keep nothing but the wire', detail: '', choice: 'stop', arg: '0', land: true, pressable: true }),
    { token: 'conjure-1', choice: 'stop', land: true, arg: '0' });
});

test('stop: land false, no arg key (the server sent arg null)', () => {
  const r = resume(offer(fixture('plain'), 'stop'));
  assert.deepEqual(r, { token: 'conjure-1', choice: 'stop', land: false });
  assert.ok(!('arg' in r!));
  // a stop row without land (an older server) still says land false
  assert.deepEqual(resume({ label: 'stop', detail: '', choice: 'stop', pressable: true }), { token: 'conjure-1', choice: 'stop', land: false });
});

test('continue: the token and the choice alone; no land off stop, no hint unless typed', () => {
  const r = resume(offer(fixture('plain'), 'continue'));
  assert.deepEqual(r, { token: 'conjure-1', choice: 'continue' });
  assert.ok(!('arg' in r!) && !('land' in r!) && !('hint' in r!));
});

test('reconjure: the test id as arg', () => {
  assert.deepEqual(resume(offer(fixture('plain'), 'fix the test: not_found')), { token: 'conjure-1', choice: 'reconjure', arg: NOT_FOUND });
});

test('continue with a hint: the sentence as hint; an empty one sends none', () => {
  const r = offer(fixture('plain'), 'continue with a hint…');
  assert.deepEqual(resume(r, 'use the repository'), { token: 'conjure-1', choice: 'continue', hint: 'use the repository' });
  assert.deepEqual(resume(r, ''), { token: 'conjure-1', choice: 'continue' });
});

test('a proposal: reject and accept, the choice alone', () => {
  assert.deepEqual(resume({ label: 'reject', detail: '…', choice: 'reject', pressable: true }), { token: 'conjure-1', choice: 'reject' });
  assert.deepEqual(resume({ label: 'accept', detail: '…', choice: 'accept', pressable: true }), { token: 'conjure-1', choice: 'accept' });
});

test('wire and port: their arg', () => {
  assert.deepEqual(resume({ label: 'wire bookings: BookingRepository', detail: '', choice: 'wire', arg: 'bookings: BookingRepository', pressable: true }),
    { token: 'conjure-1', choice: 'wire', arg: 'bookings: BookingRepository' });
  assert.deepEqual(resume(offer(fixture('check'), 'add find_by_id to BookingRepository')),
    { token: 'conjure-1', choice: 'port', arg: 'BookingRepository.find_by_id' });
});

const landed = (o: Partial<ConjureLanded> = {}): ConjureLanded => ({
  file: '/demo/a.py', unit: 'f', edits: { documentChanges: [] }, summary: 'green', green: true,
  tests: { file: '/demo/a__test.py', passed: ['x'], scope: 'file', test: null, failed: [], broken: null, seconds: 0.4 },
  rounds: 4, rungs: ['local'], stopped: false, ...o,
});

test('classify: {paused} pauses again (a thin one too); anything else landed', () => {
  const p = fixture('steps');
  assert.deepEqual(classify({ paused: p }), { kind: 'paused', paused: p });
  const thin = { token: 'conjure-2', lines: { first: 1, last: 1 }, offers: [] } as Paused;
  assert.deepEqual(classify({ paused: thin }), { kind: 'paused', paused: thin });
  const l = landed();
  assert.deepEqual(classify(l), { kind: 'landed', landed: l });
});

test('a landing\'s words are M4\'s conjureNotice: stopped without edits, stopped with, conjured', () => {
  const words = (l: ConjureLanded, written?: string) => {
    const a = classify(l);
    assert.equal(a.kind, 'landed');
    return a.kind === 'landed' ? conjureNotice(a.landed, written).text : '';
  };
  assert.equal(words(landed({ stopped: true, edits: null })), 'stopped · nothing landed');
  assert.equal(words(landed({ stopped: true, green: false, summary: 'red: test_x' }), 'saved'), 'red: test_x · saved · undo reverts it');
  assert.equal(words(landed({ summary: 'green in round 4' }), 'saved'), 'conjured · green in round 4 · saved');
});

test('runningRound: the last round + 1 for continue, climb, wire, accept; none for the rest', () => {
  const p = fixture('plain');
  for (const c of ['continue', 'climb', 'wire', 'accept']) assert.equal(runningRound(c, p), 4, c);
  for (const c of ['stop', 'reconjure', 'reject', 'port']) assert.equal(runningRound(c, p), undefined, c);
  assert.equal(runningRound('continue', { token: 't', lines: { first: 1, last: 1 }, offers: [] }), 1);
});

test('progressWords: without the run\'s label and \'round N of M · \'; the round a message starts with', () => {
  assert.deepEqual(progressWords('round 3 of 8 · asking local (q)…', 'continue'), { text: 'asking local (q)…', round: 3 });
  assert.deepEqual(progressWords('continue · round 4 of 8 · asking', 'continue'), { text: 'asking' });
  assert.deepEqual(progressWords('asking local…', 'continue'), { text: 'asking local…' });
  // 'round N · ' alone stays: the entry line drops it, the status line keeps it
  assert.deepEqual(progressWords('round 12 · checking', 'climb to claude'), { text: 'round 12 · checking', round: 12 });
});

test('runningLabel: the row\'s label trimmed; its choice when the label is blank', () => {
  assert.equal(runningLabel({ label: '  keep round 3 ', detail: '', choice: 'stop', pressable: true }), 'keep round 3');
  assert.equal(runningLabel({ label: '  ', detail: '', choice: 'continue', pressable: true }), 'continue');
});
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npm run test:unit`
Expected: FAIL, tsc cannot find module `../../src/pause/resume`.

- [ ] **Step 7: Write `src/pause/resume.ts`**

```ts
import type { ConjureLanded, ConjureParams, ConjureResult, ConjureResume, Paused, ResumeChoice } from '../protocol';
import type { PauseRow } from './model';
import { given } from './text';

// resume: what a pressed row sends (durandal.nvim conjure.lua :28-56), what the answer is
// (conjure.lua :159-207), and the running view's round and words (pause.lua :964-983,
// :1462-1500). Spec §3.5.

// Held: the pause a resume answers: its document, the opening conjure's cursor, its token
export interface Held { uri: string; position: { line: number; character: number }; token: string }

// resumeParams: arg only when the row has one (a null arg sends no key); land only for stop
// (true for a keep row, false for the stop row); hint only when the person typed one
export function resumeParams(h: Held, row: PauseRow, hint?: string): ConjureParams {
  const resume: ConjureResume = { token: h.token, choice: row.choice as ResumeChoice };
  if (given(row.arg)) resume.arg = row.arg;
  if (row.choice === 'stop') resume.land = row.land === true;
  if (given(hint) && hint !== '') resume.hint = hint;
  return { textDocument: { uri: h.uri }, position: { line: h.position.line, character: h.position.character }, resume };
}

export type Answer = { kind: 'paused'; paused: Paused } | { kind: 'landed'; landed: ConjureLanded };

// classify: the one branch point (conjure.lua :175): {paused: {…}} pauses again, else it landed
export function classify(v: ConjureResult): Answer {
  const paused = (v as { paused?: unknown }).paused;
  if (paused !== null && typeof paused === 'object') return { kind: 'paused', paused: paused as Paused };
  return { kind: 'landed', landed: v as ConjureLanded };
}

// the choices that run a round (pause.lua running :1470)
const RUNS_A_ROUND = new Set(['continue', 'climb', 'wire', 'accept']);

// runningRound: the round a choice runs: the last round's number + 1; none for the others
export function runningRound(choice: string, p: Paused): number | undefined {
  if (!RUNS_A_ROUND.has(choice)) return undefined;
  const rounds = p.rounds ?? [];
  const last = rounds.length > 0 ? Number(rounds[rounds.length - 1].round) || 0 : 0;
  return last + 1;
}

// progressWords: the engine's progress MESSAGE for the status line: without the run's own
// label and without 'round N of M · ' (the badge and the entry say the round); ROUND: the
// round the message names, when it starts with one (pause.lua progress :1490)
export function progressWords(message: string, label: string): { text: string; round?: number } {
  const named = /^round (\d+)/.exec(message);
  const lead = `${label} · `;
  let text = message.startsWith(lead) ? message.slice(lead.length) : message;
  text = text.replace(/^round \d+ of \d+ · /, '');
  return named ? { text, round: Number(named[1]) } : { text };
}

// runningLabel: the pressed row's label, trimmed; its choice when the label is blank
export function runningLabel(row: PauseRow): string {
  const label = row.label.trim();
  return label !== '' ? label : row.choice;
}
```

- [ ] **Step 8: Run lint and the unit tests**

Run: `npm run lint && npm run test:unit`
Expected: PASS. All 34 new tests (21 details, 13 resume) pass, along with the earlier tasks' tests.

- [ ] **Step 9: Commit**

```bash
git add src/pause/details.ts src/pause/resume.ts test/unit/details.test.ts test/unit/resume.test.ts
git commit -m "pause: details markdown and resume (pure)"
```

---

### Task 4: The webview page and the panel

**Files:**
- Create: `webview/render.ts` (pure `View` → HTML, no DOM; compiled by both tsconfigs)
- Create: `webview/main.ts` (the page script, DOM; compiled only by `webview/tsconfig.json` and esbuild)
- Create: `webview/pause.css`
- Create: `webview/tsconfig.json`
- Create: `src/pause/shell.ts` (pure: the HTML document, the CSP, the nonce)
- Create: `src/pause/panel.ts` (vscode glue, no unit test; Task 5's `fake.12` e2e covers it)
- Create: `test/unit/render.test.ts`, `test/unit/shell.test.ts`
- Modify: `test/unit/manifest.test.ts`, `tsconfig.json`, `package.json` (`build`, `lint`), `.vscodeignore`
- Unchanged: `eslint.config.mjs`. typescript-eslint's `recommended` already applies to `**/*.ts`, so `eslint .` lints `webview/` (Step 14 checks it).

**Interfaces:**
- Consumes: `View`, `Row`, `Line`, `ToPage`, `FromPage`, `PAGE_KEYS`, `plain` from `src/pause/viewModel.ts` (Task 1).
- Produces:
  - `webview/render.ts`: `esc(s: string): string`; `lineHtml(l: Line): string`; `html(view: View, notice?: string): string`.
  - `src/pause/shell.ts`: `csp(cspSource: string, nonce: string): string`; `nonce(): string`; `MEASURE: string` (100 cells); `shell(o: { csp: string; script: string; style: string; nonce: string }): string`.
  - `src/pause/panel.ts`: `class PausePanel` exactly as the contract (`constructor(d)`, `show`, `notice`, `isOpen`, `close`, `column`, `last`), plus `dispose(): void` (same as `close()`, so `extension.ts` can push the panel into `context.subscriptions`).
- Pinned here (later tasks rely on them):
  - **Markup.** `<main[ class="narrow[ flipped]"] data-state="<state>">` holds `#sit`, `#off`, `#diff`, `#foot` in that DOM order. `#sit` starts with the title line (`view.short` when narrow, else `view.title`), then `view.lines`. `view.lines` does **not** hold the title, so Task 2 must leave it out. An entry line is `<div class="line entry[ selected]" data-entry="i">`. A row is `<button type="button" class="row" data-row="i"[ data-key="k"][ disabled]>`, one `<span class="line">` per `row.lines` line.
  - **Key badge.** Every span of kind `key` renders as `<kbd class="k-key">`, so the row's badge is the key span inside `row.lines`. Task 2's `rowLines` must give the key its own `{ text: key, kind: 'key' }` span at the start of the row's first line, as nvim marks `DurandalKey`.
  - **Running and help.** With `view.status` set, `#off` shows only the status line: no rows and no reason. With `view.help` set, `#diff` shows the help lines in place of the diff title and lines.
  - **Footer.** `#foot` shows the notice when one is given (it gets class `notice`), else `view.legend`.
  - **Scroll keys.** The page scrolls by itself for `j` / `k` (one line) and `PageUp` / `PageDown` (a page). It also reports them, so the extension can close help or say something. The scroll target is `#diff` when wide and `main` when narrow, because in a narrow layout the whole stack scrolls.
  - **Reported keys.** A key in `PAGE_KEYS` with no ctrl, meta or alt held is reported and its default is prevented. Any key with a modifier passes through untouched, so VS Code's chords still work. A held key repeats only for the four scroll keys.
  - **Load.** The page posts `size` and then `ready`. `size` is posted again only when the cell count changes (ResizeObserver, 100 ms debounce).
  - **Flash.** A `'row'` flash marks the row last clicked; failing that, the row whose `data-key` is the key last reported. An `'entry'` flash marks every `.entry.selected` line. Either flash lasts 150 ms.
  - **Panel.** The tab title is `view.tab`. `show()` creates the panel in the column right of `o.beside` (VS Code's `Beside` when that is not given). It reveals an existing panel only when `o.focus` is true, so a running view re-sent each second does not pull a hidden tab forward. `close()` never calls `closed()`: `closed()` means the user (or VS Code) disposed the tab. After any dispose, `isOpen()` is false and `last()` is `undefined`. On `ready` the panel re-sends the last view itself and also forwards `ready` to `receive`.

- [ ] **Step 1: Write the failing render test**

`test/unit/render.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { View } from '../../src/pause/viewModel';
import { esc, html, lineHtml } from '../../webview/render';

// a hand-made view: two entries (the second selected, two lines long), a keyed row, a keyless
// unpressable row, a keep row; a diff with a `<` in it
const view = (o: Partial<View> = {}): View => ({
  state: 'paused',
  tab: 'conjure · cancel_booking',
  title: [{ text: 'conjure · cancel_booking', kind: 'title' }, { text: ' · ' }, { text: '● paused', kind: 'paused' }],
  short: [{ text: 'cancel_booking', kind: 'title' }],
  lines: [
    [{ text: 'red', kind: 'red' }, { text: ' after round 2' }],
    [],
    [{ text: '1 ' }, { text: 'round 1 · base', kind: 'dim' }],
    [{ text: '2 ' }, { text: 'round 2 · strong' }],
    [{ text: '  still failing' }],
  ],
  entryAt: [-1, -1, 0, 1, 1],
  entries: 2,
  selected: 1,
  rows: [
    { key: 'c', label: 'continue', detail: 'one more round', pressable: true, lines: [[{ text: 'c', kind: 'key' }, { text: '  continue        ' }, { text: 'one more round', kind: 'dim' }]] },
    { label: 'wire', detail: 'a third wire', pressable: false, lines: [[{ text: '   wire            ' }, { text: 'a third wire', kind: 'dim' }]] },
    { key: 'a', label: 'keep round 2', detail: '', pressable: true, lines: [[{ text: 'a', kind: 'key' }, { text: '  keep round 2' }]] },
  ],
  diff: {
    title: [{ text: 'round 2 · ' }, { text: 'a', kind: 'key' }, { text: ' keeps this' }],
    lines: [[{ text: '@@ -1 +1 @@', kind: 'dim' }], [{ text: '-  if n < 0:', kind: 'red' }], [{ text: '+  if n <= 0:', kind: 'green' }]],
  },
  legend: 'c continue · a keep · ? help',
  narrow: false,
  flipped: false,
  width: 60,
  ...o,
});

const buttons = (s: string) => s.match(/<button[^>]*>/g) ?? [];
const pane = (s: string, id: string) => {
  const m = new RegExp(`<(section|footer) id="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(s);
  assert.ok(m, `no #${id}`);
  return m[2];
};

test('esc: the five characters HTML gives meaning to', () => {
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(esc('plain · ✓ 漢'), 'plain · ✓ 漢');
});

test('lineHtml: a span with a kind gets the class k-<kind>; key spans are <kbd>; no kind is bare text', () => {
  assert.equal(lineHtml([{ text: 'red', kind: 'red' }, { text: ' after' }, { text: '' }, { text: 'c', kind: 'key' }]),
    '<span class="k-red">red</span> after<kbd class="k-key">c</kbd>');
  assert.equal(lineHtml([]), '');
});

test('a <button> per row, its key as a <kbd> badge, disabled when not pressable (spec §4.3)', () => {
  const out = html(view());
  assert.deepEqual(buttons(out), [
    '<button type="button" class="row" data-row="0" data-key="c">',
    '<button type="button" class="row" data-row="1" disabled>',
    '<button type="button" class="row" data-row="2" data-key="a">',
  ]);
  assert.match(out, /data-row="0" data-key="c"><span class="line"><kbd class="k-key">c<\/kbd>  continue        <span class="k-dim">one more round<\/span><\/span><\/button>/);
  assert.ok(!out.slice(out.indexOf('data-row="1"'), out.indexOf('data-row="2"')).includes('<kbd'), 'a keyless row has no badge');
});

test('entries: each line of an entry carries data-entry; the selected entry\'s lines carry the class', () => {
  const sit = pane(html(view()), 'sit');
  assert.equal((sit.match(/class="line entry selected" data-entry="1"/g) ?? []).length, 2);
  assert.equal((sit.match(/class="line entry" data-entry="0"/g) ?? []).length, 1);
  assert.equal((sit.match(/data-entry=/g) ?? []).length, 3);
  assert.equal(pane(html(view({ selected: -1 })), 'sit').includes('selected'), false);
});

test('the title leads the situation; an empty line keeps its height', () => {
  const sit = pane(html(view()), 'sit');
  assert.ok(sit.startsWith('<div class="line title"><span class="k-title">conjure · cancel_booking</span> · <span class="k-paused">● paused</span></div>'));
  assert.ok(sit.includes('<div class="line"> </div>'));
});

test('text is escaped: the < of a diff line never becomes markup', () => {
  const diff = pane(html(view()), 'diff');
  assert.ok(diff.includes('<span class="k-red">-  if n &lt; 0:</span>'));
  assert.ok(diff.includes('<span class="k-green">+  if n &lt;= 0:</span>'));
  assert.ok(!diff.includes('n < 0'));
  const evil = html(view({ legend: '<script>x</script>', rows: [{ key: '"', label: 'l', detail: '', pressable: true, lines: [[{ text: '<b>', kind: 'key' }]] }] }));
  assert.ok(!evil.includes('<script>') && !evil.includes('<b>'));
  assert.ok(evil.includes('data-key="&quot;"'));
});

test('help mode: the key table replaces the diff pane', () => {
  const diff = pane(html(view({ help: [[{ text: 'c', kind: 'key' }, { text: '  one more round' }]] })), 'diff');
  assert.ok(diff.includes('<kbd class="k-key">c</kbd>  one more round'));
  assert.ok(!diff.includes('@@') && !diff.includes('keeps this'));
  assert.match(html(view({ help: [] })), /<section id="diff" class="help">/);
});

test('narrow: main carries narrow (and flipped), the short title shows; wide main has neither', () => {
  assert.match(html(view()), /^<main data-state="paused">/);
  const narrow = html(view({ narrow: true }));
  assert.match(narrow, /^<main class="narrow" data-state="paused">/);
  assert.ok(pane(narrow, 'sit').startsWith('<div class="line title"><span class="k-title">cancel_booking</span></div>'));
  assert.match(html(view({ narrow: true, flipped: true })), /^<main class="narrow flipped" data-state="paused">/);
});

test('the footer: the legend, or a notice in its place', () => {
  assert.equal(pane(html(view()), 'foot'), 'c continue · a keep · ? help');
  const out = html(view(), 'p: nothing was refused');
  assert.equal(pane(out, 'foot'), 'p: nothing was refused');
  assert.match(out, /<footer id="foot" class="line notice">/);
  assert.match(html(view(), ''), /<footer id="foot" class="line">c continue/);
});

test('running: the status line replaces the rows and the reason', () => {
  const out = html(view({
    state: 'running',
    reason: [{ text: 'why it was proposed' }],
    status: [{ text: '⠋', kind: 'spinner' }, { text: ' continue · round 3 · 4 s', kind: 'running' }],
  }));
  const off = pane(out, 'off');
  assert.equal(buttons(off).length, 0);
  assert.ok(!off.includes('why it was proposed'));
  assert.equal(off, '<div class="line status"><span class="k-spinner">⠋</span><span class="k-running"> continue · round 3 · 4 s</span></div>');
  assert.match(out, /data-state="running"/);
});

test('a proposal\'s reason sits above the rows', () => {
  const off = pane(html(view({ state: 'proposal', reason: [{ text: 'the test was wrong', kind: 'proposal' }] })), 'off');
  assert.ok(off.startsWith('<div class="line reason"><span class="k-proposal">the test was wrong</span></div><button'));
});

test('no inline style anywhere (the CSP allows none)', () => {
  for (const v of [view(), view({ narrow: true, flipped: true }), view({ help: [[{ text: 'x' }]] }), view({ state: 'running', status: [{ text: '⠋', kind: 'spinner' }] })]) {
    const out = html(v, 'a notice');
    assert.ok(!/style=/i.test(out) && !/<style/i.test(out), out);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit`
Expected: FAIL. tsc cannot find module `../../webview/render`.

- [ ] **Step 3: Write `webview/render.ts`**

```ts
import type { Line, Row, View } from '../src/pause/viewModel';

// render: the page's whole markup from the extension's View (spec §4.3, plan decision 2). Pure
// and DOM-free, so the root tsconfig compiles it for render.test.ts and the page bundles it.
// The model has already laid every line out in cells; this only maps span kinds to classes and
// names what can be clicked. No style attribute ever (the CSP allows no inline style).

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ENTITY[c]);

// lineHtml: a line's spans; kind k → class k-<k>; a key is a <kbd> badge (rows, titles, help)
export function lineHtml(l: Line): string {
  return l.map(s => {
    if (s.text === '') return '';
    const t = esc(s.text);
    if (!s.kind) return t;
    return s.kind === 'key' ? `<kbd class="k-key">${t}</kbd>` : `<span class="k-${s.kind}">${t}</span>`;
  }).join('');
}

// block: one line as an element; an empty line holds a space so it keeps its height under pre
const block = (tag: 'div' | 'span', cls: string, l: Line, attrs = ''): string =>
  `<${tag} class="${cls}"${attrs}>${lineHtml(l) || ' '}</${tag}>`;

function situation(v: View): string {
  const title = block('div', 'line title', v.narrow ? v.short : v.title);
  const lines = v.lines.map((l, i) => {
    const e = v.entryAt[i] ?? -1;
    if (e < 0) return block('div', 'line', l);
    return block('div', `line entry${e === v.selected ? ' selected' : ''}`, l, ` data-entry="${e}"`);
  });
  return `<section id="sit">${title}${lines.join('')}</section>`;
}

function row(r: Row, i: number): string {
  const key = r.key ? ` data-key="${esc(r.key)}"` : '';
  const off = r.pressable ? '' : ' disabled';
  const lines = r.lines.map(l => block('span', 'line', l)).join('');
  return `<button type="button" class="row" data-row="${i}"${key}${off}>${lines}</button>`;
}

// offers: the rows (the reason above them for a proposal), or the running status line alone
function offers(v: View): string {
  if (v.status) return `<section id="off">${block('div', 'line status', v.status)}</section>`;
  const reason = v.reason ? block('div', 'line reason', v.reason) : '';
  return `<section id="off">${reason}${v.rows.map(row).join('')}</section>`;
}

// diff: the selected entry's diff, or the key table while ? is on
function diff(v: View): string {
  if (v.help) return `<section id="diff" class="help">${v.help.map(l => block('div', 'line', l)).join('')}</section>`;
  const lines = v.diff.lines.map(l => block('div', 'line', l)).join('');
  return `<section id="diff">${block('div', 'line title', v.diff.title)}${lines}</section>`;
}

const footer = (v: View, notice: string | undefined): string =>
  notice ? `<footer id="foot" class="line notice">${esc(notice)}</footer>` : `<footer id="foot" class="line">${esc(v.legend)}</footer>`;

// html: the inner HTML of the page's #root
export function html(view: View, notice?: string): string {
  const cls = view.narrow ? ` class="narrow${view.flipped ? ' flipped' : ''}"` : '';
  return `<main${cls} data-state="${view.state}">${situation(view)}${offers(view)}${diff(view)}${footer(view, notice)}</main>`;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm run test:unit`
Expected: PASS (render.test.ts: 12 tests). The test's import pulls `webview/render.ts` into the root compile (to `out/webview/render.js`). Step 11 also names it in `include`.

- [ ] **Step 5: Write the failing shell test**

`test/unit/shell.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csp, MEASURE, nonce, shell } from '../../src/pause/shell';

test('csp: exactly the Global Constraints policy, scripts by nonce, styles and fonts from the webview only', () => {
  assert.equal(csp('https://abc.vscode-cdn.net', 'N0n+ce/='),
    "default-src 'none'; script-src 'nonce-N0n+ce/='; style-src https://abc.vscode-cdn.net; font-src https://abc.vscode-cdn.net");
});

test('nonce: 16 random bytes in base64, fresh each time', () => {
  const a = nonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, nonce());
});

test('shell: the CSP meta, the stylesheet, one nonced script, the root and the 100-cell measure; nothing inline', () => {
  const c = csp('vscode-webview://x', 'NONCE');
  const out = shell({ csp: c, script: 'https://x/dist/webview.js', style: 'https://x/dist/pause.css', nonce: 'NONCE' });
  assert.ok(out.startsWith('<!DOCTYPE html>'));
  assert.ok(out.includes(`<meta http-equiv="Content-Security-Policy" content="${c}">`));
  assert.ok(out.includes('<link rel="stylesheet" href="https://x/dist/pause.css">'));
  assert.ok(out.includes('<script nonce="NONCE" src="https://x/dist/webview.js"></script>'));
  assert.equal((out.match(/<script/g) ?? []).length, 1);
  assert.ok(out.includes('<div id="root"></div>'));
  assert.equal(MEASURE.length, 100);
  assert.ok(out.includes(`<span id="measure" aria-hidden="true">${MEASURE}</span>`));
  assert.ok(!/style=/i.test(out) && !/<style/i.test(out));
});

test('shell: attribute values are escaped', () => {
  const out = shell({ csp: 'a"b', script: 's&t', style: '<c>', nonce: 'n' });
  assert.ok(out.includes('content="a&quot;b"'));
  assert.ok(out.includes('src="s&amp;t"'));
  assert.ok(out.includes('href="&lt;c>"'));
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npm run test:unit`
Expected: FAIL. tsc cannot find module `../../src/pause/shell`.

- [ ] **Step 7: Write `src/pause/shell.ts`**

```ts
import { randomBytes } from 'node:crypto';

// shell: the pause panel's HTML document (spec §4.1), pure so the CSP is unit-tested. Scripts
// run only with the nonce; styles and fonts load only from the webview's own origin; nothing is
// inline (colours come from the --vscode-* variables VS Code injects). The page script renders
// into #root; #measure is the 100 cells it measures to tell the extension its width in cells
// (plan decision 5).

export const csp = (cspSource: string, nonce: string): string =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource}; font-src ${cspSource}`;

export const nonce = (): string => randomBytes(16).toString('base64');

export const MEASURE = '0'.repeat(100);

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function shell(o: { csp: string; script: string; style: string; nonce: string }): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attr(o.csp)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<link rel="stylesheet" href="${attr(o.style)}">`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<span id="measure" aria-hidden="true">${MEASURE}</span>`,
    `<script nonce="${attr(o.nonce)}" src="${attr(o.script)}"></script>`,
    '</body>',
    '</html>',
  ].join('\n');
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 9: Write the failing manifest test**

In `test/unit/manifest.test.ts`, add to the imports at the top:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

and append:

```ts
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
```

- [ ] **Step 10: Run it to see it fail**

Run: `npm run test:unit`
Expected: FAIL in `the webview: a second bundle…`, because the build script has no `webview/main.ts` call.

- [ ] **Step 11: The configuration**

`webview/tsconfig.json` (new):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["./**/*.ts", "../src/pause/viewModel.ts"]
}
```

(`types: []` keeps Node's globals out of the page. The root compile still sees Node's types, but `render.ts` uses no timers or Node APIs.)

`tsconfig.json`: change `include` to name `render.ts` and only `render.ts`. `main.ts` needs the DOM lib, so only `webview/tsconfig.json` sees it:

```json
  "include": ["src", "test", "webview/render.ts"]
```

`package.json` `scripts`: replace `build` and `lint` (the other scripts are unchanged):

```json
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --target=node20 --sourcemap && esbuild webview/main.ts --bundle --outfile=dist/webview.js --format=iife --platform=browser --target=es2022 && node -e \"require('fs').copyFileSync('webview/pause.css','dist/pause.css')\"",
    "lint": "tsc -p . --noEmit && tsc -p webview --noEmit && eslint .",
```

`.vscodeignore` (whole file):

```
**
!dist/extension.js
!dist/webview.js
!dist/pause.css
!package.json
!README.md
!CHANGELOG.md
!LICENSE
```

- [ ] **Step 12: Write `webview/main.ts`**

```ts
import { PAGE_KEYS, type FromPage, type ToPage, type View } from '../src/pause/viewModel';
import { html } from './render';

// The page script (spec §4.2, §4.3). It renders the View the extension sends and names what was
// pressed; it decides nothing about keys. It owns three things only: the diff pane's scroll
// (kept while the diff is unchanged; j k PageUp PageDown scroll it), the 150 ms flash and the
// 1.5 s footer notice. Its width in cells is measured on a hidden 100-cell span in the editor
// font (plan decision 5). No inline style anywhere: classes only (the CSP allows none).

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = acquireVsCodeApi();
const post = (m: FromPage): void => api.postMessage(m);

const REPORTED = new Set(PAGE_KEYS);
const SCROLL = new Set(['j', 'k', 'PageUp', 'PageDown']);
const FLASH_MS = 150;
const NOTICE_MS = 1500;
const RESIZE_MS = 100;

const root = document.getElementById('root') as HTMLElement;
const measure = document.getElementById('measure') as HTMLElement;
const byId = (id: string): HTMLElement | null => document.getElementById(id);

let view: View | undefined;
let notice: string | undefined;
let noticeTimer: number | undefined;
let lastRow: number | undefined; // the row last clicked: a 'row' flash marks it
let lastKey: string | undefined; // else the row whose key was last reported
let flipped: boolean | undefined; // narrow only: the pane last scrolled into view

// the diff pane's content: the scroll stays while it is unchanged
const diffKey = (v: View): string => JSON.stringify(v.help ?? v.diff);

// scroller: what j k PageUp PageDown move: the diff pane, or the whole stack when narrow
const scroller = (): HTMLElement | null => (view?.narrow ? root.querySelector('main') : byId('diff'));

function render(next: View, flash?: 'row' | 'entry'): void {
  const sitTop = byId('sit')?.scrollTop ?? 0;
  const scrollTop = scroller()?.scrollTop ?? 0;
  const same = view !== undefined && view.narrow === next.narrow && diffKey(view) === diffKey(next);
  view = next;
  root.innerHTML = html(next, notice);
  const sit = byId('sit');
  if (sit) sit.scrollTop = sitTop;
  const s = scroller();
  if (s) s.scrollTop = same ? scrollTop : 0;
  if (next.narrow && next.flipped !== flipped) (next.flipped ? byId('diff') : byId('sit'))?.scrollIntoView({ block: 'start' });
  flipped = next.narrow ? next.flipped : undefined;
  if (flash) flashOn(flash);
}

function flashed(what: 'row' | 'entry'): HTMLElement[] {
  if (what === 'entry') return Array.from(root.querySelectorAll<HTMLElement>('.entry.selected'));
  const el = lastRow !== undefined
    ? root.querySelector<HTMLElement>(`[data-row="${lastRow}"]`)
    : lastKey !== undefined ? root.querySelector<HTMLElement>(`[data-key="${CSS.escape(lastKey)}"]`) : null;
  return el ? [el] : [];
}

function flashOn(what: 'row' | 'entry'): void {
  const els = flashed(what);
  for (const e of els) e.classList.add('flash');
  window.setTimeout(() => { for (const e of els) e.classList.remove('flash'); }, FLASH_MS);
}

function showNotice(text: string): void {
  notice = text;
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = undefined;
    noticeTimer = undefined;
    if (view) render(view);
  }, NOTICE_MS);
  if (view) render(view);
}

window.addEventListener('message', (e: MessageEvent<ToPage>) => {
  const m = e.data;
  if (m.type === 'view') render(m.view, m.flash);
  else if (m.type === 'notice') showNotice(m.text);
});

// one line is the measure's height (it is inline-block, so its height is the line height)
const lineHeight = (): number => measure.getBoundingClientRect().height || 16;

function scrollFor(key: string): void {
  const s = scroller();
  if (!s) return;
  const line = lineHeight();
  const page = Math.max(line, s.clientHeight - line);
  const by = key === 'j' ? line : key === 'k' ? -line : key === 'PageDown' ? page : -page;
  s.scrollBy({ top: by });
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // VS Code's chords and shortcuts pass through
  if (!REPORTED.has(e.key)) return;
  e.preventDefault();
  if (SCROLL.has(e.key)) scrollFor(e.key);
  else if (e.repeat) return; // a held letter answers once
  lastKey = e.key;
  lastRow = undefined;
  post({ type: 'key', key: e.key });
});

root.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null;
  const row = t?.closest<HTMLButtonElement>('[data-row]');
  if (row) {
    if (row.disabled) return;
    lastRow = Number(row.dataset.row);
    lastKey = undefined;
    post({ type: 'press', row: lastRow });
    return;
  }
  const entry = t?.closest<HTMLElement>('[data-entry]');
  if (entry) post({ type: 'select', entry: Number(entry.dataset.entry) });
});

// the panel's width in cells of the editor font; posted only when it changes
let cols = 0;
function sendSize(): void {
  const cell = measure.getBoundingClientRect().width / 100;
  if (cell <= 0) return;
  const c = Math.floor(document.documentElement.clientWidth / cell);
  if (c <= 0 || c === cols) return;
  cols = c;
  post({ type: 'size', cols: c });
}

let resizeTimer: number | undefined;
new ResizeObserver(() => {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(sendSize, RESIZE_MS);
}).observe(document.documentElement);

sendSize();
post({ type: 'ready' });
```

- [ ] **Step 13: Write `webview/pause.css`**

```css
/* The pause window (spec §4.3): a grid with no measuring in JS. The model lays every line out
   in cells, so the left column is as wide as its widest line (max-content) and the diff takes
   the rest. Colours come only from the --vscode-* variables VS Code injects (light, dark and
   high contrast follow). Words and glyphs carry the meaning; colour never does alone. */

html, body { margin: 0; padding: 0; height: 100%; }

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
  font-weight: var(--vscode-editor-font-weight);
  line-height: 1.4;
}

/* the 100 cells the page measures; inline-block so its height is one line */
#measure {
  position: absolute;
  top: 0;
  left: 0;
  display: inline-block;
  visibility: hidden;
  white-space: pre;
  pointer-events: none;
}

main {
  display: grid;
  box-sizing: border-box;
  height: 100vh;
  padding: 0.5em 1ch;
  column-gap: 2ch;
  grid-template-columns: max-content minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto auto;
  grid-template-areas:
    "sit diff"
    "off diff"
    "foot diff";
}

#sit { grid-area: sit; overflow: auto; }
#off { grid-area: off; padding-top: 0.5em; }
#foot { grid-area: foot; padding-top: 0.5em; color: var(--vscode-descriptionForeground); }
#foot.notice { color: var(--vscode-editorWarning-foreground); }
#diff {
  grid-area: diff;
  overflow: auto;
  padding-left: 2ch;
  border-left: 1px solid var(--vscode-panel-border);
}

.line { display: block; white-space: pre; }
#sit > .title, #diff > .title { padding-bottom: 0.25em; }

/* narrow (below 110 cells): one column, the diff under the offers, the whole stack scrolls and
   the footer stays at the bottom; Tab moves between the panes (main.ts scrolls them in) */
main.narrow {
  overflow-y: auto;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: none;
  grid-template-areas:
    "sit"
    "off"
    "diff"
    "foot";
}
main.narrow #sit { overflow-x: auto; overflow-y: hidden; }
main.narrow #diff {
  overflow-x: auto;
  overflow-y: hidden;
  margin-top: 0.5em;
  padding-top: 0.5em;
  padding-left: 0;
  border-left: 0;
  border-top: 1px solid var(--vscode-panel-border);
}
main.narrow #foot {
  position: sticky;
  bottom: 0;
  background: var(--vscode-editor-background);
}

/* span kinds (viewModel SpanKind), spec §4.3's colours */
.k-strong { font-weight: bold; }
.k-dim { color: var(--vscode-descriptionForeground); }
.k-red { color: var(--vscode-errorForeground); }
.k-green { color: var(--vscode-testing-iconPassed); }
.k-check { color: var(--vscode-editorWarning-foreground); }
.k-place { color: var(--vscode-textLink-foreground); }
.k-key { color: var(--vscode-textPreformat-foreground); }
.k-running { color: var(--vscode-progressBar-background); }
.k-title { font-weight: bold; }
.k-paused { font-weight: bold; color: var(--vscode-editorWarning-foreground); }
.k-proposal { color: var(--vscode-editorInfo-foreground); }
.k-section { font-weight: bold; }
.k-spinner {
  display: inline-block;
  color: var(--vscode-progressBar-background);
  animation: durandal-spin 1s steps(8) infinite;
}
@keyframes durandal-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .k-spinner { animation: none; } }

/* the key badge: no padding or border width, so the cells stay aligned */
kbd {
  font: inherit;
  border-radius: 3px;
  background: var(--vscode-keybindingLabel-background);
  box-shadow: inset 0 -1px 0 var(--vscode-keybindingLabel-bottomBorder);
}

/* entries: clickable lines; the selected entry is a band */
.entry { cursor: pointer; }
.entry:hover { background: var(--vscode-list-hoverBackground); }
.entry.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

/* rows: buttons that look like the text they hold */
button.row {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: left;
  cursor: pointer;
}
button.row:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); }
button.row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
button.row:disabled { cursor: default; color: var(--vscode-disabledForeground); }

/* the 150 ms flash on a pressed row or a newly selected entry */
.flash {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
  background: var(--vscode-editor-findMatchHighlightBackground);
}
```

- [ ] **Step 14: Build, lint, test, and check the package's file list**

Run: `npm run build && ls dist/webview.js dist/pause.css`
Expected: three esbuild calls' worth of output and both files listed.

Run: `npm run lint && npm run test:unit`
Expected: PASS. `tsc -p webview --noEmit` type-checks `main.ts`, `render.ts` and `viewModel.ts` with the DOM lib. `eslint .` reports nothing for `webview/`. To confirm eslint reaches the page, run `npx eslint webview/main.ts webview/render.ts --max-warnings=0`: it exits 0 and lints them rather than warning "File ignored".

Run: `npx vsce ls --no-dependencies`
Expected: the list holds `dist/extension.js`, `dist/webview.js`, `dist/pause.css`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` and nothing from `webview/`, `src/` or `out/`.

- [ ] **Step 15: Write `src/pause/panel.ts`**

(APIs checked in `@types/vscode` 1.91.0: `window.createWebviewPanel(viewType, title, { viewColumn, preserveFocus }, options)`, `WebviewPanelOptions.retainContextWhenHidden`, `WebviewOptions.enableScripts` / `localResourceRoots`, `Webview.cspSource`, `asWebviewUri`, `postMessage`, `onDidReceiveMessage`, `WebviewPanel.reveal(viewColumn?, preserveFocus?)`, `onDidChangeViewState`, `onDidDispose`, `visible`, `viewColumn`, `Uri.joinPath`.)

```ts
import * as vscode from 'vscode';
import { csp, nonce, shell } from './shell';
import type { FromPage, ToPage, View } from './viewModel';

// PausePanel: the one pause / review tab (spec §4.1). It knows nothing about conjure or reviews.
// It shows the View it is given, re-sends it whenever the page (re)loads (retainContextWhenHidden
// is off: the extension holds the model) and hands page messages on. durandal.pauseOpen is
// true while the panel exists and is visible. Disposing the tab is q: closed() tells the
// controller; a close() the controller asks for does not call it back.

const setOpen = (on: boolean) => void vscode.commands.executeCommand('setContext', 'durandal.pauseOpen', on);

// besideOf: the column right of the unit's file; VS Code's Beside when no column is known
const besideOf = (c: vscode.ViewColumn | undefined): vscode.ViewColumn =>
  c !== undefined && c >= vscode.ViewColumn.One ? Math.min(c + 1, vscode.ViewColumn.Nine) : vscode.ViewColumn.Beside;

export class PausePanel {
  private panel: vscode.WebviewPanel | undefined;
  private shown: View | undefined;
  private listeners: vscode.Disposable[] = [];

  constructor(private readonly d: { extensionUri: vscode.Uri; receive(m: FromPage): void; closed(): void }) {}

  // show: create the panel beside the file, or update it; an existing panel is revealed only
  // when focus is asked for (a running view re-sent each second never pulls a hidden tab forward)
  show(view: View, o: { beside?: vscode.ViewColumn; flash?: 'row' | 'entry'; focus: boolean }): void {
    this.shown = view;
    if (!this.panel) {
      this.create(view.tab, besideOf(o.beside), o.focus);
    } else {
      this.panel.title = view.tab;
      if (o.focus) this.panel.reveal(undefined, false);
    }
    this.post(o.flash ? { type: 'view', view, flash: o.flash } : { type: 'view', view });
  }

  notice(text: string): void {
    this.post({ type: 'notice', text });
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  // close: our listeners go before the dispose, so closed() (the user's q) is not called
  close(): void {
    const p = this.panel;
    if (!p) return;
    this.forget();
    p.dispose();
  }

  dispose(): void {
    this.close();
  }

  column(): vscode.ViewColumn | undefined {
    return this.panel?.viewColumn;
  }

  last(): View | undefined {
    return this.shown;
  }

  private create(title: string, column: vscode.ViewColumn, focus: boolean): void {
    const dist = vscode.Uri.joinPath(this.d.extensionUri, 'dist');
    const p = vscode.window.createWebviewPanel('durandal.pause', title, { viewColumn: column, preserveFocus: !focus }, {
      enableScripts: true,
      localResourceRoots: [dist],
      retainContextWhenHidden: false,
    });
    const n = nonce();
    p.webview.html = shell({
      csp: csp(p.webview.cspSource, n),
      script: p.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      style: p.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'pause.css')).toString(),
      nonce: n,
    });
    this.listeners = [
      p.webview.onDidReceiveMessage((m: unknown) => this.heard(m)),
      p.onDidChangeViewState(e => {
        setOpen(e.webviewPanel.visible);
        if (e.webviewPanel.visible) this.resend();
      }),
      p.onDidDispose(() => {
        this.forget();
        this.d.closed();
      }),
    ];
    this.panel = p;
    setOpen(true);
  }

  // heard: a page message; ready re-sends the view (the page has just loaded), then every
  // message goes on to the controller
  private heard(m: unknown): void {
    if (typeof m !== 'object' || m === null || typeof (m as { type?: unknown }).type !== 'string') return;
    const msg = m as FromPage;
    if (msg.type === 'ready') this.resend();
    this.d.receive(msg);
  }

  private resend(): void {
    if (this.shown) this.post({ type: 'view', view: this.shown });
  }

  private post(m: ToPage): void {
    void this.panel?.webview.postMessage(m);
  }

  private forget(): void {
    for (const l of this.listeners) l.dispose();
    this.listeners = [];
    this.panel = undefined;
    this.shown = undefined;
    setOpen(false);
  }
}
```

Run: `npm run lint && npm run test:unit`
Expected: PASS. Nothing constructs `PausePanel` yet; Task 5 wires it in `extension.ts` and drives it through `fake.12`.

- [ ] **Step 16: Commit**

```bash
git add webview/tsconfig.json webview/render.ts webview/main.ts webview/pause.css \
  src/pause/shell.ts src/pause/panel.ts \
  test/unit/render.test.ts test/unit/shell.test.ts test/unit/manifest.test.ts \
  tsconfig.json package.json .vscodeignore
git commit -m "pause: the webview page and panel"
```

---

### Task 5: The pause lifecycle: store, reminder, controller, conjure hand-off

**Files:**
- Create: `src/pause/store.ts`
- Create: `test/unit/pauseStore.test.ts`
- Create: `src/pause/reminder.ts`
- Create: `src/pause/controller.ts`
- Modify: `src/tdd/conjure.ts` (the sink, `resume`, the reopen check; `paused()` goes)
- Modify: `src/tdd/landing.ts` (`firstSentence`, `pausedNotice` go)
- Modify: `test/unit/landing.test.ts` (their test goes)
- Modify: `src/uiTypes.ts:505-507` (the `ask` comment)
- Modify: `src/extension.ts` (build the pieces, `hooks.stopped`, `Api.pause`)
- Modify: `test/e2e/fake.11-tdd.e2e.ts:279-311` (the two paused tests go)
- Create: `test/e2e/fake.12-pause.e2e.ts`

**Interfaces:**
- Consumes:
  - Task 1: `Paused`, `ConjureParams` (`protocol.ts`); `View`, `FromPage` (`viewModel.ts`); `given` (`text.ts`).
  - Task 2: `entries(p): PauseEntry[]`, `defaultSelected(es): number`, `rows(p, entry, narrow): PauseRow[]`, `layout(cols)`, `conjureView(p, o)`, `noRow(rows, key)`, `Running`, `PauseRow`, `PauseEntry` (`model.ts`).
  - Task 3: `conjureDetails(p, o)` (`details.ts`); `resumeParams(h, row, hint?)`, `runningLabel(row)`, `runningRound(choice, p)` (`resume.ts`).
  - Task 4: `PausePanel` (`show`, `notice`, `isOpen`, `close`, `column`, `last`) (`panel.ts`).
  - Existing: `Conjure` (`tdd/conjure.ts`), `Flight` (`tdd/flights.ts`), `chordLabel` (`settings.ts`), `findRoot` (`root.ts`), `VirtualDocs` (`virtualDocs.ts`), `NOT_RUNNING`, `Say`, `Server` (`server.ts`).
- Produces:
  - `src/pause/store.ts`: `Pause`, `held(uri, position, paused, version, lineCount): Pause`, `PauseStore` (`set`, `get`, `take`, `drop`, `dropAll`, `uris`).
  - `src/pause/reminder.ts`: `Reminders` (`show(uri, line, text)`, `clear(uri)`, `count(uri)`, `register(context)`).
  - `src/tdd/conjure.ts`: `PauseSink { shown(params, p); ended(); atRun(uri, line, selection): boolean }`, `ResumeHooks { started(f) }`, `Conjure.setSink(s)`, `Conjure.resume(params, hooks)`.
  - `src/pause/controller.ts`: `SourceKind`, `KeyAct`, `PauseController` (owns the `PauseStore`; `shown`, `ended`, `atRun`, `receive`, `press`, `view`, `source`, `stopped`, `notices`, `register(context)`, `store`).
  - `src/extension.ts`: `PauseApi { view(); source(); press(key); receive(m); stored(uri); reminders(uri); notices() }` as `Api.pause`. Task 8 adds `open`.

The controller owns the store (its drop callback closes the panel and clears the reminder). The run state lives in the controller: a resume takes the pause out of the store before the request goes (spec §3.4 rule 3), and the controller keeps the taken pause to draw the running view.

- [ ] **Step 1: Write the failing store tests**

Create `test/unit/pauseStore.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { held, Pause, PauseStore } from '../../src/pause/store';
import { fixture } from '../pauseFixtures';

const at = { line: 26, character: 4 };

test('held: the server\'s 1-based lines become 0-based, last clamped to the document', () => {
  const p = fixture('plain');
  p.lines = { first: 27, last: 28 };
  const h = held('file:///a.py', at, p, 7, 40);
  assert.deepEqual([h.first, h.last, h.version, h.token], [26, 27, 7, p.token]);
  assert.deepEqual(h.position, at);
  assert.equal(h.selected, undefined);
  assert.equal(held('file:///a.py', at, p, 7, 27).last, 26);
  // a document shorter than the unit's start still gives an ordered range
  const short = held('file:///a.py', at, p, 7, 10);
  assert.deepEqual([short.first, short.last], [9, 9]);
});

test('PauseStore: one pause per document; set replaces without a drop', () => {
  const dropped: [string, string | undefined][] = [];
  const s = new PauseStore((p, why) => dropped.push([p.token, why]));
  const a = held('file:///a.py', at, fixture('plain'), 1, 40);
  const b = { ...held('file:///a.py', at, fixture('wired'), 2, 40), token: 'conjure-9' };
  s.set(a);
  s.set(b);
  assert.equal(s.get('file:///a.py'), b);
  assert.deepEqual(dropped, []);
  assert.deepEqual(s.uris(), ['file:///a.py']);
});

test('PauseStore: take removes without a drop; drop says why; dropAll is silent', () => {
  const dropped: [string, string | undefined][] = [];
  const s = new PauseStore((p, why) => dropped.push([p.uri, why]));
  const mk = (uri: string): Pause => held(uri, at, fixture('plain'), 1, 40);
  s.set(mk('file:///a.py'));
  s.set(mk('file:///b.py'));
  s.set(mk('file:///c.py'));
  assert.equal(s.take('file:///a.py')?.uri, 'file:///a.py');
  assert.equal(s.get('file:///a.py'), undefined);
  assert.deepEqual(dropped, []);
  s.drop('file:///b.py', 'the earlier pause is forgotten');
  s.drop('file:///nothing.py', 'never said');
  assert.deepEqual(dropped, [['file:///b.py', 'the earlier pause is forgotten']]);
  s.dropAll();
  assert.deepEqual(dropped, [['file:///b.py', 'the earlier pause is forgotten'], ['file:///c.py', undefined]]);
  assert.deepEqual(s.uris(), []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at compile, `Cannot find module '../../src/pause/store'`.

- [ ] **Step 3: Write the store**

Create `src/pause/store.ts`:

```ts
import type { Paused } from '../protocol';

// store: the paused conjures, one per document (spec §3.1, §3.4; nvim conjure.lua's
// paused[buf]). Pure: the controller watches the documents and calls drop.

// Pause: first and last are the unit's 0-based lines (the server's are 1-based, last clamped to
// the document); position is the conjure's original cursor (a resume re-sends it); version the
// document's when the pause was shown; selected the entry chosen, kept across a closed window.
export interface Pause {
  uri: string; token: string; position: { line: number; character: number }; first: number; last: number;
  paused: Paused; selected?: number; version: number;
}

export function held(uri: string, position: Pause['position'], paused: Paused, version: number, lineCount: number): Pause {
  const top = Math.max(lineCount - 1, 0);
  const first = Math.min(Math.max(paused.lines.first - 1, 0), top);
  const last = Math.max(Math.min(paused.lines.last - 1, top), first);
  return { uri, token: paused.token, position, first, last, paused, version };
}

export class PauseStore {
  private readonly held = new Map<string, Pause>();

  // dropped hears every pause dropped (not one taken or replaced); why undefined is silent
  constructor(private readonly dropped: (p: Pause, why: string | undefined) => void) {}

  set(p: Pause): void { this.held.set(p.uri, p); }

  get(uri: string): Pause | undefined { return this.held.get(uri); }

  // take: a resume's, before its request goes, so no token is sent twice
  take(uri: string): Pause | undefined {
    const p = this.held.get(uri);
    this.held.delete(uri);
    return p;
  }

  drop(uri: string, why?: string): void {
    const p = this.held.get(uri);
    if (!p) return;
    this.held.delete(uri);
    this.dropped(p, why);
  }

  // dropAll: the server stopped; nothing it said stands
  dropAll(): void {
    for (const uri of [...this.held.keys()]) this.drop(uri);
  }

  uris(): string[] { return [...this.held.keys()]; }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: the three `pauseStore.test` tests PASS.

- [ ] **Step 5: Commit the store**

```bash
git add src/pause/store.ts test/unit/pauseStore.test.ts
git commit -m "pause: the pause store and its drop rules (pure)"
```

- [ ] **Step 6: Write the reminder**

Create `src/pause/reminder.ts`:

```ts
import * as vscode from 'vscode';

// Reminders: the end-of-line note on a paused unit's last line (spec §3.3; nvim pause.remind's
// virtual line), in the lens colour, as the ⚡ hints. One per document; no key is bound for it.
export class Reminders {
  private readonly type = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1.5em' },
  });
  private readonly shown = new Map<string, { line: number; text: string }>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.type, vscode.window.onDidChangeVisibleTextEditors(eds => {
      for (const ed of eds) this.paint(ed);
    }));
  }

  show(uri: string, line: number, text: string): void {
    this.shown.set(uri, { line, text });
    for (const ed of vscode.window.visibleTextEditors) this.paint(ed);
  }

  clear(uri: string): void {
    this.shown.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === uri) ed.setDecorations(this.type, []);
    }
  }

  count(uri: string): number { return this.shown.has(uri) ? 1 : 0; }

  private paint(ed: vscode.TextEditor): void {
    const r = this.shown.get(ed.document.uri.toString());
    if (!r || r.line >= ed.document.lineCount) return;
    const end = ed.document.lineAt(r.line).range.end;
    ed.setDecorations(this.type, [{ range: new vscode.Range(end, end), renderOptions: { after: { contentText: r.text } } }]);
  }
}
```

- [ ] **Step 7: Hand the pause from Conjure to a sink**

In `src/tdd/landing.ts`, delete `firstSentence` and `pausedNotice` (and their comments). In `test/unit/landing.test.ts`, delete the test `'the paused notice: the diagnosis\'s first sentence'` and drop `firstSentence, pausedNotice` from the import.

In `src/uiTypes.ts`, change the comment above `ask` to:

```ts
  // ask: a notice with buttons; the one chosen, or undefined when it is dismissed
```

Replace `src/tdd/conjure.ts` with:

```ts
import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { ConjureLanded, ConjureParams, ConjureResult, Olifant, Paused } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { Ui } from '../uiTypes';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { Flight, Outcome, settle } from './flights';
import { changedSpan, conjureNotice, savedWord, selectionLines } from './landing';
import type { Tests } from './tests';

export interface ConjureDeps {
  server: Server; say: Say; ui: () => Ui; flights: TddFlights; tests: Tests;
  // each landing's flashed span (Api.tdd.flashes, for the e2e tests)
  flashes: { first: number; last: number }[];
}

// PauseSink: where a pause goes (the pause controller, M5 spec §3)
export interface PauseSink {
  // a pause answered, to an opening conjure or a resume (params: the request, its position the original)
  shown(params: ConjureParams, p: Paused): void;
  // a resume ended without a pause (a landing, an error, a cancel): the running view closes
  ended(): void;
  // a conjure is about to go from line of uri: true when it reopened the held pause instead
  atRun(uri: string, line: number, selection: boolean): boolean;
}

// ResumeHooks: a resume's flight, for the window's x
export interface ResumeHooks { started(f: Flight<vscode.CancellationToken>): void }

// Conjure: a body (or the selected lines) filled until its tests pass (durandal.nvim conjure.lua,
// M4 spec §4). A landing applies the accepted edit, flashes the changed lines, marks the
// after-run and says one line. A pause goes to the sink (M5 spec §3); a resume comes back
// through resume() so its landing is this one.
export class Conjure {
  private readonly landed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });
  private sink: PauseSink | undefined;

  constructor(private readonly d: ConjureDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.landed, vscode.commands.registerCommand('durandal.conjure', () => this.run()));
  }

  setSink(s: PauseSink): void { this.sink = s; }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    const sel = selectionLines(h.editor.selection.start, h.editor.selection.end);
    // a conjure inside a held pause's unit reopens it; anywhere else it forgets it (spec §3.4 rule 4)
    if (this.sink?.atRun(h.uri, h.position.line, !!sel)) return;
    const params: ConjureParams = { textDocument: { uri: h.uri }, position: h.position };
    if (sel) params.selection = sel;
    await this.ask(params);
  }

  // resume: a pause's answer; the window is its progress (no notification), x cancels the flight
  async resume(params: ConjureParams, hooks: ResumeHooks): Promise<void> {
    await this.ask(params, hooks);
  }

  // ask sends a conjure (or a resume), then lands its answer or hands on its pause
  private async ask(params: ConjureParams, hooks?: ResumeHooks): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      if (hooks) this.sink?.ended();
      return;
    }
    const f = this.d.flights.start('conjure');
    const send = () => settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method);
    let o: Outcome<ConjureResult>;
    if (hooks) {
      hooks.started(f);
      o = await send();
    } else {
      o = await withCancel('Durandal: conjuring…', f, send);
    }
    if (o.kind === 'cancelled') {
      if (hooks) this.sink?.ended();
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', 'conjure cancelled · nothing landed');
      return;
    }
    if (o.kind === 'error') {
      if (hooks) this.sink?.ended();
      void this.d.say('error', o.message);
      return;
    }
    // the one branch point is the answer's shape (conjure.lua :175): {paused: {…}} or a landing.
    // ConjureLanded is open (an index signature), so `in` does not narrow: read it through the cast.
    const p = (o.value as { paused?: unknown }).paused;
    if (p && typeof p === 'object') {
      this.sink?.shown(params, p as Paused);
      return;
    }
    if (hooks) this.sink?.ended();
    await this.land(params, o.value as ConjureLanded);
  }
```

Keep `land()` and `flash()` exactly as they are below this point, and close the class.

- [ ] **Step 8: Write the controller**

Create `src/pause/controller.ts`:

```ts
import * as vscode from 'vscode';
import type { ConjureParams, Paused } from '../protocol';
import { findRoot } from '../root';
import { NOT_RUNNING, Say, Server } from '../server';
import { chordLabel } from '../settings';
import type { Conjure, PauseSink } from '../tdd/conjure';
import type { Flight } from '../tdd/flights';
import type { Ui } from '../uiTypes';
import type { VirtualDocs } from '../virtualDocs';
import { conjureDetails } from './details';
import { conjureView, defaultSelected, entries, layout, noRow, PauseRow, rows, Running } from './model';
import type { PausePanel } from './panel';
import type { Reminders } from './reminder';
import { resumeParams, runningLabel, runningRound } from './resume';
import { held, Pause, PauseStore } from './store';
import type { FromPage, View } from './viewModel';

export type SourceKind = 'conjure' | 'do' | 'errand' | 'reconcile';

// KeyAct: a key's action; true when it did something, else why not (the footer's notice)
export interface KeyAct { keys: string[]; act(key: string): Promise<true | string> | true | string }

export interface ControllerDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; panel: PausePanel; reminders: Reminders; conjure: Conjure; platform: string;
}

// a run: a resume in the air; pause is the one it took, drawn until the answer comes
interface Run { uri: string; pause: Pause; row: PauseRow; started: number; timer: NodeJS.Timeout; flight?: Flight<vscode.CancellationToken>; message?: string; round?: number }

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keyName = (k: string) => (k === 'Escape' ? 'Esc' : k);
const docOf = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);

// PauseController: the window's source and its keys (spec §3, §4.4). The page sends what was
// pressed; the controller decides, re-lays out the model and sends it back.
export class PauseController implements PauseSink {
  readonly store: PauseStore;
  private shownUri: string | undefined;
  private cols = 120;
  private help = false;
  private flipped = false;
  private run: Run | undefined;
  private readonly said: string[] = [];

  constructor(private readonly d: ControllerDeps) {
    this.store = new PauseStore((p, why) => this.dropped(p, why));
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      // any edit of the unit's file kills the pause server-side (ConjureNext.hs pruned)
      vscode.workspace.onDidChangeTextDocument(e => {
        const uri = e.document.uri.toString();
        const p = this.store.get(uri);
        if (p && e.contentChanges.length > 0 && e.document.version !== p.version) {
          this.store.drop(uri, 'conjure: the file changed, the pause is gone');
        }
      }),
      vscode.workspace.onDidCloseTextDocument(doc => this.store.drop(doc.uri.toString())),
      { dispose: () => this.endRun() },
    );
  }

  // --- the sink (tdd/conjure.ts)

  shown(params: ConjureParams, p: Paused): void {
    const uri = params.textDocument.uri;
    const after = this.run?.uri === uri;
    if (after) this.endRun();
    const doc = docOf(uri);
    const h = held(uri, params.position, p, doc?.version ?? 0, doc?.lineCount ?? p.lines.last);
    this.store.set(h);
    this.d.reminders.show(uri, h.last, `conjure paused · ${chordLabel(this.d.platform, 'C')} reopens`);
    void this.d.say('info', p.why ? `conjure paused · ${p.why}` : 'conjure paused');
    this.shownUri = uri;
    this.help = false;
    this.paint(after ? 'entry' : undefined, true);
  }

  ended(): void {
    const uri = this.run?.uri;
    this.endRun();
    if (uri !== undefined && this.shownUri === uri) this.hide();
  }

  atRun(uri: string, line: number, selection: boolean): boolean {
    const p = this.store.get(uri);
    if (!p) return false;
    if (!selection && line >= p.first && line <= p.last) {
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    this.store.drop(uri, 'the earlier pause is forgotten');
    return false;
  }

  // --- the page

  async receive(m: FromPage): Promise<void> {
    if (m.type === 'size') {
      this.cols = m.cols;
      this.paint();
    } else if (m.type === 'key') {
      await this.press(m.key);
    } else if (m.type === 'press') {
      const r = this.view()?.rows[m.row];
      if (r?.key) await this.press(r.key);
    } else if (m.type === 'select') {
      await this.answer('select', this.select(m.entry));
    }
  }

  async press(key: string): Promise<void> {
    // the key table is on: any key closes it (pause.lua: "any key closes this")
    if (this.help && key !== '?') {
      this.help = false;
      this.paint();
      return;
    }
    const k = this.table().find(x => x.keys.includes(key));
    await this.answer(key, k ? await k.act(key) : 'nothing to do here');
  }

  view(): View | undefined { return this.d.panel.isOpen() ? this.d.panel.last() : undefined; }
  source(): SourceKind | undefined { return this.d.panel.isOpen() && this.shownUri ? 'conjure' : undefined; }
  notices(): string[] { return [...this.said]; }

  // stopped: the server stopped; nothing it said stands
  stopped(): void {
    this.endRun();
    this.store.dropAll();
    this.hide();
  }

  // --- drawing

  private current(): { pause: Pause; running?: Running } | undefined {
    const uri = this.shownUri;
    if (!uri) return undefined;
    const r = this.run;
    if (r && r.uri === uri) {
      return {
        pause: r.pause,
        running: {
          label: runningLabel(r.row), message: r.message, seconds: Math.floor((Date.now() - r.started) / 1000),
          round: r.round ?? runningRound(r.row.choice, r.pause.paused), accepted: r.row.choice === 'accept',
        },
      };
    }
    const p = this.store.get(uri);
    return p ? { pause: p } : undefined;
  }

  private selectedOf(p: Pause): number {
    return p.selected ?? defaultSelected(entries(p.paused));
  }

  private paint(flash?: 'row' | 'entry', focus = false): void {
    const c = this.current();
    if (!c) return;
    const view = conjureView(c.pause.paused, {
      cols: this.cols, selected: this.selectedOf(c.pause), running: c.running, flipped: this.flipped, help: this.help,
      chord: chordLabel(this.d.platform, 'C'),
    });
    const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === c.pause.uri)?.viewColumn;
    this.d.panel.show(view, { beside, flash, focus });
  }

  private async answer(key: string, r: true | string): Promise<void> {
    if (r === true) return;
    const text = `${keyName(key)}: ${r}`;
    this.said.push(text);
    this.d.panel.notice(text);
  }

  private hide(): void {
    this.shownUri = undefined;
    this.help = false;
    this.flipped = false;
    this.d.panel.close();
  }

  // the panel's tab was closed: the source stays (pause stored, run going)
  closed(): void {
    this.shownUri = undefined;
    this.help = false;
  }

  private dropped(p: Pause, why: string | undefined): void {
    this.d.reminders.clear(p.uri);
    if (this.shownUri === p.uri && this.run?.uri !== p.uri) this.hide();
    if (why) void this.d.say('info', why);
  }

  private endRun(): void {
    if (this.run) clearInterval(this.run.timer);
    this.run = undefined;
  }

  // --- the keys (pause.lua M.keys :1095-1126)

  private table(): KeyAct[] {
    return [
      { keys: ['c', 'h', 'C', 'w', 'W', 't', 'T', 'p', 'P', 's', 'a', 'r'], act: k => this.rowKey(k) },
      { keys: ['['], act: () => this.step(-1) },
      { keys: [']'], act: () => this.step(1) },
      { keys: DIGITS, act: k => this.jump(Number(k)) },
      // the page scrolls the diff pane itself; reported so every key is accounted for
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.details() },
      { keys: ['x'], act: () => this.cancel() },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
  }

  private rowsOf(p: Pause): PauseRow[] {
    const es = entries(p.paused);
    return rows(p.paused, es[this.selectedOf(p)], layout(this.cols).narrow);
  }

  private rowKey(k: string): true | string | Promise<true | string> {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const rs = this.rowsOf(p);
    const row = rs.find(r => r.key === k && r.pressable);
    if (row) return this.resume(p, row);
    // why not, with the proposal's own rule (pause.lua no_row :1033-1044)
    return noRow(rs, k);
  }

  private async resume(p: Pause, row: PauseRow): Promise<true | string> {
    // the server check comes first: the pause and the window stay (spec §3.5)
    if (!this.d.server.client()) return NOT_RUNNING;
    let hint: string | undefined;
    if (row.hint) {
      hint = (await this.d.ui().text({ title: 'hint', value: '', prompt: 'goes to the model with the next round' }).result)?.trim();
      if (!hint) return true;
      // dropped or replaced while the sentence was asked: nothing to send
      if (this.store.get(p.uri) !== p) return true;
    }
    const params = resumeParams({ uri: p.uri, position: p.position, token: p.token }, row, hint);
    this.store.take(p.uri);
    this.d.reminders.clear(p.uri);
    this.run = { uri: p.uri, pause: p, row, started: Date.now(), timer: setInterval(() => this.paint(), 1000) };
    this.help = false;
    this.paint('row');
    void this.d.conjure.resume(params, { started: f => { if (this.run?.uri === p.uri) this.run.flight = f; } });
    return true;
  }

  private select(i: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p || i < 0 || i >= entries(p.paused).length) return 'nothing to do here';
    p.selected = i;
    this.paint('entry');
    return true;
  }

  private step(d: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const n = entries(p.paused).length;
    const from = this.selectedOf(p);
    const to = Math.min(Math.max(from + d, 0), n - 1);
    if (to === from || n === 0) return d < 0 ? 'the first entry' : 'the last entry';
    p.selected = to;
    this.paint('entry');
    return true;
  }

  private jump(n: number): true | string {
    if (this.run && this.run.uri === this.shownUri) return 'a run is going on · x cancels it';
    const p = this.shownUri ? this.store.get(this.shownUri) : undefined;
    if (!p) return 'nothing to do here';
    const i = entries(p.paused).findIndex(e => e.n === n && e.kind !== 'proposal');
    if (i < 0) return `no entry ${n}`;
    if (i === this.selectedOf(p)) return `entry ${n} is shown`;
    p.selected = i;
    this.paint('entry');
    return true;
  }

  private flip(): true | string {
    if (!layout(this.cols).narrow) return 'both panes are shown';
    this.flipped = !this.flipped;
    this.paint();
    return true;
  }

  private cancel(): true | string {
    const f = this.run && this.run.uri === this.shownUri ? this.run.flight : undefined;
    if (!f) return 'nothing is running';
    f.cancel('user');
    return true;
  }

  // details: the pause as a markdown document beside the window (spec §6); the window stays
  private async details(): Promise<true | string> {
    const c = this.current();
    if (!c) return 'nothing to do here';
    const unit = vscode.Uri.parse(c.pause.uri);
    const doc = docOf(c.pause.uri);
    const root = unit.scheme === 'file' ? await findRoot(unit.fsPath) : undefined;
    const text = conjureDetails(c.pause.paused, { root, lang: doc?.languageId ?? '' });
    const uri = this.d.docs.set(`details/${c.pause.token}.md`, text);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }
}
```

- [ ] **Step 9: Wire it in the extension**

In `src/extension.ts`:
- Import `PausePanel` from `./pause/panel`, `PauseController` from `./pause/controller`, `Reminders` from `./pause/reminder`, and the types `FromPage`, `View` from `./pause/viewModel`, `SourceKind` from `./pause/controller`.
- Add the API type next to `TddApi`:

```ts
// the pause window (M5): its view and source, a key or page message played as if sent, a
// document's pause and reminder, the footer notices said (the e2e tests read them)
export interface PauseApi {
  view(): View | undefined;
  source(): SourceKind | undefined;
  press(key: string): Promise<void>;
  receive(m: FromPage): Promise<void>;
  stored(uri: string): boolean;
  reminders(uri: string): number;
  notices(): string[];
}
```

- Add `pause: PauseApi;` to `Api` with the comment `// the pause window (M5)`.
- Replace `new Conjure({ server: s, say, ui, flights, tests, flashes }).register(context);` with:

```ts
  const conjure = new Conjure({ server: s, say, ui, flights, tests, flashes });
  conjure.register(context);
  // the pause window (M5 spec §2): the panel knows nothing of conjure; the controller decides
  const reminders = new Reminders();
  reminders.register(context);
  let controller: PauseController | undefined;
  const panel = new PausePanel({
    extensionUri: context.extensionUri,
    receive: m => void controller?.receive(m),
    closed: () => controller?.closed(),
  });
  context.subscriptions.push({ dispose: () => panel.close() });
  controller = new PauseController({ server: s, say, ui, docs, panel, reminders, conjure, platform: process.platform });
  controller.register(context);
  conjure.setSink(controller);
  const ctl = controller;
  const pause: PauseApi = {
    view: () => ctl.view(),
    source: () => ctl.source(),
    press: k => ctl.press(k),
    receive: m => ctl.receive(m),
    stored: uri => !!ctl.store.get(uri),
    reminders: uri => reminders.count(uri),
    notices: () => ctl.notices(),
  };
```

- In `hooks.stopped`, add `ctl.stopped();` after `flights.cancelAll('stopped');`.
- Return `pause` in the API object: `…, plans, suggest, tdd, pause };`.

- [ ] **Step 10: Remove M4's paused e2e tests**

In `test/e2e/fake.11-tdd.e2e.ts`, delete the two tests `'paused: the warning; Stop sends the resume and nothing lands'` and `'paused: Continue resumes and lands'` (lines 279-311). If `FakeUi` is no longer used in that file, drop its import.

- [ ] **Step 11: Write the pause e2e (lifecycle)**

Create `test/e2e/fake.12-pause.e2e.ts`:

```ts
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ConjurePaused } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { FakeUi } from '../fakeUi';
import { wrapped } from '../pauseFixtures';
import { api, file, log, open, reply, revert, running, settle, tabsUnder, until, ws } from './helpers';

// The pause window over the fake server (M5 spec §3, §4, §8): the fixtures' paused answers,
// the resumes they send, the keys, the drops. The fake answers each method with one reply, so a
// flow sets the next reply before the key that sends it.
const MAIN = 'one/main.py';
const MAIN_TEXT = Array.from({ length: 30 }, (_, i) => `line_${i + 1} = ${i + 1}`).join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const abs = (rel: string) => join(ws(), rel);
const conjures = () => log().filter(m => m.method === 'olifant/conjure');
const resumes = () => conjures().map(m => m.params.resume).filter(Boolean);

// a fixture whose unit is lines 3-5 of main.py (1-based), as the server would send for it
function paused(name: 'plain' | 'wired' | 'steps' | 'check' = 'plain'): ConjurePaused {
  const w = wrapped(name);
  w.paused.lines = { first: 3, last: 5 };
  w.paused.file = abs(MAIN);
  return w;
}
const mainEdit = (text: string) => ({ documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
  { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, newText: text },
] }] });
const tests = () => ({ file: abs('one/main__test.py'), passed: [], scope: 'file', test: null, failed: [], broken: null, seconds: 0.1 });
const landed = (o: Record<string, unknown> = {}) => ({
  file: abs(MAIN), unit: 'f', edits: mainEdit('line_3 = 33'), summary: 'kept round 3 · red: not_found', green: false,
  tests: tests(), rounds: 3, rungs: ['local'], stopped: true, ...o,
});

// conjureAt: a conjure from line (0-based) of main.py, answered with reply; waits for the panel
async function conjureAt(line: number, answer: unknown): Promise<void> {
  const a = await api();
  const ed = await open(file(MAIN));
  ed.selection = new vscode.Selection(line, 0, line, 0);
  reply('olifant/conjure', answer);
  const n = conjures().length;
  await vscode.commands.executeCommand('durandal.conjure');
  await until(() => conjures().length > n, 'the conjure sent');
  await until(() => a.pause.view(), 'the pause window');
}

// pressed: a key, then the resume it sent
async function pressed(key: string): Promise<Record<string, unknown>> {
  const a = await api();
  const n = resumes().length;
  await a.pause.press(key);
  await until(() => resumes().length > n, `the resume for ${key}`);
  return resumes()[n];
}

describe('the pause window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(MAIN, MAIN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(MAIN, 'x = 1\n');
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    if (a.pause.view()) await a.pause.press('q');
    reply('olifant/conjure', null);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN));
    if (d?.isDirty) await revert(d);
    await settle(MAIN, MAIN_TEXT);
  });

  it('a paused answer opens the window beside the file, holds the pause, places one reminder', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    assert.equal(a.pause.source(), 'conjure');
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    assert.ok(plain(a.pause.view()!.title).startsWith('conjure · CancelBooking.handle · ● paused'));
    assert.ok(a.shown.slice(from).some(s => s.text === `conjure paused · ${wrapped('plain').paused.why}`));
    const panelTab = vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input instanceof vscode.TabInputWebview);
    assert.ok(panelTab, 'a webview tab');
    assert.notEqual(panelTab!.group.viewColumn, vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uriOf(MAIN))?.viewColumn);
  });

  it('a keeps the selected round: stop, land, arg; the landing applies and closes the window', async () => {
    const a = await running();
    await conjureAt(3, paused());
    reply('olifant/conjure', landed());
    const r = await pressed('a');
    assert.deepEqual(r, { token: 'conjure-1', choice: 'stop', land: true, arg: '3' });
    await until(() => !a.pause.view(), 'the window closed');
    await until(() => vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN))?.lineAt(2).text === 'line_3 = 33', 'the keep landed');
    assert.ok(!a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 0);
  });

  it('0 then a keeps the wire alone; s stops; t re-conjures the test; c continues', async () => {
    const a = await running();
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    await conjureAt(3, paused('wired'));
    await a.pause.press('0');
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('a'), { token: wrapped('wired').paused.token, choice: 'stop', land: true, arg: '0' });
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('s'), { token: 'conjure-1', choice: 'stop', land: false });
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    const t = await pressed('t');
    assert.equal(t.choice, 'reconjure');
    assert.equal(t.arg, wrapped('plain').paused.offers.find(o => o.choice === 'reconjure')!.arg);
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('c'), { token: 'conjure-1', choice: 'continue' });
  });

  it('h asks the sentence and sends it as the hint; an empty sentence sends nothing', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await conjureAt(3, paused());
    const n = resumes().length;
    void a.pause.press('h');
    await until(() => ui.texts.length === 1, 'the hint asked');
    assert.equal(ui.texts[0].title, 'hint');
    ui.texts[0].finish('   ');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n);
    assert.ok(a.pause.stored(uriOf(MAIN)));
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    void a.pause.press('h');
    await until(() => ui.texts.length === 2, 'the hint asked again');
    ui.texts[1].finish('use the repository');
    await until(() => resumes().length > n, 'the hinted resume');
    assert.deepEqual(resumes()[n], { token: 'conjure-1', choice: 'continue', hint: 'use the repository' });
  });

  it('[ ] and digits move the selection; the a row follows it', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const last = a.pause.view()!.selected;
    await a.pause.press('[');
    assert.equal(a.pause.view()!.selected, last - 1);
    await a.pause.press(']');
    assert.equal(a.pause.view()!.selected, last);
    await a.pause.press(']');
    assert.ok(a.pause.notices().at(-1) === ']: the last entry');
    await a.pause.press('1');
    assert.ok(a.pause.view()!.rows.some(r => r.key === 'a' && r.label === 'keep round 1'));
    await a.pause.press('7');
    assert.equal(a.pause.notices().at(-1), '7: no entry 7');
  });

  it('a click on a row answers as its key; a click on an entry selects it', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.receive({ type: 'select', entry: 0 });
    assert.equal(a.pause.view()!.selected, 0);
    const i = a.pause.view()!.rows.findIndex(r => r.key === 's');
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    const n = resumes().length;
    await a.pause.receive({ type: 'press', row: i });
    await until(() => resumes().length > n, 'the clicked resume');
    assert.deepEqual(resumes()[n], { token: 'conjure-1', choice: 'stop', land: false });
  });

  it('every key of the table does something or says why (spec §4.4)', async () => {
    const a = await running();
    await conjureAt(3, paused());
    // keys that send a resume or close are checked elsewhere; here the rest leave the window up
    // (the plain fixture offers c h t T s and a keep: those send; Tab flips silently when the
    // page reported a narrow panel)
    const silent = ['[', ']', '2', 'j', 'k', 'PageUp', 'PageDown', 'Tab'];
    for (const k of ['C', 'w', 'W', 'p', 'P', 'r', 'x', 'Tab', '[', ']', '2', 'j', 'k', 'PageUp', 'PageDown', 'b']) {
      const before = a.pause.notices().length;
      await a.pause.press(k);
      assert.ok(a.pause.view(), `${k} keeps the window`);
      assert.ok(a.pause.notices().length > before || silent.includes(k), `${k} says why`);
    }
    assert.ok(a.pause.notices().includes('x: nothing is running'));
    assert.ok(a.pause.notices().includes('r: no proposal to reject'));
    assert.ok(a.pause.notices().includes('C: no stronger model to climb to'));
    assert.ok(a.pause.notices().includes('b: nothing to do here'));
    await a.pause.press('?');
    assert.ok(a.pause.view()!.help && a.pause.view()!.help!.length > 3);
    await a.pause.press('j');
    assert.equal(a.pause.view()!.help, undefined);
  });

  it('q keeps the pause; a conjure inside the unit reopens it with no request', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.press('[');
    const sel = a.pause.view()!.selected;
    await a.pause.press('q');
    assert.equal(a.pause.view(), undefined);
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.view(), 'the window again');
    assert.equal(conjures().length, n);
    assert.equal(a.pause.view()!.selected, sel);
  });

  it('an edit of the file drops the pause, its reminder and the window', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    const ed = await open(file(MAIN));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# '));
    await until(() => !a.pause.stored(uriOf(MAIN)), 'the pause dropped');
    assert.equal(a.pause.reminders(uriOf(MAIN)), 0);
    assert.equal(a.pause.view(), undefined);
    assert.ok(a.shown.slice(from).some(s => s.text === 'conjure: the file changed, the pause is gone'));
  });

  it('a conjure elsewhere forgets the pause and sends a fresh request', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    await a.pause.press('q');
    reply('olifant/conjure', landed({ edits: null, stopped: false, summary: 'green: already passes', green: true }));
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(20, 0, 20, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the fresh conjure');
    assert.equal(conjures()[n].params.resume, undefined);
    assert.ok(a.shown.slice(from).some(s => s.text === 'the earlier pause is forgotten'));
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a refused resume closes the window with the sentence and holds no pause', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    reply('olifant/conjure', { lsp_error: 'this paused conjure is gone (it expired, was resumed, or its file changed): conjure again' });
    await a.pause.press('c');
    await until(() => !a.pause.view(), 'the window closed');
    assert.ok(a.shown.slice(from).some(s => s.level === 'error' && s.text.startsWith('this paused conjure is gone')));
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a second press during the run says so and sends nothing; x cancels: nothing landed, no pause', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 4 of 9 · asking local…'] });
    const n = resumes().length;
    await a.pause.press('c');
    await a.pause.press('c');
    await until(() => resumes().length > n, 'the resume');
    assert.equal(a.pause.view()!.state, 'running');
    assert.ok(a.pause.notices().includes('c: a run is going on · x cancels it'));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n + 1);
    const id = conjures().at(-1)!.id;
    await a.pause.press('x');
    await until(() => a.shown.slice(from).some(s => s.text === 'conjure cancelled · nothing landed'), 'the cancel said');
    assert.ok(log().some(m => m.method === '$/cancelRequest' && m.params.id === id));
    assert.equal(a.pause.view(), undefined);
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a run that pauses again redraws the window in place', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const next = paused('wired');
    next.paused.token = 'conjure-2';
    reply('olifant/conjure', next);
    await a.pause.press('c');
    // the press took the pause before its request went
    assert.ok(!a.pause.stored(uriOf(MAIN)));
    await until(() => a.pause.stored(uriOf(MAIN)), 'the next pause');
    assert.ok(plain(a.pause.view()!.title).includes('● paused'));
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t => t.input instanceof vscode.TabInputWebview);
    assert.equal(tabs.length, 1);
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.equal((await pressed('s')).token, 'conjure-2');
  });

  it('d opens the details as a markdown document beside the window; the window stays', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## situation'));
    assert.ok(a.pause.view());
    await vscode.window.tabGroups.close(tab);
  });
});
```

- [ ] **Step 12: Run lint, unit and the e2e**

Run: `npm run lint && npm run test:unit && DURANDAL_E2E_ONLY=fake.1 npm run test:e2e`
Expected: lint clean; unit PASS; `fake.11` (minus the two removed tests) and `fake.12` PASS. (`fake.1` selects fake.1, fake.10 to fake.13 by prefix; to run only this file use `DURANDAL_E2E_ONLY=fake.12`.)

If `a keeps the selected round` fails on `arg`, read `defaultSelected` for the plain fixture: the last round is 3, so `arg: '3'`. If a test times out waiting for the window, check that `PausePanel.show` creates the panel when none is open and that `isOpen()` turns true before `show` returns.

- [ ] **Step 13: Commit**

```bash
git add src/pause/reminder.ts src/pause/controller.ts src/tdd/conjure.ts src/tdd/landing.ts src/uiTypes.ts src/extension.ts test/unit/landing.test.ts test/e2e/fake.11-tdd.e2e.ts test/e2e/fake.12-pause.e2e.ts
git commit -m "pause: the window opens on a pause; keys resume, select, hide; edits and conjures elsewhere drop it"
```

---

### Task 6: The running view's words, a hidden run, resize, and the M5a PR

**Files:**
- Create: `src/pause/progress.ts`
- Create: `test/unit/progress.test.ts`
- Modify: `src/server.ts` (`ClientHooks.progress`, `middleware.handleWorkDoneProgress`)
- Modify: `src/pause/controller.ts` (claims, `progress`, release on run end)
- Modify: `src/extension.ts` (`hooks.progress`)
- Modify: `test/fake-lsp/fake-lsp` (a hold sends `window/workDoneProgress/create` first, and `end` when cancelled)
- Modify: `test/e2e/fake.12-pause.e2e.ts` (the running words, a hidden run, size)
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3 `progressWords(message, label)`; Task 5 `PauseController` (its private `run`, `paint`, `endRun`), `Api.pause`.
- Produces:
  - `src/pause/progress.ts`: `ProgressValue`, `Claim`, `ProgressClaims` (`claim(title, words): Claim`, `hear(token, v)`, `clear()`).
  - `src/server.ts`: `ClientHooks.progress?(token: string | number, v: ProgressValue): void`.
  - `PauseController.progress(token, v)`.

The hook (plan decision 1): vscode-languageclient 11.0.0 calls `middleware.handleWorkDoneProgress(token, params, next)` for every begin, report and end of a token its progress part registered from the server's `window/workDoneProgress/create`. Calling `next()` keeps the library's status-bar progress. olifant sends `create` for every progress (lsp-library `withIndefiniteProgress`); the fake did not, so its hold now does.

- [ ] **Step 1: Write the failing claim tests**

Create `test/unit/progress.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressClaims } from '../../src/pause/progress';

test('a claim owns the next begin with its title, and hears its words until the end (nvim lsp.claim)', () => {
  const c = new ProgressClaims();
  const heard: string[] = [];
  c.hear('t0', { kind: 'begin', title: 'conjuring', message: 'before the claim' });
  c.claim('conjuring', m => heard.push(m));
  c.hear('t1', { kind: 'begin', title: 'testing', message: 'not ours' });
  c.hear('t2', { kind: 'begin', title: 'conjuring', message: 'starting' });
  c.hear('t1', { kind: 'report', message: 'still not ours' });
  c.hear('t2', { kind: 'report', message: 'round 4 of 9 · asking local…' });
  c.hear('t2', { kind: 'report' });
  c.hear('t2', { kind: 'end' });
  c.hear('t2', { kind: 'report', message: 'after the end' });
  assert.deepEqual(heard, ['starting', 'round 4 of 9 · asking local…']);
});

test('first come: two claims own two begins in order; a released claim owns nothing', () => {
  const c = new ProgressClaims();
  const a: string[] = [];
  const b: string[] = [];
  const gone = c.claim('conjuring', m => a.push(`gone ${m}`));
  gone.release();
  c.claim('conjuring', m => a.push(m));
  c.claim('conjuring', m => b.push(m));
  c.hear(1, { kind: 'begin', title: 'conjuring' });
  c.hear(2, { kind: 'begin', title: 'conjuring' });
  c.hear(2, { kind: 'report', message: 'two' });
  c.hear(1, { kind: 'report', message: 'one' });
  assert.deepEqual(a, ['one']);
  assert.deepEqual(b, ['two']);
});

test('release stops the words; a new begin on a token clears its owner; clear forgets all', () => {
  const c = new ProgressClaims();
  const heard: string[] = [];
  const claim = c.claim('conjuring', m => heard.push(m));
  c.hear('t', { kind: 'begin', title: 'conjuring' });
  c.hear('t', { kind: 'report', message: 'one' });
  claim.release();
  c.hear('t', { kind: 'report', message: 'two' });
  c.claim('conjuring', m => heard.push(`next ${m}`));
  c.hear('t', { kind: 'begin', title: 'mutating' });
  c.hear('t', { kind: 'report', message: 'three' });
  c.clear();
  c.hear('u', { kind: 'begin', title: 'conjuring', message: 'four' });
  assert.deepEqual(heard, ['one']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit`
Expected: FAIL at compile, `Cannot find module '../../src/pause/progress'`.

- [ ] **Step 3: Write the claims**

Create `src/pause/progress.ts`:

```ts
// progress: the server's work-done progress a resume claims (spec §3.6; nvim lsp.claim
// lsp.lua :76-121). A claim names a title; the next begin with that title is its token's, and
// that token's report words go to the claim until its end. Unclaimed progress stays the
// library's (the status bar). First come: two resumes in the air own two begins in order.
export type ProgressValue =
  | { kind: 'begin'; title: string; message?: string }
  | { kind: 'report'; message?: string }
  | { kind: 'end'; message?: string };

export interface Claim { release(): void }

interface Waiting { title: string; words(message: string): void; released: boolean }

export class ProgressClaims {
  private waiting: Waiting[] = [];
  private readonly owned = new Map<string | number, Waiting>();

  claim(title: string, words: (message: string) => void): Claim {
    const w: Waiting = { title, words, released: false };
    this.waiting.push(w);
    return { release: () => { w.released = true; } };
  }

  hear(token: string | number, v: ProgressValue): void {
    if (v.kind === 'begin') {
      this.owned.delete(token);
      this.waiting = this.waiting.filter(w => !w.released);
      const i = this.waiting.findIndex(w => w.title === v.title);
      if (i < 0) return;
      const [w] = this.waiting.splice(i, 1);
      this.owned.set(token, w);
      if (typeof v.message === 'string') w.words(v.message);
      return;
    }
    const w = this.owned.get(token);
    if (!w) return;
    if (v.kind === 'end') {
      this.owned.delete(token);
      return;
    }
    if (!w.released && typeof v.message === 'string') w.words(v.message);
  }

  // clear: the server stopped
  clear(): void {
    this.waiting = [];
    this.owned.clear();
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:unit`
Expected: the three `progress.test` tests PASS.

- [ ] **Step 5: The server hook**

In `src/server.ts`, add to the imports: `import type { ProgressValue } from './pause/progress';`. Add to `ClientHooks` after `suggestion`:

```ts
  // the server's work-done progress, every begin, report and end the library shows (M5 spec
  // §3.6): the pause window claims a resume's
  progress?(token: string | number, v: ProgressValue): void;
```

In the `middleware` object, after `resolveCompletionItem`, add:

```ts
        // seen, then shown by the library as before (its status-bar progress)
        handleWorkDoneProgress: (token, params, next) => {
          hooks.progress?.(token, params);
          next(token, params);
        },
```

(The library's `HandleWorkDoneProgressSignature` is `(token, params) => void`; check `node_modules/vscode-languageclient/lib/common/client.d.ts:223`. If its `next` takes no arguments in this version, call `next()` — the type checker says which.)

- [ ] **Step 6: The controller claims a resume's progress**

In `src/pause/controller.ts`:
- Import `ProgressClaims`, `Claim`, `ProgressValue` from `./progress` and `progressWords` from `./resume`.
- Add `claim?: Claim;` to the `Run` interface and a field `private readonly claims = new ProgressClaims();`.
- Add the method:

```ts
  // progress: the server's work-done progress (hooks.progress); a resume's words feed its run
  progress(token: string | number, v: ProgressValue): void {
    this.claims.hear(token, v);
  }
```

- In `resume()`, after `this.run = { … };` add:

```ts
    const run = this.run;
    run.claim = this.claims.claim('conjuring', m => {
      if (this.run !== run) return;
      const w = progressWords(m, runningLabel(row));
      run.message = w.text;
      if (w.round !== undefined) run.round = w.round;
      this.paint();
    });
```

- In `endRun()`, release the claim before dropping the run:

```ts
  private endRun(): void {
    if (this.run) {
      clearInterval(this.run.timer);
      this.run.claim?.release();
    }
    this.run = undefined;
  }
```

- In `stopped()`, add `this.claims.clear();` first.

In `src/extension.ts`, after `hooks.stopped = …`, add `hooks.progress = (token, v) => ctl.progress(token, v);`.

- [ ] **Step 7: The fake announces a hold's progress**

In `test/fake-lsp/fake-lsp`, in the hold branch, send the create request before the begin (olifant's lsp library does), and in the `$/cancelRequest` branch end the held token's progress:

```python
        if isinstance(result, dict) and result.get("hold"):
            # work that goes on: announced (window/workDoneProgress/create, as olifant lsp's
            # library does), its progress titled as the answer says, and no answer until cancelled
            token = "olifant-hold-%s" % msg["id"]
            send({"jsonrpc": "2.0", "id": "create-%s" % msg["id"], "method": "window/workDoneProgress/create", "params": {"token": token}})
            send({"jsonrpc": "2.0", "method": "$/progress", "params": {"token": token, "value": {"kind": "begin", "title": result.get("title", "conjuring")}}})
            for words in result.get("progress", []):
                send({"jsonrpc": "2.0", "method": "$/progress", "params": {"token": token, "value": {"kind": "report", "message": words}}})
            held.append(msg["id"])
            continue
```

```python
    elif method == "$/cancelRequest":
        # a held request the client gave up on: its progress ends, and it is cancelled, as olifant lsp answers it
        rid = msg["params"]["id"]
        if rid in held:
            held.remove(rid)
            send({"jsonrpc": "2.0", "method": "$/progress", "params": {"token": "olifant-hold-%s" % rid, "value": {"kind": "end"}}})
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32800, "message": "cancelled"}})
```

Update the header comment's hold sentence to: `{"hold": true, "progress": [words…]} announces its progress (window/workDoneProgress/create), reports it and answers only a $/cancelRequest, as cancelled, ending the progress`.

- [ ] **Step 8: Write the failing e2e cases**

Add to `test/e2e/fake.12-pause.e2e.ts`, inside the `describe`:

```ts
  it('the running view: the row\'s label, the server\'s words without the round prefix, the round', async () => {
    const a = await running();
    await conjureAt(3, paused());
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 4 of 9 · asking local (qwen3-coder:30b)…'] });
    await a.pause.press('c');
    const v = await until(() => {
      const x = a.pause.view();
      return x && x.status && plain(x.status).includes('asking local (qwen3-coder:30b)…') ? x : undefined;
    }, 'the words in the running view');
    assert.equal(v.state, 'running');
    assert.ok(!plain(v.status!).includes('round 4 of 9 ·'), plain(v.status!));
    assert.ok(plain(v.status!).startsWith('▶ continue'), plain(v.status!));
    assert.ok(plain(v.title).includes('running'));
    assert.ok(plain(v.title).includes('round 4'), plain(v.title));
    assert.equal(v.legend, 'x cancel · q hide (it goes on) · ? help');
    await a.pause.press('x');
    await until(() => !a.pause.view(), 'cancelled');
  });

  it('the opening conjure claims nothing: its words stay the library\'s', async () => {
    const a = await running();
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(3, 0, 3, 0);
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 1 of 9 · asking local…'] });
    const n = conjures().length;
    void vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the conjure sent');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(a.pause.view(), undefined);
    a.tdd.cancel();
    await until(() => log().some(m => m.method === '$/cancelRequest' && m.params.id === conjures()[n].id), 'cancelled');
  });

  it('q during the run hides the window; the run goes on; its next pause opens the window again', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const next = paused('wired');
    next.paused.token = 'conjure-2';
    reply('olifant/conjure', { delay: 1.5, ...next });
    const n = resumes().length;
    await a.pause.press('c');
    await a.pause.press('q');
    assert.equal(a.pause.view(), undefined);
    await until(() => a.pause.stored(uriOf(MAIN)), 'the next pause', 10_000);
    await until(() => a.pause.view(), 'the window again');
    assert.equal(resumes().length, n + 1);
    assert.ok(!log().some(m => m.method === '$/cancelRequest' && m.params.id === conjures().at(-1)!.id));
  });

  it('q during the run, then a landing: it lands with no window', async () => {
    const a = await running();
    await conjureAt(3, paused());
    reply('olifant/conjure', { delay: 1.5, ...landed() });
    await a.pause.press('a');
    await a.pause.press('q');
    await until(() => vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN))?.lineAt(2).text === 'line_3 = 33', 'the keep landed', 10_000);
    assert.equal(a.pause.view(), undefined);
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a narrow panel: narrow texts, Tab flips, a wide one shows both (spec §4.3)', async () => {
    const a = await running();
    await conjureAt(3, paused());
    // the page reports its own size once it loads; let that pass first
    await new Promise(r => setTimeout(r, 500));
    await a.pause.receive({ type: 'size', cols: 90 });
    let v = a.pause.view()!;
    assert.ok(v.narrow);
    assert.ok(v.legend.startsWith('Tab diff'), v.legend);
    assert.ok(plain(v.diff.title).endsWith(' · Tab back'), plain(v.diff.title));
    await a.pause.press('Tab');
    assert.ok(a.pause.view()!.flipped);
    await a.pause.receive({ type: 'size', cols: 160 });
    v = a.pause.view()!;
    assert.ok(!v.narrow);
    await a.pause.press('Tab');
    assert.equal(a.pause.notices().at(-1), 'Tab: both panes are shown');
  });

  it('a server restart drops every pause and closes the window, silently', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.restartServer');
    await until(() => a.server.state() === 'running', 'running again', 60_000);
    assert.ok(!a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.reminders(uriOf(MAIN)), 0);
    assert.deepEqual(a.shown.slice(from).filter(s => s.text.includes('pause')), []);
  });
```

- [ ] **Step 9: Run them**

Run: `npm run lint && npm run test:unit && DURANDAL_E2E_ONLY=fake.12 npm run test:e2e`
Expected: PASS, including the M4 `fake.11` hold tests (`DURANDAL_E2E_ONLY=fake.11` once more to be sure the fake's `create` did not change them).

If the running-words test times out with the status line still `▶ continue - starting…` (the model's default message), the hook did not fire: log the middleware call, and check that the client answered the fake's `window/workDoneProgress/create` (the fake log holds the answer, `{"id": "create-<n>", "result": null}`).

- [ ] **Step 10: README and CHANGELOG**

In `README.md`, replace the sentence `A conjure that pauses (a decision model with a ladder) offers Continue and Stop; the steering window comes in a later release.` with `A conjure that pauses opens the pause window (below).` Then add this section after the TDD loop's paragraph, before `## Settings`:

```markdown
## The pause window

A conjure that pauses (a project with a decision model and a ladder) opens a tab beside the
file. The left side says why it stopped, lists the rounds (the wire as entry 0, accepted steps
between them) and the tests involved, and offers what can be done next, each on a key. The right
side shows the diff the selected entry would land. One letter or a click answers; the tab then
shows the run, and the next pause or the landing.

| Key | What it does |
|---|---|
| `c` / `h` | Continue: more rounds with this model; `h` asks a sentence for the model first. |
| `C` | Climb to the stronger model. |
| `w` `W`, `t` `T`, `p` `P` | Wire a port, fix a test, add the method a port lacks (the first / the second). |
| `a` | Accept the diff on the right: keep that round (red), keep the wire alone, or accept a proposal. |
| `r` | Reject the proposal. |
| `s` | Stop: nothing lands. |
| `[` `]`, `0`-`9` | Previous / next entry, or jump to one; the diff follows. |
| `j` `k`, PageUp PageDown | Scroll the diff. |
| `Tab` | In a narrow tab, move between the situation and the diff. |
| `d` | The details as a markdown document beside the tab. |
| `x` | Cancel a run (nothing lands). |
| `q`, `Esc` | Close the tab; the pause stays. |
| `?` | The keys; any key closes them. |

Closing the tab keeps the pause: `Cmd+Alt+D C` (`Ctrl+Alt+D C`) inside the unit reopens it, and a
note at the end of the unit's last line says so. Editing the file drops the pause, as the server
does; a conjure elsewhere in the file forgets it. A pause lives ten minutes on the server.
```

In `CHANGELOG.md`, under `## Unreleased`, change the M4 line's `conjure (a pause offers Continue / Stop)` to `conjure`, and add as the first entry:

```markdown
- The pause window: a paused conjure opens a tab beside the file with the situation, the rounds,
  the offers on their keys and the diff they would land; resumes run in it with the server's
  words, `d` opens the details as markdown, and the pause survives the tab (milestone 5a).
```

- [ ] **Step 11: The manual checklist and the PR**

Run the whole local gate once more:

```bash
npm run lint && npm run test:unit && npm run test:e2e
```

Expected: lint clean; unit PASS; e2e `fake` and `bare` PASS (the `real` suite runs only with `OLIFANT_BIN` and `OLIFANT_REPO`; with them, `real.1`-`real.8` still PASS, since M5a changes no real-server flow).

Commit:

```bash
git add src/pause/progress.ts src/pause/controller.ts src/server.ts src/extension.ts test/unit/progress.test.ts test/fake-lsp/fake-lsp test/e2e/fake.12-pause.e2e.ts README.md CHANGELOG.md
git commit -m "pause: the running view hears the resume's progress; a hidden run reopens on its pause; README"
```

Push the branch and open the PR (after the final Fable review of the branch and its fixes):

```bash
git push -u origin m5a-pause
gh pr create --title "M5a: the pause window" --body-file <scratch>/m5a-pr.md
```

The PR body lists: what the window does (one paragraph); the plan decisions 1-8 of this plan, with 6 marked "M5b"; spec corrections found (the fixtures are wrapped, not bare; any the executors met); the follow-ups the spec names as olifant notes (the resume error text omits `port`; no top-level `hint`); and this manual checklist, unticked:

```markdown
- [ ] Light and dark themes: every span kind readable; the selected band visible.
- [ ] A narrow tab (drag the split): the panes stack, `Tab` moves between them, texts switch.
- [ ] The tab opens beside the file and takes focus: the letters work at once.
- [ ] Clicks and keys do the same: an entry click selects, a row click answers.
- [ ] `d`: the details document's headings, outline and fenced highlighting.
- [ ] A real paused conjure (`DURANDAL_E2E_MODEL` project): the running view shows olifant's words.
- [ ] The reminder beside ⚡ hints: readable, not confused with them.
```

---

## M5b: the review sources (branch `m5b-reviews`, from `main` after M5a merges)

### Task 7: Review view models, facts and the plan rule (pure)

**Files:**
- Create: `src/pause/reviewModel.ts`, `src/plans/facts.ts`, `src/plans/isPlan.ts`
- Create: `test/fixtures/review/do.json`, `test/fixtures/review/errand.json`, `test/fixtures/review/reconcile.json`
- Create: `test/unit/reviewModel.test.ts`, `test/unit/facts.test.ts`, `test/unit/isPlan.test.ts`
- Modify: `test/pauseFixtures.ts` (Task 1 made it with `fixture()`): add `reviewFixture()`
- Modify: `src/protocol.ts`: the comment above `Fact` only (the confirmed shapes)

`src/plans/isPlan.ts` holds only the pure rule and imports nothing. Task 8 puts the vscode glue (`trackIsPlan(context)`, which sets `durandal.isPlan`) in a new file, `src/plans/trackIsPlan.ts`. That keeps `isPlan.ts` free of vscode so `node --test` can load it.

**Interfaces:**
- Consumes:
  - Task 1: `Line`, `Span`, `SpanKind`, `Row`, `View`, `plain` (`viewModel.ts`); `given`, `width`, `cut`, `wrap` (`text.ts`); `Review`, `DoReview`, `ReconcileReview`, `ReadingEntry`, `ReviewOffer`, `ReviewListItem`, `Fact` (`protocol.ts`).
  - Task 2 (`model.ts`): `KeyHelp`, `rowLines(rows, width)`, `helpLines(width, keys)`, `layout(cols)`, `conjureKeys(chord)`, `conjureLegend(o)`. This task reuses them and ports none of them again:
    - The scroll, `Tab` and `?` entries of the three key tables are Task 2's `conjureKeys('')` entries (`j k`, `PageDown PageUp`, `Tab`, `?`), found by key (nvim's `pause.key(token)`).
    - The legend's scroll part (`j k … scroll`) comes from Task 2's `conjureLegend`, so both sources spell it the same way.
    - Rows: `rowLines(rows, width).lines` sliced at `starts[i]`. Row `i` covers lines `starts[i]` up to `starts[i+1]`; the first of them starts with Task 2's `{ text: key, kind: 'key' }` span. This task adds no key span of its own.
    - Help width: `layout(cols).narrow ? text : right - 4` (pause.lua: `(narrow and geo.width or geo.right) - 4`, where `right = width - left`).
    - Assumption: `helpLines` shows `KeyHelp.keys.join(' ')` in the key column, as nvim shows `q Esc` and `[ ]`. The tables below write keys as the page names them (`['q', 'Escape']`, `['[', ']']`; the digit range `['1-9']`); `helpLines` shows `Escape` as `Esc`, as Task 2's conjure table does.
- Produces (the contract's Task 7 block, with the changes in **bold**):
  - `reviewModel.ts`:
    - `interface ReviewRow { key; label; detail; choice; entry?; step? }`; `DO_KEYS`, `ERRAND_KEYS`, `READING_KEYS: KeyHelp[]`.
    - **`NOT_OFFERED: { do: Record<string, string>; reading: Record<string, string> }`**. One flat Record cannot hold both sources: `a` and `r` mean different things for a do and for a reading.
    - **`notOffered(r: Review, key: string): string`** (new). A do gives `NOT_OFFERED.do[key]`. A reconcile with no entries gives `nothing to review`; otherwise `NOT_OFFERED.reading[key]` or `no step <key> to place it under`. The controller checks busy first (`the last answer is still on its way`).
    - `reviewRows(r, selected)`, `reviewView(r, o)` and `reviewTitle(r)`, as the contract gives them.
    - `entryIndex(r, entry)`, `pickAtCursor(reviews, line)`, `oneCommand(s)` and `busyWords(choice)`, also as the contract gives them.
    - `reviewView`'s `o.busy` is the **choice** being answered. The legend becomes `busyWords(o.busy)`, and `state` becomes `'busy'`. `o.chord` is accepted but unused: the review's `q` help names its lens, not the chord.
  - `facts.ts`: `interface TextEdit0 { start; end; lines }`; `factEdits(lines, facts): TextEdit0[]`.
  - `isPlan.ts`: `isPlanPath(path, root, languageId): boolean`.

**View conventions (shared with Task 2 and Task 4):**
- `View.lines` never holds the title line. The page draws `view.title`, or `view.short` when narrow.
- `title` is the first of full / short / bare that fits `width` cells; when even bare does not fit, it is cut with `…` (pause.lua `edge`). `short` is bare, fitted the same way.
- `entryAt[i]` is the file (do) or the reading (reconcile) that line `i` shows, else -1. `selected` is -1 when there are none. The selected line is the one whose `entryAt` equals `selected`, so the `> ` and the page's band mark the same line.
- Diff lines are one plain span each; the page colours them by sign, as for the conjure diff. The no-change lines are `dim`.
- Legend: `[ ] files` or `[ ] readings`, then the scroll part, `d details · ? help · q later`, with `Tab diff · ` first when narrow. When wide, ` (the review stays)` is added only when the whole fits the text pane, as nvim chooses between legend and legend_short. At the 74-cell maximum it never fits, as in nvim at 150 columns.

**Confirmed against olifant `1ae076fc`:**
- **Facts** (`Server/LoopTypes.hs:37` `data Fact = Replace Int Text | Insert Int [Text] | ReplaceRows Int Int [Text]`; `Server/Loop.hs:283-288` `factJson`; semantics in `Server/ReviewReadings.hs:239-245` `applyFactsText`):
  - `{row, text}` replaces row `row`.
  - `{after, lines}` inserts after row `after`. Several after one row keep the facts' order. An insert after a row inside a range lands below the range.
  - `{from, to, lines}` replaces rows `from..to`, **with `to` inclusive** (LoopSpec:931: `ReplaceRows 1 2 [B1,B2,B3]` on `a,b1,b2,…` replaces `b1,b2`). It does exist on the wire; `Excerpt.hs:128-133` makes it, for frozen and re-rendered code excerpts.
  - Rows are 0-based rows of the plan text before the answer.
  - The do's `test` choice sends `facts = map factJson (withJournal (ttFacts t) jf)` (`Lsp.hs` chooseReview `"test"` branch), so all three shapes can arrive.
  - nvim's `apply_facts` ignores `{from,to,lines}`. This port follows nvim for `{row}` and `{after}` (clamping, the no-op replace dropped) and the server for ranges.
- **`denied` is `string[]`** (`Review.hs:211` `deniedWords :: [Denial] -> [Text] -> [Text]`), not the string the fact sheet says. The model still accepts a bare string as one item.
- `title.step` is an ordinal or null, and `title.unit` may be null. An errand is the same payload with `kind: "errand"`, its badge suffixed ` · kept|reverted|reopened`, and `reopen` as its only offer.

Replace the `Fact` comment in `src/protocol.ts`:

```ts
// facts (olifant Loop.hs factJson, ReviewReadings.hs applyFactsText): rows are 0-based rows of
// the plan text before the answer. {row, text} replaces a row; {after, lines} inserts below a
// row (several at one row in order); {from, to, lines} replaces rows from..to, to inclusive.
export type Fact = { row: number; text: string } | { after: number; lines: string[] } | { from: number; to: number; lines: string[] };
```

- [ ] **Step 1: Vendor the review fixtures and the fixture helper**

These were written from durandal.nvim `tests/review_spec.lua`'s builders: `payload()` (:19-39), `past()` (:351-355) and `readings()` (:266-270), with `vim.NIL` written as `null`. In `past()`, `vim.tbl_deep_extend` merges `title`, so the errand keeps verb, step, unit, model, seconds and cost; only the badge becomes `◆ answered · kept`.

`test/fixtures/review/do.json`:

```json
{
  "id": "R1",
  "kind": "do",
  "plan": "plans/t.md",
  "row": 2,
  "title": {
    "verb": "do",
    "step": 1,
    "unit": "Table.label",
    "badge": "◆ answered",
    "model": "sonnet",
    "seconds": 42,
    "cost": 0.06
  },
  "summary": "The do changed 2 files.",
  "step": "- [ ] add a label @src/a.py:Table.label",
  "said": [
    "changed @src/a.py:Table.label"
  ],
  "tests": {
    "ran": true,
    "passed": 1,
    "failed": 0,
    "list": [
      {
        "test": "test_label",
        "status": "passed"
      }
    ]
  },
  "denials": [
    {
      "tool": "Bash",
      "input": "python -m pytest t.py",
      "pattern": "Bash(python -m pytest*)",
      "allowed": false
    }
  ],
  "denied": [
    "tried `python -m pytest t.py` 3 times; not allowed.",
    "Allowed: `uv run …`."
  ],
  "landing": {
    "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n",
    "files": [
      {
        "file": "src/a.py",
        "status": "modified",
        "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n"
      },
      {
        "file": "src/b.py",
        "status": "added",
        "diff": "--- a/src/b.py\n+++ b/src/b.py\n@@ -0,0 +1,1 @@\n+y = 1\n"
      }
    ],
    "edit": null
  },
  "offers": [
    {
      "choice": "keep",
      "key": "a",
      "label": "keep the change",
      "detail": "the files stay"
    },
    {
      "choice": "revert",
      "key": "r",
      "label": "revert the change",
      "detail": "files restored"
    },
    {
      "choice": "test",
      "key": "t",
      "label": "run the step's tests now",
      "detail": "their marks land"
    },
    {
      "choice": "allow",
      "key": "p",
      "label": "allow `Bash(python -m pytest*)`",
      "detail": "in future dos"
    }
  ],
  "details": [
    {
      "title": "the step",
      "text": "- [ ] add a label"
    },
    {
      "title": "diff · src/a.py",
      "text": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n",
      "lang": "diff"
    }
  ]
}
```

`test/fixtures/review/errand.json`:

```json
{
  "id": "R1",
  "kind": "errand",
  "plan": "plans/t.md",
  "row": 2,
  "title": {
    "verb": "do",
    "step": 1,
    "unit": "Table.label",
    "badge": "◆ answered · kept",
    "model": "sonnet",
    "seconds": 42,
    "cost": 0.06
  },
  "summary": "The do changed 2 files.",
  "step": "- [ ] add a label @src/a.py:Table.label",
  "said": [
    "changed @src/a.py:Table.label"
  ],
  "tests": {
    "ran": true,
    "passed": 1,
    "failed": 0,
    "list": [
      {
        "test": "test_label",
        "status": "passed"
      }
    ]
  },
  "denials": [
    {
      "tool": "Bash",
      "input": "python -m pytest t.py",
      "pattern": "Bash(python -m pytest*)",
      "allowed": false
    }
  ],
  "denied": [
    "tried `python -m pytest t.py` 3 times; not allowed.",
    "Allowed: `uv run …`."
  ],
  "landing": {
    "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n",
    "files": [
      {
        "file": "src/a.py",
        "status": "modified",
        "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n"
      },
      {
        "file": "src/b.py",
        "status": "added",
        "diff": "--- a/src/b.py\n+++ b/src/b.py\n@@ -0,0 +1,1 @@\n+y = 1\n"
      }
    ],
    "edit": null
  },
  "offers": [
    {
      "choice": "reopen",
      "key": "o",
      "label": "reopen: ask for more in the same thread",
      "detail": "a do on the step resumes its thread"
    }
  ],
  "details": [
    {
      "title": "the step",
      "text": "- [ ] add a label"
    },
    {
      "title": "diff · src/a.py",
      "text": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n class Table:\n+    def label(self) -> str: return self.id\n",
      "lang": "diff"
    }
  ]
}
```

`test/fixtures/review/reconcile.json`:

```json
{
  "id": "reconcile",
  "kind": "reconcile",
  "plan": "plans/t.md",
  "title": {
    "verb": "reconcile",
    "count": 2
  },
  "summary": "2 readings to review",
  "entries": [
    {
      "id": "done|src/a.py|Table.label|abc1234",
      "kind": "done",
      "row": 2,
      "step": 1,
      "summary": "Step 1 looks done",
      "offers": [
        {
          "choice": "apply",
          "key": "a",
          "label": "tick it",
          "detail": "the step's line ticked"
        },
        {
          "choice": "leave",
          "key": "r",
          "label": "leave it",
          "detail": "the step stays open"
        }
      ],
      "landing": {
        "edit": null,
        "diff": "--- a/plans/t.md\n+++ b/plans/t.md\n@@ -3,1 +3,1 @@\n-- [ ] add a label @src/a.py:Table.label\n+- [x] add a label @src/a.py:Table.label ✓ abc1234\n\n--- a/src/a.py\n+++ b/src/a.py\n@@ -1,1 +1,2 @@\n+    def label(self) -> str: return self.id",
        "facts": 1
      }
    },
    {
      "id": "unplaced|src/a.py|spare|def5678",
      "kind": "unplaced",
      "row": null,
      "step": null,
      "summary": "Not in any step: `spare` in a.py",
      "offers": [
        {
          "choice": "apply",
          "key": "a",
          "label": "add it as a new step",
          "detail": "- [ ] def spare() @src/a.py:spare"
        },
        {
          "choice": "place",
          "key": "1",
          "label": "under Step 1",
          "detail": "- [ ] add a label",
          "step": 2
        },
        {
          "choice": "place",
          "key": "2",
          "label": "under Step 2",
          "detail": "- [ ] next",
          "step": 3
        },
        {
          "choice": "new",
          "key": "n",
          "label": "a new step",
          "detail": "- [ ] def spare() @src/a.py:spare"
        },
        {
          "choice": "ignore",
          "key": "i",
          "label": "not work: ignore it",
          "detail": "until it changes again"
        }
      ],
      "landing": {
        "edit": null,
        "diff": "--- a/plans/t.md\n+++ b/plans/t.md\n@@ -4,1 +4,2 @@\n - [ ] next\n+- [ ] def spare() @src/a.py:spare",
        "facts": 1
      }
    }
  ],
  "details": [
    {
      "title": "readings",
      "text": "done|src/a.py|Table.label|abc1234\n"
    }
  ]
}
```

Add to `test/pauseFixtures.ts`, below Task 1's `fixture()`. Keep its `readFileSync` and `join` imports; add them if that file builds its path differently. The path resolves from `out/test/pauseFixtures.js` back to the source tree, as `fixture()` does:

```ts
import type { DoReview, ReconcileReview } from '../src/protocol';

// A review payload from test/fixtures/review (written from durandal.nvim review_spec.lua's
// builders): do = payload(), errand = past(), reconcile = readings(). A fresh copy each call.
export function reviewFixture(name: 'do' | 'errand'): DoReview;
export function reviewFixture(name: 'reconcile'): ReconcileReview;
export function reviewFixture(name: 'do' | 'errand' | 'reconcile'): DoReview | ReconcileReview {
  return JSON.parse(readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'review', `${name}.json`), 'utf8')) as DoReview | ReconcileReview;
}
```

- [ ] **Step 2: Write the failing plan-rule test**

`test/unit/isPlan.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlanPath } from '../../src/plans/isPlan';

test('a markdown file under <root>/plans/ is a plan, at any depth', () => {
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/sub/y.md', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one/', 'markdown'), true);
});

test('markdown is a .md name or the markdown language', () => {
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one', 'plaintext'), true);
  assert.equal(isPlanPath('/w/one/plans/X.MD', '/w/one', 'plaintext'), true);
  assert.equal(isPlanPath('/w/one/plans/notes', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/x.py', '/w/one', 'python'), false);
});

test('outside plans/ or outside a project it is not', () => {
  assert.equal(isPlanPath('/w/plain/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plansx/a.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/other/plans/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans/x.md', undefined, 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans/', '/w/one', 'markdown'), false);
});

test('Windows separators are the same rule', () => {
  assert.equal(isPlanPath('C:\\w\\one\\plans\\x.md', 'C:\\w\\one', 'markdown'), true);
  assert.equal(isPlanPath('C:\\w\\one\\src\\x.md', 'C:\\w\\one', 'markdown'), false);
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `npm run test:unit`
Expected: the compile fails with `Cannot find module '../../src/plans/isPlan'`.

- [ ] **Step 4: Write `src/plans/isPlan.ts`**

```ts
// The plan rule (spec §5.1): a markdown document (a .md name, or language markdown) under
// <project root>/plans/. Pure: Task 8's trackIsPlan.ts sets durandal.isPlan with it.

// PATH a file system path, ROOT its olifant project's root (undefined: in none).
export function isPlanPath(path: string, root: string | undefined, languageId: string): boolean {
  if (root === undefined || root === '') return false;
  const norm = (p: string) => p.replace(/\\/g, '/');
  const file = norm(path);
  const plans = `${norm(root).replace(/\/+$/, '')}/plans/`;
  if (!file.startsWith(plans) || file.length === plans.length) return false;
  return languageId === 'markdown' || file.toLowerCase().endsWith('.md');
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `npm run test:unit`
Expected: the 4 isPlan tests pass. Nothing else changes.

- [ ] **Step 6: Write the failing facts test**

Ported from durandal.nvim `plans.apply_facts` (plans.lua :313-343) and review_spec's `t` case (:162-171). The range case is olifant's `LoopSpec.hs:931` example.

`test/unit/facts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fact } from '../../src/protocol';
import { factEdits, type TextEdit0 } from '../../src/plans/facts';

const PLAN = ['# T', '', '- [ ] add a label @src/a.py:Table.label', '- [ ] next'];

// the edits applied one by one, in their order
const apply = (lines: string[], edits: TextEdit0[]): string[] => {
  const out = [...lines];
  for (const e of edits) out.splice(e.start, e.end - e.start, ...e.lines);
  return out;
};

test('{row, text} replaces that line (review_spec: t lands the tick)', () => {
  const facts: Fact[] = [{ row: 2, text: '- [x] add a label @src/a.py:Table.label ✓ abc1234' }];
  assert.deepEqual(factEdits(PLAN, facts), [{ start: 2, end: 3, lines: ['- [x] add a label @src/a.py:Table.label ✓ abc1234'] }]);
});

test('a replace that changes nothing is dropped; out of range is dropped; the last for a row wins', () => {
  assert.deepEqual(factEdits(PLAN, [{ row: 3, text: '- [ ] next' }]), []);
  assert.deepEqual(factEdits(PLAN, [{ row: 4, text: 'x' }, { row: -1, text: 'x' }]), []);
  assert.deepEqual(factEdits(PLAN, [{ row: 3, text: 'a' }, { row: 3, text: 'b' }]), [{ start: 3, end: 4, lines: ['b'] }]);
});

test('{after, lines} inserts below that row; several below one row keep the engine\'s order', () => {
  assert.deepEqual(factEdits(PLAN, [{ after: 2, lines: ['  - also @src/a.py:Table'] }]), [{ start: 3, end: 3, lines: ['  - also @src/a.py:Table'] }]);
  const facts: Fact[] = [{ after: 2, lines: ['  - one'] }, { after: 2, lines: ['  - two', '  - three'] }];
  assert.deepEqual(apply(PLAN, factEdits(PLAN, facts)), ['# T', '', '- [ ] add a label @src/a.py:Table.label', '  - one', '  - two', '  - three', '- [ ] next']);
});

test('inserts are clamped: -1 is the top, past the end the bottom; no lines is dropped', () => {
  assert.deepEqual(factEdits(PLAN, [{ after: -1, lines: ['top'] }]), [{ start: 0, end: 0, lines: ['top'] }]);
  assert.deepEqual(factEdits(PLAN, [{ after: 99, lines: ['end'] }]), [{ start: 4, end: 4, lines: ['end'] }]);
  assert.deepEqual(factEdits(PLAN, [{ after: 1, lines: [] }]), []);
});

test('replaces and inserts together: bottom up, the replace before an insert at the same line', () => {
  const facts: Fact[] = [{ after: 0, lines: ['under title'] }, { row: 2, text: '- [x] a' }, { after: 1, lines: ['above a'] }, { after: 3, lines: ['last'] }];
  const edits = factEdits(PLAN, facts);
  assert.deepEqual(edits, [
    { start: 4, end: 4, lines: ['last'] },
    { start: 2, end: 3, lines: ['- [x] a'] },
    { start: 2, end: 2, lines: ['above a'] },
    { start: 1, end: 1, lines: ['under title'] },
  ]);
  assert.deepEqual(apply(PLAN, edits), ['# T', 'under title', '', 'above a', '- [x] a', '- [ ] next', 'last']);
});

test('edits never overlap: as one workspace edit they give the same text', () => {
  const facts: Fact[] = [{ row: 0, text: '# U' }, { after: 0, lines: ['x'] }, { from: 2, to: 3, lines: ['y'] }, { after: 3, lines: ['z'] }];
  const edits = factEdits(PLAN, facts);
  const asc = [...edits].reverse();
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].end <= asc[i].start, JSON.stringify(asc));
  assert.deepEqual(apply(PLAN, edits), ['# U', 'x', '', 'y', 'z']);
});

test('{from, to, lines} replaces rows from..to (to inclusive), as the server\'s applyFactsText', () => {
  // olifant LoopSpec: applyFactsText [ReplaceRows 1 2 [B1,B2,B3], ReplaceRows 4 6 [E], Insert 6 [after], Insert 2 [below B]]
  const lines = ['a', 'b1', 'b2', 'c', 'e1', 'e2', 'e3', 'f'];
  const facts: Fact[] = [
    { from: 1, to: 2, lines: ['B1', 'B2', 'B3'] }, { from: 4, to: 6, lines: ['E'] }, { after: 6, lines: ['after'] }, { after: 2, lines: ['below B'] },
  ];
  assert.deepEqual(apply(lines, factEdits(lines, facts)), ['a', 'B1', 'B2', 'B3', 'below B', 'c', 'E', 'after', 'f']);
  assert.deepEqual(factEdits(lines, [{ from: 1, to: 2, lines: ['B'] }]), [{ start: 1, end: 3, lines: ['B'] }]);
});

test('a range: clamped to the document; changing nothing, dropped; a replace inside it, dropped; an insert inside it goes below it', () => {
  assert.deepEqual(factEdits(PLAN, [{ from: 3, to: 9, lines: ['N'] }]), [{ start: 3, end: 4, lines: ['N'] }]);
  assert.deepEqual(factEdits(PLAN, [{ from: 7, to: 9, lines: ['N'] }]), []);
  assert.deepEqual(factEdits(PLAN, [{ from: 2, to: 3, lines: PLAN.slice(2) }]), []);
  assert.deepEqual(factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { row: 2, text: 'lost' }]), [{ start: 1, end: 3, lines: ['R'] }]);
  assert.deepEqual(apply(PLAN, factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { after: 1, lines: ['below'] }])), ['# T', 'R', 'below', '- [ ] next']);
  // a second range over the first's rows is dropped
  assert.deepEqual(factEdits(PLAN, [{ from: 1, to: 2, lines: ['R'] }, { from: 2, to: 3, lines: ['S'] }]), [{ start: 1, end: 3, lines: ['R'] }]);
});

test('no facts, no edits', () => {
  assert.deepEqual(factEdits(PLAN, []), []);
});
```

- [ ] **Step 7: Run it and see it fail**

Run: `npm run test:unit`
Expected: `Cannot find module '../../src/plans/facts'`.

- [ ] **Step 8: Write `src/plans/facts.ts` and fix the `Fact` comment in `src/protocol.ts`** (the block under "Confirmed" above)

Every edit is in the coordinates of the original lines, and no two edits overlap; two may only touch at one start. So Task 8 can apply them as one `WorkspaceEdit` (each `start..end` as the range `(start,0)..(end,0)`, with `lines.map(l => l + '\n')` as the new text; an insert at the line count goes at the end of the last line with a leading `\n`). The bottom-up order also lets the edits be applied one at a time.

```ts
// A choose answer's facts as edits of a plan's lines (durandal.nvim plans.apply_facts, and
// the server's applyFactsText for a range). Rows are 0-based rows of LINES as they are; `to`
// is inclusive. No vscode import: M6's plan verbs reuse it.
import type { Fact } from '../protocol';

// Replace lines [start, end) with LINES (0-based, the document's lines before any edit).
export interface TextEdit0 { start: number; end: number; lines: string[] }

const isReplace = (f: Fact): f is { row: number; text: string } =>
  typeof (f as { row?: unknown }).row === 'number' && typeof (f as { text?: unknown }).text === 'string';
const isInsert = (f: Fact): f is { after: number; lines: string[] } =>
  typeof (f as { after?: unknown }).after === 'number' && Array.isArray((f as { lines?: unknown }).lines);
const isRange = (f: Fact): f is { from: number; to: number; lines: string[] } =>
  typeof (f as { from?: unknown }).from === 'number' && typeof (f as { to?: unknown }).to === 'number' && Array.isArray((f as { lines?: unknown }).lines);

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// FACTS over LINES as edits, bottom-up (by start, descending; at one start the replace before
// the insert), none overlapping, each in the coordinates of LINES: applied one by one in this
// order, or all at once as one workspace edit, they give the same text.
// - {row, text}: line ROW becomes TEXT; out of range, or no change: dropped; the last for a
//   row wins.
// - {from, to, lines}: rows FROM..TO (inclusive, clamped to the document) become LINES; one
//   overlapping an earlier range, or changing nothing: dropped. A {row} inside it is dropped.
// - {after, lines}: LINES go below row AFTER (clamped: -1 is the top, past the end the
//   bottom); below a range's row, below the range. Several at one place keep the engine's
//   order. No lines: dropped.
export function factEdits(lines: string[], facts: Fact[]): TextEdit0[] {
  const n = lines.length;
  const ranges: { start: number; end: number; lines: string[] }[] = [];
  for (const f of facts) {
    if (!isRange(f)) continue;
    const start = Math.max(f.from, 0);
    const end = Math.min(f.to, n - 1) + 1;
    if (start >= end) continue;
    if (ranges.some(r => start < r.end && r.start < end)) continue;
    ranges.push({ start, end, lines: [...f.lines] });
  }
  const inRange = (row: number) => ranges.find(r => r.start <= row && row < r.end);

  const replaced = new Map<number, string>();
  for (const f of facts) {
    if (isRange(f) || !isReplace(f)) continue;
    if (f.row < 0 || f.row >= n || inRange(f.row)) continue;
    replaced.set(f.row, f.text);
  }

  const inserts: { at: number; after: number; i: number; lines: string[] }[] = [];
  facts.forEach((f, i) => {
    if (isRange(f) || isReplace(f) || !isInsert(f) || f.lines.length === 0) return;
    const r = inRange(f.after);
    const at = r ? r.end : Math.max(0, Math.min(f.after + 1, n));
    inserts.push({ at, after: f.after, i, lines: [...f.lines] });
  });
  inserts.sort((a, b) => a.at - b.at || a.after - b.after || a.i - b.i);

  const edits: TextEdit0[] = [];
  for (const r of ranges) if (!same(lines.slice(r.start, r.end), r.lines)) edits.push(r);
  for (const [row, text] of replaced) if (lines[row] !== text) edits.push({ start: row, end: row + 1, lines: [text] });
  for (const x of inserts) {
    const last = edits[edits.length - 1];
    if (last && last.start === x.at && last.end === x.at) last.lines.push(...x.lines);
    else edits.push({ start: x.at, end: x.at, lines: x.lines });
  }
  // bottom up; at one start the replace (end > start) goes before the insert
  return edits.sort((a, b) => b.start - a.start || b.end - a.end);
}
```

- [ ] **Step 9: Run it and see it pass**

Run: `npm run test:unit`
Expected: the 9 facts tests pass.

- [ ] **Step 10: Write the failing review-model test**

This ports review_spec's drawing assertions one for one:
- the do drawing (:64-80), the heredoc and the 3-line caps (:82-105), and the failing test with no files (:107-112);
- the window frames of the key tests, as model facts: the diff title `file 1 of 2 · src/a.py` (:126), `]` (:137-138), the `p` and `r` why-nots (:139-142), and `1 readings to review` after an apply (:303);
- the reconcile drawing (:272-281), `]` on readings and its why-nots (:283-296), the lens opening on a reading (:348), the errand drawing (:357-363), and plan_review's pick (:323-341).

It adds the span kinds (colour as data), the title fitting, narrow, busy, help, `reviewTitle`, `entryIndex` and the edge cases.

nvim draws at a left pane of 80 cells, while the panel's widest text pane is 74 (`layout(200)`). Every ported assertion fits in 74.

`test/unit/reviewModel.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DoReview, ReconcileReview, ReviewListItem } from '../../src/protocol';
import { plain, type Line, type View } from '../../src/pause/viewModel';
import { conjureLegend, helpLines, layout, rowLines } from '../../src/pause/model';
import {
  busyWords, DO_KEYS, entryIndex, ERRAND_KEYS, NOT_OFFERED, notOffered, oneCommand, pickAtCursor, READING_KEYS,
  reviewRows, reviewTitle, reviewView,
} from '../../src/pause/reviewModel';
import { reviewFixture } from '../pauseFixtures';

// Ported from durandal.nvim tests/review_spec.lua. nvim draws at a left pane of 80 cells; the
// panel's widest text pane is 74 (layout(200)), which every assertion here fits.
const WIDE = 200;
const NARROW = 100;
const DONE = 'done|src/a.py|Table.label|abc1234';
const SPARE = 'unplaced|src/a.py|spare|def5678';

const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: Line[], s: string): boolean => texts(ls).some(l => l.includes(s));
const view = (r: DoReview | ReconcileReview, o: Partial<Parameters<typeof reviewView>[1]> = {}): View =>
  reviewView(r, { cols: WIDE, selected: 0, flipped: false, help: false, chord: 'Cmd+Alt+D', ...o });
const doReview = (o: Partial<DoReview> = {}): DoReview => ({ ...reviewFixture('do'), ...o });
// readings(which): the reconcile with only those entries (1-based, as the Lua builder)
const readings = (which: number[] = [1, 2]): ReconcileReview => {
  const r = reviewFixture('reconcile');
  const entries = which.map(i => r.entries[i - 1]);
  return { ...r, entries, title: { verb: 'reconcile', count: entries.length }, summary: `${entries.length} readings to review` };
};
// the conjure legend's scroll part (Task 2 owns its spelling)
const SCROLL = conjureLegend({ narrow: false, proposal: false, running: false, wire: false }).split(' · ').find(p => p.endsWith(' scroll'));

test('do: the step, what it said, the tests, the denials in words and the files beside the diff', () => {
  const v = view(reviewFixture('do'));
  assert.equal(plain(v.title), 'do · step 1 · Table.label · ◆ answered · sonnet · 42 s · $0.06');
  assert.equal(plain(v.lines[0]), 'The do changed 2 files.');
  assert.ok(has(v.lines, 'step    - [ ] add a label @src/a.py:Table.label'));
  assert.ok(has(v.lines, 'said    changed @src/a.py:Table.label'));
  assert.ok(has(v.lines, 'tests   ● 1 passed'));
  assert.ok(has(v.lines, 'denied  tried `python -m pytest t.py` 3 times; not allowed.'));
  assert.ok(has(v.lines, 'Allowed: `uv run …`.'));
  assert.ok(has(v.lines, '> M src/a.py'));
  assert.ok(has(v.lines, '  A src/b.py'));
  const DIFF = reviewFixture('do').landing.diff;
  assert.deepEqual([...texts(v.diff.lines), ''], DIFF.split('\n'));
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`),
    ['a keep the change', 'r revert the change', "t run the step's tests now", 'p allow `Bash(python -m pytest*)`']);
  // no hashes, no session, no also lines on screen
  for (const l of texts(v.lines)) assert.ok(!l.includes('also'), l);
});

test('do: the parts in their colours (the badge, the summary, the labels, the tests, the denial)', () => {
  const v = view(reviewFixture('do'));
  assert.deepEqual(v.title.find(s => s.text === '◆ answered'), { text: '◆ answered', kind: 'proposal' });
  assert.equal(v.title.find(s => s.text.includes('sonnet'))?.kind, 'dim');
  assert.equal(v.lines[0][0].kind, 'strong');
  const at = (s: string) => v.lines.find(l => plain(l).includes(s))!;
  assert.deepEqual(at('step    -')[0], { text: 'step', kind: 'section' });
  assert.equal(at('● 1 passed').find(s => s.text === '● 1 passed')?.kind, 'green');
  assert.equal(at('denied').find(s => s.text.startsWith('tried'))?.kind, 'red');
  assert.equal(at('Allowed:').find(s => s.text.startsWith('Allowed'))?.kind, undefined);
  assert.equal(at('> M src/a.py').find(s => s.text === 'M')?.kind, 'green');
  const blocked = view(doReview({ title: { ...reviewFixture('do').title, badge: '✗ blocked' } }));
  assert.deepEqual(blocked.title.find(s => s.text === '✗ blocked'), { text: '✗ blocked', kind: 'red' });
});

test('do: the files list: its header with [ ] file on the right; each file an entry; the selected one marked', () => {
  const v = view(reviewFixture('do'));
  const header = v.lines.find(l => plain(l).startsWith('files'))!;
  assert.equal(plain(header), `files${' '.repeat(v.width - 5 - 8)}[ ] file`);
  assert.deepEqual(header.slice(-2), [{ text: '[ ]', kind: 'key' }, { text: ' file', kind: 'dim' }]);
  const a = texts(v.lines).indexOf('> M src/a.py');
  assert.deepEqual([v.entryAt[a], v.entryAt[a + 1]], [0, 1]);
  assert.equal(v.entryAt[0], -1);
  assert.equal(v.entries, 2);
  assert.equal(v.selected, 0);
  assert.equal(v.lines.length, v.entryAt.length);
  assert.equal(plain(v.diff.title), 'file 1 of 2 · src/a.py');
});

test('do: ] shows the next file: its diff, its mark; out of range is the first', () => {
  const v = view(reviewFixture('do'), { selected: 1 });
  assert.equal(plain(v.diff.title), 'file 2 of 2 · src/b.py');
  assert.ok(has(v.lines, '> A src/b.py'));
  assert.ok(has(v.lines, '  M src/a.py'));
  assert.deepEqual(texts(v.diff.lines), ['--- a/src/b.py', '+++ b/src/b.py', '@@ -0,0 +1,1 @@', '+y = 1']);
  assert.equal(view(reviewFixture('do'), { selected: 7 }).selected, 0);
});

test('do: a denied heredoc is one row, its first line and a count; long rows cap at 3 lines (d details)', () => {
  const body = Array.from({ length: 40 }, (_, i) => `print(${i + 1})`);
  const heredoc = `python3 - <<'EOF'\n${body.join('\n')}\nEOF`;
  const long = 'word '.repeat(100);
  const v = view(doReview({ said: [long, 'short'], denied: [`tried \`${heredoc}\` 2 times; not allowed.`, 'Allowed: `uv run …`.'] }));
  const ls = texts(v.lines);
  assert.ok(has(v.lines, "denied  tried `python3 - <<'EOF' …` (42 lines) 2 times; not allowed."));
  assert.ok(!has(v.lines, 'print(1)'));
  assert.ok(has(v.lines, 'Allowed: `uv run …`.'));
  const i = ls.findIndex(l => l.startsWith('said '));
  let rows = 1;
  while (ls[i + rows]?.startsWith('        word')) rows++;
  assert.match(ls[i + rows], /… \d+ more lines \(d details\)/);
  assert.equal(rows, 3);
  assert.ok(has(v.lines, '        short'));
});

test('do: a failing test is said in red with its name; no change is said so', () => {
  const v = view(doReview({ tests: { ran: true, passed: 0, failed: 1, list: [{ test: 'test_label', status: 'failed' }] }, landing: { diff: '', files: [] } }));
  assert.ok(has(v.lines, 'tests   ✗ test_label · 0 passed'));
  assert.ok(has(v.lines, 'no file changed'));
  assert.deepEqual(texts(v.diff.lines), ['the do changed no file']);
  assert.equal(v.diff.lines[0][0].kind, 'dim');
  assert.equal(plain(v.diff.title), 'no change');
  assert.equal(v.selected, -1);
  assert.equal(v.entries, 0);
});

test('do: no tests ran, nothing said: their words, dimmed', () => {
  const v = view(doReview({ tests: { ran: false, passed: 0, failed: 0, list: [] }, said: [] }));
  assert.ok(has(v.lines, "tests   none ran (t runs the step's tests)"));
  assert.ok(has(v.lines, 'said    nothing in its grammar'));
  assert.equal(v.lines.find(l => plain(l).startsWith('said'))!.at(-1)?.kind, 'dim');
  // a null tests block is none ran
  assert.ok(has(view(doReview({ tests: null })).lines, "tests   none ran (t runs the step's tests)"));
});

test('do: the offers pane: each row in its columns, as row_lines lays it out', () => {
  const v = view(reviewFixture('do'));
  assert.ok(v.rows.some(r => r.lines.some(l => plain(l).startsWith('a  keep the change'))));
  assert.deepEqual(v.rows.flatMap(r => r.lines), rowLines(reviewRows(reviewFixture('do'), 0), v.width).lines);
  assert.ok(v.rows.every(r => r.pressable));
});

test('do: the legend ends q later; (the review stays) only when it fits; narrow: Tab diff first, Tab back on the diff', () => {
  // the tail fits no text pane (74 cells at most, as nvim's 150-column cap): the short form shows
  const v = view(reviewFixture('do'));
  const long = `[ ] files · ${SCROLL} · d details · ? help · q later (the review stays)`;
  assert.equal(v.legend, long.length <= v.width ? long : `[ ] files · ${SCROLL} · d details · ? help · q later`);
  const n = view(reviewFixture('do'), { cols: NARROW });
  assert.ok(n.narrow);
  assert.equal(n.legend, `Tab diff · [ ] files · ${SCROLL} · d details · ? help · q later`);
  assert.equal(plain(n.diff.title), 'file 1 of 2 · src/a.py · Tab back');
  assert.equal(plain(view(doReview({ landing: { diff: '', files: [] } }), { cols: NARROW }).diff.title), 'no change · Tab back');
  assert.equal(n.flipped, false);
  assert.equal(view(reviewFixture('do'), { cols: NARROW, flipped: true }).flipped, true);
  assert.equal(view(reviewFixture('do'), { flipped: true }).flipped, false);
});

test('do: the title shortens to fit: the model goes first, then the seconds and the cost', () => {
  // narrow text panes: cols - 8 cells
  const full = 'do · step 1 · Table.label · ◆ answered · sonnet · 42 s · $0.06';
  const short = 'do · step 1 · Table.label · ◆ answered · 42 s · $0.06';
  const bare = 'do · step 1 · Table.label · ◆ answered';
  assert.equal(plain(view(reviewFixture('do'), { cols: full.length + 8 }).title), full);
  assert.equal(plain(view(reviewFixture('do'), { cols: full.length + 7 }).title), short);
  assert.equal(plain(view(reviewFixture('do'), { cols: short.length + 7 }).title), bare);
  assert.equal(plain(view(reviewFixture('do'), { cols: bare.length + 7 }).title), 'do · step 1 · Table.label · ◆ answer…');
  assert.equal(plain(view(reviewFixture('do')).short), bare);
});

test('busy: the state says so and the busy words replace the legend', () => {
  const v = view(reviewFixture('do'), { busy: 'keep' });
  assert.equal(v.state, 'busy');
  assert.equal(v.legend, 'keeping…');
  assert.equal(view(reviewFixture('do')).state, 'review');
  assert.equal(busyWords('keep'), 'keeping…');
  assert.equal(busyWords('revert'), 'reverting…');
  assert.equal(busyWords('test'), "running the step's tests…");
  assert.equal(busyWords('allow'), 'allowing…');
  assert.equal(busyWords('apply'), '…');
});

test('help: the diff pane holds the source\'s key table', () => {
  const geo = layout(WIDE);
  assert.equal(view(reviewFixture('do')).help, undefined);
  assert.deepEqual(view(reviewFixture('do'), { help: true }).help, helpLines(geo.right - 4, DO_KEYS));
  assert.deepEqual(view(reviewFixture('errand'), { help: true }).help, helpLines(geo.right - 4, ERRAND_KEYS));
  assert.deepEqual(view(readings(), { help: true }).help, helpLines(geo.right - 4, READING_KEYS));
  assert.deepEqual(view(reviewFixture('do'), { help: true, cols: NARROW }).help, helpLines(layout(NARROW).text, DO_KEYS));
});

test('key tables: nvim\'s order; scroll, Tab and ? are the conjure table\'s', () => {
  const names = (ks: { keys: string[] }[]) => ks.map(k => k.keys.join(' '));
  assert.deepEqual(names(DO_KEYS).slice(0, 6), ['a', 'r', 'o', 't', 'p', '[ ]']);
  assert.deepEqual(names(DO_KEYS).slice(-3), ['d', 'q Escape', '?']);
  assert.deepEqual(names(ERRAND_KEYS).slice(0, 2), ['o', '[ ]']);
  assert.deepEqual(names(READING_KEYS).slice(0, 6), ['a', 'r', '1-9', 'n', 'i', '[ ]']);
  assert.equal(DO_KEYS[11].help, 'this help; any key closes it');
  assert.equal(READING_KEYS[10].help, 'later: the window closes; the readings stay, their lenses reopen them');
});

test('not offered: a do\'s letters and a reading\'s say why', () => {
  const only = doReview({ offers: [{ choice: 'keep', key: 'a', label: 'keep the change', detail: '' }] });
  assert.equal(notOffered(only, 'p'), 'nothing was refused');
  assert.equal(notOffered(only, 'r'), 'nothing to revert');
  assert.equal(notOffered(only, 'o'), 'this do has no thread to reopen');
  assert.equal(notOffered(only, 't'), 'no tests to run');
  assert.equal(NOT_OFFERED.do.a, 'nothing to keep');
  assert.equal(notOffered(readings(), 'r'), 'a unit in no step is not left: i ignores it');
  assert.equal(notOffered(readings(), 'i'), 'only a unit in no step is ignored');
  assert.equal(notOffered(readings(), 'n'), 'only a unit in no step becomes a new step');
  assert.equal(notOffered(readings(), 'a'), 'nothing to apply');
  assert.equal(notOffered(readings(), '5'), 'no step 5 to place it under');
  assert.equal(notOffered(readings([]), 'a'), 'nothing to review');
});

test('oneCommand: one line stays; a heredoc is its first line, a count and the tail', () => {
  assert.equal(oneCommand('tried `ls` 2 times'), 'tried `ls` 2 times');
  assert.equal(oneCommand('tried `cat <<EOF\na\nEOF` 2 times; not allowed.'), 'tried `cat <<EOF …` (3 lines) 2 times; not allowed.');
  assert.equal(oneCommand('a\nb'), 'a …` (2 lines)');
});

test('errand: a past do read-only: its badge, its one offer, its diff', () => {
  const v = view(reviewFixture('errand'));
  assert.ok(plain(v.title).includes('◆ answered · kept'));
  assert.ok(v.rows.some(r => r.lines.some(l => plain(l).startsWith('o  reopen: ask for more in the same thread'))));
  assert.ok(has(v.diff.lines, '+    def label(self) -> str: return self.id'));
  assert.deepEqual(reviewRows(reviewFixture('errand'), 0).map(r => r.choice), ['reopen']);
});

test('reviewTitle: the tab\'s words', () => {
  assert.equal(reviewTitle(reviewFixture('do')), 'do · step 1 · Table.label');
  assert.equal(reviewTitle(doReview({ title: { verb: 'do', step: null, unit: null } })), 'do');
  assert.equal(reviewTitle(reviewFixture('errand')), 'do · past');
  assert.equal(reviewTitle(readings()), 'reconcile · 2 to review');
});

test('reconcile: one line per reading, the selected one\'s plan edit over its unit\'s diff, and its offers', () => {
  const v = view(readings());
  assert.equal(plain(v.title), 'reconcile · 2 to review');
  assert.equal(v.tab, 'reconcile · 2 to review');
  assert.equal(plain(v.lines[0]), '2 readings to review');
  assert.ok(has(v.lines, '> Step 1 looks done'));
  assert.ok(has(v.lines, '  Not in any step: `spare` in a.py'));
  assert.ok(has(v.diff.lines, '+- [x] add a label @src/a.py:Table.label ✓ abc1234'));
  assert.ok(has(v.diff.lines, '+    def label(self) -> str: return self.id'));
  assert.deepEqual(v.rows.map(r => `${r.key} ${r.label}`), ['a tick it', 'r leave it']);
  const header = v.lines.find(l => plain(l).startsWith('readings'))!;
  assert.equal(plain(header), `readings${' '.repeat(v.width - 8 - 11)}[ ] reading`);
  assert.equal(v.entries, 2);
  assert.equal(v.entryAt[texts(v.lines).indexOf('> Step 1 looks done')], 0);
  assert.equal(plain(v.diff.title), 'reading 1 of 2 · Step 1 looks done');
  assert.ok(v.legend.startsWith(`[ ] readings · ${SCROLL} · d details · ? help · q later`));
});

test('reconcile: ] goes to the next reading; its keys are its offers', () => {
  const v = view(readings(), { selected: 1 });
  assert.equal(plain(v.diff.title), 'reading 2 of 2 · Not in any step: `spare` in a.py');
  const off = v.rows.flatMap(r => texts(r.lines));
  assert.ok(off.some(l => l.startsWith('1  under Step 1')));
  assert.ok(off.some(l => l.startsWith('i  not work: ignore it')));
  assert.ok(has(v.lines, '> Not in any step: `spare` in a.py'));
});

test('reconcile: rows carry the entry and, for a digit, the offer\'s step (not the digit)', () => {
  assert.deepEqual(reviewRows(readings([2]), 0).find(r => r.key === '2'),
    { key: '2', label: 'under Step 2', detail: '- [ ] next', choice: 'place', entry: SPARE, step: 3 });
  assert.deepEqual(reviewRows(readings(), 0)[0], { key: 'a', label: 'tick it', detail: "the step's line ticked", choice: 'apply', entry: DONE });
  assert.deepEqual(reviewRows(readings([]), 0), []);
});

test('reconcile: what is left after an answer; nothing left; no change to the plan', () => {
  assert.equal(plain(view(readings([2])).lines[0]), '1 readings to review');
  const none = view(readings([]));
  assert.ok(has(none.lines, 'nothing left to review'));
  assert.equal(plain(none.diff.title), 'nothing to review');
  assert.deepEqual(texts(none.diff.lines), ['no change to the plan']);
  assert.deepEqual(none.rows, []);
  assert.equal(none.selected, -1);
  const r = readings([1]);
  r.entries[0].landing.diff = '';
  assert.deepEqual(texts(view(r).diff.lines), ['no change to the plan']);
  assert.equal(plain(view(readings(), { cols: NARROW }).diff.title), 'reading 1 of 2 · Step 1 looks done · Tab back');
});

test('entryIndex: a reading\'s id to its index; else 0', () => {
  assert.equal(entryIndex(readings(), SPARE), 1);
  assert.equal(entryIndex(readings(), DONE), 0);
  assert.equal(entryIndex(readings(), 'gone'), 0);
  assert.equal(entryIndex(readings(), undefined), 0);
  assert.equal(entryIndex(reviewFixture('do'), SPARE), 0);
  assert.ok(has(view(readings(), { selected: entryIndex(readings(), SPARE) }).lines, '> Not in any step: `spare` in a.py'));
});

test('pickAtCursor: the review on the line; else a reading on it; a do on the line wins; else the first; none', () => {
  const list: ReviewListItem[] = [
    { id: 'R1', kind: 'do', row: 3, step: '- [ ] next', status: 'answered' },
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: SPARE, kind: 'unplaced', row: null }, { id: DONE, kind: 'done', row: 2 }] },
  ];
  assert.deepEqual(pickAtCursor(list, 2), { id: 'reconcile', entry: DONE });
  assert.deepEqual(pickAtCursor(list, 3), { id: 'R1' });
  assert.deepEqual(pickAtCursor(list, 9), { id: 'R1' });
  assert.equal(pickAtCursor([], 2), undefined);
  // a do and a reading on one line: the do, whichever comes first
  const both: ReviewListItem[] = [
    { id: 'reconcile', kind: 'reconcile', entries: [{ id: DONE, kind: 'done', row: 3 }] },
    { id: 'R1', kind: 'do', row: 3 },
  ];
  assert.deepEqual(pickAtCursor(both, 3), { id: 'R1' });
  assert.deepEqual(pickAtCursor([...both].reverse(), 3), { id: 'R1' });
});
```

- [ ] **Step 11: Run it and see it fail**

Run: `npm run test:unit`
Expected: `Cannot find module '../../src/pause/reviewModel'`.

- [ ] **Step 12: Write `src/pause/reviewModel.ts`**

This ports review.lua: `titles` :41-56, `one_command` :60-66, `situation` :70-162, the key tables :272-313 and :408-428, `readings_situation` :319-373, `not_offered` and `by_key`'s fallback :376-396, `show`'s entry pick :438-442, and `at_cursor` :490-496. `put` is pause.lua's `sheet.put` (cut to the width, trailing spaces dropped) with `cut_chunks`' span-preserving cut.

```ts
// review.lua's pure half: a do, an errand (a past do) and a reconcile's readings as the
// pause window's View. The rows carry what a choose needs; the key tables give the help;
// pickAtCursor is plan_review's pick. No vscode import.
import type { DoReview, ReadingEntry, ReconcileReview, Review, ReviewListItem, ReviewOffer } from '../protocol';
import type { Line, Row, Span, SpanKind, View } from './viewModel';
import { plain } from './viewModel';
import { cut, given, width, wrap } from './text';
import { conjureKeys, conjureLegend, helpLines, layout, rowLines, type KeyHelp } from './model';

// A row of a review's offers pane: the server's key, and what a choose sends.
export interface ReviewRow { key: string; label: string; detail: string; choice: string; entry?: string; step?: number }

// The conjure table's entry holding KEY (pause.key in nvim): scroll, Tab and ? read the same
// in every source.
function shared(key: string): KeyHelp {
  const k = conjureKeys('').find(e => e.keys.includes(key));
  if (!k) throw new Error(`no conjure key ${key}`);
  return k;
}

const DETAILS: KeyHelp = { keys: ['d'], help: 'details, in a split to the right' };

export const DO_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'keep the change: the files stay, its plan lines land under the step' },
  { keys: ['r'], help: 'revert the change: the files restored as they were before the do, new files removed' },
  { keys: ['o'], help: 'reopen: keep the change and ask for more in the same thread' },
  { keys: ['t'], help: "run the step's tests now; their marks land in the plan" },
  { keys: ['p'], help: 'allow what was refused in future dos ([plans] do_tools in .olifant/config.toml)' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  DETAILS,
  { keys: ['q', 'Escape'], help: 'later: the window closes; the review stays, its lens on the step reopens it' },
  shared('?'),
];

export const ERRAND_KEYS: KeyHelp[] = [
  { keys: ['o'], help: 'reopen: ask for more in the same thread' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  DETAILS,
  { keys: ['q', 'Escape'], help: 'close' },
  shared('?'),
];

export const READING_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'apply the reading: tick the step, reopen it, write its note, or place the unit where it says' },
  { keys: ['r'], help: 'leave it: the step stays as it is (the reading is not offered again at this fingerprint)' },
  { keys: ['1-9'], help: 'place a unit in no step under that open step' },
  { keys: ['n'], help: 'a unit in no step as a new step' },
  { keys: ['i'], help: 'not work: ignore a unit in no step until it changes again' },
  { keys: ['[', ']'], help: 'previous / next reading; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  DETAILS,
  { keys: ['q', 'Escape'], help: 'later: the window closes; the readings stay, their lenses reopen them' },
  shared('?'),
];

// Why a key the review does not offer is not taken: a do's fixed letters (review.lua M.keys
// offer(choice, why)), a reading's (review.lua not_offered).
export const NOT_OFFERED: { do: Record<string, string>; reading: Record<string, string> } = {
  do: {
    a: 'nothing to keep',
    r: 'nothing to revert',
    o: 'this do has no thread to reopen',
    t: 'no tests to run',
    p: 'nothing was refused',
  },
  reading: {
    a: 'nothing to apply',
    r: 'a unit in no step is not left: i ignores it',
    i: 'only a unit in no step is ignored',
    n: 'only a unit in no step becomes a new step',
  },
};

// The words for KEY when no row of R carries it (review.lua offer's why, by_key's).
export function notOffered(r: Review, key: string): string {
  if (r.kind !== 'reconcile') return NOT_OFFERED.do[key] ?? 'not offered';
  if (entriesOf(r).length === 0) return 'nothing to review';
  return NOT_OFFERED.reading[key] ?? `no step ${key} to place it under`;
}

// A denial of a command over several lines (a heredoc): its first line, a count, and what
// follows the command ("tried `a <<EOF …` (42 lines) 2 times; not allowed.").
export function oneCommand(s: string): string {
  const m = /^([^\n]*)\n([\s\S]*)$/.exec(s);
  if (!m) return s;
  const n = s.split('\n').length;
  const tail = /`([^`\n]*)$/.exec(m[2])?.[1] ?? '';
  return `${m[1]} …\` (${n} lines)${tail}`;
}

// The footer while a choose is on its way.
export function busyWords(choice: string): string {
  const words: Record<string, string> = { keep: 'keeping…', revert: 'reverting…', test: "running the step's tests…", allow: 'allowing…' };
  return words[choice] ?? '…';
}

// The panel tab's title.
export function reviewTitle(r: Review): string {
  if (r.kind === 'reconcile') return `reconcile · ${entriesOf(r).length} to review`;
  if (r.kind === 'errand') return 'do · past';
  return doHead(r).join(' · ');
}

// A reading's index by its id; 0 when it is not there (or no id, or a do).
export function entryIndex(r: Review, entry: string | undefined): number {
  if (r.kind !== 'reconcile' || entry === undefined) return 0;
  const i = entriesOf(r).findIndex(e => e.id === entry);
  return i < 0 ? 0 : i;
}

// plan_review's pick (review.lua at_cursor): the review whose row is LINE; else a review
// with an entry on LINE (unless a do already sits on it); else the first; none: undefined.
export function pickAtCursor(reviews: ReviewListItem[], line: number): { id: string; entry?: string } | undefined {
  if (reviews.length === 0) return undefined;
  let pick = reviews[0];
  let entry: string | undefined;
  for (const r of reviews) {
    if (given(r.row) && r.row === line) { pick = r; entry = undefined; }
    for (const e of given(r.entries) ? r.entries : []) {
      if (given(e.row) && e.row === line && !(pick.kind === 'do' && pick.row === line)) { pick = r; entry = e.id; }
    }
  }
  return entry === undefined ? { id: pick.id } : { id: pick.id, entry };
}

function entriesOf(r: ReconcileReview): ReadingEntry[] {
  return given(r.entries) ? r.entries : [];
}

function filesOf(r: DoReview): DoReview['landing']['files'] {
  const landing = given(r.landing) ? r.landing : undefined;
  return landing && given(landing.files) ? landing.files : [];
}

// SELECTED clamped to N things: -1 when there are none, 0 when it is out of range.
function clamp(selected: number, n: number): number {
  if (n === 0) return -1;
  return Number.isInteger(selected) && selected >= 0 && selected < n ? selected : 0;
}

// The rows of R: a do's offers, or the selected reading's (digits carry the offer's step).
export function reviewRows(r: Review, selected: number): ReviewRow[] {
  const row = (o: ReviewOffer): ReviewRow => ({ key: o.key, label: given(o.label) ? o.label : o.choice, detail: given(o.detail) ? o.detail : '', choice: o.choice });
  if (r.kind !== 'reconcile') return (given(r.offers) ? r.offers : []).map(row);
  const es = entriesOf(r);
  const sel = clamp(selected, es.length);
  if (sel < 0) return [];
  const e = es[sel];
  return (given(e.offers) ? e.offers : []).map(o => {
    const out: ReviewRow = { ...row(o), entry: e.id };
    if (given(o.step)) out.step = o.step;
    return out;
  });
}

const rtrim = (s: string): string => s.replace(/\s+$/, '');

// One line from SPANS: cut to W cells (ending in … when cut), trailing spaces dropped,
// empty spans dropped (sheet.put).
function put(spans: Span[], w?: number): Line {
  let ss = spans.filter(s => s.text !== '');
  const full = plain(ss);
  if (w !== undefined && width(full) > w) {
    const keep = cut(full, w).length - '…'.length;
    const out: Span[] = [];
    let used = 0;
    for (const s of ss) {
      if (used >= keep) break;
      const part = s.text.slice(0, keep - used);
      out.push(s.kind ? { text: part, kind: s.kind } : { text: part });
      used += part.length;
    }
    if (out.length === 0) out.push({ text: '' });
    out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + '…' };
    ss = out;
  }
  while (ss.length > 0) {
    const last = ss[ss.length - 1];
    const t = rtrim(last.text);
    if (t === last.text) break;
    if (t === '') ss = ss.slice(0, -1);
    else ss = [...ss.slice(0, -1), { ...last, text: t }];
  }
  return ss;
}

const span = (text: string, kind?: SpanKind): Span => (kind ? { text, kind } : { text });

// TEXT wrapped at W, each line in KIND from its first letter.
function wrapped(text: string, w: number, kind: SpanKind): Line[] {
  return wrap(text, w).map(l => {
    const lead = /^\s*/.exec(l)![0];
    return put([span(lead), span(l.slice(lead.length), kind)]);
  });
}

// The parts of a review's title head: `do`, `step N`, the unit.
function doHead(r: DoReview): string[] {
  const t = given(r.title) ? r.title : {};
  const head = ['do'];
  if (given(t.step)) head.push(`step ${t.step}`);
  if (given(t.unit)) head.push(String(t.unit));
  return head;
}

// The three titles of a do (review.lua titles): full; short without the model; bare without
// the seconds and the cost. The badge is the proposal's colour when answered, else red.
function doTitles(r: DoReview): Line[] {
  const t = given(r.title) ? r.title : {};
  const badge = given(t.badge) ? String(t.badge) : '◆ answered';
  const kind: SpanKind = badge.includes('answered') ? 'proposal' : 'red';
  const of = (model: boolean, secs: boolean): Line => {
    let f = '';
    if (model && given(t.model)) f += ` · ${t.model}`;
    if (secs && given(t.seconds)) f += ` · ${t.seconds} s`;
    if (secs && typeof t.cost === 'number') f += ` · $${t.cost.toFixed(2)}`;
    return put([span(doHead(r).join(' · ') + ' · ', 'title'), span(badge, kind), span(f, 'dim')]);
  };
  return [of(true, true), of(false, true), of(false, false)];
}

// The first of TITLES that fits W cells, else the last cut to fit (pause.lua edge).
function fit(titles: Line[], w: number): Line {
  for (const t of titles) if (width(plain(t)) <= w) return t;
  return put(titles[titles.length - 1], Math.max(w, 8));
}

// The scroll keys as the conjure legend says them.
function scrollPart(): string {
  return conjureLegend({ narrow: false, proposal: false, running: false, wire: false })
    .split(' · ').find(p => p.endsWith(' scroll')) ?? 'j k scroll';
}

// The footer: `[ ] files · <scroll> · d details · ? help · q later`, `Tab diff · ` first when
// narrow; wide, ` (the review stays)` after it when it fits.
function legend(what: string, narrow: boolean, w: number): string {
  const parts = [...(narrow ? ['Tab diff'] : []), `[ ] ${what}`, scrollPart(), 'd details', '? help', 'q later'];
  const short = parts.join(' · ');
  const long = `${short} (the review stays)`;
  return !narrow && width(long) <= w ? long : short;
}

// A diff pane's title: TEXT, and ` · Tab back` when narrow.
function diffTitle(text: string, narrow: boolean): Line {
  return narrow ? [span(text, 'title'), span(' · ', 'title'), span('Tab', 'key'), span(' back', 'title')] : [span(text, 'title')];
}

// A diff's lines, its trailing blank lines dropped.
function diffLines(diff: string): Line[] {
  const ls = diff.split('\n');
  while (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
  return ls.map(l => [span(l)]);
}

interface Pane { title: Line; short: Line; lines: Line[]; entryAt: number[]; entries: number; selected: number; diff: { title: Line; lines: Line[] }; what: string; keys: KeyHelp[] }

// A do's or an errand's panes (review.lua situation) at W cells.
function doPane(r: DoReview, w: number, selected: number, narrow: boolean): Pane {
  const files = filesOf(r);
  const sel = clamp(selected, files.length);
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };

  if (given(r.summary)) {
    for (const l of wrapped(String(r.summary), w, 'strong')) push(l);
    push([]);
  }
  // a labelled paragraph: the label in its column, the text wrapped under itself, at most
  // 3 lines and a count of the rest (d details has them all)
  const labelled = (label: string, text: string, kind?: SpanKind): void => {
    let ls = wrap(text, Math.max(w - 8, 20));
    const more = ls.length - 3;
    if (more > 0) ls = ls.slice(0, 3);
    ls.forEach((l, i) => {
      const head = i === 0 ? label : '';
      push(put([span(head, 'section'), span(' '.repeat(8 - head.length)), span(l, kind)], w));
    });
    if (more > 0) push(put([span(' '.repeat(8)), span(`… ${more} more lines (d details)`, 'dim')], w));
  };
  if (given(r.step)) labelled('step', String(r.step));
  const said = given(r.said) ? r.said : [];
  if (said.length === 0) labelled('said', 'nothing in its grammar', 'dim');
  said.forEach((l, i) => labelled(i === 0 ? 'said' : '', String(l)));
  const tests = given(r.tests) ? r.tests : undefined;
  if (tests && tests.ran) {
    const failed = (given(tests.list) ? tests.list : []).filter(x => x.status === 'failed').map(x => String(x.test));
    const passed = Number(tests.passed) || 0;
    if (failed.length > 0) labelled('tests', `✗ ${failed.join(', ')} · ${passed} passed`, 'red');
    else labelled('tests', `● ${passed} passed`, 'green');
  } else {
    labelled('tests', "none ran (t runs the step's tests)", 'dim');
  }
  const denied = given(r.denied) ? (typeof r.denied === 'string' ? [r.denied] : r.denied) : [];
  denied.forEach((l, i) => labelled(i === 0 ? 'denied' : '', oneCommand(String(l)), i === 0 ? 'red' : undefined));
  push([]);

  // the files, the selected one marked: its diff is on the right
  if (files.length > 0) {
    const right = '[ ] file';
    push([span('files', 'section'), span(' '.repeat(Math.max(w - 5 - right.length, 1))), span('[ ]', 'key'), span(' file', 'dim')]);
    const sign: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D' };
    files.forEach((f, i) => {
      push(put([span(i === sel ? '> ' : '  '), span(sign[f.status] ?? '?', f.status === 'deleted' ? 'red' : 'green'), span(` ${f.file}`)], w), i);
    });
  } else {
    push([span('no file changed', 'dim')]);
  }
  while (lines.length > 0 && lines[lines.length - 1].length === 0) { lines.pop(); entryAt.pop(); }

  const file = sel >= 0 ? files[sel] : undefined;
  const diff = file
    ? { title: diffTitle(`file ${sel + 1} of ${files.length} · ${file.file}`, narrow), lines: diffLines(given(file.diff) ? file.diff : '') }
    : { title: diffTitle('no change', narrow), lines: [[span('the do changed no file', 'dim')]] };
  const [full, short, bare] = doTitles(r);
  return {
    title: fit([full, short, bare], w), short: fit([bare], w), lines, entryAt, entries: files.length, selected: sel, diff,
    what: 'files', keys: r.kind === 'errand' ? ERRAND_KEYS : DO_KEYS,
  };
}

// A reconcile's panes (review.lua readings_situation) at W cells.
function readingsPane(r: ReconcileReview, w: number, selected: number, narrow: boolean): Pane {
  const es = entriesOf(r);
  const sel = clamp(selected, es.length);
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };
  const head = `reconcile · ${es.length} to review`;
  if (given(r.summary)) {
    for (const l of wrapped(String(r.summary), w, 'strong')) push(l);
    push([]);
  }
  const right = '[ ] reading';
  push([span('readings', 'section'), span(' '.repeat(Math.max(w - 8 - right.length, 1))), span('[ ]', 'key'), span(' reading', 'dim')]);
  es.forEach((e, i) => push(put([span(i === sel ? '> ' : '  '), span(given(e.summary) ? e.summary : e.kind)], w), i));
  if (es.length === 0) push([span('nothing left to review', 'dim')]);

  const entry = sel >= 0 ? es[sel] : undefined;
  const title = entry
    ? diffTitle(`reading ${sel + 1} of ${es.length} · ${given(entry.summary) ? entry.summary : entry.kind}`, narrow)
    : diffTitle('nothing to review', narrow);
  const landing = entry && given(entry.landing) ? entry.landing : undefined;
  let dl = diffLines(landing && given(landing.diff) ? landing.diff : '');
  if (dl.length === 0) dl = [[span('no change to the plan', 'dim')]];
  const t = put([span(head, 'title')]);
  return { title: fit([t], w), short: fit([t], w), lines, entryAt, entries: es.length, selected: sel, diff: { title, lines: dl }, what: 'readings', keys: READING_KEYS };
}

// The whole View of review R for a panel COLS cells wide, entry SELECTED (a file of a do, a
// reading of a reconcile; 0-based); BUSY the choice whose answer is on its way.
export function reviewView(r: Review, o: { cols: number; selected: number; flipped: boolean; help: boolean; busy?: string; chord: string }): View {
  const geo = layout(o.cols);
  const w = geo.text;
  const p = r.kind === 'reconcile' ? readingsPane(r, w, o.selected, geo.narrow) : doPane(r, w, o.selected, geo.narrow);
  const rs = reviewRows(r, p.selected);
  const laid = rowLines(rs, w);
  const rows: Row[] = rs.map((x, i) => ({
    key: x.key, label: x.label, detail: x.detail, pressable: true,
    lines: laid.lines.slice(laid.starts[i], i + 1 < laid.starts.length ? laid.starts[i + 1] : laid.lines.length),
  }));
  const view: View = {
    state: o.busy !== undefined ? 'busy' : 'review',
    tab: reviewTitle(r),
    title: p.title, short: p.short, lines: p.lines, entryAt: p.entryAt, entries: p.entries, selected: p.selected,
    rows, diff: p.diff,
    legend: o.busy !== undefined ? busyWords(o.busy) : legend(p.what, geo.narrow, w),
    narrow: geo.narrow, flipped: geo.narrow && o.flipped, width: w,
  };
  if (o.help) view.help = helpLines(geo.narrow ? w : geo.right - 4, p.keys);
  return view;
}
```

- [ ] **Step 13: Run everything and see it pass**

Run: `npm run lint && npm run test:unit`
Expected: no lint or type errors; the 23 reviewModel, 9 facts and 4 isPlan tests pass with every earlier test. (These were checked against stand-ins for Task 1's `text.ts` and Task 2's `model.ts`. If Task 2's real `rowLines` or `helpLines` differ, only the tests that compare with those functions' own output move, and they move together.)

- [ ] **Step 14: Commit**

```bash
git add src/pause/reviewModel.ts src/plans/facts.ts src/plans/isPlan.ts src/protocol.ts test/fixtures/review test/pauseFixtures.ts test/unit/reviewModel.test.ts test/unit/facts.test.ts test/unit/isPlan.test.ts
git commit -m "pause: review view models, plan facts and the plan rule (pure)"
```

---

### Task 8: The review sources, their entry points, durandal.isPlan, and the M5b PR

**Files:**
- Create: `src/pause/review.ts`
- Create: `src/plans/trackIsPlan.ts`
- Modify: `src/pause/controller.ts` (the review source: state, drawing, keys, choose, reopen, details)
- Modify: `src/server.ts` (`ClientHooks.reviewReady` and its notification handler)
- Modify: `src/commandTable.ts` (`durandal.plan.review` built; `planReview` leaves `SERVER_NAMED_INFO`)
- Modify: `src/extension.ts` (`Reviews`, `trackIsPlan`, `hooks.reviewReady`, `Api.pause.open`, `Api.isPlan`)
- Modify: `test/unit/manifest.test.ts`
- Create: `test/e2e/fake.13-review.e2e.ts`
- Modify: `README.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes:
  - Task 1: `Review`, `DoReview`, `ReconcileReview`, `ChooseResult`, `ReviewReady`, `ReviewsResult`, `Olifant.plansReview`, `Olifant.plansReviews`, `Olifant.plansReviewChoose`, `Olifant.plansDo`, `Olifant.plansReviewReady` (`protocol.ts`).
  - Task 3: `reviewDetails(title, sections)` (`details.ts`).
  - Task 5: `PauseController` (its `shownUri`, `help`, `flipped`, `cols`, `paint`, `hide`, `answer`, `table`, `closed`, `atRun`, `shown`), `PauseApi`.
  - Task 7: `reviewView(r, o)`, `reviewTitle(r)`, `entryIndex(r, entry)`, `pickAtCursor(reviews, line)`, `notOffered(r, key)`, `reviewRows(r, selected)` (`reviewModel.ts`); `factEdits(lines, facts)`, `TextEdit0` (`plans/facts.ts`); `isPlanPath(path, root, languageId)` (`plans/isPlan.ts`); `reviewFixture(name)` (`test/pauseFixtures.ts`).
  - Existing: `applyServerEdit` (`applyEdit.ts`), `errorMessage` (`errors.ts`), `findRoot` (`root.ts`).
- Produces:
  - `src/pause/review.ts`: `Reviews` (`open(planUri, id, entry?)`, `pick()`, `ready(p)`, `register(context)`).
  - `src/plans/trackIsPlan.ts`: `trackIsPlan(context): { isPlan(): boolean }`.
  - `PauseController.showReview(planUri, review, entry?)`; `SourceKind` now also `do`, `errand`, `reconcile`.
  - `src/server.ts`: `ClientHooks.reviewReady?(p: ReviewReady): void`.
  - `Api.pause.open(uri, id, entry?)`; `Api.isPlan(): boolean`.

The controller shows one source at a time (spec §5.4). Task 5's `shownUri` names a conjure source; this task adds `rev`, a review source. At most one of the two is set. Opening a review while a pause is shown swaps the panel's source; the pause stays stored and its reminder stays; a conjure inside the unit swaps back (Task 5's `atRun` clears `rev`).

- [ ] **Step 1: The server's push**

In `src/server.ts`, import `ReviewReady` with the other protocol types, and add to `ClientHooks` after `progress`:

```ts
  // olifant/plans/review/ready: a do's review is waiting (sent before the do's own answer)
  reviewReady?(p: ReviewReady): void;
```

After the `lc.onNotification(Olifant.suggestion.method, …)` line, add:

```ts
    lc.onNotification(Olifant.plansReviewReady.method, (p: ReviewReady) => hooks.reviewReady?.(p));
```

- [ ] **Step 2: durandal.isPlan**

Create `src/plans/trackIsPlan.ts`:

```ts
import * as vscode from 'vscode';
import { findRoot } from '../root';
import { isPlanPath } from './isPlan';

// trackIsPlan keeps durandal.isPlan: the active editor shows a plan of an Olifant project (spec
// §5.1), as projects.ts keeps durandal.inProject. The plan chords use it.
export function trackIsPlan(context: vscode.ExtensionContext): { isPlan(): boolean } {
  let isPlan = false;
  const update = async (editor: vscode.TextEditor | undefined) => {
    const doc = editor?.document;
    const root = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
    const yes = !!doc && doc.uri.scheme === 'file' && isPlanPath(doc.uri.fsPath, root, doc.languageId);
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    isPlan = yes;
    await vscode.commands.executeCommand('setContext', 'durandal.isPlan', yes);
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => void update(e)));
  void update(vscode.window.activeTextEditor);
  return { isPlan: () => isPlan };
}
```

- [ ] **Step 3: The review source in the controller**

In `src/pause/controller.ts`:

Add to the imports:

```ts
import { applyServerEdit } from '../applyEdit';
import { errorMessage } from '../errors';
import { factEdits } from '../plans/facts';
import { ChooseResult, DoReview, ErrandResult, Fact, Olifant, Review } from '../protocol';
import { reviewDetails } from './details';
import { entryIndex, notOffered, reviewRows, reviewTitle, reviewView } from './reviewModel';
```

(`ConjureParams` and `Paused` stay imported as types; merge the protocol imports into one line.)

Add the review state next to `shownUri`:

```ts
// a review shown: its plan, the payload, the selected file or reading, the choice in the air
interface RevState { planUri: string; review: Review; selected: number; busy?: string }
```

```ts
  private rev: RevState | undefined;
```

Add `showReview` after `atRun`:

```ts
  // showReview: a review in the window (spec §5); entry selects a reading. The same review shown
  // again keeps its selection; a pause shown before stays stored with its reminder (§5.4).
  showReview(planUri: string, review: Review, entry?: string): void {
    const same = this.rev && this.rev.planUri === planUri && this.rev.review.id === review.id && this.rev.review.kind === review.kind;
    const count = review.kind === 'reconcile' ? review.entries.length : review.landing.files.length;
    const selected = entry !== undefined ? entryIndex(review, entry)
      : same ? Math.min(this.rev!.selected, Math.max(count - 1, 0)) : 0;
    this.shownUri = undefined;
    this.help = false;
    this.rev = { planUri, review, selected };
    this.paint(undefined, true);
  }
```

Change these Task 5 methods (whole bodies shown):

```ts
  shown(params: ConjureParams, p: Paused): void {
    const uri = params.textDocument.uri;
    const after = this.run?.uri === uri;
    if (after) this.endRun();
    const doc = docOf(uri);
    const h = held(uri, params.position, p, doc?.version ?? 0, doc?.lineCount ?? p.lines.last);
    this.store.set(h);
    this.d.reminders.show(uri, h.last, `conjure paused · ${chordLabel(this.d.platform, 'C')} reopens`);
    void this.d.say('info', p.why ? `conjure paused · ${p.why}` : 'conjure paused');
    this.rev = undefined;
    this.shownUri = uri;
    this.help = false;
    this.paint(after ? 'entry' : undefined, true);
  }

  atRun(uri: string, line: number, selection: boolean): boolean {
    const p = this.store.get(uri);
    if (!p) return false;
    if (!selection && line >= p.first && line <= p.last) {
      this.rev = undefined;
      this.shownUri = uri;
      this.help = false;
      this.paint(undefined, true);
      return true;
    }
    this.store.drop(uri, 'the earlier pause is forgotten');
    return false;
  }

  source(): SourceKind | undefined {
    if (!this.d.panel.isOpen()) return undefined;
    if (this.rev) return this.rev.review.kind;
    return this.shownUri ? 'conjure' : undefined;
  }

  private paint(flash?: 'row' | 'entry', focus = false): void {
    const r = this.rev;
    if (r) {
      const view = reviewView(r.review, {
        cols: this.cols, selected: r.selected, flipped: this.flipped, help: this.help, busy: r.busy, chord: chordLabel(this.d.platform, 'P R'),
      });
      const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === r.planUri)?.viewColumn;
      this.d.panel.show(view, { beside, flash, focus });
      return;
    }
    const c = this.current();
    if (!c) return;
    const view = conjureView(c.pause.paused, {
      cols: this.cols, selected: this.selectedOf(c.pause), running: c.running, flipped: this.flipped, help: this.help,
      chord: chordLabel(this.d.platform, 'C'),
    });
    const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === c.pause.uri)?.viewColumn;
    this.d.panel.show(view, { beside, flash, focus });
  }

  private hide(): void {
    this.shownUri = undefined;
    this.rev = undefined;
    this.help = false;
    this.flipped = false;
    this.d.panel.close();
  }

  // the panel's tab was closed: the source stays (pause stored, run going, review on the server)
  closed(): void {
    this.shownUri = undefined;
    this.rev = undefined;
    this.help = false;
  }

  private table(): KeyAct[] {
    if (this.rev) return this.reviewTable(this.rev);
    return [
      { keys: ['c', 'h', 'C', 'w', 'W', 't', 'T', 'p', 'P', 's', 'a', 'r'], act: k => this.rowKey(k) },
      { keys: ['['], act: () => this.step(-1) },
      { keys: [']'], act: () => this.step(1) },
      { keys: DIGITS, act: k => this.jump(Number(k)) },
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.details() },
      { keys: ['x'], act: () => this.cancel() },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
  }
```

In `receive`, the `select` branch now works for both sources:

```ts
    } else if (m.type === 'select') {
      await this.answer('select', this.rev ? this.selectReview(this.rev, m.entry) : this.select(m.entry));
    }
```

Add the review keys and their actions at the end of the class:

```ts
  // --- the review source (review.lua keys :217-293, readings :383-430)

  private reviewTable(r: RevState): KeyAct[] {
    const scroll: KeyAct = { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true };
    const shared: KeyAct[] = [
      { keys: ['['], act: () => this.stepReview(r, -1) },
      { keys: [']'], act: () => this.stepReview(r, 1) },
      scroll,
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.reviewDetailsOpen(r) },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
    if (r.review.kind === 'errand') return [{ keys: ['o'], act: () => this.reopen(r) }, ...shared];
    if (r.review.kind === 'do') {
      const offer = (k: string, choice: string): KeyAct => ({ keys: [k], act: () => this.offer(r, k, choice) });
      return [offer('a', 'keep'), offer('r', 'revert'), offer('t', 'test'), offer('p', 'allow'), { keys: ['o'], act: () => this.reopen(r) }, ...shared];
    }
    return [{ keys: ['a', 'r', 'n', 'i', '1', '2', '3', '4', '5', '6', '7', '8', '9'], act: k => this.byKey(r, k) }, ...shared];
  }

  // offer: a do's fixed key answers with its choice when the review offers it
  private offer(r: RevState, key: string, choice: string): Promise<true | string> | string {
    if (r.busy) return 'the last answer is still on its way';
    if (!r.review.offers.some(o => o.choice === choice)) return notOffered(r.review, key);
    return this.choose(r, key, choice, {});
  }

  // byKey: a reading's offer by its key (digits place under the open step the offer names)
  private byKey(r: RevState, key: string): Promise<true | string> | string {
    if (r.busy) return 'the last answer is still on its way';
    const row = reviewRows(r.review, r.selected).find(x => x.key === key);
    if (!row) return notOffered(r.review, key);
    const extra: { entry?: string; step?: number } = {};
    if (row.entry !== undefined) extra.entry = row.entry;
    if (row.step !== undefined) extra.step = row.step;
    return this.choose(r, key, row.choice, extra);
  }

  private async choose(r: RevState, key: string, choice: string, extra: { entry?: string; step?: number }): Promise<true | string> {
    if (!this.d.server.client()) return NOT_RUNNING;
    r.busy = choice;
    this.paint();
    let res: ChooseResult;
    try {
      res = await this.d.server.request(Olifant.plansReviewChoose, { textDocument: { uri: r.planUri }, id: r.review.id, choice, ...extra });
    } catch (err) {
      r.busy = undefined;
      if (this.rev !== r) {
        void this.d.say('error', errorMessage(err));
        return true;
      }
      this.paint();
      return errorMessage(err);
    }
    r.busy = undefined;
    return this.answered(r, choice, res);
  }

  // answered: the edit as one undo step, the facts on the plan, then done (close and say) or the
  // new review in place with what it said (review.lua answered :168-200). files: VS Code reloads
  // unmodified files from disk itself.
  private async answered(r: RevState, choice: string, res: ChooseResult): Promise<true | string> {
    const failed = await this.landReview(r.planUri, res.edit, res.facts);
    const kind = r.review.kind === 'reconcile' ? 'reconcile' : 'do';
    if (failed) {
      if (this.rev !== r) {
        void this.d.say('error', failed);
        return true;
      }
      if (res.review) r.review = res.review;
      this.paint();
      return failed;
    }
    if (res.done) {
      if (this.rev === r) this.hide();
      void this.d.say('info', `${kind}: ${res.said ?? choice}`);
      return true;
    }
    if (this.rev === r) {
      if (res.review) {
        r.review = res.review;
        const count = r.review.kind === 'reconcile' ? r.review.entries.length : r.review.landing.files.length;
        r.selected = Math.min(r.selected, Math.max(count - 1, 0));
      }
      this.paint();
    }
    return res.said ?? 'done';
  }

  // landReview: a choose's edit (versioned: refused whole if the plan moved) and its facts; the
  // reason when VS Code or the version check refused
  private async landReview(planUri: string, edit: ChooseResult['edit'], facts: Fact[] | undefined): Promise<string | undefined> {
    if (edit) {
      const lc = this.d.server.client();
      if (!lc) return NOT_RUNNING;
      const done = await applyServerEdit(lc, { label: 'review', edit }, () => undefined, () => undefined);
      if (!done.applied) return done.failureReason ?? 'VS Code did not apply the edit';
    }
    if (facts && facts.length > 0) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(planUri));
      const edits = factEdits(doc.getText().split('\n'), facts);
      if (edits.length > 0) {
        const we = new vscode.WorkspaceEdit();
        const uri = doc.uri;
        for (const e of edits) {
          if (e.end < doc.lineCount) {
            we.replace(uri, new vscode.Range(e.start, 0, e.end, 0), e.lines.map(l => l + '\n').join(''));
          } else {
            // the edit reaches past the last line: replace to the end, no trailing newline added
            const end = doc.lineAt(doc.lineCount - 1).range.end;
            const start = e.start < doc.lineCount ? new vscode.Position(e.start, 0) : end;
            we.replace(uri, new vscode.Range(start, end), (e.start >= doc.lineCount ? '\n' : '') + e.lines.join('\n'));
          }
        }
        if (!await vscode.workspace.applyEdit(we)) return 'VS Code did not apply the plan facts';
      }
    }
    return undefined;
  }

  private selectReview(r: RevState, i: number): true | string {
    const count = r.review.kind === 'reconcile' ? r.review.entries.length : r.review.landing.files.length;
    if (i < 0 || i >= count) return 'nothing to do here';
    r.selected = i;
    this.paint('entry');
    return true;
  }

  private stepReview(r: RevState, d: number): true | string {
    const reading = r.review.kind === 'reconcile';
    const count = reading ? (r.review as { entries: unknown[] }).entries.length : (r.review as DoReview).landing.files.length;
    if (count === 0) return reading ? 'nothing to review' : 'no file changed';
    const to = Math.min(Math.max(r.selected + d, 0), count - 1);
    if (to === r.selected) return d < 0 ? (reading ? 'the first reading' : 'the first file') : (reading ? 'the last reading' : 'the last file');
    r.selected = to;
    this.paint('entry');
    return true;
  }

  // reopen (o): what the do should change, then a live do is kept and its thread resumed; an
  // errand's thread is resumed at once (spec §5.3). The do's own handling is M6's: one line here.
  private async reopen(r: RevState): Promise<true | string> {
    if (r.busy) return 'the last answer is still on its way';
    const review = r.review as DoReview;
    if (!review.offers.some(o => o.choice === 'reopen')) return notOffered(r.review, 'o');
    const text = (await this.d.ui().text({ title: 'more', value: '', prompt: 'what the do should change' }).result)?.trim();
    if (!text) return true;
    if (this.rev !== r) return true;
    const line = review.row ?? 0;
    if (review.kind === 'errand') {
      this.hide();
      await this.redo(r.planUri, review.id, line, text);
      return true;
    }
    if (!this.d.server.client()) return NOT_RUNNING;
    r.busy = 'reopen';
    this.paint();
    let res: ChooseResult;
    try {
      res = await this.d.server.request(Olifant.plansReviewChoose, { textDocument: { uri: r.planUri }, id: review.id, choice: 'reopen' });
    } catch (err) {
      r.busy = undefined;
      if (this.rev === r) this.paint();
      return this.rev === r ? errorMessage(err) : (void this.d.say('error', errorMessage(err)), true);
    }
    r.busy = undefined;
    const said = await this.answered(r, 'reopen', res);
    if (res.reopen) await this.redo(r.planUri, res.reopen.id, line, text);
    return said;
  }

  // redo: plans/do resuming a review's thread; its review arrives through review/ready again
  private async redo(planUri: string, id: string, line: number, text: string): Promise<void> {
    try {
      const a: ErrandResult = await this.d.server.request(Olifant.plansDo, { textDocument: { uri: planUri }, line, resume: id, text });
      const changed = Array.isArray(a.changed) ? a.changed.length : 0;
      const review = typeof a.review === 'string' ? ' · to review' : '';
      void this.d.say('info', `do: ${changed} ${changed === 1 ? 'file' : 'files'} changed${review} · ${Number(a.seconds) || 0} s`);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
    }
  }

  // the review's server-built details beside the window (spec §6)
  private async reviewDetailsOpen(r: RevState): Promise<true> {
    const uri = this.d.docs.set(`details/${r.review.id}.md`, reviewDetails(reviewTitle(r.review), r.review.details));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }
```

`reviewView` turns `busy` (the choice in the air) into the legend's busy words itself.

- [ ] **Step 4: Opening reviews**

Create `src/pause/review.ts`:

```ts
import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { CLIENT_COMMANDS, Olifant, ReviewReady } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { PauseController } from './controller';
import { pickAtCursor } from './reviewModel';

// Reviews: the ways into a review (spec §5.1): the server's push after a do, the plan lens
// (olifant.plans.review), and the chord p r on a plan. Each asks olifant/plans/review and shows it.
export class Reviews {
  constructor(private readonly d: { server: Server; say: Say; controller: PauseController }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.review', () => this.pick()),
      // the lens: [id, planUri] for a do, ['reconcile', planUri, entry] for a reading
      vscode.commands.registerCommand(CLIENT_COMMANDS.planReview, (id: unknown, planUri: unknown, entry?: unknown) => {
        if (typeof id !== 'string' || typeof planUri !== 'string') return;
        return this.open(planUri, id, typeof entry === 'string' ? entry : undefined);
      }),
    );
  }

  async open(planUri: string, id: string, entry?: string): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    try {
      const review = await this.d.server.request(Olifant.plansReview, { textDocument: { uri: planUri }, id });
      this.d.controller.showReview(planUri, review, entry);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
    }
  }

  // pick: the review on the cursor's line, else a reading there, else the first (review.lua at_cursor)
  async pick(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== 'file') {
      void this.d.say('error', 'open a plan of an Olifant project first');
      return;
    }
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const planUri = ed.document.uri.toString();
    let found: { id: string; entry?: string } | undefined;
    try {
      const list = await this.d.server.request(Olifant.plansReviews, { textDocument: { uri: planUri } });
      found = pickAtCursor(list.reviews ?? [], ed.selection.active.line);
    } catch (err) {
      void this.d.say('error', errorMessage(err));
      return;
    }
    if (!found) {
      void this.d.say('info', 'plans: nothing to review');
      return;
    }
    await this.open(planUri, found.id, found.entry);
  }

  // ready: the server's push; the plan need not be open
  ready(p: ReviewReady): void {
    if (typeof p?.id !== 'string' || typeof p.textDocument?.uri !== 'string') return;
    void this.open(p.textDocument.uri, p.id);
  }
}
```

- [ ] **Step 5: The command table and the manifest**

In `src/commandTable.ts`:
- Delete `'durandal.plan.review': { title: 'Plan: Review', milestone: 5 },` from `NOT_YET`.
- Add `'durandal.plan.review': { title: 'Plan: Review' },` to `BUILT` after `'durandal.conjure'`.
- Delete `planReview: { title: 'Plan Review', milestone: 5 },` from `SERVER_NAMED_INFO` and change its key type to `Exclude<keyof typeof CLIENT_COMMANDS, 'showActions' | 'planReview'>`. Update the comment above it: `showActions is built (actions/command.ts), planReview too (pause/review.ts); the rest are later milestones'.`

`package.json` needs no change: the command is already contributed with the same title, and its `p r` keybinding with `when: durandal.isPlan` stays.

In `test/unit/manifest.test.ts`, add:

```ts
test('M5: Plan: Review is built; the lens command is registered by its own handler', () => {
  assert.equal(BUILT['durandal.plan.review'].title, 'Plan: Review');
  assert.ok(!('durandal.plan.review' in NOT_YET));
  assert.ok(!('olifant.plans.review' in SERVER_NAMED));
  assert.deepEqual(KEYS.find(k => k.command === 'durandal.plan.review'), { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' });
});
```

- [ ] **Step 6: Wire it**

In `src/extension.ts`:
- Import `Reviews` from `./pause/review` and `trackIsPlan` from `./plans/trackIsPlan`.
- Add to `PauseApi`: `open(uri: string, id: string, entry?: string): Promise<void>;` (comment: `// a review opened as the lens opens it`). Add to `Api`: `isPlan(): boolean;` (comment: `// the active editor shows a plan (durandal.isPlan)`).
- After the controller is built:

```ts
  const reviews = new Reviews({ server: s, say, controller: ctl });
  reviews.register(context);
  hooks.reviewReady = p => reviews.ready(p);
  const plansTracked = trackIsPlan(context);
```

- Add `open: (uri, id, entry) => reviews.open(uri, id, entry),` to the `pause` object, and `isPlan: plansTracked.isPlan` to the returned API.

Run: `npm run lint && npm run test:unit`
Expected: lint clean; unit PASS, the new manifest test included.

- [ ] **Step 7: Write the review e2e**

Create `test/e2e/fake.13-review.e2e.ts`:

```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ConjurePaused, DoReview, ReconcileReview } from '../../src/protocol';
import { Olifant } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { FakeUi } from '../fakeUi';
import { reviewFixture, wrapped } from '../pauseFixtures';
import { api, file, log, open, reply, revert, running, settle, tabsUnder, until } from './helpers';

// The review sources over the fake server (M5 spec §5, §8): the push after a do, the lens, the
// chord, choose and its answers, reopen, durandal.isPlan.
const PLAN = 'one/plans/p.md';
const PLAN_TEXT = '# A plan\n\n- [ ] add a label @src/a.py:Table.label\n';
const MAIN = 'one/main.py';
const uriOf = (rel: string) => file(rel).toString();
const sent = (method: string) => log().filter(m => m.method === method);
const chooses = () => sent('olifant/plans/review/choose').map(m => m.params);

const planEdit = (text: string, version: number | null = null) => ({ documentChanges: [{ textDocument: { uri: uriOf(PLAN), version }, edits: [
  { range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } }, newText: text },
] }] });

// showing: open the review the lens names and wait for its window
async function showing(review: DoReview | ReconcileReview, entry?: string): Promise<void> {
  const a = await api();
  reply('olifant/plans/review', review);
  await vscode.commands.executeCommand('olifant.plans.review', review.id, uriOf(PLAN), ...(entry ? [entry] : []));
  await until(() => a.pause.source() === review.kind, `the ${review.kind} window`);
}

describe('the review window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(PLAN, PLAN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, '# A plan\n\n- [ ] a step\n');
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    if (a.pause.view()) await a.pause.press('q');
    for (const m of ['olifant/plans/review', 'olifant/plans/reviews', 'olifant/plans/review/choose', 'olifant/plans/do', 'olifant/conjure']) reply(m, null);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(PLAN));
    if (d?.isDirty) await revert(d);
    await settle(PLAN, PLAN_TEXT);
  });

  it('a do\'s review/ready opens the do review without opening the plan', async () => {
    const a = await running();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    reply('olifant/plans/review', reviewFixture('do'));
    reply('olifant/plans/do', {
      notify: [{ method: 'olifant/plans/review/ready', params: { id: 'R1', kind: 'do', textDocument: { uri: '$uri' } } }],
      review: 'R1', changed: ['src/a.py', 'src/b.py'], seconds: 42,
    });
    await a.server.request(Olifant.plansDo, { textDocument: { uri: uriOf(PLAN) }, line: 2 });
    await until(() => a.pause.source() === 'do', 'the do window');
    assert.ok(plain(a.pause.view()!.title).startsWith('do · step 1 · Table.label · ◆ answered'));
    assert.deepEqual(sent('olifant/plans/review').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'R1' });
    assert.ok(!vscode.window.visibleTextEditors.some(e => e.document.uri.toString() === uriOf(PLAN)));
  });

  it('a keeps: choose keep, the plan edit lands, the window closes, do: kept; a second press waits', async () => {
    const a = await running();
    await open(file(PLAN));
    await showing(reviewFixture('do'));
    reply('olifant/plans/review/choose', { delay: 1, done: true, said: 'kept', edit: planEdit('  ✓ kept line\n') });
    const from = a.shown.length;
    const n = chooses().length;
    void a.pause.press('a');
    await until(() => chooses().length > n, 'the choose sent');
    await a.pause.press('a');
    assert.ok(a.pause.notices().includes('a: the last answer is still on its way'));
    assert.equal(a.pause.view()!.state, 'busy');
    await until(() => a.shown.slice(from).some(s => s.text === 'do: kept'), 'do: kept');
    assert.deepEqual(chooses()[n], { textDocument: { uri: uriOf(PLAN) }, id: 'R1', choice: 'keep' });
    assert.equal(chooses().length, n + 1);
    assert.equal(a.pause.view(), undefined);
    assert.ok(vscode.workspace.textDocuments.find(d => d.uri.toString() === uriOf(PLAN))!.getText().includes('  ✓ kept line'));
  });

  it('t: the facts land on the plan and the window redraws with what it said', async () => {
    const a = await running();
    await open(file(PLAN));
    await showing(reviewFixture('do'));
    const next = reviewFixture('do');
    next.summary = 'The step\'s tests pass.';
    reply('olifant/plans/review/choose', { done: false, said: '1 passed · 0 failed', facts: [{ after: 2, lines: ['  ✓ test_label'] }], review: next });
    await a.pause.press('t');
    await until(() => a.pause.notices().includes('t: 1 passed · 0 failed'), 'the notice');
    assert.ok(a.pause.view()!.lines.some(l => plain(l).includes('The step\'s tests pass.')));
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriOf(PLAN))!;
    assert.equal(doc.lineAt(3).text, '  ✓ test_label');
  });

  it('keys the review does not offer say why; an engine error stays in the footer', async () => {
    const a = await running();
    const bare = reviewFixture('do');
    bare.offers = bare.offers.filter(o => o.choice === 'keep' || o.choice === 'test');
    await showing(bare);
    await a.pause.press(']');
    await a.pause.press('p');
    await a.pause.press('r');
    assert.ok(a.pause.notices().includes('p: nothing was refused'));
    assert.ok(a.pause.notices().includes('r: nothing to revert'));
    reply('olifant/plans/review/choose', { lsp_error: 'the step has no tests' });
    await a.pause.press('t');
    await until(() => a.pause.notices().includes('t: the step has no tests'), 'the error in the footer');
    assert.equal(a.pause.source(), 'do');
  });

  it('the chord p r picks the review on the cursor\'s line; none says so', async () => {
    const a = await running();
    const ed = await open(file(PLAN));
    await until(() => a.isPlan(), 'durandal.isPlan');
    ed.selection = new vscode.Selection(2, 0, 2, 0);
    reply('olifant/plans/reviews', { reviews: [
      { id: 'R0', kind: 'do', row: 7, step: 'other', status: 'answered' },
      { id: 'R1', kind: 'do', row: 2, step: 'add a label', status: 'answered' },
    ] });
    reply('olifant/plans/review', reviewFixture('do'));
    await vscode.commands.executeCommand('durandal.plan.review');
    await until(() => a.pause.source() === 'do', 'the do window');
    assert.equal(sent('olifant/plans/review').at(-1)!.params.id, 'R1');
    await a.pause.press('q');
    reply('olifant/plans/reviews', { reviews: [] });
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.review');
    await until(() => a.shown.slice(from).some(s => s.text === 'plans: nothing to review'), 'nothing to review');
  });

  it('reconcile: ] reads the next reading; a applies the first; a digit places with the offer\'s step; the last closes', async () => {
    const a = await running();
    await open(file(PLAN));
    const readings = reviewFixture('reconcile');
    await showing(readings);
    assert.equal(plain(a.pause.view()!.title), 'reconcile · 2 to review');
    await a.pause.press(']');
    assert.equal(a.pause.view()!.selected, 1);
    await a.pause.press('[');
    const rest = reviewFixture('reconcile');
    rest.entries = rest.entries.slice(1);
    reply('olifant/plans/review/choose', { done: false, said: 'applied', edit: null, review: rest });
    await a.pause.press('a');
    await until(() => a.pause.notices().includes('a: applied'), 'applied');
    assert.deepEqual(chooses().at(-1), { textDocument: { uri: uriOf(PLAN) }, id: 'reconcile', choice: 'apply', entry: readings.entries[0].id });
    const from = a.shown.length;
    reply('olifant/plans/review/choose', { done: true, said: 'placed', edit: null, review: null });
    await a.pause.press('2');
    await until(() => a.shown.slice(from).some(s => s.text === 'reconcile: placed'), 'reconcile: placed');
    assert.deepEqual(chooses().at(-1), { textDocument: { uri: uriOf(PLAN) }, id: 'reconcile', choice: 'place', entry: readings.entries[1].id, step: 3 });
    assert.equal(a.pause.view(), undefined);
  });

  it('the lens opens a reading selected', async () => {
    const a = await running();
    const readings = reviewFixture('reconcile');
    await showing(readings, readings.entries[1].id);
    assert.equal(a.pause.view()!.selected, 1);
  });

  it('errand o: what to change, then plans/do resumes its thread; Escape sends nothing', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await showing(reviewFixture('errand'));
    await a.pause.press('a');
    assert.ok(a.pause.notices().at(-1)!.startsWith('a: '));
    const n = sent('olifant/plans/do').length;
    void a.pause.press('o');
    await until(() => ui.texts.length === 1, 'asked');
    ui.texts[0].finish(undefined);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(sent('olifant/plans/do').length, n);
    reply('olifant/plans/do', { review: 'R2', changed: ['src/a.py'], seconds: 9 });
    void a.pause.press('o');
    await until(() => ui.texts.length === 2, 'asked again');
    assert.equal(ui.texts[1].title, 'more');
    ui.texts[1].finish('add a docstring');
    await until(() => sent('olifant/plans/do').length > n, 'plans/do');
    assert.deepEqual(sent('olifant/plans/do').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 2, resume: 'R1', text: 'add a docstring' });
  });

  it('a live do\'s o: choose reopen, then plans/do with the id it answered', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    const live = reviewFixture('do');
    live.offers = [...live.offers, { choice: 'reopen', key: 'o', label: 'reopen', detail: 'say what to change' }];
    await showing(live);
    reply('olifant/plans/review/choose', { done: true, said: 'kept; say what to change', edit: null, reopen: { id: 'R1' } });
    reply('olifant/plans/do', { review: 'R3', changed: [], seconds: 4 });
    const n = sent('olifant/plans/do').length;
    void a.pause.press('o');
    await until(() => ui.texts.length === 1, 'asked');
    ui.texts[0].finish('rename it');
    await until(() => sent('olifant/plans/do').length > n, 'plans/do');
    assert.equal(chooses().at(-1)!.choice, 'reopen');
    assert.deepEqual(sent('olifant/plans/do').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, line: 2, resume: 'R1', text: 'rename it' });
  });

  it('a stale plan: the edit is refused whole, the review stays, the footer says why (Review Focus 5)', async () => {
    const a = await running();
    const ed = await open(file(PLAN));
    await showing(reviewFixture('do'));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '<!-- typed -->\n'));
    const stale = ed.document.version - 1;
    reply('olifant/plans/review/choose', { done: true, said: 'kept', edit: planEdit('  ✓ kept line\n', stale) });
    const before = a.pause.notices().length;
    await a.pause.press('a');
    await until(() => a.pause.notices().length > before, 'the refusal');
    assert.ok(a.pause.notices().at(-1)!.startsWith('a: '));
    assert.equal(a.pause.source(), 'do');
    assert.ok(!ed.document.getText().includes('kept line'));
  });

  it('d opens the review\'s details as markdown beside the window', async () => {
    const a = await running();
    await showing(reviewFixture('do'));
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/R1').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## the step'));
    await vscode.window.tabGroups.close(tab);
  });

  it('a review opened over a pause swaps the window; the pause stays; a conjure in the unit swaps back (spec §5.4)', async () => {
    const a = await running();
    await settle(MAIN, Array.from({ length: 10 }, (_, i) => `v${i} = ${i}`).join('\n') + '\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(3, 0, 3, 0);
    const w: ConjurePaused = wrapped('plain');
    w.paused.lines = { first: 3, last: 5 };
    reply('olifant/conjure', w);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'conjure', 'the pause window');
    await showing(reviewFixture('do'));
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    const n = sent('olifant/conjure').length;
    const back = await open(file(MAIN));
    back.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'conjure', 'the pause again');
    assert.equal(sent('olifant/conjure').length, n);
    await a.pause.press('q');
    await settle(MAIN, 'x = 1\n');
  });

  it('durandal.isPlan: a plan of project one, not a file in no project', async () => {
    const a = await running();
    await open(file(PLAN));
    await until(() => a.isPlan(), 'isPlan for the plan');
    await open(file('plain/notes.txt'));
    await until(() => !a.isPlan(), 'not for notes.txt');
  });
});
```

The fixtures (Task 7) give: the do review `R1` on row 2, step 1, unit `Table.label`, badge `◆ answered`, files `src/a.py` (M) and `src/b.py` (A), offers keep / revert / test / allow; the errand `R1` with only reopen, row 2; the reconcile review with two entries, the first a `done` reading (apply, leave), the second `unplaced` with place offers on keys `1` (step 2) and `2` (step 3). If a fixture differs, change the test's literals to the fixture's, not the fixture.

- [ ] **Step 8: Run lint, unit and the e2e**

Run: `npm run lint && npm run test:unit && DURANDAL_E2E_ONLY=fake.13 npm run test:e2e`, then `DURANDAL_E2E_ONLY=fake.12 npm run test:e2e` (the conjure source must not have changed).
Expected: all PASS.

If the push test times out: check the fake log for the client receiving `olifant/plans/review/ready` (the fake sends notifications in `notify` before the answer) and that `hooks.reviewReady` was set before the server started (it is assigned on activation, before the first `start`; `lc.onNotification` reads `hooks` at call time).

- [ ] **Step 9: README, CHANGELOG, commit, PR**

In `README.md`, add after the pause window's last paragraph:

```markdown
The same tab reviews a plan's do, a past do, and a reconcile's readings. A do's review opens by
itself when the do ends; the plan's lenses and `Cmd+Alt+D P R` (`Ctrl+Alt+D P R`) on a plan open
any review waiting there. A do review: `a` keeps the change, `r` reverts it, `t` runs the step's
tests, `p` allows the tools the do was refused, `o` reopens its thread with what to change,
`[` `]` move between its files. A reconcile: `a` applies the selected reading, `r` leaves it, a
digit places a unit under that open step, `n` makes it a new step, `i` ignores it. `q` closes the
tab; the review stays on the server, under its lens.
```

In `CHANGELOG.md`, add as the first entry under `## Unreleased`:

```markdown
- Reviews in the pause window: a do's review opens when the do ends, the plan lens and
  `Plan: Review` (chord `p r` on a plan) open do, past-do and reconcile reviews; their answers
  land as one undo step, with the plan's facts (milestone 5b).
```

Run the whole gate: `npm run lint && npm run test:unit && npm run test:e2e`. Expected: PASS.

```bash
git add src/pause/review.ts src/pause/controller.ts src/plans/trackIsPlan.ts src/server.ts src/commandTable.ts src/extension.ts test/unit/manifest.test.ts test/e2e/fake.13-review.e2e.ts README.md CHANGELOG.md
git commit -m "pause: reviews in the window: the push after a do, the plan lens, p r; choose, facts and reopen"
git push -u origin m5b-reviews
gh pr create --title "M5b: reviews in the pause window" --body-file <scratch>/m5b-pr.md
```

The PR body (after the final Fable review and its fixes) lists: what the sources do; plan decision 6 (`plans/do` sends `line`); spec corrections (the errand's tab title, `denied` is a list, the wide legend never fits); handoffs to M6 (`facts.ts`, `isPlan.ts`, `trackIsPlan.ts`, `ClientHooks.reviewReady`, `Reviews.open` for the errand entry points and the forced-reconcile auto-open, the do answer after a reopen as one line); and the manual checklist: a real do review's look in both themes; the lens label `Cmd+Alt+D P R`; the plan facts landing as one undo step.

---

## Self-review notes (for the plan's author; executors may skip)

- **Spec coverage.** §3.1-3.7: Tasks 5 and 6 (store, reminder, drops 1-6, resume, claim, hidden run). §4: Task 4 (panel, protocol, layout), Tasks 2 and 5 (keys). §5: Tasks 7 and 8. §6: Tasks 3, 5 (`d` for a pause) and 8 (`d` for a review). §7: Task 1 (types), Tasks 2, 3 and 7 (edge cases), Task 5 (M4 removals), Task 6 (README and CHANGELOG). §8: every listed unit file and both e2e files.
- **Not pinned by a test:** "server not running at press time" (§3.5, §7). A server stop drops every pause first (`hooks.stopped`), so the window cannot show a pause while the client is gone; the check stays in `resume()` and `choose()` as a guard.
- **The task writers ran their code** against stand-ins for the neighbouring tasks' modules (Tasks 2, 3, 7) and Task 2's expected strings against durandal.nvim's own `pause.situation` headless. Tasks 1, 5, 6 and 8 were not compiled; their names were checked against Tasks 2, 3, 4 and 7 by hand.
- **Cross-task rulings applied after the writers finished:** `View.tab` (decision 9); `conjureKeys(chord)` and `noRow` (Task 2) used by Tasks 5 and 7; the review key tables carry the `PageDown PageUp` line and the page's `Escape` name; Task 4's panel titles its tab with `view.tab`.
- **Spec corrections found while planning:** the fixtures are wrapped `{ paused }`; `denied` is a list; `{from, to, lines}` facts exist; unsaved plan edits do not make a choose's edit stale (Review Focus 5); the errand tab title is `do · past` (a tab title, not the page's title line); nvim's status line uses an em dash; the help says `PgDn PgUp` where nvim says `^d ^u`.
