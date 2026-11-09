# durandal-vscode M5: the pause / review webview

Date: 2026-11-08. Status: approved in conversation, section by section. Umbrella:
`2026-11-06-durandal-vscode-design.md` §6 row 5 ("the one webview: conjure pause, do review,
reconcile review, details view"; decision it owns: "the webview's message protocol and key
handling"). Inputs: `~/projects/notes/vscode-port/m5/nvim-pause-review-surface.md` (durandal.nvim
pause.lua / review.lua / details.lua / conjure.lua, their specs and the four fixtures) and
`protocol-and-port-state.md` (olifant's `olifant/conjure` and `plans/review` family, the port at
`4205138`, alder-vscode precedent: none). Paths below: vsc = durandal-vscode at `4205138`, nvim =
durandal.nvim/lua/durandal, olf = olifant/src/Olifant (pinned `.olifant-ref` 1ae076f; the pause
and review code is unchanged at olifant HEAD).

The user of the extension sees what durandal.nvim gives: a conjure that pauses opens a window
beside the file with the situation (diagnosis, rounds, tests), the diff a choice would land and
the offers as keyed rows; one letter or click answers; the window shows the run and the next
pause in place. The same window reviews a plan's `do` (keep / revert / reopen / tests / allow)
and a reconcile's readings (apply / leave / place / new / ignore) when M6 lands plans. `d` opens
the details beside it.

## 0. Decisions

User rulings (2026-11-08):

1. **M5 ships every source and the entry points that exist today.** Conjure pause, do, errand
   and reconcile review sources, client-built conjure details, server-built review details. Entry
   points wired in M5: the `olifant.plans.review` lens command (replacing the M1 stub), the
   `olifant/plans/review/ready` push, the `p r` chord with `durandal.isPlan` set by M5. M6 adds
   the plan verbs that create reviews and the errand entry points.
2. **The window is an editor tab beside the file**: one singleton `WebviewPanel`, opened in the
   column beside the unit's file and focused, so the letters work at once and the file stays
   visible for the reminder and the landing flash. Not a bottom-panel view, not the same column.
3. **Details are a virtual markdown document** (`durandal-doc`, language markdown) opened beside
   the window, not a page of the webview: headings give the outline and sticky scroll, fenced
   blocks get the editor's own highlighting, find and screen readers work.
4. **Thin webview, model in the extension** (approach A of three). The extension ports nvim's
   pure `situation()` / `entries()` / `rows()` / review `situation()` into a view model; the page
   script only renders the model and names what was pressed. Rejected: a smart webview computing
   layout in the page (two runtimes, two test setups) and server-rendered HTML set on every
   change (loses scroll, focus and the hint input; unusable for the running view).

Decided in the design, flagged here: the reminder under a paused unit is an end-of-line
decoration (the ⚡ hint pattern), not a CodeLens; the hint sentence and the reopen text are
asked through the native InputBox (`Ui.text`), not an input inside the webview; `o` reopen sends
the `olifant/plans/do` request minimally (M6 owns the do flow); the panel never closes on focus
loss (nvim closes on `WinEnter`; a tab is not a float); no corner spinner for a hidden run (the
library's status bar already spins); `durandal.isPlan` moves from M6 to M5.

Facts that shaped the design (details in the input files):

- There is no "conjure" source in the plans/review protocol. The pause lives entirely in the
  `paused` payload of `olifant/conjure`; do / errand / reconcile reviews are another family
  (`olifant/plans/reviews`, `/review`, `/review/choose`, push `/review/ready`). nvim shares one
  renderer over two data models; so does this design.
- Conjure details have no server payload (nvim builds them from `paused`); review details are
  server-built `{title, text, lang?}` sections.
- A pause is server memory only (600 s) and any edit to the unit's file kills it server-side at
  the next conjure call. Reviews are server-persisted (`.olifant/state/reviews/`), and their
  code lens is the durable entry point; lenses already render on plan files today.
- Progress correlation is by `$/progress` title (`conjuring`), first-come; only a resume feeds
  the window. No client code handles `$/progress` yet (the library's status bar does).
- No webview exists in this repo or alder-vscode: CSP, bundle, message protocol and tests are
  designed here. tsconfig has no DOM lib; there is one esbuild bundle; `.vscodeignore` is a
  whitelist. The four `*paused.json` fixtures are not vendored yet.
- M4's `Conjure.paused()` (Continue / Stop warning) and `pausedNotice` are what M5 replaces;
  `Conjure.ask()` is the one place a paused answer is told from a landing and `Conjure.land()` is
  reusable for a resume's landing.

## 1. Scope and non-goals

In scope: the pause store, reminder and drop rules; the webview panel, its message protocol,
layout and key handling; the conjure, do, errand and reconcile view models; resume building and
answer handling (in place, landing, error, cancel); the running view fed by the server's
progress messages; the review entry points of ruling 1, `choose` handling (edit, facts, files,
done / replace, reopen); the details document; `protocol.ts` tightened to the server's shapes;
the four pause fixtures vendored; `durandal.isPlan` and `durandal.pauseOpen` context keys.

Out of scope (M6 or later): the plan verbs (`do`, `reconcile`, `ask`, …) and their answer
handling; forced-reconcile auto-open; errand entry points (`olifant.plans.errand` lens,
`olifant/plans/errands` picker, journal-line definition); `:Durandal plan` buffer marking;
`fire_landed` after a landing or review; a corner spinner for a hidden run; a
`WebviewPanelSerializer` (a pause is gone after a restart anyway; reviews reopen from their
lens); settings for the window; `olifant/plans/outcome` (ghost blocks, M7); any real-server e2e
of a pause or a review (both need a model; see §8).

One spec; the plan may land it as two PRs, as M3 did: M5a the panel, conjure source, details and
pause lifecycle (§3, §4, §6); M5b the review sources and entry points (§5). The shared pieces
(§2 types, panel, controller, key tables) belong to M5a.

## 2. Components and files

```
src/pause/
  viewModel.ts    shared types (also imported by the webview bundle): View, Line, Span, Entry, Row
  model.ts        pure: paused payload → View (nvim pause.lua situation / entries / rows /
                  default_selected / row_lines / help_lines; short_name, failure_of, wire words)
  reviewModel.ts  pure: do / errand / reconcile payload → View (review.lua situation,
                  readings_situation, titles, one_command); pickAtCursor for the chord
  details.ts      pure: paused → markdown; review details[] → markdown (details.lua build,
                  build_sections)
  resume.ts       pure: Row + hint → ConjureResume; answer classifier (paused | landed | error);
                  landing and stop notice wording
  store.ts        PauseStore: one pause per document URI; drop rules; events
  panel.ts        PausePanel: the singleton WebviewPanel; html shell, CSP/nonce, postMessage
                  in/out, visibility, dispose; knows nothing about conjure or reviews
  controller.ts   PauseController: the source shown (conjure | review), key tables per source,
                  webview events → actions (resume, choose, select, details, cancel), running
                  view and progress routing, notices
  review.ts       open by id / entry, reviews list pick, choose answer handling, reopen
  reminder.ts     the eol decoration on a paused unit
  progress.ts     the "conjuring" progress claim (hook chosen at plan time, §3.6)
src/plans/
  facts.ts        pure: apply choose `facts` to a plan document's text (M6 reuses it)
  isPlan.ts       durandal.isPlan rule and context key
webview/
  tsconfig.json   DOM lib, module esnext, strict; includes webview/ and src/pause/viewModel.ts
  main.ts         the page script: receives View / running / notice / help, renders, sends
                  ready / size / key / press / select
  render.ts       pure html(view) → string; used by main.ts and by a unit test
  pause.css       grid layout; colours from --vscode-* variables
test/fixtures/paused/   the four durandal.nvim fixtures (bare paused objects)
test/fixtures/review/   do.json, errand.json, reconcile.json (from review_spec.lua builders)
```

Shared types: `View { title: Span[]; short: Span[]; lines: Line[]; entries: Entry[]; selected:
number; rows: Row[]; reason?: Span[]; diff: { title: Span[]; lines: Line[] }; legend: string;
state: 'paused' | 'proposal' | 'running' | 'review' | 'busy'; help?: Line[]; narrow: boolean }`,
`Line = Span[]`, `Span { text: string; kind?: 'strong' | 'dim' | 'red' | 'green' | 'check' |
'place' | 'key' | 'running' | 'title' }`, `Entry { n?: number; glyph?: string; label: string;
body: string; tag?: Span; selected: boolean }`, `Row { key?: string; label: string; detail:
string; pressable: boolean }`. Span kinds are a closed list; the page maps kinds to classes.
Words and glyphs carry the meaning; colour never does alone (nvim's rule).

Changes outside `src/pause/`: `src/tdd/conjure.ts` keeps `run()` / `ask()` / `land()`;
`paused()` and `landing.ts`'s `pausedNotice` go, `ask()` hands a paused answer to the controller
and resumes go back through `ask()` so a landing reuses `land()`. `src/server.ts` gains
`ClientHooks.reviewReady` (next to `suggestion`) and whatever the progress hook of §3.6 needs.
`src/commandTable.ts`: `durandal.plan.review` moves from `NOT_YET` to `BUILT`;
`SERVER_NAMED_INFO.planReview` becomes built (the lens command `olifant.plans.review` registered
with its real handler). `extension.ts` constructs the store, panel, controller and review
pieces and exposes `Api.pause`. `package.json`: `durandal.pauseOpen` and `durandal.isPlan` are
set by the extension; a second esbuild call (`webview/main.ts` → `dist/webview.js`, `--platform
browser --format iife`, with `webview/pause.css` copied to `dist/`); `.vscodeignore` whitelists
`dist/webview.js` and `dist/pause.css`. No runtime dependency is added.

`Api.pause` (the e2e seam, beside `tdd`): `view(): View | undefined`, `source(): 'conjure' |
'do' | 'reconcile' | 'errand' | undefined`, `press(key: string): Promise<void>` (as if the webview
had sent `{type:'key'}`), `open(uri, id, entry?)` (a review), `stored(uri): boolean` (a pause is
held for that document), `reminders(uri): number` (decorations placed).

## 3. Conjure pause lifecycle

### 3.1 Store

`PauseStore` keeps at most one pause per document URI: `{ token, position, lines, paused,
selected?, version }`. `position` is the original request's 0-based position (a resume re-sends
it, never the current cursor). `lines` arrive 1-based inclusive from the server; `last` is clamped
to the document's line count, then both become a 0-based range once. `version` is the document
version when the pause was shown (nvim's `changedtick`). `selected` is the entry index, kept
across window close, reset when a new pause replaces this one.

### 3.2 Showing a pause

`Conjure.ask()` → answer has an object `paused` → `controller.showPaused(params, paused)`:

1. store it (replacing any pause of the same document);
2. place the reminder (§3.3);
3. `ui.info('conjure paused · <why>')`;
4. open or re-render the panel with the conjure source. Selection: a stored `selected` if the
   pause is re-shown; else nvim's default — the first `proposal` / `refused` entry, else the last
   round, else the first entry. If the panel already shows this document's pause (a run's next
   pause), the view is replaced in place and the page flashes the newly selected entry.

### 3.3 Reminder

One `after` end-of-line decoration on the unit's last line: `conjure paused · <chord> C reopens`
(`chord` = the platform label, as the lens label is built in `settings.ts`), colour
`editorCodeLens.foreground`, as the ⚡ hints. Cleared when the pause drops. No keys are bound in
the editor for it.

### 3.4 Dropping

`store.drop(uri, why?)` closes the panel if it shows that pause, clears the reminder, and says why
when nvim does:

1. `workspace.onDidChangeTextDocument` for the unit's document while a pause is stored →
   `conjure: the file changed, the pause is gone`. During a run nothing is stored, so an edit
   then is not watched (nvim likewise); the next pause captures the new version and the server
   refuses a stale resume on its own.
2. The document closes → silent.
3. A resume is sent → the pause is removed **before** the request goes out, so a token is never
   sent twice. Cancel, error and landing do not restore it.
4. `durandal.conjure` with no selection and the cursor inside the stored lines → reopen the panel,
   no request. Any other conjure on a document holding a pause → drop with `the earlier pause is
   forgotten`, then the fresh request.
5. A new pause for the same document replaces the stored one.
6. `hooks.stopped` (server stop / restart / crash) → drop all, silently.

### 3.5 Resume

A pressable row, by key or click, with the view in `paused` or `proposal` state:

- `h` first asks the sentence: `ui.text({ prompt: 'hint', placeholder: 'goes to the model with
  the next round' })`; empty or escaped sends nothing.
- `resume.ts` builds `{ textDocument, position: stored position, resume: { token, choice, arg?,
  land?, hint? } }` exactly as nvim: `arg` present only when the row's `arg` is non-null; `land`
  only for `choice === 'stop'` (`true` for keep rows, `false` for the stop row); `hint` only when
  typed.
- The store drops the pause (rule 3), the view switches to the **running** state: label = the
  row's label (or choice), elapsed seconds from the extension's one-second timer, `round` =
  last round + 1 for continue / climb / wire / accept (else none), the accepted proposal shown as
  a ✓ step while its round runs; legend `x cancel · q hide (it goes on) · ? help`; row keys,
  `[ ]` and digits answer `a run is going on · x cancels it`.
- The request goes through `Conjure.ask()` with a flight (`flights.start('conjure')`); `x` cancels
  that flight (`$/cancelRequest`). M4's Notification progress with Cancel is **not** shown for a
  resume; the panel is the progress. (The opening conjure keeps M4's notification.)
- Answers: `paused` → §3.2 step 4 in place; landed → panel closes, `Conjure.land()` as today
  (edits through `applyServerEdit`, flash, test marks, notice) with the wording ported from
  nvim: `stopped` without edits → `stopped · nothing landed`; `stopped` with edits → `<summary> ·
  <saved words> · undo reverts it`; else `conjured · <summary>[ · N rounds · rungA → rungB][ ·
  <saved words>]`, level warning when `green` is false. LSP error → panel closes,
  `ui.error(message)`. Cancel (`-32800`) → panel closes, `ui.info('conjure cancelled · nothing
  landed')`. None of these restores the pause.
- Server not running at press time → footer notice with `NOT_RUNNING`; pause and panel stay (the
  check precedes the drop).

### 3.6 Progress claim

While a resume is in flight the controller claims the next `$/progress` `begin` whose `title` is
`conjuring` and routes its `report` messages to the running view: `^round (\d+)` updates the
round; a leading `round N of M · ` and the row label are stripped for display; `end` releases the
claim. Unclaimed progress stays where the library puts it (the status bar). The opening conjure
never claims.

**Plan-time check on the hook.** vscode-languageclient's progress feature answers the server's
`window/workDoneProgress/create` and renders `$/progress` itself; `LanguageClient.onProgress(
WorkDoneProgress.type, token, handler)` needs the token. The plan tries, in order: (a) a
`middleware.window` hook if the installed library version exposes one for progress creation;
(b) registering our own `window/workDoneProgress/create` handler that records the token and
delegates to the library's part; (c) the fallback — the running view shows label and elapsed
seconds only, and the library's status bar keeps the server's words. The spec commits to the
behaviour and the fallback, not the hook. The fake server sends `$/progress` for a `hold` reply
without a `create` request; if the chosen hook needs the request, the fake gains it.

### 3.7 Panel hidden while running

The user closes the tab mid-run: the run goes on, nothing else is shown; the next pause reopens
the panel; a landing lands as usual (§3.5). Two conjures may be in flight (flights allow it): the
claim is first-come, the panel shows whichever paused last, the store holds one pause per
document.

## 4. The webview

### 4.1 Panel

One `WebviewPanel`, `viewType 'durandal.pause'`, created on first show in `ViewColumn.Beside`
with focus, then `reveal`ed in its own column. Title follows the view: `conjure · <unit>`, `do ·
step N · <unit>`, `reconcile · N to review`, `do · past`. Options: `enableScripts`,
`localResourceRoots: [dist]`, `retainContextWhenHidden: false` (the extension holds the model and
re-sends it when the panel becomes visible). CSP: `default-src 'none'; script-src 'nonce-…';
style-src ${cspSource}; font-src ${cspSource}` — no inline styles (colours come from the
`--vscode-*` variables VS Code injects). Disposing the tab is `q`: the source stays (pause in the
store, review on the server). `durandal.pauseOpen` is true while the panel exists and is visible.

### 4.2 Message protocol

Extension → page:

- `{ type: 'view', view: View, flash?: 'row' | 'entry' }` — the whole model each time. The page
  re-renders each pane whose content changed and keeps the diff pane's scroll position when the
  diff text is unchanged.
- `{ type: 'running', label, message, seconds, round? }` — the running status line; the spinner is
  a CSS animation in the page.
- `{ type: 'notice', text }` — a footer notice for 1.5 s (`<key>: <why>`), then the legend returns.
- `{ type: 'help', on: boolean }` — the diff pane shows the key table (`view.help`) or the diff.

Page → extension:

- `{ type: 'ready' }` on load; `{ type: 'size', cols: number }` on load and resize (the panel's
  width in character cells of the monospace font: the one piece of geometry that crosses the
  boundary; the extension sets `view.narrow = cols < 110` and the narrow texts).
- `{ type: 'key', key }` — a normalised name: letters as typed (`a`, `C`), `[`, `]`, `0`–`9`,
  `Tab`, `Escape`, `?`, `j`, `k`, `PageUp`, `PageDown`. The page decides nothing about keys; it
  swallows the default action of the ones it reports.
- `{ type: 'press', row: number }` — a row clicked; `{ type: 'select', entry: number }` — an entry
  clicked.

### 4.3 Layout

CSS grid, no measuring in JS. Left column: the situation pane (title line, outcome, diagnosis,
the rounds / entries list with paging lines, the tests block or the check block), then the offers
pane (rows as `<button>`s: a `<kbd>` badge for the key, the label, the dim detail; `disabled`
when not pressable; the `reason` line above the rows when a proposal is selected), then the footer
(legend or notice). Right column: the diff pane (title, monospace lines coloured by sign; `+++`
/ `---` file lines, `@@` hunks). Below 110 cells the grid stacks the diff under the left column
and `Tab` scrolls between them (the model's narrow texts: `the diff (Tab shows it)`, `… · Tab
back`, legend `Tab diff · …`). Entries and rows are clickable; `[` `]` and digits move the
selection; `j` `k` `PageUp` `PageDown` scroll the diff pane; `?` replaces the diff pane with the
key table, any key closes it. Fonts and colours from `--vscode-editor-font-family`,
`--vscode-foreground`, `--vscode-errorForeground` (red), `--vscode-testing-iconPassed` (green),
`--vscode-editorWarning-foreground` (check), `--vscode-textLink-foreground` (place),
`--vscode-descriptionForeground` (dim), `--vscode-textPreformat-foreground` (key),
`--vscode-list-activeSelectionBackground` (selected band), `--vscode-focusBorder`.

### 4.4 Keys

One table per source in `controller.ts`, each entry `{ keys, act, why }`, ported from nvim's
`M.keys` / `not_offered`:

- conjure: `c h C w W t T p P s a r [ ] 0-9 Tab d x q Escape ? j k PageUp PageDown`;
- do: `a r o t p [ ] Tab d q Escape ?` + scroll; errand: `o [ ] Tab d q Escape ?` + scroll;
- reconcile: `a r 1-9 n i [ ] Tab d q Escape ?` + scroll.

The same table yields the help text and the legend, and the e2e "every shown key does something
or says why" walks it. Row keys for the conjure source are assigned by `choice` in server order
(`continue` → `h` when `hint` else `c`; `climb` → `C`; `wire` → `w`, `W`; `reconjure` → `t`, `T`;
`port` → `p`, `P`; a third of any gets no key; `stop` with `land: true` is not a row but feeds
the synthesized `a` row; other `stop` → `s`; `accept` → `a`; `reject` → `r`; `proposal` skipped;
unknown → unpressable row). The `a` row follows the selection: `refused` → `accept it anyway`;
a `wire` entry → `keep nothing but the wire` (`stop`, `land: true`, `arg: '0'`); a round with a
non-null `diff` → `keep round N` (`arg: String(n)`); otherwise no `a` row. Review rows carry the
server's `key`; do keys are the fixed set, reading keys are matched from `offer.key` (digits
`1`–`9` carry the offer's `step`, not the digit).

## 5. Review sources

### 5.1 Entry points

All end in `review.open(planUri, id, entry?)` → `olifant/plans/review { textDocument, id }` → the
panel with the source chosen by `result.kind` (`do`, `errand`, `reconcile`):

1. **Push `olifant/plans/review/ready`** `{ id, kind, textDocument }` via `ClientHooks.reviewReady`.
   Only dos send it, before the do's own answer (M6 handles that answer). The panel opens
   without opening the plan document.
2. **Lens command `olifant.plans.review`**, args `[id, planUri]` or `['reconcile', planUri,
   entryKey]`.
3. **`durandal.plan.review`** (chord `p r`, `when: durandal.isPlan`): `olifant/plans/reviews` for
   the active plan, then nvim's pick: the review whose `row` is the cursor line; else an entry
   whose `row` is the cursor line (opened with that reading selected); else the first; none →
   `plans: nothing to review`.

`durandal.isPlan` (`src/plans/isPlan.ts`): the active document is markdown (`.md` or languageId
`markdown`) under `<project root>/plans/` of an olifant project (`projects.ts` root). Updated on
active-editor change, like `durandal.inProject`.

Not in M5: errand entry points, forced-reconcile auto-open (§1).

### 5.2 View models

`reviewModel.ts` ports review.lua. Do / errand: title `do · step N · <unit> · <badge> · <model> ·
<N> s · $<cost>` (short form drops the model, bare form drops seconds and cost; badge kind
`proposal` when it contains `answered`, else `red`); summary (strong); labelled paragraphs `step`,
`said` (one per item; `nothing in its grammar` when empty), `tests` (`● N passed` / `✗ a, b · N
passed` / `none ran (t runs the step's tests)`), `denied` (first item red; heredocs collapsed by
`one_command`); each paragraph capped at 3 lines then `… N more lines (d details)`; the files list
`M|A|D path` with the selected band (`no file changed` when none); diff = the selected file's diff
with title `file i of n · <path>` (`no change` / `the do changed no file`). Reconcile: title
`reconcile · N to review` (N = `entries.length`), summary, the readings list by `entry.summary`,
diff = the selected entry's `landing.diff` (`no change to the plan`), rows = the selected entry's
offers. Rows are `{ key, label, detail, choice, entry?, step? }`.

### 5.3 Choose

A pressable row → view state `busy` with the footer `keeping…` / `reverting…` / `running the
step's tests…` / `allowing…` / `…`; a second press answers `the last answer is still on its way`.
Request `olifant/plans/review/choose { textDocument, id, choice, entry?, step? }`. Answer:

- `edit` → `applyServerEdit` (M1's versioned path, one undo step); `facts` → `facts.ts` on the
  plan document (`{row, text}` replaces a line, `{after, lines}` inserts, `{from, to, lines}`
  replaces a range), applied as one edit; `files` → nothing to do (VS Code reloads unmodified
  files from disk; a modified one gets the standard conflict).
- `done` → panel closes, `ui.info('do: <said>')` or `ui.info('reconcile: <said>')`.
- else `review` → the view is replaced in place, footer `<key>: <said>`.
- `RequestFailed` → footer `<key>: <message>` if the panel still shows that review, else
  `ui.error(message)`. The plan document having unsaved edits makes `applyServerEdit` refuse the
  edit whole and say so; the review stays open.
- Reopen (`o`): first `ui.text({ prompt: 'more' })` (empty / escaped sends nothing); a live do →
  choose `reopen`, then on `reopen: { id }` in the answer send `olifant/plans/do { textDocument,
  row, resume: id, text }` and show the answer's summary as one info line; an errand → the do
  request directly. The do's full handling (ghosts, `fire_landed`) is M6; the new review arrives
  through `review/ready` again.

The server refreshes lenses itself after a choose.

### 5.4 One panel, two sources

Opening a review while a pause is shown swaps the panel's source; the pause stays stored and its
reminder stays; `durandal.conjure` inside the unit swaps back. Review selection lives in the
controller's view state and is lost on close (the server holds the review), as in nvim.

## 6. Details

`d` opens `durandal-doc:/details/<token | review id>.md` beside the panel (`ViewColumn.Beside`
from the panel, focused), language markdown, read-only; the panel stays open. `VirtualDocs.set`
replaces the text when the same source is shown again: one tab per source.

Conjure details (`details.ts`, from `details.build`), in nvim's section order, each a `##`:

- `## situation` — outcome; diagnosis (first sentence bold); `trigger: …`; for `failure.kind ===
  'check'`: `round N: <tool> refused it before the tests ran` and `- file:line  message` per
  problem; `hint:` from `steps` of kind `hint` (the server sends no top-level `hint`; nvim's line
  reads a field that never arrives).
- `## rounds` — `### round N · rung · verdict`; the attempt body fenced in the file's language
  (VS Code's language id for the file name; a plain fence when none); `decide: choice confidence`;
  `Jev: ask .68 · again .29` (probabilities sorted descending then by name, two decimals, leading
  zero dropped); `failed[].output` lines in a plain fence.
- `## tests` — `path::name · status`, the note, the source fenced.
- `## unit` — the header fenced, `ports: a, b`.
- `## steps` — `each in force from the next round on`; `✓ before round 1 | after round N · text`;
  `wired param: port · files`.
- `## diffs` — `### title` + a ```` ```diff ```` fence each: rounds first (the landing deduped onto
  the kept round: `round N · what keep round N lands`), then step files (`<step text> · <file>`),
  then wired files unless a wire step listed them, then `keep round N would land`.
- footer `token … · expires in N s`.

Paths are shortened relative to the project root, bare names for files beside the unit. Review
details: the server's `details[]` → `## title` + text, `lang: 'diff'` fenced as diff, others as
prose. Navigation is the markdown outline, breadcrumbs and sticky scroll; closing the tab is `q`.

## 7. Protocol, errors, edge cases

`protocol.ts` tightening (header rule: the consuming milestone types it):

- `ConjurePaused.paused`: the full shape — `token, file, lines, round, rung, summary, why, title,
  diagnosis: string[], trigger, rounds[], tests[], unit, landing, wired[], offers[], expires,
  outcome, steps[], failure, checker, snippet?, proposal?`, nullable fields typed `T | null`. One
  `given()` helper makes `null` and missing the same everywhere in the models. `ConjureResume.
  choice` is the union `continue | climb | stop | reconjure | accept | reject | wire | port`,
  `arg?: string`. `ConjureLanded.stopped` required.
- Reviews: `ReviewsResult`, `ReviewListItem`, `DoReview` (`kind: 'do' | 'errand'`),
  `ReconcileReview`, `ReviewOffer`, `ReadingEntry`, `ChooseResult { done, said, edit?, facts?,
  files?, review?, reopen? }`, `Fact` union, `DetailsSection`, `ReviewReady`; `plansReviewReady`
  gets its handler. `plansDo` params gain `resume?`, `text?` if not typed (plan-time check).

M4 removals: `Conjure.paused()`, `pausedNotice`, the two paused tests in `fake.11` (replaced in
`fake.12`), the README and CHANGELOG lines about Continue / Stop. M4's `diagnosis` string-vs-array
mismatch disappears with the type.

Edge cases, each with a test:

- Thin pause (`{ token, lines, offers: [] }`): title `conjure · ● paused`, diff `nothing to show
  yet`, no rows, no error.
- Offers: a third `wire` / `reconjure` / `port` → a row without a key, unpressable; unknown
  `choice` → the same; `proposal` offer skipped; `a` with no keep target → `nothing to keep on
  this entry`.
- `rounds[].diff === ''` (not null) still yields `a keeps this`; the pane says `(none: the body is
  your text)`.
- More than nine entries: paging `… N earlier ([ pages)` / `… N later (] pages)`; digits jump by
  `round.round`, so later rounds page only.
- Resume refused by the server (gone, file changed, no body to keep, …) → panel closes,
  `ui.error(sentence)`, no pause (as nvim; the server keeps the token only after `reject` or a
  refusal, which the user reaches by conjuring again — accepted loss).
- Server not running at press time → footer notice; pause and panel stay.
- `review/ready` for a plan that is not open → the panel opens; the plan opens when the user
  follows a lens.
- A review choose answer with both `edit` and `review`: apply, then replace the view.

## 8. Testing

Fixtures: `test/fixtures/paused/{plain,wired,steps,check}.json` vendored from durandal.nvim
(bare paused objects; the e2e wraps them as `{ paused }`); `test/fixtures/review/{do,errand,
reconcile}.json` written from `review_spec.lua`'s builders (the server's shape is confirmed in the
fact sheet); `proposed`, `refused` and check-wall variants built in code from the plain fixture,
as the Lua spec does.

Unit (node:test, no VS Code), ported assertion for assertion where the data is the same:

- `model.test.ts` ← pause_spec §10.1–10.6 and the key-assignment, no-wire, steps-as-entries, check
  section, `p` row, paging and thin-answer groups: exact titles and short titles, line texts, row
  keys / labels / details and their column layout, diff titles and first lines, legend variants,
  narrow variants, help lines; span kinds on exact substrings (the colour-as-data tests) instead
  of highlight groups; widths in display cells (a `width()` helper for CJK and emoji, as nvim's
  `strwidth`).
- `reviewModel.test.ts` ← review_spec's drawing tests (do title, paragraphs, files, diff, denied
  heredoc collapse, 3-line caps, no-file case; reconcile title, rows, selected offers; errand badge
  and single offer) and `pickAtCursor`.
- `details.test.ts` ← details_spec: section order, check wall, place rows, dedup, path shortening,
  fence languages.
- `resume.test.ts`: the seven pinned resume shapes (no `arg` key when null, `land` only on stop,
  `hint`), answer classification, landing and stop wording.
- `render.test.ts`: `html(view)` has a `<button>` per row with its `<kbd>`, disabled when not
  pressable, the selected entry's class, escaped text (`<` in a diff line), help mode.
- `facts.test.ts`: the three fact shapes on a document text. `isPlan.test.ts`: the path rule.
- `manifest.test.ts` updated: `durandal.plan.review` in `BUILT`; `pauseOpen` and `isPlan` among the
  known `when` keys; `dist/webview.js` and `dist/pause.css` in `.vscodeignore`'s whitelist.

Contract e2e (fake-lsp), through `Api.pause`, with the fake's one-reply limit handled by
re-`reply()` inside the flow as `fake.11` does:

- `fake.12-pause.e2e.ts`: a paused reply opens the panel (`pauseOpen` true, `stored(uri)` true,
  one reminder); `press('a')` sends `{ token, choice: 'stop', land: true, arg: '2' }` and the
  landed reply applies its edit and closes the panel; `0` then `a` → `arg: '0'`; `s` → `land:
  false`; `t` → `reconjure` with the test id; `h` → `continue` with the FakeUi text; proposal `r`
  / `a`; `[` `]` and digits move `view().selected`; every key of the table does something or
  leaves a notice; `q` keeps the pause and a conjure inside the unit reopens it with no request;
  an edit drops pause, reminder and panel; a conjure elsewhere forgets it; a `hold` reply with
  progress words shows them in the running view (or, under fallback (c) of §3.6, the label and
  seconds), `x` sends `$/cancelRequest` and leaves `conjure cancelled · nothing landed` and no
  pause; an `lsp_error` reply closes the panel with the sentence; `d` opens a `durandal-doc`
  markdown tab whose first heading is `## situation`.
- `fake.13-review.e2e.ts`: a `plans/do` reply with `notify: review/ready` opens the do source;
  `a` sends `{ id, choice: 'keep' }`, applies `edit`, closes, `do: kept`; `t` with `facts` redraws
  and edits the plan; `p` / `r` why-not notices; an engine error lands in the footer; the lens
  command and the `p r` chord open by id (cursor-row pick); reconcile `]`, `a` with `{ entry,
  choice: 'apply' }`, a digit → `{ choice: 'place', step: 3 }`, the last answer closes with
  `reconcile: placed`; errand `o` → `plans/do { resume, text }`; `isPlan` true for `plans/x.md` in
  project `one`, false in `plain/`.

Real e2e: none added. A paused conjure needs a `[decide]` model (local-only `DURANDAL_E2E_MODEL`,
as M4's conjure) and a do review needs `claude -p`; `real.8` keeps its pending conjure case.

Manual checklist (the PR carries it): light and dark themes; narrow stacking and `Tab`; focus on
open; click and key parity; the details document's highlighting; the running view's words with
the real server; the reminder's look beside ⚡ hints.

## 9. Umbrella deviations, handoffs, follow-ups

Deviations to flag in the PR: the umbrella's "pause/review window and nothing else" shrinks
further — details became a markdown document, so the webview holds only the situation / offers /
diff panes; `durandal.isPlan` moves from M6 to M5; `durandal.pauseOpen` is informational (no
keybinding uses it yet).

Handoffs to M6: `src/plans/facts.ts` and `isPlan.ts`; `ClientHooks.reviewReady`; `review.open(uri,
id, entry?)` as the API for the errand entry points and forced-reconcile auto-open; the do answer
after a reopen (M5 shows one info line).

Olifant notes, the user's call to file: the resume error text omits `port`; the paused JSON has no
top-level `hint` (nvim's details line is dead); the fake-lsp sends `$/progress` without
`window/workDoneProgress/create` (extend it if the §3.6 hook needs the request).

Open at plan time: the §3.6 progress hook (a, b or fallback c); whether `plansDo` params are
already typed with `resume` / `text`; the page's cell-width measurement (a hidden `<span>` of
known length, or `ch` units).
