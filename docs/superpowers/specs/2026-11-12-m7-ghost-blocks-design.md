# durandal-vscode M7: ghost blocks

Date: 2026-11-12. Status: approved in conversation, section by section. Umbrella:
`2026-11-06-durandal-vscode-design.md` §6 row 7 ("accept/reject blocks under plan rows";
decision it owns: "real text with diff decorations and Accept/Discard CodeLens (inline-chat
idiom) vs CodeLens only"). Also closes M3's deferral (`2026-11-07-m3-ghost-text-snippets-design.md`
§0.2, §1, §3.4: "inline rendering of ghost lines → M7") and M6's stopgap
(`2026-11-09-m6-plans-design.md` §0.3, §4.3, §9). Input:
`~/projects/notes/vscode-port/m7/ghost-blocks-surface.md` (olifant's block protocol and sync at
the pin, nvim `ghosts.lua` beyond the seam list, the VS Code API facts, the drift past the pin)
and `~/projects/notes/vscode-port/m7/suggestion-seams.md` (nvim `suggest.lua`, the port's M3
suggestion path, olifant's ghost classification). Paths below: vsc = durandal-vscode at
`cdc269e`, nvim = durandal.nvim/lua/durandal at `101bec0`, olf = olifant/src/Olifant at
`48f38ab` (the pin, unchanged).

The user of the extension sees what durandal.nvim draws as virtual lines: an engine answer to a
plan row (a validate, an ask held for review, a do in a project without git) waits under that
row as ghost lines until a chord accepts or rejects it, and a pushed suggestion that is one
small block at the cursor shows its lines under the line before Tab plans it with the model.
Nothing of either reaches the document, the server or the disk until it is accepted.

## 0. Decisions

User rulings (2026-11-11/12):

1. **Both kinds in M7.** Plan ghost blocks (the umbrella's row) and the suggestion ghost kind's
   lines (M3's deferral) ship together, one renderer.
2. **Approach D: inline completions are the renderer.** VS Code has no virtual lines. Real text
   with decorations (umbrella option A) is out on the facts: `olifant lsp` syncs incrementally
   and reads the editor's unsaved text for everything (idle triage with Jev calls, paid checks
   on save, errand prompts, journal placement), a save or autosave would write the proposal to a
   tracked plan file, and hiding text through `didChange` middleware would desync an incremental
   server (surface §1.4, §4.1). Comment threads (option C, inline widget, no text) and CodeLens
   + hover (option B) were weighed and set aside: C looks like a review comment and its range
   tracking and keyboard targeting are unverified; B shows no lines inline. D renders the
   proposal as native ghost text through the inline-completion middleware M3b already owns: no
   document text, no server or disk effect, no new UI surface. Its gap: plan ghost lines are
   visible one row at a time (the cursor's row); the always-on marker and its hover cover the
   rest (§3.2).
3. **Keys per kind, as nvim.** Plan blocks: `p y` / `p n` at the cursor row. Suggestion ghosts:
   Tab / Esc. A native Tab commit of a plan ghost item also accepts (it inserts exactly the
   accepted text).
4. **Command ids stay as shipped** (`durandal.<verb>` flat ids, `durandal.plan.*`): M8 amends
   umbrella §4 instead of renaming before `v0.1.0`.
5. **Chord prefix is `ctrl+alt+d` on macOS too** (`cdc269e`, 2026-11-12): `cmd+alt+d` is the
   Dock-hide shortcut and never reaches VS Code. Umbrella §4 and the M6 spec were amended.

Decided by default (may be revisited at plan review):

6. All blocks at a row are decided together: `p y` accepts them in answer order as one edit,
   `p n` rejects them all (nvim `ghosts.at` picks one block of the row, in table order).
7. The inline item's text is the row's lines after accepting (M6 `landing` applied to that row
   alone); VS Code decides whether the difference renders (insert-only differences do; a
   `replace` that is not an extension of the row renders nothing and the marker + hover remain).
8. A suggestion ghost whose block goes above the cursor line (server `line == at`) keeps M3's
   band only: ghost text cannot be drawn before the cursor.
9. A hover-toolbar or word-wise (⌘→) accept of a suggestion ghost item inserts the unfilled
   template verbatim as a plain edit; no fill runs (the server would answer ContentModified
   once the version moved). The item's `command` logs it and clears the band.
10. After a native Esc on a plan ghost item, the ghost is not re-triggered until the cursor
    leaves the row and returns.
11. One branch, one PR; olifant pin unchanged; `~/projects/olifant-48f38ab` kept for real e2e.

## 1. Scope and non-goals

In scope: the plan ghost store and its decisions (`p y` / `p n`, native commit); the marker
and hover on ghost rows; the inline item for both kinds; the suggestion band's ghost lines;
the `ghostInline` context key and its Tab / Esc bindings; deletion of M6's prompt; the fake-lsp
suite for every flow; the manual checklist for the rendering.

Not in scope: all ghosts visible at once (follow-up if missed in use; option C is the
candidate); ghost lines above the cursor line for suggestions (§0.8); partial accept of a
block; rendering when `editor.inlineSuggest.enabled` is off (marker, hover and chords still
work); olifant changes (the drift past the pin touches nothing here, surface §5); M8's README
beyond the sections M7 adds.

Success: nvim's `ghosts.lua` behaviour ported (stamp, replace, outcome per block, landed on
accept, nothing on reject, dropped on stop/close), the M3 ghost kind's lines drawn under the
line with Tab still planning through the review, every flow in the fake-lsp suite, the manual
checklist walked, `prompt.ts` gone.

## 2. Components and files

New, under `src/plans/`:

- `ghosts.ts` (pure, no vscode import): the per-document ghost store. `Ghosts` holds, per uri,
  the answers' placed blocks `{id, index, row, replace, lines}` (lines already stamped by
  `placeBlocks`) with a generation. `add(uri, id, placed)`; `at(uri, row)`: the blocks at a
  row in answer order; `shift(uri, changes)`: rows through `shiftRows` (M6b, right-gravity);
  `accept(uri, row)` → `{lines, outcomes}` where lines are the row's result through `landing`
  (one edit) and outcomes one `accepted` per block; `reject(uri, row)` → `rejected` per block;
  `insertTextFor(uri, row, rowText)`: the row's lines after accepting, joined by `\n`;
  `markerText(n)` = `ai · +N lines` (N = the row's line count, "line" when 1); `drop(uri)`.
  Replaces `hold()` / `Wait` in `verbs.ts`.
- `ghostView.ts`: the marker decoration type (`after`, `editorGhostText.foreground`, margin
  `1.5em`, `hoverMessage` = the row's lines in a fenced block) set on every ghost row of the
  shown editors; the one-shot `editor.action.inlineSuggest.trigger` when the selection enters a
  ghost row (not after a native Esc on that row, §0.10); the accept flash (M6b `flash`).

New, under `src/suggest/`:

- `ghostItem.ts` (pure): `inlineItem(lineText, line, lines, command, args)` → `{range: the
  whole line, insertText: lineText + '\n' + lines.join('\n'), command}` as a
  `vscode.InlineCompletionItem` shape (built without the vscode import; `editor.ts` wraps it).
  Shared by both kinds.

Changed:

- `src/plans/verbs.ts`: `hold()` → `ghosts.add`; `writeBlocks` and `outcomes()` reused by the
  accept path; the `moved()` row tracking moves into `ghosts.shift`; `api().waiting` →
  `api().planView.ghosts(uri)` (rows, lines, marker texts).
- `src/plans/prompt.ts`: deleted; `words.ts` loses `promptWord`.
- `src/commandTable.ts` / `commands.ts`: `durandal.plan.accept` / `.reject` leave `NOT_YET`
  (now empty: `notYet` and `registerNotYet` go); two unlisted commands registered in code only
  (no `contributes.commands` entry): `durandal.plan.ghostAccepted {uri, row, gen}` and
  `durandal.suggest.ghostInserted {uri, key}`.
- `src/suggest/recognition.ts`: `ghostOf` keeps `below: boolean` (server `line === at + 1`);
  `types.ts` `Offer`/`Shown` gain it; `keyOf` ignores it.
- `src/suggest/gate.ts` / `inline.ts`: `nonInline(uri, line)` becomes `ghostAt(uri, line)`: for
  a shown ghost-kind band with `below`, the inline item; for follow-up / recognition, `[]` as
  today; for a snippet, the server path as today.
- `src/suggest/editor.ts`: sets `durandal.ghostInline` while the served item is ours (cleared
  with the band); `accept.ts` and the dismiss command run `editor.action.inlineSuggest.hide`
  first when `ghostInline` is set.
- `src/server.ts` `provideInlineCompletionItems`: plan ghost at the cursor row (via the
  plan view) first, then the suggest gate, then the server, each returning items or yielding.
- `package.json`: titles "Plan: Accept ghost" / "Plan: Reject ghost"; the two sibling Tab / Esc
  bindings (§4); `test/unit/manifest.test.ts` pins updated.

## 3. Plan ghost blocks

### 3.1 Store

An answer's blocks (`placeBlocks`, M6b) go into `Ghosts` instead of `hold()`; the pending `⋯`
marker is removed as today. Several answers may be pending; a second answer on a row with a
ghost appends its blocks after the existing ones. Rows follow document edits through `shift`
(right-gravity: an insert at the row's line keeps the ghost on the row the text moved to); a
row the user deletes takes its blocks with it, dropped without outcome (nvim's extmark dies the
same way). Server stop or restart (gen change) and document close drop the document's ghosts
without outcome (M6 rule). A full-content change (reload from disk) goes through `shift` like
any change; no special case. Nothing persists across sessions.

### 3.2 View

Every ghost row carries the marker `ai · +N lines` at end of line (`editorGhostText.foreground`)
whose hover shows the row's proposal lines in a fenced block, so every pending ghost can be
read without moving the cursor (nvim's `ai` sign and its virtual lines). The `⋯ asking |
validating | doing` marker of a running request is unchanged.

At the cursor row the inline-completion middleware returns the row's item (§2 `inlineItem`
with `insertTextFor`) and does not ask the server. VS Code renders the insert-only difference
as ghost lines under the row at any cursor column; a do's re-spelled step line (the only
`replace`, an extension of the row) renders as the appended anchor plus the lines; a
`replace` that is not an extension renders nothing (§0.7). Entering a ghost row runs
`editor.action.inlineSuggest.trigger` once; typing on the row re-requests as usual and the
item is recomputed from the row's current text. After a native Esc the row is not re-triggered
until the cursor leaves and returns (§0.10). With `editor.inlineSuggest.enabled` off nothing is
drawn inline; marker, hover and chords work.

### 3.3 Decisions

`p y` (`durandal.plan.accept`) at the cursor row: `ghosts.accept` → one `applyEdit` through
`writeBlocks` (one undo step; the stale-version refusal as M6), flash, `outcomes()` one
`accepted` per block of the row, `landed.fire('accept')` (reconcile listens). `p n`
(`durandal.plan.reject`): `rejected` per block, no landed, no text. A row with no ghost (a
pending `⋯` row too) → nvim's warning "no ghost here". Blocks with no lines write nothing and
still get their outcome (M6 `writeBlocks` rule).

A native Tab commit of the item inserts the same text through VS Code's own edit (one undo
step) and then runs `durandal.plan.ghostAccepted {uri, row, gen}`: with the current gen it
drops the row's blocks, sends the outcomes and fires landed; with a stale gen (already decided,
server restarted) it does nothing. A word-wise partial accept (⌘→) is plain typing: the ghost
stays attached to its row and re-renders under it. Undo of an accept removes the text; the
ghost does not return.

## 4. Suggestion ghost lines

The M3 band stays: `⚡ Tab: <name> (+N lines)` at end of the cursor line, Esc memory, Tab →
`Accept.run` → review → `plan{fill:true}` → land, clearing on cursor off the line, line text
change, an edit elsewhere after the debounce, server stop, `durandal.ghosts` off. M7 adds the
drawing for the ghost kind with `below`: the middleware returns `inlineItem(lineText, line,
lines, 'durandal.suggest.ghostInserted', {uri, key})`, so the unfilled template shows as ghost
lines under the line. `above` keeps the band only (§0.8). Follow-up and recognition bands still
make the middleware yield `[]`; the M3 rule "the decoration never overlaps an inline ghost"
becomes "a ghost-kind band is served as the inline ghost".

Keys: while the served item is ours, `durandal.ghostInline` is true and two sibling bindings
apply — Tab → `durandal.suggest.accept` and Esc → `durandal.suggest.dismiss`, both `when
inlineSuggestionVisible && durandal.ghostVisible && durandal.ghostInline && editorTextFocus &&
!suggestWidgetVisible && !inSnippetMode` (Esc also the M3 Esc exclusions). Both hide the inline
suggestion first, then run the M3 path (accept: review and fill; dismiss: memory, feedback
none for a ghost, clear). The umbrella's "Tab only under `!inlineSuggestionVisible`" guarded
other providers; `ghostInline` is only true for ours, so the rule is amended, not broken. A
hover-toolbar or ⌘→ accept inserts the template verbatim (§0.9): `ghostInserted` logs
`ghost-inserted` and clears the band; no fill, no error.

`durandal.ghosts` off still turns off every suggestion kind; plan ghost blocks are independent
of it (nvim's `ghosts.lua` is independent of `opts.ghosts`).

## 5. Protocol, errors, edge cases

- Wire unchanged: blocks `{after, after_text, lines:[{text, fp}]}` from `plans/ask`,
  `/validate`, `/do`; `olifant/plans/outcome {textDocument, id, block, outcome}` one per block;
  the do re-spell rule (`replaces`, M6b) kept. Nothing server-side depends on an outcome of an
  errand block (surface §1.3), so an undecided ghost costs and loses nothing.
- `plan{fill:true}` is only sent from the review's Apply (M3 §5) and only while the band is
  current; after a verbatim insert the band is gone, so ContentModified cannot arise from M7.
- Native commit vs chord race: the item's `gen` settles it (§3.3).
- The inline item is refused by VS Code when the row's text diverged from the item (it is
  recomputed on each request, so only within one request); the marker and hover remain.
- Multiple cursors: the primary selection's row.
- Log events: `ghost-shown` / `ghost-accepted` / `ghost-rejected` for plan blocks (with the
  verb and block count), `ghost-inserted` for the verbatim suggestion insert; M3's `ghost-*`
  events unchanged.

## 6. Umbrella deviations and follow-ups

- §6 row 7's decision is answered "neither": inline completions, not real text and not
  CodeLens (§0.2).
- §4 Tab rule amended for `ghostInline` (§4); §4 chord prefix amended (`cdc269e`); §4 command
  ids to be amended in M8 (§0.4).
- nvim deviations to list in the PR: all blocks at a row decided together (§0.6); ghost lines
  visible one row at a time (hover covers the rest); Tab also accepts a plan ghost; suggestion
  ghosts above the cursor line keep the band only.
- Follow-up candidates (not filed): all ghosts visible at once via comment threads; a ghost-kind
  real e2e if the python chain never classifies one.

## 7. Testing

Unit (node:test, pure): `ghosts.ts` (add, at with several blocks on a row and answer order,
shift through inserts/deletes above and at the row, accept lines for insert and for the do
re-spell, outcomes, reject, drop on gen change), `inlineItem`, `markerText`, `ghostOf` with
`below` and `keyOf` ignoring it, manifest pins for the two new bindings and the changed
titles, `commandTable` without `NOT_YET`.

Fake-lsp e2e: `fake.15-verbs` rewritten from Accept all / Reject all to the row: validate held
under the moved request row → `api().planView.ghosts(uri)` lists it with its marker text; the
middleware serves the item (`api().suggest.inline(uri)` → range = the row, insertText = row +
lines); `p y` → text landed, one undo step, outcome `accepted` per block, `landed` accept
fired; `p n` → outcomes `rejected`, no text; two blocks on one row from one validate; the do
re-spell block; empty-lines block → outcome without text; server stop drops without outcome;
native commit via `editor.action.inlineSuggest.trigger` + `commit` → `ghostAccepted`
(skipped with a note if the test host does not render inline suggestions, plan-time check 5).
`fake.10-suggestions`: the ghost case asserts the served item and the `ghostInline` Tab path
(hide, review, fill request `{planId, fill:true}`); an `above` case asserts band only and no
item; a verbatim insert case (`commit` directly) asserts the text, `ghost-inserted`, band
cleared, no fill request.

Real e2e: blocks need a model, so none (as M6); `real.7` gains a ghost-kind case only if the
python chain classifies one (plan-time check), else the manual checklist covers it.

Manual checklist (rendering cannot be read by tests): ghost lines under a plan row with the
cursor mid-line; hover on a marker of another row; Esc, leave, return; a validate with two
rows; `p y` flash and reconcile; suggestion ghost lines below the line, Tab plans and lands,
Esc dismisses and does not return on the same line text; the hover-toolbar accept.

## 8. Plan-time checks

Before the plan commits to the shape, verify in the 1.145 host (notes under
`~/projects/notes/vscode-port/m7/`):

1. Ghost text renders for `range` = the whole line and `insertText` = line + `\n` + lines with
   the cursor mid-line (insert-only diff), and for the do re-spell extension.
2. `editor.action.inlineSuggest.trigger` shows a provider item with no typing; whether cursor
   moves within the row hide it (then re-trigger per move while on the row, still once per
   entry after an Esc).
3. An extension Tab binding with `inlineSuggestionVisible && durandal.ghostInline` outranks
   the default `editor.action.inlineSuggest.commit`.
4. The item `command` fires on a full commit only, not on ⌘→.
5. The e2e host can drive `trigger` / `commit` and `api().suggest.inline` sees the served item.

If 1 or 2 fails, the fallback for plan blocks is the marker + hover + chords (no inline lines)
and the PR says so; the suggestion side then keeps the band only.

## 9. Handoffs

To M8 (release): README ghost sections (plan ghosts and their chords, suggestion ghost lines,
the toolbar-accept note, `editor.inlineSuggest.enabled`), CHANGELOG from the PR, the §4
command-id amendment (§0.4), the manual checklist results.
