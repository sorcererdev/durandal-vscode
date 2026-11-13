# durandal-vscode M6: plans

Date: 2026-11-09. Status: approved in conversation, section by section. Umbrella:
`2026-11-06-durandal-vscode-design.md` §6 row 6 ("plan detection, reading layer, glyph
decorations, fold conclusions, verbs, lenses, errands, outcome notifications, auto-reconcile,
plan diagnostics style"; decision it owns: "glyphs by decoration vs token colours only"). Input:
`~/projects/notes/vscode-port/m6/plans-surface.md` (durandal.nvim `plans.lua` / `review.lua` /
`ghosts.lua` seams and `plans_spec.lua`; olifant's plan protocol at the port's pin and at HEAD;
the port at `7a4651c`; the VS Code 1.91 / 1.145 API facts). Paths below: vsc = durandal-vscode
at `7a4651c`, nvim = durandal.nvim/lua/durandal at `2a7c954`, olf = olifant/src/Olifant at
`48f38ab` (the new pin, §0.1).

The user of the extension sees what durandal.nvim gives in a plan file: markers, anchors and
fingerprints read as glyphs, done steps and answered questions fold closed with their conclusion
on the fold line, claim verdicts sit in the margin, a chord asks, validates or does a step, the
plan keeps itself reconciled with the code as tests, stubs, conjures and saves land, journal
lines open the past do behind them, and the review window from M5 opens for a forced reconcile's
readings and a `do`'s result.

## 0. Decisions

User rulings (2026-11-09):

1. **M6 targets olifant `48f38ab` (HEAD today), claim pass in scope.** The port's pin `1ae076f`
   is 42 commits behind and the whole difference is plans: six token modifiers instead of three
   (`checked`, `wrong`, `resolved` added), the server-run claim pass (started on `didOpen`,
   `didSave` and the client's `olifant/plans/idle` notification; each pass is `claude -p` work
   under `[plans] pass_budget` / `pass_cost`, `0` turns it off), per-sentence pull diagnostics
   `source: olifant-plan` with codes `claim-checking/right/wrong/unsure/queued`, three new
   `executeCommand`s (`olifant.checkSentence`, `olifant.showWhy`, `olifant.showCode`, answered
   through `window/showDocument`), hover on claims, and fold rules that need the checked-sentence
   set. nvim's `plans.lua` is written against HEAD. M6a's first commit bumps `.olifant-ref` and
   re-runs the M1–M5 real e2e against it.
2. **The three VS Code gaps.** Glyphs are done properly, by decoration (§3.3). Folds close on
   entry without custom fold text; the conclusion rides on an end-of-line decoration on the
   collapsed line (§3.6). Virtual lines (ghost blocks) stay M7.
3. **Blocks before M7: an accept-all / reject-all prompt.** `validate`, a `do` in a project
   without git, and an `ask` with `reviewAnswers` return proposal blocks that nvim shows as ghost
   blocks. M6 shows their text beside the plan and asks Accept all / Reject all; accepted blocks
   land through the same write path an `ask` uses; `plans/outcome` goes out per block. `p y` /
   `p n` stay "not implemented yet (milestone 7)".
4. **Approach A: middleware taps + pure view layers.** The library keeps registering the
   server's semantic tokens, folding ranges and code lenses; M6 taps the three middleware hooks
   to copy each answer into a per-document reading model; every decoration is a pure function of
   that model plus editor state. No extra requests. (B, extension-owned providers, re-implements
   the library; C, pulling via `vscode.provide*` commands, doubles requests to a server doing paid
   work and races the editor's own token cycle.)
5. **One spec, three PRs.** M6a reading layer (pin bump, detection + settings, token
   contributions, glyphs, verdict margin, folds + conclusions, Enter rule, excerpt typed-guard);
   M6b verbs (dispatch / pending / cancel, landing, the blocks prompt, files, new step / excerpt /
   toggle, stub / test on a step, the reopen's full `do`); M6c the loop (landed bus,
   auto-reconcile, idle, lens commands, errands, outcome, claim-pass actions, `stopped`).
6. **Dropped:** nvim's `:Durandal plan` (treat any buffer as a plan). The server serves plan
   features only for paths its own `isPlanPath` recognises, so a marked buffer would get chords
   without tokens, folds or lenses. Deferred, not ported.
7. **Defaults mirror nvim:** the glyph layer is off (`durandal.plans.conceal: false`); colours
   and folds are always on; `reconcile: "auto"`; `foldDone: true`; `reviewAnswers: false`. There
   is no idle setting: idle is the claim pass, always sent; the README names `[plans] pass_cost =
   0` as the off switch and says a pass can cost money.
8. **Chords** keep the nvim letters under `ctrl+alt+d p` (also on macOS): `q v d y n f c e
   r x` as in `commandTable.ts` today, plus `p enter` New Step, `p s` Stub, `p t` Test (in a plan
   they shadow the global TDD chords, as nvim's do), `p o` Open Past Do (nvim's `gd` / Enter on a
   journal line; Enter is not remappable in VS Code and Go to Definition stays the server's).
   `Plan: Cancel` is palette-only.

## 1. Scope and non-goals

In scope: §0.1's pin bump; `durandal.plans.*` settings; `durandal.isPlan` on more events; token
type / modifier / scope contributions; the reading model; glyph decorations; the verdict margin;
close-on-entry folds and conclusion decorations; the markdown Enter rule while a plan is active;
the excerpt typed-guard; the verbs ask / validate / do / files / reconcile / new step / excerpt /
toggle / stub / test / cancel / open past do; landing with facts, straight-in answers, the blocks
prompt, fingerprint stamps, outcomes; the landed bus; auto-reconcile with its three triggers;
idle; the `olifant.plans.excerpt` and `olifant.plans.errand` lens commands; the claim-pass actions
reaching the chord-`a` menu; `ClientHooks.stopped` for all of it.

Not in scope (named for the next milestones): ghost blocks and `p y` / `p n` (M7); `:Durandal
plan` marking (§0.6); a gutter or sign column (VS Code has only image gutter icons); custom fold
text (no API, §3.6 is the substitute); a Test Explorer for a plan's tests; olifant#7 (a keep
refused as stale is already kept server-side; protocol work); M8's README and packaging beyond
the sections M6 adds.

## 2. Components and files

New under `src/plans/` (existing: `isPlan.ts`, `trackIsPlan.ts`, `facts.ts`):

| file | purpose | vscode import |
|---|---|---|
| `legend.ts` | decode a `SemanticTokens` data array with the server's legend into `Tok[]` | no |
| `reading.ts` | `PlanReading` per document: tokens, folds, lenses, version; `lineTokens`, `sectionRange` | no |
| `glyphs.ts` | `concealOf(tok, text, glyphs)`, the default glyph table, the trailing-space rule | no |
| `foldText.ts` | `foldLabel(reading, start, end)`: question conclusion / done step / plain | no |
| `verdicts.ts` | rank table, `worstPerLine(diagnostics)` | no |
| `journal.ts` | `isJournal(line)` | no |
| `blocks.ts` | block row resolution (`after_text` → `locate`, `after`, request row), replace rule, fingerprint stamp rule, `acceptEdits` | no |
| `scheduler.ts` | the reconcile state machine (in flight, again, debounce, said-open, version moved → rerun) with an injected clock | no |
| `idle.ts` | the per-document 1 s debounce | no |
| `taps.ts` | the three middleware functions that feed `PlanReading` | yes |
| `decorate.ts` | glyph, verdict, pending, conclusion and flash decoration types; `repaint(editor)` | yes |
| `folds.ts` | close on entry (`editor.fold`), collapsed-start detection from visible ranges | yes |
| `enterRule.ts` | install / dispose the markdown `onEnterRules` with the active editor | yes |
| `verbs.ts` | dispatch, running rows, cancel, `land` | yes |
| `prompt.ts` | the blocks Accept all / Reject all prompt + the beside document | yes |
| `actions.ts` | new step / excerpt / toggle through `textDocument/codeAction` with `only: ['source']` | yes |
| `reconcile.ts` | the scheduler's shell: triggers, the request, the review auto-open | yes |
| `errands.ts` | `p o`, the `olifant.plans.errand` lens command | yes |
| `options.ts` | `durandal.plans.*` read + change events (distinct from `src/settings.ts`) | yes |

Elsewhere: `src/landed.ts` (the bus, §5.1); `src/applyEdit.ts` gains `onApplied(label, uris)`;
`src/server.ts` wires the taps into `middleware` and the idle / outcome notifications;
`src/protocol.ts` gains `plansIdle`, the six modifiers, typed `ErrandResult.facts/blocks`,
`ReconcileResult`, `FilesResult`, `ErrandsResult`; `src/commandTable.ts` moves the nine plan
commands from `NOT_YET` to `BUILT` (except accept / reject, re-labelled milestone 7) and adds
`plan.newStep`, `plan.stub`, `plan.test`, `plan.cancel`, `plan.errand`; `package.json` gains the
settings, chords, `contributes.semanticTokenTypes/Modifiers/Scopes`; `src/pause/controller.ts`
`redo` is replaced by a call into `verbs.run`; `src/pause/review.ts` `Reviews.open(uri,
'reconcile')` is reused by the forced reconcile; `src/extension.ts` exposes `Api.plans` (§8).

## 3. The reading layer (M6a)

### 3.1 Detection and settings

- `isPlanPath(path, root, languageId)` stays the rule with the dir from `durandal.plans.dir`
  (default `"plans"`). The README says it must match `[plans] dir` in `.olifant/config.toml`, as
  nvim's does; the server decides which files are plans, the client only decides where its
  chords and decorations apply.
- `durandal.isPlan` now also updates on `onDidChangeTextDocument` when the language id of the
  active document changes and on `onDidSaveTextDocument` of the active document (an untitled
  file saved into `plans/`). The M5b note "editor change only" closes.
- Settings `durandal.plans.*`: `dir` string; `reconcile` `"auto" | "key"`; `conceal` boolean
  (false); `glyphs` object, any of `todo ☐`, `done ☑`, `question ?`, `test ·`, `also +`, `dash ""`,
  `path ""`, `hex ""`, `queued ○`, `checking …`, `right ✓`, `wrong ✗`, `unsure ?`; `foldDone`
  boolean (true); `reviewAnswers` boolean (false). A change repaints every visible plan.

### 3.2 Data: taps and the reading model

`clientOptions.middleware` gains `provideDocumentSemanticTokens`,
`provideDocumentSemanticTokensEdits`, `provideDocumentRangeSemanticTokens`,
`provideFoldingRanges`, `provideCodeLenses`. Each calls `next`, and for a plan document copies
the answer into `readings.get(uri)`:

- Tokens are decoded with the legend from `lc.initializeResult.capabilities.semanticTokensProvider
  .legend`, never from `protocol.ts` constants, so a legend change cannot misdecode; an `Edits`
  answer is applied to the previous array. `Tok = { line, start, length, type, modifiers:
  Set<string> }`. Multi-line tokens are kept but ignored by `concealOf` (nvim: single-row only).
- Folds: `{ start, end }[]` (the server's, before VS Code merges them with markdown's).
- Lenses: the resolved `command` and `arguments` of each (`olifant.plans.excerpt` carries
  `[uri, open, close, live, anchor]`).
- `version` = the document version the answer was computed for. Every reader checks it.

`PlanReading` is dropped on document close and on `stopped`.

### 3.3 Colours and glyphs

Colours come from themes. `contributes.semanticTokenTypes` lists the 13 types with `superType`
mirroring nvim's links: `planEvidence`, `planAlso`, `planJournal` → `comment`; `planQuestion` →
`class` (nvim's `Title`; a heading-like colour in every theme); `planAnchorUnit` → `variable`;
`planStep`, `planStepDone`, `planClaim`, `planTest`, `planMarker` → `string`; `planVerdict`,
`planAnchorPath`, `planFingerprint` → `number`. `contributes.semanticTokenModifiers` lists the
six; `semanticTokenScopes` gives each type a TextMate scope and maps `stale` to `comment`. The
`done` modifier maps to nothing ("the folding does the work", nvim). No decoration carries a
colour of its own except the verdict margin (§3.4).

Glyphs, only with `conceal: true`. One `TextEditorDecorationType` per glyph name, rebuilt when the
setting changes. For each single-row token of type `planMarker`, `planAnchorPath`,
`planFingerprint` on a non-cursor line, `concealOf` picks the glyph: `planAnchorPath` → `path`,
`planFingerprint` → `hex`, `planMarker` by trimmed text `- [ ]` → `todo`, `- [x]`/`- [X]` →
`done`, `- ?` → `question`, `- test:` → `test`, `- also` → `also`, else → `dash`. The token's
range is hidden and the glyph shown as `before.contentText`; when the glyph is non-empty, the
token is a marker and the character after it is a space, the range stops one column early so the
glyph keeps the marker's trailing space (nvim `plans.lua:116-118`). An empty glyph hides only.

The hide: `textDecoration: 'none; display: none'` (the CSS the editor injects verbatim). Plan-time
check in the fake e2e that the hidden text takes no width; fallback `opacity: '0'` with a
negative `letterSpacing` sized to the range. Cursor lines show raw text (nvim `concealcursor=""`):
every line holding a selection's active position is skipped; repaint on
`onDidChangeTextEditorSelection`, `onDidChangeVisibleTextEditors`, a new tokens answer, a
settings change. Repaint is a filter over `reading.tokens`; no requests.

### 3.4 Verdict margin

On `languages.onDidChangeDiagnostics` for a plan uri: take the diagnostics with `source`
`olifant-plan` or `olifant`, one glyph per line, worst wins by nvim's rank (`claim-wrong` 5 ✗,
`claim-unsure` 4 ?, `claim-checking` 3 …, `claim-queued` 2 ○, `claim-right` 1 ✓; any verdict
outranks any non-verdict diagnostic; among non-verdicts error > warning > information > hint,
shown as `E W I H`, as nvim's sign text does). The
glyph is a `before` decoration at column 0 of the line, `margin: '0 0.6ch 0 0'`, colour
`editorWarning.foreground` (wrong, warnings), `editorError.foreground` (errors),
`testing.iconPassed` (right), `editorHint.foreground` (the rest). A `claim-wrong` range also gets
`textDecoration: 'underline wavy'` in `editorWarning.foreground`.

Non-verdict diagnostics keep VS Code's own rendering: there is no API to hide squiggles per
document, and nvim's rule ("a plan line is prose; words beside prose read as prose") is already
met because VS Code draws no inline text for diagnostics. The Problems panel is untouched.

### 3.5 Enter continues a step

`languages.setLanguageConfiguration('markdown', { onEnterRules })` with two rules — a line
matching `^\s*- \[ \] ` continues with `- [ ] `; a line matching `^\s*- \[[xX]\] ` continues with
`- ` (nvim: `comments = "b:- [ ],b:-"`, done steps continue plain) — **installed when the active
editor becomes a plan and disposed when it stops being one**, so other markdown files never see
it. Plan-time check: whether the call replaces the built-in markdown configuration (it has no
`onEnterRules` of its own); if it does, ours copies the built-in brackets, auto-closing and
surrounding pairs.

### 3.6 Folds

The server's ranges reach the editor through the library; markdown's heading folds merge by VS
Code's rule (equal starts: the first registered provider wins; overlaps with an earlier range
are dropped). Plan-time check that step and excerpt folds survive the merge on a real plan;
fallback: none is possible from an extension, so the finding is documented and the markdown
folds are what they are.

**Close on entry.** When a plan editor becomes active and this document has not been entered
since it was opened (per document, not per editor; `foldDone` false → excerpt starts only, true
→ every server range with `end > start`), wait for a `PlanReading` with folds for the current
version (poll 50 ms, give up after 8 s as nvim does), then one `editor.fold { selectionLines:
starts }` on the active editor, latest start first. Folds that form later start open (VS Code's
default). A document re-opened after close is entered again. Plan-time check: `editor.fold`
against an editor that lost focus between the wait and the call; fallback: skip, enter again on
the next activation.

**Conclusions.** `onDidChangeTextEditorVisibleRanges` and every repaint compute the collapsed
starts: a server fold start whose `start + 1` is not in any visible range. Each gets an `after`
decoration in `editorCodeLens.foreground`, text from `foldLabel(reading, start, end)`:

- the start row has a `planQuestion` token → ` — <conclusion> ▸ N` where the conclusion is the
  last row at or before `end` whose indent equals the question's first child's indent and which
  has a `planClaim` token; without one, ` ▸ N`;
- else a `planStepDone` token → `  <planAnchorUnit text> <planVerdict text> ▸ N`;
- else ` ▸ N`;

with `N = end - start`, cut with `…` at 80 columns. nvim's leading glyph (`?`, `☑`) is skipped:
the line's own text stays visible in VS Code. Examples pinned by the unit tests: `? Why F?` line
shows ` — A later note. ▸ 3`; `- [x] done step @src/a.py:F ✓ abc1234` shows `  F ✓ ▸ 1`.

### 3.7 Excerpt typed-guard

`onDidChangeTextDocument` on a plan: for each change whose range lies strictly between a live
excerpt lens's `open` and `close` rows (`live === true`), warn once per `anchor ?? open` per
document: *"excerpt: live and read-only, the next reconcile replaces what you type here"*. Frozen
excerpts never warn. The warned set is dropped on close and `stopped`.

## 4. The verbs (M6b)

### 4.1 Dispatch

`verbs.run(uri, verb: 'ask' | 'validate' | 'do', row, params?)`:

- no client → `NOT_RUNNING` through `ui.error`;
- one request per row: `running.get(uri).get(row)` present → warn *"plans: a request is already
  running on this line"*;
- the row gets a pending end-of-line decoration ` ⋯ asking` / ` ⋯ validating` / ` ⋯ doing`
  (`editorCodeLens.foreground`); the row is tracked as a one-line range shifted by
  `onDidChangeTextDocument`, so a block whose `after` equals the request row lands where that row
  is now (M4's survivor lines do the same);
- params `{ textDocument, line: row, ...params }` (a reopen adds `resume`, `text`); the request
  carries a `CancellationTokenSource` kept with the running entry; `tick` = the document version
  at send;
- answer: cancelled (`-32800`) → info *"cancelled"*; error → `ui.error(message)`; `null` → info
  *"<verb>: nothing came back"*; result → `land(...)`. The pending decoration goes in every case.

`Plan: Cancel` (palette): cancels every running verb of the active plan and its running reconcile
(§5.2); info *"cancelled"*, or *"plans: nothing is running"*.

### 4.2 Landing

`land(uri, verb, requestRow, result, tick)` in nvim's order:

1. **Facts.** `result.facts` → `factEdits` → one `WorkspaceEdit`, only when the document version
   equals `tick`; otherwise dropped without a word (nvim `plans.lua:409`).
2. **A `do` with `review: string`** (git project): info *"do: N file(s) changed · to review · S
   s[ · $C]"* (`N = changed.length`), `landed.fire('do')`, return. `changed` files need no
   `checktime`: VS Code reloads clean documents itself; a dirty one keeps the person's text, as
   it should.
3. **Blocks.** Rows resolve as nvim's: `after_text: string` → `locate` inside the section holding
   the request row (`sectionRange`: nearest `#` heading above to the line before the next);
   `after === requestRow` → the tracked row; else `after`; clamped to the document. `replace` when
   `block.replace === true` or (verb `do` and the first line starts `- [`). Then:
   - **ask, `reviewAnswers` false:** `accept(all blocks)` at once;
   - **otherwise** (validate; a `do` with no `review`; ask with `reviewAnswers`): the prompt
     (§4.3).
4. Message *"<verb>: N lines · D not found · S s[ · $C]"* (`D = dropped + unresolved`, `$C` only
   when `cost` is present); the last landed row flashes 300 ms (the `conjure` flash type).

`accept(blocks)`: lines inserted bottom-up (one insert after the same row keeps the engine's
order), replacing when the rule says; every fingerprintable line (a `- ` line that is not `-
test: `, `- also @`, `- ? `, `- [ ] `, `- [x] `) that carries an anchor and has an `fp` gets
` ✓ <fp>` after the anchor (nvim `ghosts.lua:74-95`); joined with step 1's facts in **one**
`WorkspaceEdit` (plan-time check that `workspace.applyEdit` is one undo step; fallback
`TextEditor.edit` with `undoStopBefore` / `undoStopAfter` false between the two); then
`plans/outcome { textDocument, id: result.id, block: i, outcome: 'accepted' }` per block when
`result.id` is a string; `landed.fire('accept')`. A document that is not open any more drops the
blocks with no outcome.

### 4.3 The blocks prompt (until M7)

The blocks' text, in order, each block separated by a blank line, is set into
`durandal-doc:/plans/<name>/proposal.md` and shown beside the plan (`ViewColumn.Beside`,
`preserveFocus`); then `ui.ask("<verb>: N lines in K blocks", ['Accept all', 'Reject all'])`
(the M4 `Ui.ask` shape: a modal-free information message with two buttons). Accept all →
`accept(blocks)`; Reject all → `plans/outcome … 'rejected'` per block; dismissed → nothing sent
(nvim's unanswered ghost). The beside document is forgotten after the answer. `p y` / `p n` say
*"Durandal: Plan: Accept is not implemented yet (milestone 7)"*.

### 4.4 Files, new step, excerpt, toggle, stub, test, review

- **Files** `p f`: `plans/files { textDocument }` → `items[{ section, row, text, file, line }]`
  → quick pick, label `section · text`, detail `file:line` or the plan's `row + 1`; pick → open
  the file at `line` (default 1) or move the plan's cursor to `row`. Empty → info *"plans: no
  files"*.
- **New step** `p enter`, **Excerpt** `p e`, **Toggle** `p x` (`actions.ts`): the extension sends
  `textDocument/codeAction` at `{ row, 0 }` with `context: { only: ['source'], diagnostics: [] }`
  itself (`source` actions never reach the lightbulb or the chord-`a` menu's filter) and:
  - new step: the action titled `New step below` with an `edit` → `applyServerEdit`; cursor to
    `row + 2`, column 0; none → warn *"no new step here"*;
  - excerpt: first, if the cursor row is inside a collapsed server fold (§3.6's collapsed
    starts) → `editor.toggleFold`, no request; else the action titled `Show the code here`:
    `disabled` with `data.open` → toggle the fold at `open + 1`; `disabled` without → info
    *"excerpt: <reason>"*; an `edit` → apply; else `codeAction/resolve` → apply `edit` or info
    *"excerpt: nothing to show here"*; no such action → the same info;
  - toggle: the action with `data.kind === 'toggle'`: `disabled` → info *"toggle: <reason>"*;
    `edit` → apply; else resolve → apply or info *"toggle: nothing to change here"*; none → info
    *"toggle: not on a step"*.
  All applies go through `applyServerEdit` (the server's version check stands; a resolve that
  fails with *"the plan changed since; ask again"* is shown as the error).
- **Stub** `p s` / **Test** `p t`: `plans/stub` / `plans/test` with `{ textDocument, line }`; M4's
  `StepResult` handling applies (`applyServerEdit` with `word` saves the stub's files; info
  *"stubbed <name>"*; tests → *"tests: P passed · F failed · S s"*, facts only when the version
  held, else the warning suffix *" · plan changed, press again"*); each fires `landed` (`stub`,
  `test`).
- **Review** `p r`: M5b's. The reopen path's `redo` (`controller.ts:598`) becomes
  `verbs.run(planUri, 'do', line, { resume: id, text })`, so a reopened do lands fully.

Every message string above is nvim's, verbatim.

## 5. The loop (M6c)

### 5.1 Landed bus

`src/landed.ts`: `landed: EventEmitter<{ kind: 'test' | 'stub' | 'conjure' | 'do' | 'accept' |
'review' }>`. Fired by `tdd/tests.ts` (a run finished), `tdd/stub.ts`, `tdd/conjure.ts` (a conjure
landed), `pause/controller.ts` (a review answered with `done`), `plans/verbs.ts` (`do`, `accept`).
The only cross-module event in the port; the reconcile shell is its first listener.

### 5.2 Reconcile

`scheduler.ts` (pure): per document `{ inFlight?: { tick }, again?: boolean, lastStart?: ms,
lastError?: string, saidOpen?: number }`; `start(uri, forced, now, version)` → `'send' |
'remembered' | 'skip'`; `answer(uri, result | error, versionNow)` → the messages to say, whether
to open the review, whether to run again. Rules (nvim `plans.lua:487-544`):

- a second start while one is in flight is remembered (`again = again || forced`); one more
  unforced run follows the answer when the document version moved during the request (the
  server's facts were refused) or `again` is set;
- unforced with no client → `skip` silently; forced → `NOT_RUNNING`;
- result `{ landed, readings }`: say *"reconcile: L facts · O to review"* when `landed > 0` or
  `readings !== saidOpen`; remember `saidOpen`; **forced and `readings > 0` → `Reviews.open(uri,
  'reconcile')`**; automatic runs never open it;
- error: `-32800` silent; else shown when forced, or when the text differs from `lastError`
  (an automatic run says a repeated error once).

`reconcile.ts` (shell): sends `plans/reconcile { textDocument, forced }` with a cancellation
source (cancelled by `Plan: Cancel`); `p c` = forced. The facts arrive by `workspace/applyEdit`
with labels `Olifant: reconcile` / `Olifant: journal`: `applyServerEdit` gains an `onApplied(label,
uris)` hook, and the shell records the post-edit version of each uri as its own, so that edit
does not count as "the document moved" (nvim's `reconciling[buf].tick` reset). A reconcile
result's `facts` / `blocks`, if present, are ignored (nvim ignores them; the e2e asserts it).

Triggers, `reconcile === 'auto'` only:

1. a plan becomes the active editor (`onDidChangeActiveTextEditor`, and the client attaching
   while one is active) → unforced, skipped when that document's last start is < 1 s ago;
2. every `landed` event → unforced, every open plan document;
3. `onDidSaveTextDocument` of a non-plan file → one global 1 s timer, restarted by each save;
   on fire, unforced for every plan that has a visible editor (hidden plans wait; the plan's own
   save does not count).

`reconcile === 'key'` leaves `p c` only.

### 5.3 Idle

Per plan document: `onDidChangeTextDocument` re-arms a 1 s timer; on fire, if the version is
unchanged since arming, `notify('olifant/plans/idle', { textDocument })`. Dropped on close and
`stopped`. Sent regardless of `reconcile` mode: idle is the claim pass, not the reconcile. The
README's plans section says what a pass costs and that `[plans] pass_cost = 0` turns it off.

### 5.4 Lenses

The library shows the server's lenses and honours `workspace/codeLens/refresh`. The two stubbed
commands become real:

- `olifant.plans.excerpt [uri, open, close, live, anchor]` → toggle the fold at `open + 1` in a
  visible editor on `uri` (open one beside if none), making it active first;
- `olifant.plans.errand [uri, row]` → `plans/errands { textDocument, row }` → `errands[]`: none →
  info *"plans: no past do here"*; one → open it (§5.5); several → quick pick, label `<at, first
  16 chars, T → space> · <status> · <choice> · <words>`.

`olifant.plans.review` is M5b's. `editor.action.triggerSuggest` is built in.

### 5.5 Errands

`p o` (`Plan: Open Past Do`): on a journal line (`isJournal`: `^\s*- \d\d? [A-Za-z]{3} \d\d:\d\d
· `) → `plans/errand { textDocument, row }` → the M5 window shows it read-only (`kind:
'errand'`, M5b's view model); off a journal line, or an error / non-object result → info *"plans:
no record behind this line"*. Opening by id (from §5.4's pick) sends `{ textDocument, id }`.

### 5.6 Claim-pass actions

The three server commands are registered by the library's `ExecuteCommandFeature` and forwarded
as `workspace/executeCommand`; `window/showDocument` is the library's. Nothing to build for them.
`Check this (~$est)`, `Show why`, `Show the code here` are code actions on a sentence or step:
the chord-`a` menu in a plan must list them. Plan-time check of what the server returns to a
`textDocument/codeAction` without `only`; if the `source` ones are missing, the menu sends a
second request with `only: ['source']` and merges. The menu's existing "review first" path is
unchanged for actions with an `edit`; a bare `command` action is run through
`commands.executeCommand`.

Diagnostics for verdicts are pulled: plan-time check against `48f38ab` that the server sends
`workspace/diagnostic/refresh` when a verdict changes (the library honours it, and the port's
default pull options re-pull only on open and editor switch). Fallback if it does not:
`diagnosticPullOptions: { onChange: true, filter }` with the filter keeping the change pull for
plan documents only (plan-time check of the library's `filter` signature). Whichever the check
selects goes in the plan.

### 5.7 Stopped

`ClientHooks.stopped` → `verbs` drops running rows and pending decorations; `reconcile` drops
in-flight state, `again`, timers, `saidOpen`; `idle` timers go; `readings` and the warned sets
are cleared; decorations are repainted empty. Nothing it said stands.

## 6. Protocol, errors, edge cases

- `protocol.ts`: `PLAN_TOKEN_MODIFIERS` = the six; `Olifant.plansIdle` (notification `{
  textDocument }`); `ErrandResult { facts?: Fact[], blocks?: Block[], dropped?, unresolved?,
  seconds?, cost?, changed?: string[], review?: string, id?: string }`, `Block { after?: number,
  after_text?: string, lines: { text: string, fp?: string }[], replace?: boolean }`;
  `ReconcileResult { landed?: number | string, readings?: number | string }` (nvim `tonumber`s
  them); `FilesResult { items: FileItem[] }`; `ErrandsResult { errands: Errand[] }`, `Errand { id,
  at, status, choice, words, model }`.
- Every verb request names the plan's `textDocument.uri`; the server answers for recognised plans
  only, so a chord in a non-plan markdown file never fires (`when: durandal.isPlan`).
- A verb answered after the document closed: facts and blocks dropped, no outcome, no message.
- A landing whose `after_text` is not found: nvim's `locate` returns nil → the block uses
  `after`; the same here.
- `applyServerEdit` refusals (*"<name> changed since"*) surface as today; the pending decoration
  for the verb is already gone by then.
- Legend mismatch (a server older than the pin): `legend.ts` decodes whatever legend the server
  announced; unknown types get no glyph and no fold label; nothing throws.
- Two editors on one plan: decorations are per editor (both repainted); close-on-entry is per
  document; the conclusion decorations follow each editor's own visible ranges.
- The claim pass costs money: the README's plans section states it in one sentence next to the
  idle behaviour; no client-side budget.

## 7. Umbrella deviations and follow-ups

- Umbrella §4 says "eleven `plan*` types and the `stale` modifier": the legend is 13 types and,
  at the new pin, six modifiers. `semanticTokenTypes` lists 13.
- Umbrella §4's glyph setting `durandal.plans.glyphs` ("false disables") becomes two settings
  matching nvim: `conceal` (the switch, default false) and `glyphs` (the table).
- Umbrella §6 row 6 "fold conclusions": delivered as end-of-line decorations on collapsed
  starts, not fold text (no API).
- `:Durandal plan` not ported (§0.6).
- `p o` and `Plan: Cancel` are new surface with no nvim chord (nvim uses `gd` / Enter and
  `:Durandal plan cancel`).
- Follow-ups to file after M6a: the markdown fold merge finding (if steps lose to headings); the
  `display: none` result; olifant: the kind of the `Check this` / `Show why` actions (if they
  are `source`, a request to make them `quickfix` or `refactor` so the lightbulb shows them).

## 8. Testing

**Unit** (`test/unit/`, node:test, no vscode): `legend` (13 × 6 bitmask decode, an `Edits`
apply), `glyphs` (`concealOf` table, trailing-space rule, empty glyph hides only), `foldText`
(the examples in §3.6, the conclusion scan, the 80-column cut), `verdicts` (worst wins, severity
fallback), `journal`, `blocks` (`sectionRange`, `locate`, `after` / request-row / clamp, the
replace rule, the stamp rule, bottom-up order with one `after`), `scheduler` (in flight →
remembered; version moved → one rerun; said-open; forced opens; repeated error once; `key` mode),
`idle` (re-arm, unchanged-version guard), `isPlan` with a configured dir, `manifest` (new chords
all `when: durandal.isPlan`, new settings present, `semanticTokenTypes` = the 13 with superTypes,
modifiers = the 6), `protocol` (new types).

**Fake e2e** (every CI cell). The fake gains `diagnosticProvider` and `executeCommandProvider`
(header note, as the port extended it before); canned `textDocument/semanticTokens/full`,
`foldingRange`, `codeLens`, `textDocument/diagnostic`, `olifant/plans/*` replies per test. A new
test seam `Api.plans = { drawn(uri): { glyphs, verdicts, pending, conclusions }, reading(uri),
entered(uri) }`.

- `fake.14-reading`: tokens → glyph decorations with `conceal` on, none with it off; the cursor
  line raw; the glyph decorations' ranges and `before` texts as the seam reports them (the §3.3
  width check cannot be measured from the extension host: it is a one-off probe at plan time
  and a manual-checklist item); folds closed on entry (`visibleRanges` skip `start + 1`) and open
  after a later fold appears; a conclusion decoration on a collapsed question; verdict glyph from
  a canned `olifant-plan` report, worst wins; the Enter rule present while a plan is active and
  gone after switching to `main.py`; the excerpt typed-guard warns once.
- `fake.15-verbs`: ask → lines straight in, ` ✓ fp` stamped, one undo (`undo` restores the
  pre-ask text), `plans/outcome accepted` per block in the log; validate → the beside document +
  prompt; Accept all lands and logs outcomes, Reject all logs `rejected`; a second verb on the
  same row warns; cancel → `$/cancelRequest` in the log and *"cancelled"*; a late answer with a
  moved version drops the facts; a `do` with `review` says the message and fires `landed`;
  files pick; new step / excerpt / toggle requests carry `only: ['source']`, disabled reasons
  surface, the toggle's resolved edit is applied; stub / test on a step reach `plans/stub` /
  `plans/test` with the cursor row; reopen → `plans/do` with `resume` and a full landing.
- `fake.16-loop`: entry reconcile once per second; `landed` → reconcile; save of `main.py` →
  one reconcile for the visible plan after 1 s, none for a hidden one; forced with `readings: 1`
  opens the review window on `reconcile`; an `Olifant: reconcile` labelled edit does not cause a
  rerun; a moved version does; `key` mode sends nothing automatic; idle notification 1 s after
  typing stops, none while typing; `olifant.plans.errand` with one / several; `p o` on a journal
  line opens the errand view, off it says the message; `stopped` clears running rows and
  decorations.

**Real e2e** (`OLIFANT_BIN` at `48f38ab`, `OLIFANT_REPO`): `real.9-plans` on the python-htmx
sandbox with `[plans] pass_cost = 0` appended to its `.olifant/config.toml` (no paid checks in
CI) and the `check_answers` initialization hook for one deterministic verdict: the six-modifier
legend arrives and decodes; a step and an excerpt fold; `p x` ticks a step through resolve; a
forced reconcile answers; `plans/files` lists the step's file. `ask` / `validate` / `do` stay
behind `DURANDAL_E2E_MODEL`, as M4's conjure does.

**Manual checklist** (per PR body): glyph alignment and the hide trick in light, dark and
high-contrast themes; verdict glyph colours; the conclusion decoration on a collapsed question;
`p enter` continues a step in a plan and does nothing special in another markdown file; `p o` on
a journal line; one close-on-entry pass on a plan with 20+ folds does not flicker; the
chord-`a` menu lists `Check this` with its estimate.

## 9. Handoffs

To M7 (ghost blocks): `blocks.ts` (rows, replace, stamp, `acceptEdits`), the `plans/outcome` send,
`landed.fire('accept')`, the prompt in `prompt.ts` to delete, `p y` / `p n` to build, nvim's
`ghosts.lua` seam list in `plans-surface.md` §1.8.

To M8 (release): README plans section (settings, chords, the claim-pass cost sentence, the `dir`
must-match note), CHANGELOG entries from the three PRs, the manual checklist results.
