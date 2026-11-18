# durandal-vscode M9: olifant pin bump to main and the conjure step review

Date: 2026-11-17. Status: brainstormed on Fable; the user's rulings are in §0.A and every other
point is ruled here. Umbrella: `2026-11-06-durandal-vscode-design.md`. Supersedes the conjure half
of `2026-11-08-m5-pause-review-webview-design.md` (the do/errand/reconcile review half stands) and
the ask-ghost / `reviewAnswers` decisions of `2026-11-12-m7-ghost-blocks-design.md`. Companion:
`2026-11-17-m10-plan-prose-and-inspect-design.md` (the UI that follows on this pin). Release
precedent: `2026-11-15-v0.1.1-design.md`. Facts: `~/projects/notes/vscode-port/m9/`
(`olifant-drift.md` + addendum, `nvim-and-vscode-surface.md`, `olifant-conjure-overhaul.md`,
`nvim-conjure-inspect-vs-vscode.md`). Paths: vsc = durandal-vscode at `4d3b589` (v0.1.1 + the
first M9 draft), nvim = durandal.nvim `origin/main` `770834e` `lua/durandal/`, olifant =
`origin/main` `6c47430` (read with `git show origin/main:<path>`; the pin is `48f38ab`).

The extension pins olifant at `48f38ab`. Olifant main has since re-made conjure: no rounds, no
pause, no offers; a conjure is one step, shown for review, answered accept / reject / harder. The
extension's only webview was built on the old pause, so moving the pin breaks it. M9 moves the
pin, replaces the pause window's conjure half with the step review durandal.nvim now has, and
fixes the two other breaks the bump causes (`olifant/plans/ask` and the server command list).
The plan-prose and inspect UI that the same pin enables is M10, which ends with release 0.2.0; M9
merges to main without a release.

## 0. Decisions

### A. Ruled by the user

1. **(2026-11-15) Parity with durandal.nvim, nothing ahead of it.** Inspect's four actions and
   doctor row get command routing only.
2. **(2026-11-15) The hover footer's keys are fixed in olifant, first.** An olifant PR makes the
   server read `keys.plan_keep` and `keys.definition` from `initializationOptions`; M9 pins the
   olifant commit that includes it.
3. **(2026-11-17) Split.** M9 = pin bump + conjure step review + the breaks, merged to main, no
   release. M10 = plan-prose chords and margin, the inspect margin, docs, release 0.2.0.
4. **(2026-11-15) Chords follow nvim's letters** (M10 implements them; M9 only removes the `ask`
   verb and rebinds `P Q` to *Answer this*, so the chord is never dead on main).

### B. Ruled here

5. **Thin consumer.** The step review is drawn from the `shown` object; nothing is modelled client
   side beyond one held step per document. No reading of `.olifant/state/conjure-steps.jsonl`.
6. **The step review is a fourth source of the existing review panel**, beside do, errand and
   reconcile (as nvim's `step.lua` is a source of its `pause` window). Not a new webview.
7. **What nvim dropped, we drop**: the end-of-line reminder, the pause watcher, expiry, the `x`
   cancel, the running view, the size rule. Re-entry is by document version + cursor span.
8. **Names stay.** `src/pause/`, `PausePanel`, `PauseApi` keep their names; the prose becomes "the
   review window" (nvim renamed only prose). `source()` reports `'step'` for a conjure step.
9. **`olifant/plans/ask` leaves the client.** The verb `ask`, its ghost landing, `' ⋯ asking'` and
   the `durandal.plans.reviewAnswers` setting are removed. `P Q` runs the server's *Answer this*
   code action (the small `runTitledAction` helper lands here; M10 adds the other three chords).
10. **Step fixtures are hand-built, not recorded.** nvim has no recorded step fixture; ours are
    built from olifant's `stepJson` shape and nvim's `step_spec` cases, under `test/fixtures/step/`
    with that provenance in the README there.
11. **The real e2e sandbox stops setting `[plans] pass_cost = 0`** (on main it hides `○` and the
    Check actions; M10 asserts them) and gets `[conjure] writer` pointed at a recorded step via
    `step_replies`. The recorded `check_answers` hook stays; `decide_answers` / `inspect_answers`
    hooks are added here so M10 only writes tests.
12. **Settings are removed, not deprecated** (`plans.reviewAnswers`; the extension ships through
    GitHub releases at 0.1.1).

## 1. Scope and non-goals

In scope: `.olifant-ref` → olifant main (after the footer-keys PR); `SERVER_COMMANDS` to the
server's eight; `initOptions.keys` (`plan_keep`, `definition`); removal of `ask` and
`reviewAnswers`; `P Q` → *Answer this*; the conjure step review (protocol, flow, window, keys,
held step, fixtures, e2e); the env hooks `DURANDAL_STEP_REPLIES`, `DURANDAL_DECIDE_ANSWERS`,
`DURANDAL_INSPECT_ANSWERS`; README's conjure section and a CHANGELOG `## Unreleased` entry; the
olifant PR (footer keys, and the doctor `Claude` case if it crashes).

Not in scope (M10): the verdict table, spinner, shared-row marks, `P S` / `P shift+S` / `P K`,
the inspect margin, release 0.2.0. Not in scope at all: a Checks view; inspect chords; any
client-side conjure state beyond the held step.

## 2. Components and files

Olifant (`~/projects/olifant`, one PR, first):
- `src/Olifant/Server/Plans.hs:339-341`: `keepFooter`/`keepAnswerFooter` take the definition key
  and the keep key, from `scKeys` (`Lsp.hs:241`) with defaults `gd` and `<leader>mpk`; one
  `LspSpec` case each way; book rows in `16-the-language-server.md` and `19-plans.md`.
- `src/Olifant/Doctor.hs`: verify `olifant doctor` with `default` set to a `claude` backend (the
  model row has no `Claude` case); add the case if it crashes.

Extension (`~/projects/durandal-vscode`):
- `.olifant-ref`; comments naming `48f38ab` (`src/protocol.ts:295,320`, `src/settings.ts:30`,
  `test/e2e/run.ts:104`, `test/fake-lsp/fake-lsp` header); README Requirements sha (the
  `releaseText` test needs README and CHANGELOG to carry the same 7-char sha — the CHANGELOG line
  goes in `## Unreleased`).
- `src/protocol.ts`: `SERVER_COMMANDS` (8); `ConjureResult`, `ConjureResume`, `Shown`; the
  `Paused*` family removed; `plans/ask` entry per §6 check 3.
- `src/settings.ts`: `keys.plan_keep`, `keys.definition`; `step_replies`, `decide_answers`,
  `inspect_answers` from env.
- `src/tdd/conjure.ts`, `src/tdd/landing.ts`: the three-branch flow and the new words.
- `src/pause/stepModel.ts` (new), `src/pause/stepStore.ts` (new, the held step),
  `controller.ts` (`showStep`, `stepTable`, `answerStep`; the pause half removed),
  `model.ts` (pause-only helpers removed; shared `KeyHelp` entries lifted first), `details.ts`
  (`conjureDetails` removed), `resume.ts` / `progress.ts` / `reminder.ts` / old `store.ts`
  removed with their `server.ts` / `extension.ts` wiring; `webview/main.ts` (`PAGE_KEYS`, span and
  state kinds).
- `src/plans/verbs.ts`, `rowMarks.ts`, `words.ts`, `src/plans/settings.ts`, `src/plans/actions.ts`
  (`runTitledAction`, the `P Q` handler), `src/commandTable.ts` (`durandal.plan.ask` retitled
  "Plan: answer this"), package.json (setting removed).
- `test/fake-lsp/fake-lsp` (8 commands); `test/fixtures/step/{took,nostep,failing}.json` +
  `test/stepFixtures.ts`; `test/fixtures/paused/*` and `pauseFixtures.ts`'s pause parts removed;
  `test/e2e/fake.12-step.e2e.ts` (replaces `fake.12-pause`), `fake.11-tdd` landing cases,
  `fake.13-review:333-351`, `fake.15-verbs` minus ask, `real.8-tdd`; `test/e2e/run.ts` sandbox
  config + env; unit tests (`stepModel.test.ts`, protocol shape, landing words, every-key test;
  old pause halves removed).
- README (conjure section, the `c` row, "the review window" prose), CHANGELOG `## Unreleased`,
  M5 spec/plan "superseded (conjure half)" lines.

## 3. Design per item

### 3.1 Pin and the breaks

- The pin moves to olifant main at or after the footer-keys merge. CI's shape is unchanged
  (checkout at the sha, cabal cache keyed per sha with prefix restore, hackage fallback); one cold
  build per OS. `[conjure] wire` and `[model] rounds` are config errors on main: the sandbox
  config must not set them (it does not today — plan-time check 1 confirms).
- `SERVER_COMMANDS` = `olifant.doctor`, `olifant.checkSentence`, `olifant.answerSentence`,
  `olifant.checkPlan`, `olifant.showWhy`, `olifant.showCode`, `olifant.inspectShowWhy`,
  `olifant.inspectDismiss`. `src/actions/command.ts:106` then routes every server-built action to
  the server, arguments verbatim. Inspect's four actions and the plan actions work from the
  lightbulb and the chord-a menu from this point.
- `initOptions.keys` = `{ plan_review: chordLabel('p r'), plan_keep: chordLabel('p k'),
  definition: 'F12' }` (M10 binds `P K`; the footer is right from the day the pin lands).
- `olifant/plans/ask`: `REQUEST.ask`, the `straight` landing, `' ⋯ asking'`, `nothingBack` for
  ask and `plans.reviewAnswers` go. `P Q` (`durandal.plan.ask`, title "Plan: answer this") calls
  `runTitledAction(editor, ['Answer this'])`: `textDocument/codeAction` at the cursor point
  (UTF-16 column, `context.diagnostics: []`, no `only`), bare `Command`s dropped, the first action
  whose title starts with the prefix runs `workspace/executeCommand` on the server with its
  `command.arguments`; none → info `ask: nothing to answer here (checked already? hover reads it)`;
  a `ResponseError` → its message as an info notice. The helper takes `{exact?, needsEdit?}` so M10
  reuses it for `P S`, `P shift+S`, `P K`.
- Left to vscode-languageclient: `definition` → `Location[]`, `window/showDocument`, Markdown
  hover, `window/showMessage`, `$/progress` "checking"/"answering" (plan-time check 4: the
  `handleWorkDoneProgress` middleware falls through for titles the pause code no longer owns — with
  `progress.ts` gone the middleware shrinks to the library default).

### 3.2 Conjure: wire

```ts
type ConjureParams = { textDocument, position, selection?: {start, end}, resume?: ConjureResume };
type ConjureResume = { token: string; choice: 'accept' | 'reject' | 'harder' };
type ConjureResult = { shown: Shown } | { landed: { file: string; edits: WorkspaceEdit | null } }
                   | { rejected: true };
type Shown = { token; file; unit; writer; goal: string | null; took?: boolean;
  edits: WorkspaceEdit | null; dropped: string[]; parses: { file; ok: boolean }[];
  tests: { passing: string[]; failing: string[]; stillRed: string[]; noTests: boolean };
  after: TestsRun | null; cost: number | null; seconds: number; harder: boolean;
  diffs: { file; diff }[]; situation: string; reply: string };
```

Every nullable is read through `given()`; only an explicit `took === false` is a no-step. The
`Paused*` family, old `ResumeChoice` values, `hint`/`arg`/`land`, and the flat landed shape
(`summary, green, rounds, rungs, stopped`) are deleted. `$/progress` "conjuring" (indefinite,
cancellable) stays with the library's status-bar progress and the Cancel on the opening call;
its messages are `conjuring with <model>` / `conjuring again with <model>` and are shown as is.

### 3.3 Conjure: flow (`src/tdd/conjure.ts`)

- `c` (and the selection variant) sends `{textDocument, position, selection?}`. The result:
  `shown` → `controller.showStep(doc, shown, position)`; `landed` → apply `edits` with
  `applyServerEdit` (one undo step per file; `documentChanges` with `CreateFile` + inserts for new
  files, as the do review's landing already does), flash the changed span, `test.mark(shown.after)`
  when the held step had one, `landed('conjure')`, info `conjured · <goal> · <saved | N files
  saved | N saved, M unsaved | nothing changed>` (`the step` when no goal; always info); `rejected`
  → info `step rejected · nothing landed`; anything else → error `conjure: an answer olifant does
  not give`.
- Answers reuse the opening `textDocument` + `position` and add `resume`. The server locates the
  project by the path and the step by the token alone.
- Errors: on an answer (a `resume` was sent) → close the window, forget the step, show the
  server's sentence as an error (`the file changed since the step was shown; your text stands
  (<rel>): conjure again`, `this step is gone (it was answered, or a new conjure replaced it):
  conjure again`, `no harder writer: name one with [conjure] harder` — the last keeps the old step,
  see §3.5). On the opening call → leave state alone, show the sentence (`<why>: put the cursor in
  one to conjure it`, `no model is configured: …`, `claude is not installed`, `timed out after N
  s`, `the model said: …`). `RequestCancelled` → info `conjure cancelled · nothing landed`.
- `didChange` keeps flowing (the server's staleness check reads the live document version).

### 3.4 Conjure: the window (`src/pause/stepModel.ts`)

A `View` with `rows: []`, no status line, `state: 'review'`, built with the existing `put`,
`wrapped`, `fit`, `diffTitle`, `diffLines`, `legend()` helpers. Left pane, top to bottom:

1. Title `conjure · <unit> · <goal>` fitted to width (`conjure · <goal>` when narrow); goal
   `(no goal stated)` when null. No-step: `conjure · no step · <goal>`, or
   `conjure · no step · the writer saw nothing to do` when the goal is `nothing`.
2. Facts line, dim: `<writer> · <seconds> s · $<cost, 3 dp>` (`the writer` when null; cost part
   only when non-null).
3. `tests   ` + `no tests` (`noTests`) / `no change in the tests` / the non-empty parts of
   `+N passing`, `-N newly failing`, `N still red` joined by ` · `; coloured error when any
   failing, dim when only still red, passed otherwise.
4. `dropped: a, b` in the error colour, when any.
5. No-step notice: `the writer took no step: h asks the harder writer, d shows its reply`
   (`the writer took no step: d shows its reply` without a harder writer).
6. `files   [ ] file`, then one row per `diffs[].file`: `> ` on the selected, `✓ ` passed or `✗ `
   error per `parses` (`✓` when the file has no parse entry), the path. No files and took: `the
   step changes no file`.

Right pane: `file N of M · <file>` (+ ` · Tab back` when narrow) over the file's unified diff,
trailing blanks trimmed; `no change` when there is no file. Legend: `[Tab diff ·] a accept ·
r reject · h harder · [ ] files · d details · ? help · q later`, with `a` dropped when
`took === false` and `h` dropped when `!harder`.

### 3.5 Conjure: keys (`controller.ts` `stepTable`)

| Key | Does |
|---|---|
| `a` | `answerStep('accept')`; when `took === false` says `no step to accept: h asks the harder writer, d shows the reply` and sends nothing |
| `r` | `answerStep('reject')` |
| `h` | `answerStep('harder')`; when `!harder` says `no harder writer: name one with [conjure] harder` and sends nothing |
| `[` `]` | previous / next file; `the first file`, `the last file`, `the step changes no file` |
| `j k PgUp PgDn`, `Tab`, `?` | shared scroll / narrow flip / help |
| `d` | `reviewDetails` beside the window with two sections, `the situation the writer read` and `the writer's reply` |
| `q`, `Esc` | close; the step stays held |

`answerStep(choice)`: busy guard (a second `a`/`r`/`h` says `the last answer is still on its
way`), footer `landing…` / `rejecting…` / `asking the harder writer…`, then the request of §3.3.
A new `shown` (after `h`) re-renders in place with the new token; a failed `h` keeps the old step
and token and shows the error in the footer. `landed` and `rejected` close and forget.

### 3.6 Conjure: the held step (`src/pause/stepStore.ts`)

One per document: `{shown, position, version, lines}` where `lines` is the span the step's
`edits` touch in that document (`documentChanges[].edits[].range` and `changes[uri]`), or the
asked line for a no-step. `c` with no selection, the same document version and the cursor inside
`lines` reopens the window with no request; otherwise the held step is dropped and a fresh conjure
is sent (the server drops its own shown steps for that file on a new conjure). A selection conjure
always asks fresh. Nothing watches the document; the version comparison replaces the old pause
watcher, reminder and expiry. A server restart invalidates tokens: the next answer gets `this
step is gone`, which closes and forgets (§3.3).

### 3.7 Removed

`src/pause/resume.ts` (move `acted` first), `progress.ts` and its `hooks.progress` wiring,
`reminder.ts`, the old `store.ts` payload, `details.ts:conjureDetails`; from `model.ts`:
`entries`, `rows`, `noRow`, `PauseEntry`, `PauseRow`, `Running`, `situationLines`, `titles`,
`diffPane`, `statusLine`, `conjureLegend`, `conjureKeys`, `conjureView` — after the shared
scroll/Tab/`d`/`?` `KeyHelp` entries move to `reviewModel.shared()` (the trap at
`reviewModel.ts:14-20`); from `controller.ts`: the sink methods, `Run`, claims and timer, the
conjure `paint` branch, `table`/`rowKey`/`resume`/`select`/`step`/`jump`/`cancel`/`details`, the
paused-document watchers; webview `PAGE_KEYS` letters `c C w W s x P T 0-9`, `SpanKind`
`paused`/`spinner`, `ViewState` `paused`/`running`, `View.status`, `View.reason`;
`PauseSink`/`ResumeHooks`/`resume()` in `tdd/conjure.ts`; `test/fixtures/paused/*`,
`pauseFixtures.ts`'s pause parts, `fake.12-pause.e2e.ts`, `resume.test.ts`, `pauseStore.test.ts`,
`progress.test.ts`, the pause halves of `model.test.ts` / `details.test.ts`, `protocol.test.ts`'s
`PAUSED_FIELDS` and four-fixture test; README's pause-window key table and reopen/expiry text.
The do/errand/reconcile review path is untouched and its tests must stay green throughout.

## 4. Testing summary

- Unit: `stepModel.test.ts` (nvim's nine `step_spec` cases: full situation; newly failing / still
  red / non-parsing file; no tests + dropped + no goal; second file selected; no-step title, notice
  and legend; goal `nothing`; refusals before any request); protocol shape (the three results,
  `took` absent = took); landing words; an every-key-acts-or-says-why test over the step table;
  `runTitledAction` picking; `manifest.test.ts`; `protocol.test.ts` scans against the new pin;
  `releaseText` sha (README + CHANGELOG Unreleased).
- Fake e2e `fake.12-step.e2e.ts`: open from `shown` (title, facts, tests, files, diff); `a` lands
  as one undo step and says `conjured · <goal> · saved`; a new file is created; `r`; `h` replaces
  in place with the new token; `h` error keeps the step; no-step opens with the notice and refuses
  `a`; `q` then `c` on the same version reopens with no request, an edit asks again; a selection
  conjure sends `selection` and asks fresh; busy guard; engine-refused accept closes and says why;
  `d` opens the two sections; `source()` is `'step'`. `fake.11-tdd` landing cases rewritten;
  `fake.13-review:333-351` ported to a step; `fake.15-verbs` loses ask and gains `P Q` → the
  `Answer this` action → `olifant.answerSentence` in the fake's log. fake-lsp's initialize lists
  the 8 commands.
- Real e2e: `run.ts` writes the sandbox config with `[decide] model = "jev"`, a jev backend, the
  writer backend the recorded step needs, `[inspect] enabled = true`, `settle = 0.5`, no
  `pass_cost = 0`, no `wire`/`rounds`; env `DURANDAL_STEP_REPLIES` (a `<goal>…</goal><file
  path=…>…</file>` text, as olifant's `conjureSpec`), `DURANDAL_CHECK_ANSWERS`,
  `DURANDAL_DECIDE_ANSWERS`, `DURANDAL_INSPECT_ANSWERS` → the init options. `real.8-tdd`: `c`
  shows the step with the recorded goal, `a` lands it, `conjured · <goal> · saved`; a no-step
  recording gives the no-step window and `a` is refused client-side. (M10 adds the plan-prose and
  inspect assertions on this sandbox.)
- CI: same shape, one cold cabal build per OS.

## 5. Plan-time checks

1. The real sandbox's `.olifant/config.toml` (from `scripts/try-pack.sh` on main) sets neither
   `[conjure] wire` nor `[model] rounds`; it names a writer backend that `step_replies` satisfies
   (a non-jev kind; confirm which kinds `conjureSpec` uses with `withPython` + `step_replies`).
2. `olifant.cabal` on main builds with GHC 9.10.3 / cabal 3.16.1.0.
3. `protocol.test.ts`'s method scan: whether `olifant/plans/ask` must stay listed because the
   server still serves it.
4. With `progress.ts` gone, `handleWorkDoneProgress` middleware is either deleted or passes every
   token to the library.
5. `applyServerEdit` handles `documentChanges` with `CreateFile` + `TextDocumentEdit` at the
   editor's version (the step's `edits` for a new test file).
6. The doctor `Claude` case: run `olifant doctor` on main with `[model] default` naming a claude
   backend before the olifant PR is cut.
7. `releaseText.test.ts` accepts the sha in `## Unreleased` (or needs the check loosened to any
   section).

## 6. Task order

1. Olifant PR: footer keys (+ doctor `Claude` case if check 6 fails); merge; note the sha (Sonnet).
2. Pin bump and the breaks: `.olifant-ref`, comments, `SERVER_COMMANDS`, `initOptions.keys`,
   env hooks, `ask`/`reviewAnswers` removal, `runTitledAction` + `P Q`, fake-lsp's command list,
   sandbox config; unit scans green (Opus: protocol-sensitive).
3. Conjure protocol and flow: `protocol.ts` types, `tdd/conjure.ts` three branches, landing words,
   the held step store (Opus).
4. Step window: `stepModel.ts`, controller `showStep`/`stepTable`/`answerStep`, legend, details;
   lift shared `KeyHelp`; remove the pause half (Opus).
5. Fixtures and e2e: `test/fixtures/step/*`, `fake.12-step`, `fake.11`/`fake.13`/`fake.15` ports,
   `real.8`; delete the pause fixtures and tests (Sonnet; Opus review).
6. README conjure section, CHANGELOG Unreleased, M5 superseded lines; final whole-branch review
   (Fable, per policy: the conjure window applies server edits to the user's files) (Sonnet
   write-up).

## 7. Acceptance criteria

- `.olifant-ref` names an olifant main commit at or after the footer-keys merge; CI green on all
  three cells; `check-vsix` passes; main carries no release.
- `c` on a unit against the real server opens the step window per §3.4; `a` lands the edits and
  says `conjured · <goal> · saved`; `r` and `h` behave per §3.5; `q` + `c` reopens without a
  request; after an edit `c` asks again; a no-step opens and refuses `a`.
- Hovering a checked plan sentence shows `F12: the code · Keep this verdict: Ctrl+Alt+D P K`.
- `P Q` on a question runs *Answer this*; the lightbulb on an inspect finding offers the four
  actions and each runs; `Durandal: Health` shows the `inspect` row.
- `plans.reviewAnswers` is gone from package.json; `test/fixtures/paused/` is gone; the
  do/errand/reconcile reviews pass their existing e2e unchanged.

## 8. Follow-ups (not filed here)

- M10 (companion spec): chords, verdict margin, spinner, shared-row marks, inspect margin, 0.2.0.
- A Checks view / costs from `plans cost --checks --json`.
- Inspect chords or a findings list, once nvim has them.
- The `[conjure]` language-pack shapes and doctor's three conjure rows are "open" in olifant's
  book; the extension depends on neither.
