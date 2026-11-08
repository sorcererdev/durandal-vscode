# durandal-vscode M4: the TDD loop

Date: 2026-11-08. Status: approved in conversation, section by section. Umbrella:
`2026-11-06-durandal-vscode-design.md` §6 row 4. Inputs: `~/projects/notes/vscode-port/m4/`
`tdd-surface.md` (facts with pointers into durandal.nvim, olifant and alder-vscode), olifant book
`user/18-tdd-in-the-editor.md`. Paths below: vsc = durandal-vscode at `804864f`, nvim =
durandal.nvim/lua/durandal, olf = olifant/src/Olifant.

The user of the extension sees what durandal.nvim gives: cursor on a function → `stub` adds a
test to the project's own test file, `conjure` fills a body, `test` runs the project's own runner,
`mutate` marks survivors. Nothing is added to the user's project; the only state is the server's
step log, which exists today. Everything below is about the extension's own code.

## 0. Decisions

User rulings (2026-11-08):

1. **Results document, not the Test Explorer.** olifant has no test-listing method and `passed`
   carries ids only, so a Test Explorer tree could only fill itself from runs, could not honour
   "run these three tests" (the server runs nearest / file / all) and would have no ▶ icons
   before a run. A `durandal-doc` results document plus diagnostics keeps nvim's rhythm (one
   keystroke → one summary line → marks in the code). The Explorer is deferred until olifant
   offers a listing method (candidate olifant issue; the user's call).
2. **Chords match nvim**, deviating from the umbrella spec §4: `t` = test here (nearest test,
   the server falls back to the file), `shift+t` = test file, "Test All" palette only.
3. **Paused conjure in M4**: a warning with Continue / Stop buttons; the pause window is M5.
4. **Code split per nvim module** (`test.lua` → `tests.ts`, …) inside the extension's `src/tdd/`,
   each with a pure half ported with its nvim spec.

Adaptations from nvim, recorded: a green run refreshes the results document but does not open
it (nvim always opens its split); the `✗ … (line N)` Enter-jump becomes a DocumentLink plus F8
over the diagnostics; stub saves the edited files (M1's apply convention; nvim leaves them
unsaved); the survivors modal is a QuickPick whose "right pane" is the editor itself.

## 1. Scope and non-goals

In scope: `durandal.test.here`, `durandal.test.file`, `durandal.test.all`, `durandal.jump`,
`durandal.stub`, `durandal.conjure` (landed path, paused → warning), `durandal.mutate` with the
survivors picker, waive, and the silent re-mutate after a green run. Protocol types tightened to
the server's shapes.

Out of scope: the Test Explorer (ruling 1); the pause/review window and any client-side paused
state (M5); `fire_landed` plan reconcile after test/stub/conjure (M6); a separate chord for
conjure-with-selection (one command reads the selection, as nvim's visual map does); new
settings; action-log events (nvim logs none; the server's `.olifant/state/steps.log` records every
step).

## 2. Components and files

```
src/tdd/
  results.ts    pure: TestsRunResult → document text, link targets, one-line summary
  marks.ts      the two DiagnosticCollections (tests, mutate) + survivor memory per file/unit
  tests.ts      run here/file/all, cancel-on-rerun, results document, DocumentLinkProvider
  jump.ts       olifant/tests/file → open
  stub.ts       olifant/stub → applyServerEdit → cursor on the name
  conjure.ts    olifant/conjure → landed path; paused → warning with Continue/Stop
  mutate.ts     olifant/mutate → marks, summary, re-mutate after green
  survivors.ts  the picker (Ui.list) → stub / waive
```

- `commandTable.ts`: the six M4 ids move from `NOT_YET` to `BUILT`; `durandal.test.here` is
  added with chord `t`; `durandal.test.file` moves to `shift+t`; `durandal.test.all` has no chord.
  `when: durandal.inProject` on all. `test/unit/manifest.test.ts` follows.
- `extension.ts` builds `Marks`, `Tests`, `Stub`, `Conjure`, `Mutate` as it builds `Suggest` and
  `Generate`, registers the DocumentLinkProvider for scheme `durandal-doc` (results path only),
  and exposes `Api.tdd` (last run answer, marks snapshot) for e2e.
- `uiTypes.ts`: `list` (a live list view: the survivors picker) and `ask` (a notice with buttons: the paused warning) are added, not `pick` with item buttons and `onActive`; `text` is the
  waive InputBox. `test/fakeUi.ts` answers both.
- `protocol.ts` tightened (header comment: "a milestone that consumes a result tightens its type
  here"):
  - `TestsRunParams { textDocument; scope?: 'file' | 'all'; position? }`;
    `TestsRunResult { file; passed: string[]; scope: 'test'|'file'|'all'; test: string|null;
    failed: { id; file; line: number|null; message; output }[]; broken: string|null; seconds }`.
  - `ConjureResult` landed: `edits: WorkspaceEdit | null; tests: TestsRunResult; rounds: number;
    rungs: string[]; stopped?: boolean`; paused: `{ paused: { token: string; diagnosis: string;
    … } }` — only what the warning reads; the full shape is M5's.
  - `MutateResult.lines: { first: number; last: number }`, `waived: number`;
    `WaiveResult { waived: true }`.

## 3. Test run, results document, jump

**Requests.** `test.here`: `olifant/tests/run` with the active file and the cursor `position`
(olf Lsp.hs:610-616: in a test file the server runs the test there, in a module its test file).
`test.file`: `scope: 'file'`. `test.all`: `scope: 'all'`, the active file naming the project. No
save first: the server runs over the text it holds from didChange (nvim sends none either).

**In flight.** One `CancellationTokenSource` per run; a new run cancels the one in flight (the
server kills the runner and answers −32800, swallowed). A cancellable progress notification
"Durandal: testing…" carries the Cancel button; the library's status-bar spinner for the server's
own `$/progress` stays (M5 wants that token). Plan-time check: if the library's progress already
offers Cancel for `cancellable: true`, drop ours. A `seq` guard drops a stale answer that arrives
after a newer run started (nvim test.lua:222).

**Diagnostics** (`tests` collection, source `olifant`, Error): one per failure on `line-1` in its
own file (full line); a broken single-file run → one on line 0 of the answer's `file`; a broken
`all` run → none. The collection is cleared at the start of every run. F8 walks them.

**Results document**: a `durandal-doc` at a fixed path (`tests/results.txt`), so re-runs update
in place via `VirtualDocs.set`. Text as nvim test.lua:70-118:

```
7 passed · 2 failed · 1.3 s          | all 5 passed · 0.8 s | no tests ran | broken: <first line>
✗ test_x  (create_booking__test.py:14)                       (rest of a broken reason indented 2)
  <message>
    <output lines>
```

`✗` rows are DocumentLinks to `file:line` (no link when `line` is null). The document opens
beside the editor with `preserveFocus` when there is something to read (failures or broken); an
all-green run refreshes an open results tab and opens nothing. The summary line is also a notice:
info when green, warning when red or broken.

**After a green `here`/`file` run** with ≥ 1 pass: the silent re-mutate (§5). `fire_landed` is M6.

**Jump** (`durandal.jump`): `olifant/tests/file`; open `file` in the active column. `exists:
false` → an untitled document at that path (its first save writes it there) and the info
`new test file: <rel> — stub a test with ⌃⌥D S` (⌘⌥D on macOS). Refusals verbatim as errors.

## 4. Stub and conjure

**Stub** (`durandal.stub`). `olifant/stub` with the active file and cursor; from the survivors
picker (§5) the same function runs with `survivor` set and `position = (survivor.line-1, 0)`.
`edits` go through `applyServerEdit` (annotations stripped; the result's null document versions
pass `versionConflict`, vsc edits.ts:41; clean files saved — M1's convention). Then open
`result.file` in the active column with the cursor on the test's name: `result.name` found in
line `result.line-1`, column 0 if absent. One notice via `applyServerEdit`'s `word`:
`stubbed <name> · saved <file>`. Refusals (`no function or class at line 1: …`, a test file, a
language with no `[test.stub]`) verbatim as errors.

**Conjure** (`durandal.conjure`). `olifant/conjure` with file + cursor; when the selection is
non-empty, `selection: { start, end }` (0-based inclusive lines). Cancellable progress
"Durandal: conjuring…"; the server's round-by-round progress shows in the status bar. Cancel
(−32800) → info `conjure cancelled · nothing landed`.

Landed answer, in nvim's order (conjure.lua:130-203):

1. `edits` (null when nothing changed) through `applyServerEdit`; the server sends the accepted
   form, nothing asks again; the convention's save matches nvim's `write_landed`.
2. Flash the changed lines 500 ms (decoration on `diffEditor.insertedLineBackground`), cursor to
   the first changed line.
3. `tests` → the `tests` collection (cleared, then marked, as a run). The results document is
   refreshed if open, not opened.
4. One notice: `conjured · <summary>`, then ` · N rounds · <rung> → <rung>` when `rounds > 1` or
   `rungs.length > 1` and the summary lacks " in round ", then the save info. Warning when
   `green` is false, info otherwise. `stopped: true` → `<summary> · <saved> · undo reverts it`,
   or `stopped · nothing landed` without edits.

Paused answer (ruling 3): warning `conjure paused: <first sentence of paused.diagnosis> —
steering arrives in a later milestone` with buttons **Continue** (`resume: { token, choice:
'continue' }`, the answer handled by the same code, may pause again) and **Stop** (`{ token,
choice: 'stop' }`, lands nothing). Dismissing does nothing; the server's token expires in 10
minutes. No client-side paused state in M4; a new conjure anywhere is a fresh request.

Errors (the file changed during the conjure, no model configured, no test file yet, …) are the
server's sentence, verbatim, as an error notice.

## 5. Mutate, survivors, waive, re-mutate

**Mutate** (`durandal.mutate`). `olifant/mutate` with file + cursor; cancellable progress
"Durandal: mutating…"; Cancel → info `mutate cancelled`. On the answer: the summary as an info
notice (`1 survivor · 5/6 killed`, `nothing to mutate in handle`, `… · 1 waived`); one Warning
per survivor in the `mutate` collection (source `olifant`, full line `line-1`): `<from> → <to>
survives`, plus ` (likely equivalent)` when `dim`. Only marks inside the answer's
`lines.first..last` are replaced; other units' marks in the file stay. `marks.ts` keeps the
survivor payloads per file and unit range — read by the picker, waive and re-mutate. Marks live
until replaced, waived, or the document closes (nvim's per-buffer namespaces).

**Survivors picker** (nvim survivors.lua → `Ui.list`). Opens only when there are survivors and
the active editor is still that file. Title: the summary. Items `line N  operator  from → to`;
non-dim first, dim last with description `likely equivalent`; detail = the mutated line.
`onActive` reveals and highlights the survivor's line in the editor. Enter = stub a test for it
(nvim's `s`/CR); item button `waive`; Esc closes; the picker closes when the active editor
changes.

**Stub from a survivor**: close the picker, §4 stub with `survivor`. **Waive**: `Ui.text`
`Waive <from> → <to> (line N), because:`; empty or cancelled → back to the picker, nothing sent.
Else `olifant/waive { textDocument, survivor, reason }`; on `{ waived: true }` the mark and item
go, info `waived: <from> → <to> on line N`, the picker closes when empty. Errors (`a waiver needs
a reason`) verbatim; the survivor stays.

**Silent re-mutate** after a green `here`/`file` run with ≥ 1 pass (nvim mutate.lua:84-142):
module = the run's file, or `olifant/tests/file` when it was a test file. For each unit there
that still holds marks, `olifant/mutate` at `(first marked line, 0)`, sequentially, no picker,
no progress notification. Replace that unit's marks; refresh an open picker; one info
`killed: <from> → <to> on line N; …` for mutants that no longer survive, nothing when nothing
changed; a unit whose request errors keeps its marks.

## 6. Errors and lifecycle

- Every server error shows its sentence verbatim as an error notice (RequestFailed refusals,
  InvalidParams, the internal `olifant lsp: …`).
- −32800: silent for a run superseded by another; `conjure cancelled · nothing landed` /
  `mutate cancelled` for a Cancel click.
- A server stop or restart cancels in-flight TDD requests (as M3b's `Controller.stopped` drops
  pushes); marks and the results document stay — they describe the code, not the server.
- `NOT_RUNNING` keeps M1's message.

## 7. Testing

- **Unit** (node:test, ported from the nvim specs `test_spec`, `conjure_spec`, `mutate_spec`,
  `survivors_spec`): results text and summary; conjure notice composition (rounds/rungs rule,
  `stopped`); marks replace-within-range and survivor ordering; re-mutate unit grouping; the
  protocol method list.
- **Fake e2e** (`fake.11-tdd`, replies via the `<method>.json` convention; `hold` for cancel):
  `here`/`file`/`all` send position / scope (FAKE_LSP_LOG); a run → diagnostics, document text,
  notice; broken single vs `all`; a second run cancels the first (`$/cancelRequest` logged);
  jump with `exists` true and false; stub applies, saves, cursor on the name; conjure landed with
  and without edits, red → warning, after-run marked; paused → warning, Stop sends the resume;
  mutate marks + picker (fakeUi) → stub carries `survivor`; waive empty / sent / error; re-mutate
  after a green run.
- **Real e2e** (`real.8-tdd`, python-htmx sandbox, as nvim `e2e_tests_spec`): green and red runs
  with the diagnostic on the asserting line; nearest test; scope file; jump both ways and to a
  missing test file; stub (undone after); mutate on `handle` (`\d+/\d+ killed`). Conjure against
  a real model is local-only behind `DURANDAL_E2E_MODEL`; CI has no model. Plan-time check:
  ast-grep availability for mutate in CI.
- **Manual** (PR checklist): flash colour in light/dark, results document layout, picker reveal,
  the Cancel button on the progress notification, Ctrl/Cmd-click on a `✗` link.

## 8. Umbrella deviations and follow-ups

- §4 chords: `t` test here, `shift+t` test file, Test All palette only (ruling 2).
- §6 row 4's "Test Explorer vs a results document": results document (ruling 1); Explorer
  deferred until a server listing method exists — candidate issue on sorcererdev/olifant.
- Green runs do not open the results document.
- Plan-time checks: library progress Cancel button; ast-grep in CI; VS Code's handling of an
  untitled document at a real path for `exists: false`.
