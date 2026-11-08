# durandal-vscode M3: ghost text and snippets

Date: 2026-11-07. Status: approved in conversation, section by section. Umbrella:
`2026-11-06-durandal-vscode-design.md` §6 row 3. Inputs: `~/projects/notes/vscode-port/m3/`
`ghost-snippet-surface.md` (facts with pointers into durandal.nvim, olifant and M2) and
`brainstorm-brief.md` (questions, approaches, defaults), `design-sections.md` (this spec's draft). Paths below: vsc = durandal-vscode at
`995af42`, nvim = durandal.nvim/lua/durandal, olf = olifant/src/Olifant, d.ts = `@types/vscode`
1.91 `index.d.ts`.

## 0. Decisions

User rulings (2026-11-07):

1. Model fill on accept: VS Code's native Tab inserts the unfilled body; the item's `command`
   resolves and, if the inserted text is untouched, replaces it with the filled body. Same path
   for chosen snippets (resolve doubles as prefetch). No Tab interception.
2. Non-inline kinds (ghost block, follow-up, recognition): end-of-line `⚡` decoration, Tab opens
   M2's review, Apply plans with `fill: true` and lands. Inline rendering of ghost lines → M7.
3. Esc dismisses with per-line memory (nvim parity); recognitions send `dismissed` feedback.
4. One spec, two PRs: M3a snippets, M3b pushed and pulled suggestions.
5. Recognition choose flow: port nvim `picker.complete` over `olifant/choices`.

Decided by default (may be revisited at plan review):


- Trigger model: a client-side controller as nvim's (`CursorMoved`/`TextChanged` → debounce →
  `consider`), order pushed → pull → inline; the debounce reuses `durandal.debounceMs` (nvim
  hard-codes 300 client-side and sends `debounce_ms` to the server; one knob, same default). The
  inline provider only answers VS Code's automatic trigger when the controller has nothing
  non-inline for the line; when the controller wants the snippet shown it runs
  `editor.action.inlineSuggest.trigger`.
- Tab inside an active snippet session is VS Code's (walks the stops); `inSnippetMode` cannot
  be read from the API, so the keybinding `when` carries `!inSnippetMode` and the decoration may
  briefly show during a session (deviation, noted).
- Completion widget open: inline item not offered (`selectedCompletionInfo` set) and the
  decoration Tab is off (`!suggestWidgetVisible`) — nvim's "Tab is the menu's".
- Ghost display text is VS Code's default rendering (`class Name:`); no client rewrite of
  `${n:name}` to `⟨name⟩`; the `ghost` field is used only for the ≤ 8 lines gate.
- Max ghost lines 8, a constant (nvim `M.max_ghost_lines`, not a setup option).
- `durandal.ghosts` off: provider returns `[]`, controller idle, decorations cleared; completion
  snippets unaffected (nvim).
- Dismiss key per document, as nvim's `key_of` (+ band and choice for recognitions); cleared
  when the document closes.
- Follow-up review = M2 `Plans.review`; Apply = `plan {planId, fill:true}` then `Plans.land`;
  the plan is asked once per push (`asked` flag) and the pulled `olifant/suggest` answer carries
  its `plan` and `edit` already.
- Progress: the fill and `plan{fill}` under `window.withProgress` (status bar) titled "Filling
  holes" / the suggestion's name; the server's `$/progress`, if any, is the library's.
- Errors: `olifant/plan` "no such plan" (document moved on) → the suggestion is cleared and
  reconsidered, no message; resolve errors → one error message, the unfilled snippet stays.
- Logging field names and events as nvim's `util.log` calls in suggest.lua.
- `planId: number` in `protocol.ts`; `Suggestion` typed in full.

## 1. Scope and non-goals

M3 brings durandal.nvim's ghost text, snippets, follow-ups and recognitions to VS Code on native
surfaces: inline suggestions for the snippet anticipated at the cursor, the completion widget for
chosen snippets, an end-of-line decoration plus M2's review window for what the server pushes or
answers as a plan (`ghost`, `followup`, `recognition`), Tab and Esc under Durandal context keys,
`durandal.ghosts` with a toggle, dismiss memory, recognition feedback and the choose flow, and
nvim's action-log events (suggest.lua `util.log` calls).

Two facts shape it. The library already registers the inline-completion feature because olifant
advertises `inlineCompletionProvider` (olf Lsp.hs :144-160; `vscode-languageclient`
`lib/common/inlineCompletion.js`), so the unfilled ghost shows today; M3 gates, fills, dismisses
and toggles it. VS Code ignores a resolve that changes the insert text (d.ts :5137-5155), so the
model fill olifant does on `completionItem/resolve` (olf Lsp.hs :473-481) runs client-side after
insertion through the item's `command` (d.ts :5282), for both snippet paths.

One spec, two PRs (§7): M3a snippets, M3b pushed and pulled suggestions.

Non-goals: a ghost block's lines drawn inline (nvim `virt_lines`, suggest.lua :145-153) — M7's
ghost-block idiom owns that; the hole "Fill with the model" action beyond the lightbulb (free
since M2); cycling or partial accept (the server returns at most one item, olf
Server/Completion.hs :35-60); Tab inside an active snippet session (VS Code's snippet mode,
amending umbrella §4); the `durandal.<area>.<verb>` rename; olifant changes (issues, §7).
Success: the nvim specs in §6 ported, every flow in the fake-lsp suite, the python chain's two
halves in the real-server suite, the manual checklist walked per PR.

## 2. Components and files

New directory `src/suggest/`:

- `store.ts` — the latest `olifant/suggestion` per uri with `asked` and the plan once fetched
  (nvim `M.pushed`, suggest.lua :207-217); `current(uri, version, line)`.
- `controller.ts` — nvim suggest.lua's `schedule`/`consider`/`consider_server` (:449-461,
  :189-200, :220-335): listens to `onDidChangeTextEditorSelection` and `onDidChangeTextDocument`
  for project files, debounces by `durandal.debounceMs`, keeps `state` per uri `{key, kind, line,
  lineText, version, action, shown, planId, item?}`, owns `clear`, `dismiss`, `accept` and the
  context keys `durandal.ghostVisible`, `durandal.ghostKind`.
- `inline.ts` — the middlewares `provideInlineCompletionItems`, `provideCompletionItem`,
  `resolveCompletionItem` (added to `server.ts` :137-168 beside `provideInlayHints`), exposed
  through `ClientHooks` (:22-25) as `hooks.suggest`.
- `fill.ts` — command `durandal.snippet.fill` (§3.1/3.2) and the prefetch stash.
- `decorate.ts` — one `after` decoration type (colour `editorGhostText.foreground`), texts as
  nvim `recognition_text` (:88-92) and the follow-up/ghost lines (:135-157).
- `recognition.ts` — bands, `or`, feedback (:95-100), reset; `choices.ts` — pure `nextInput`,
  `kind` (nvim picker.lua :12-24) and the choose loop (:92-124) over `Ui.pick`/`Ui.text`.
- `keys.ts` — the dismiss key (nvim `key_of`, :26-31).

Changed: `protocol.ts` (`Suggestion` in full with `planId: number`, `InlineItem {insertText,
range, filterText, ghost, data}`, `ChoicesInput`), `server.ts` (middlewares, the
`olifant/suggestion` notification handler), `hints.ts` (`suppressed(uri)` consulted at :157-162,
refresh on change), `extension.ts` (wiring; `Api` gains `suggest` for the e2e), `package.json`
(setting, commands, keybindings), `test/fake-lsp/fake-lsp` (§6), README, CHANGELOG. `land.ts`
`Plans.review`/`land` (:37, :66) are reused unchanged; `Plans.snippet` (:56-62) stays for
generate-flow snippets.

## 3. Data flow per kind

### 3.1 Anticipated snippet
VS Code asks the provider at a typing pause, or the controller runs
`editor.action.inlineSuggest.trigger` when a pushed or pulled answer says `kind: snippet` (nvim
:276-281). The middleware calls `next` (the library sends `textDocument/inlineCompletion`; olf
Lsp.hs ghostItems :1651-1668) and returns the item only if: `durandal.ghosts` is on, the file is
under a known root, `data.kind == "action"`, `ghost` is an array of ≤ 8 lines (nvim :4, :248),
the dismiss key is not remembered, `context.selectedCompletionInfo` is unset (nvim :15-22), and
the controller holds no non-inline suggestion for the line (nvim: a follow-up wins, :334). It then
records `{data, range, body}` in the controller, sets `ghostVisible`/`ghostKind=snippet`, logs
`snippet-shown`, and attaches `command: durandal.snippet.fill [uri, range, body, data]`.
VS Code's own Tab inserts the unfilled body (tab stops live) and runs the command: resolve
`completionItem/resolve {label: generator, data, textEdit: {range, newText: body}}` (nvim
:357-369) under `withProgress` "Filling holes"; if the document's text over the inserted span
still equals the unfilled body, replace it with `insertSnippet(filledBody)`; else leave the
user's text and show a status-bar message "holes left as they are: the text changed while the
model filled" (nvim snippet.lua :7-13). Log `snippet-applied`.

### 3.2 Chosen snippet
The completion widget lists the server's items (olf Lsp.hs snippetItems :1617-1645).
`provideCompletionItem` adds the same command to Snippet-kind items whose `data.kind ==
"action"`; `resolveCompletionItem` lets the library resolve and stashes the resolved
`textEdit.newText` by `data` (VS Code resolves the focused item, so the fill is often ready when
Enter inserts). The command uses the stash or resolves again, then the §3.1 guard and replace.

### 3.3 Follow-up
Pushed (`olifant/suggestion`, olf :1256-1282) for `version == document.version` and `at ==
cursor line`, or pulled by `olifant/suggest {line}` (olf :506-524, which carries `plan` and
`edit`). Decoration `⚡ Tab: review <label> (<summary>)` (nvim :155). The plan is asked once
(`olifant/plan {planId}`, nvim :318-333) and cached. Tab logs `followup-reviewed` and opens
`Plans.review`; Apply sends `olifant/plan {planId, fill: true}` and lands the answer through
`Plans.land` (version check, saves, one notice), logs `followup-applied`; Esc in the review keeps
the suggestion (nvim :235). Conflicts block Apply as in M2.

### 3.4 Ghost block
Same as §3.3 with text `⚡ Tab: <label> (+N lines)`; the lines are seen in the review's diff, not
inline (§0.2). nvim's ghost Tab lands `plan{fill:true}` directly (:353-356); here the review
comes first because VS Code shows the lines nowhere else, and its Apply lands `plan{fill:true}`.
Log events `ghost-*`.

### 3.5 Recognition and choose
Pushed or pulled with `band`, `or`, `reasons`, `score`. Offer: `⚡ <label> — Tab: review`
(plan fetched first, nvim :262-274); choice: `⚡ <label> or a <short(or)> — Tab: choose`; hint:
`⚡ <label>`, quiet (no Tab, no Esc, :124-134). A hint the model upgrades replaces it (key
includes band and choice, :228). Tab on an offer reviews then applies as §3.3 and notifies
`olifant/recognitionFeedback {generator, outcome: "accepted"}`; Esc sends `"dismissed"`. Choose
(nvim :406-440): a quick pick "Which is it?" when `or` is set, then the loop `olifant/choices
{generator, sets}` → `nextInput` → quick pick (choices) or input box → repeat, then `olifant/plan
{textDocument, generator, sets, recognize: true}` → `Plans.review` → Apply lands that plan.
The ⚡ actions menu (M2 `actions/command.ts`) gains the line's recognition first and, for a hint,
"Show recognitions for <name> again" → feedback `"reset"` (nvim actions.lua :104-121).

## 4. Keys and context keys

Context keys, set by the controller: `durandal.ghostVisible` (a Durandal suggestion is shown on
the active editor's cursor line), `durandal.ghostKind` (`snippet | ghost | followup |
recognition`), `durandal.ghostBand` (`offer | hint | choice`, recognitions only). Cleared on
`clear` (cursor off the line, the line's text changed, `ghosts` off, document closed, server
stopped).

Keybindings (`package.json`):

- Tab → VS Code's own `editor.action.inlineSuggest.commit` for the snippet ghost: no Durandal
  binding (§0.1).
- Tab → `durandal.suggest.accept` when `durandal.ghostVisible && durandal.ghostKind !=
  'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible &&
  !suggestWidgetVisible && !inSnippetMode && !editorReadonly`. The negations are umbrella §4's
  rule: another provider's ghost, the completion menu and an active snippet keep Tab (nvim
  :170-178, snippet.lua :30-78).
- Esc → `durandal.suggest.dismiss` when `inlineSuggestionVisible && durandal.ghostVisible &&
  durandal.ghostKind == 'snippet'`: remembers the key, then `editor.action.inlineSuggest.hide`
  (VS Code's own binding has the same scope).
- Esc → `durandal.suggest.dismiss` when `durandal.ghostVisible && durandal.ghostKind !=
  'snippet' && durandal.ghostBand != 'hint' && editorTextFocus && !inlineSuggestionVisible &&
  !suggestWidgetVisible && !editorHasSelection && !editorHasMultipleSelections &&
  !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !renameInputVisible`.
- Shift+Tab inside a snippet: VS Code's.

Commands: `durandal.ghosts.toggle` ("Toggle Ghost Text", `:DurandalGhosts`, nvim init.lua :57;
flips the setting at the level it is set, as `hints.ts` :31-38), `durandal.suggest.accept`,
`durandal.suggest.dismiss` (palette, `enablement: durandal.ghostVisible`), internal
`durandal.snippet.fill`. Settings: `durandal.ghosts` (boolean, true); `durandal.debounceMs`
doubles as the controller's debounce (nvim hard-codes 300 ms, suggest.lua :459). Chord letters
are unchanged; M1 command ids kept.

## 5. Staleness and errors

Every request records `(uri, document.version, line, lineText)` and a `CancellationTokenSource`;
a newer `consider` cancels the older (the library sends `$/cancelRequest`). An answer is dropped
when any of those changed, the active document or cursor line moved, or `ghosts` was switched
off meanwhile (nvim `stale`, suggest.lua :224-228). A pushed suggestion is used only while `params.version ==
document.version && params.at == cursor line` (nvim :258-274); the library sends VS Code's
`document.version` as the LSP version, so the comparison is direct. The server's `offer` table
drops older versions (olf Lsp.hs :1264-1270), so a stale `planId` answers "no such plan": the
controller clears and reconsiders without a message.

Snippet fill: the guard is textual (the inserted span still reads the unfilled body); a failed
guard keeps the user's text and shows a status-bar message; a resolve error shows one error
message and leaves the unfilled snippet with its tab stops. Follow-up/ghost/recognition:
`olifant/plan` errors show one error message and keep the decoration; conflicts disable Apply
(M2 §5); `Plans.land`'s stale check and `applyServerEdit`'s version refusal apply unchanged;
`plan{fill:true}` is sent only from the review's Apply, so nothing lands unseen. Choose: a
`choices` error or an input with no choices shows the server's message (nvim picker.lua
:108-111) and ends the flow. Server not running: controller idle until `running`. `-32800`
answers are ignored.

Interplay: the ⚡ inlay hint is suppressed on the suggestion's line and restored on clear (nvim
:116-121); the decoration never overlaps an inline ghost (the middleware yields when a
decoration is current, and vice versa).

## 6. Testing

Fake-lsp (third vendored change): `inlineCompletionProvider: true` and
`completionProvider {resolveProvider: true, triggerCharacters: ["@", ":"]}`; canned replies for
`textDocument/inlineCompletion`, `textDocument/completion`, `completionItem/resolve`,
`olifant/suggest`, `olifant/plan`, `olifant/choices`; `FAKE_LSP_SUGGEST` as is;
`recognitionFeedback` read from `FAKE_LSP_LOG`.

Unit (node:test, ports of nvim specs): `keys` (suggest_spec d), `choices` (picker_spec),
the inline gate (ghost ≤ 8, data kind, dismissed, completion visible, decoration current), the
controller with a fake clock (one request per burst, stale answer dropped, line edit clears,
order pushed → pull → inline, `ghosts` off drops in-flight answers), recognition texts and key,
the fill guard, `protocol` drift.

Fake e2e, M3a (`fake.9-snippets`): a canned inline item sets `ghostVisible` (via `Api.suggest`);
`editor.action.inlineSuggest.commit` inserts the body, resolve is sent with `{label, data,
textEdit}` and the filled body replaces it; an earlier edit keeps the user's text; Esc
remembers the line text; `ghosts` off asks nothing; 9 ghost lines not shown; a completion-widget
item carries the command. M3b (`fake.10-suggestions`): a push shows
for its version and line only; Tab reviews, Apply sends `plan{planId, fill:true}` and lands;
ghost kind likewise; recognition offer/choice/hint, feedback accepted/dismissed/reset, the
choices loop payload; ⚡ hint absent then back.

Real e2e (python-htmx, gated as M2): M3a — blank line under the last failure → failure-variant
ghost → commit → `class Name:` (nvim e2e_python_spec :167-203); M3b — type `Cancelled` →
failure-arms follow-up → review → apply; the recognition case if it needs no model. CI has no
model or `[fills]`: it asserts "filled, or unfilled intact with the message".

Manual per PR: ghost look, fill, Esc, Copilot, hint hand-over.

## 7. M3a/M3b split and olifant issues

**M3a — snippets.** `inline.ts`, `fill.ts`, `keys.ts`, the controller's snippet subset
(context keys, dismiss memory, `ghosts` setting and toggle, Esc binding), `protocol.ts`
`InlineItem`, fake-lsp capabilities and replies, `fake.9`, the first real e2e, README section
"Ghost text and snippets". Merges when the real e2e proves the prefix rule and the fill against
`.olifant-ref`; if a typed trigger hides the ghost VS Code-side, the PR notes it and issue 3 is
filed.

**M3b — pushed and pulled suggestions.** `store.ts`, the full controller, `decorate.ts`,
`recognition.ts`, `choices.ts`, the ⚡ menu additions, hint suppression, Tab/Esc for decoration
kinds, `Suggestion`/`ChoicesInput` types, `fake.10`, the second real e2e, README "Follow-ups and
recognitions". Builds on M3a's keys and fake.

Both PRs: CHANGELOG, a manual checklist, `.olifant-ref` unchanged.

Olifant issues to file (separate issues against olifant, not M3 work):

1. Docs: `olifant/suggestion` / `olifant/suggest` kinds (`ghost`, `followup`, `recognition`,
   `snippet`) and recognition fields (`band`, `or`, `reasons`, `score`); `planId` is a number;
   `kind: snippet` carries no body (olf Server/Anticipate.hs :198); book ch. 16 table.
2. Editors note: VS Code ignores `textEdit.newText` changed on `completionItem/resolve`
   (d.ts :5137-5155); the portable fill is a post-insert step; optionally send a `command` on
   snippet items that clients may bind.
3. Conditional: inline item `range`/body versus VS Code's prefix rule (d.ts :5266-5270) when a
   trigger is typed — range from the cursor, or a body beginning with the typed text.
4. Optional: `${n:⟨name⟩}` defaults for unfilled holes so a VS Code ghost shows holes as nvim's
   `ghost` lines do (olf Snippet.hs :64-78); affects nvim's placeholder text, decide there.
