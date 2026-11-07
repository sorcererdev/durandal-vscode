# durandal-vscode M2: generators

Date: 2026-11-06. Status: approved in conversation. Umbrella: `2026-11-06-durandal-vscode-design.md`
§6 row 2. Inputs: `~/projects/notes/vscode-port/m2/generator-surface.md` (facts with pointers into
durandal.nvim, olifant `Lsp.hs`/`Output.hs` and alder-vscode `src/generate/*`), the nvim specs
named in §9, M1 at `3d4ab34`.

## 1. Goal

Parity with durandal.nvim's `<leader>ma` (actions at cursor), `<leader>mg` (generate picker: list,
form, live preview, apply, including `+ New` nested steps), ⚡ hints, `:DurandalMigration` and the
action log, on native VS Code surfaces only (QuickPick, InputBox, `durandal-doc` virtual documents,
the diff editor, inlay hints). No webview. Olifant is not changed.

Success: the behaviours the nvim unit specs pin are ported (§9), the fake-lsp contract suite covers
every flow, the real-server suite mirrors `e2e_python_spec` (comm → close_table → apply; Add a port
→ `+ New repository`), and the manual checklist is walked once before merge.

## 2. The decision M2 owns: what survives from alder-vscode

Nothing in the generate flow uses `olifant/choices`: durandal.nvim's form is driven by
`olifant/preview`, whose answer carries the fields (`value, source, valid, why, choices, needs,
new`) for every step, and `olifant/choices` is used only by the M3 recognition path. alder-vscode's
flow also takes its form from the preview answer, so its machinery survives with the wire types
swapped.

| Keep, retyped | Add | Drop |
|---|---|---|
| `flow.ts` (state machine, seq counter, 80 ms debounce, `-32800` ignored), `form.ts` (rows, sets merge, firstInvalid, fuzzy), `picker.ts` (here/all headings), `ui.ts` (QuickPick/InputBox harness, Back/Review/Apply buttons, form context key), `previewDoc.ts` (preview sink), `review.ts` (model shape), `planCheck.ts` (stale, seenText, changedPaths, failedMessage), `command.ts` (one flow, diff tabs), `within.ts`, `virtualDocs.ts` (scheme `durandal-doc`) | `steps[]` + `makes` payload and `+ New` (max 3 steps), `needs` and `new[]`, the six `source` notes, `rank.ts` + recents, actions at cursor, miss explanation, snippet insert, action log, migration report | `types.ts`, `preview.ts` (alder gets a server diff; olifant gives `main.text`), `origin.ts`, `entry.ts`, module/bool/help/example field kinds, the delete flow and empty-dir cleanup |

Files are copied into `src/generate/` (umbrella §2: copy, don't share). If after this milestone the
copies diverge less than expected, extracting a package becomes an issue.

## 3. Generate flow (`durandal.generate`, chord `g`)

- **Document.** The active editor's file when it is under a known project root; position = the
  cursor. Otherwise the root's `.olifant/config.toml` at 0:0 (nvim `document_for`): one known root
  → silently; several → a QuickPick of roots; none → "no Olifant project open". The command
  accepts a preset `{generator, sets}` argument (used by actions, §4) and a `done` mode (§4).
- **List.** `olifant/generators {textDocument, position}`. `rank.ts` is a port of `rank.lua`:
  no query → `here`, then recent, then name; with a query → fuzzy over `name + summary`, a name
  match first, then here, recent, fuzzy order. `pack` is absent from the detailed list the server
  returns, so it is not part of the fuzzy text (deviation from `rank.lua`, which reads a key the
  server does not send). Recents: top 10 per root in `workspaceState`, keyed by the root's real
  path. Separators `here` and `all` as alder's `pickerRows`. Empty list → error "no generators in
  <root> (its packs: .olifant/config.toml)".
- **Form.** One QuickPick. Items = the fields of every step in step order, a separator per step
  (`── New <generator> ──` for a `+ New` step), then an `Apply` row. Label = the field name;
  description = the value, or `⟨name⟩` when missing; detail = `why` when present, else
  `set X first` from `needs`, else the source note (`only one`, `from this file`, `from the
  cursor`, `default`, `new`, `suggested`; `you` has no note). Picking a field: if it has
  `choices` or `new[]` → a QuickPick of the choices plus `+ New <generator>…` rows (VS Code's own
  fuzzy filter; typing a value not in the list is not offered, as in nvim); else an InputBox with
  `why` as `validationMessage`. `+ New` inserts a new step before its target with `makes =
  {step, input}` and carries shared values (nvim `choose_new`); picking a plain choice for that
  input later drops the step. Two levels of nesting at most (three steps). Enter on the `Apply`
  row when the preview is not `ready` focuses the first missing field (nvim `first_missing`:
  the first field whose set or value is absent or `valid == false`).
- **Live preview.** Every change sends `olifant/preview {textDocument, position, steps}` with
  only user-set values (nvim `steps_payload(false)`), debounced 80 ms, seq-guarded; an answer
  for an older seq is dropped; `-32800` (superseded by a newer preview) is ignored. The preview
  sink shows `main`: a changed file → `vscode.diff(<real file URI>, durandal-doc:/preview/<n>/
  <path>)` beside the form with `preserveFocus`, the right side replaced on each answer; a new
  file → the virtual doc alone, language from the path's extension, selection at `main.first`.
  The tab title carries the file counts (`+ path`, `~ path +N −M`). `error` → the preview doc
  shows the "; "-split lines, the `Apply` row is disabled and a pending Enter is disarmed. No
  files and no error → "Nothing to change".
- **Apply.** The `Apply` row, or Ctrl/Cmd+Enter (`durandal.generate.apply`, `when:
  durandal.formOpen && inQuickOpen`). Waits for the in-flight preview, then `olifant/plan
  {textDocument, position, steps}` with server-inferred values merged in (nvim
  `steps_payload(true)`: `f.value` where `source != "you"`), under the library's `$/progress`
  ("Generating"). Then §5. Success → recent remembered, `generate-applied {generator}` logged,
  form closed, cursor restored. Failure → the form stays open with its values and the error.
- **Review.** The Review button or Ctrl+O (`durandal.generate.review`, same `when`): plan, close
  the form, open the review window (§5) with the plan; its Apply logs `generate-applied`.
- **Back / Esc.** As alder: Back returns to the list with the form's values kept for that
  generator; Esc closes everything and the preview tabs. Hiding the QuickPick is "nothing".
- **`done` mode.** Enter returns the last step's merged sets to the caller instead of planning
  (used by quickfixes, §4).

## 4. Actions at cursor (`durandal.actions`, chord `a`)

`olifant.showActions(uri, position)` (the inlay hint's command) shares the implementation; the
chord uses the active editor's cursor. Outside a project → information message.

- `textDocument/codeAction` at the cursor's empty range with `context.diagnostics: []`, through
  the client's typed `CodeActionRequest`. QuickPick: `kind == quickfix` first as `Fix: <title>`,
  then the rest by server order; description `(asks a, b)` from `data.missing`. Log `shown {file,
  generators}`, then `picked` or `fix-picked {file, generator}`.
- Pick: when `data.missing` is non-empty and `data.generator` is a string → the generate form
  preset with `{generator, sets}`; a quickfix opens it in `done` mode (Enter hands the sets back,
  nothing is planned in the form). Otherwise each missing input is asked directly: QuickPick when
  `data.choices[name]` is non-empty, else InputBox. Then `codeAction/resolve` on the action with
  the answers written into `data.sets`, under the library's progress (title = the action's).
  The result's `data.plan` opens the review window (§5); `plan.snippet` with `data.snippet ==
  true` inserts the snippet instead. Errors → one error message.
- No actions: `olifant/fileActions {textDocument}` (always re-requested) explains the miss as
  nvim's `explain_miss`: `elsewhere` → QuickPick of `⚡ <label> — line N` from
  `actions[].range` (1-based in the payload) with `applies … none yet` separators from `nearby`;
  picking moves the cursor there and re-runs; `nearby` → information message with each `why`;
  `none` → "No Olifant generators apply to <relative path>".
- The lightbulb / Ctrl+. path is untouched: VS Code resolves through the library and applies
  the action's `edit` through M1's `applyServerEdit` (versions, annotations, saves) without a
  review window. The two paths are documented in the README.

## 5. Apply and review

- `apply.ts`: the stale check first — every `plan.files[].before` must equal the open document's
  text when the file is open, else the disk text; `null` means the file must not exist. Any
  mismatch → "`<path>` changed since planning; nothing was applied — plan again" and nothing is
  applied. Then the plan's `edit` (the server's versioned `WorkspaceEdit`) goes through M1's
  `applyServerEdit`: version check, annotations stripped, files that were clean saved, plan files
  never saved, one notice "Applied <name>: N file(s)" with "(unsaved)" where a file could not be
  saved. Empty `files` and no conflicts → "Nothing to change: the code already has it".
  Conflicts → the review blocks Apply (below); the generate form shows them as its error.
- Snippet plans: `plan.snippet = {file, line, body}` → open `file`, `editor.insertSnippet(new
  SnippetString(body), line)`; nothing else is written. Ghost text, follow-ups and Tab stay M3.
- Review window (`review.ts` + alder's `ui.review`): one QuickPick. Notes first, in nvim
  `preview.model` order: `path:N does not parse` warnings (picking one jumps to that line, nvim
  `gd`), holes by `status` (`filled` → "name filled by model: fill…", `skipped` → "left as a
  placeholder (--no-fill)", else "left as a placeholder: why"), other warnings as `⚠`, conflicts
  as `✗`. Then the files with `+` (new) or `~` marks; the active file item opens `vscode.diff` of
  `durandal-doc:/plan/<n>/before/<path>` and `.../after/<path>` beside. Enter on `Apply` or on a
  file applies (`applied {generator, files}` logged); conflicts disable Apply; Esc closes the
  window and its diff tabs.

## 6. ⚡ hints

The library's `textDocument/inlayHint` feature as the server serves it: one hint per line with
non-snippet actions, label `⚡ <label>[ +N]`, click runs `olifant.showActions`. Every visible
line, not only the cursor line (deviation from nvim, accepted: the server designed its hints for
this). `provideInlayHints` middleware returns `[]` when `durandal.hints` is false and logs
`hinted {generator}` once per uri:line per session. `durandal.hints.toggle` flips the setting
(`:DurandalHints`). Hover (actions on the line, nearby with `why`) is free from the client.

## 7. Migration report (`durandal.migration`)

`olifant/model {textDocument}` on the active document, or the root's `config.toml` as in §3.
No `migration` key → information message "this project is not migrating (no [migrate] in
.olifant/config.toml; olifant init --migrate PATH sets it up)". Else the pure `migrationLines`
(port of `migration.lua`: `line`, blank, `switches` rows `name  on|off` or "no switches yet",
"legacy functions this branch added: …", "switches not in the registry: …") into a read-only
`durandal-doc:/Migration` opened beside.

## 8. Action log

`src/actionLog.ts`: directory `DURANDAL_LOG_DIR`, else `~/.cache/durandal`; file
`actions.jsonl`; one JSON object per line = the event plus `t` (UTC, `YYYY-MM-DDTHH:MM:SSZ`);
`mkdir -p`; best effort (a failure is written to the output channel once and never thrown).
Setting `durandal.actionLog`, default true. Events this milestone: `shown`, `picked`,
`fix-picked`, `generate-applied`, `applied`, `hinted`, with the fields §3, §4, §5 and §6 name.

## 9. Contributions and protocol

- Commands: `durandal.generate` (preset argument), `durandal.generate.apply`,
  `durandal.generate.review`, `durandal.actions`, `durandal.migration`, `durandal.hints.toggle`;
  `olifant.showActions` leaves `SERVER_NAMED_INFO`'s not-yet list. M1's ids are kept; the umbrella
  §4 `durandal.<area>.<verb>` rename stays the open pre-release item.
- Keys: `ctrl+alt+d g` / `a` exist from M1; Ctrl/Cmd+Enter → apply and Ctrl+O → review under
  `durandal.formOpen && inQuickOpen`.
- Settings: `durandal.hints` (true), `durandal.actionLog` (true). Context key `durandal.formOpen`.
- `protocol.ts` tightens: `GeneratorItem {id, name, kind, summary, here}` (the server sends `id`
  and `name`; M1 declared only `name`), `PreviewParams.steps: Step[]`, `PreviewResult {steps,
  files, main, ready, error}`, `Plan` (`files, conflicts, warnings, holes, snippet`),
  `FileActionsResult {actions, nearby}`, `ModelResult.migration?`. No method string outside
  `protocol.ts`; standard LSP types (`CodeAction`, `InlayHint`) come from the library.

## 10. Testing

- Unit (mocha, no VS Code; ports of the nvim specs): `rank` (the four orderings), `form`
  (firstMissing, options with `+ New`, notes, `stepsPayload` with `makes`, user-only vs merged),
  `flow` with a fake UI (debounce = one request per burst, stale answer dropped, failed preview
  disarms Enter, review drops a plan whose sets changed, `done` mode), preview/review model (note
  order, `canApply`, new vs changed), `apply` stale check (open doc, disk, must-not-exist),
  actions menu items (fixes first, `(asks …)`) and `explainMiss` kinds, `migrationLines`,
  `actionLog` (env dir, `t`, best effort), `protocol` drift test extended to the new types.
- Contract e2e (fake-lsp, canned `olifant_generators/preview/plan.json`,
  `textDocument_codeAction.json`, `codeAction_resolve.json`, `textDocument_inlayHint.json`,
  `olifant_fileActions.json`, `olifant_model.json`): generate end to end (files written and
  saved, the preview diff tab opens and updates, a failed plan keeps the form, a snippet plan
  inserts), `+ New` step payload asserted from `FAKE_LSP_LOG`, actions (fixes first, missing-input
  prompt, resolve with sets, review, apply; elsewhere/nearby/none), inlay hints present and gated
  by the setting, migration doc and the not-migrating message, `actions.jsonl` content under
  `DURANDAL_LOG_DIR`.
- Real-server e2e (python-htmx sandbox, gated as M1): comm → close_table → command and test
  written; Add a port → `+ New repository` → both files written; `fileActions` non-empty on a
  project file. Legacy (migration report) stays local.
- Manual checklist: hint look and click, the diff editor updating live while typing, Ctrl/Cmd+Enter
  and Ctrl+O in the form, progress in the status bar during plan, the chord on macOS (Dock item
  from M1), the review window's diff tabs closing on Esc.

## 11. Not in M2

`olifant/choices` (M3 recognition), ghost text / follow-ups / Tab, the hole "Fill with the model"
action beyond what the lightbulb gives for free, plan-file code actions (M6; they appear in the
menu if the cursor is in a plan file and are not filtered), Windows paths.

## 12. Risks

- The server's `edit` versus nvim's `plan.files` write: both come from the same plan; the stale
  check uses `before` and the apply uses `edit`. If they ever disagree (a file the plan lists
  without an edit), the e2e that writes two files catches it.
- Live diff of a real file URI against a virtual doc: if VS Code refuses to diff a dirty real
  document against a virtual one on some version, the fallback is a snapshot virtual doc on the
  left. Decided at implementation, noted in the plan.
- `insertSnippet` body syntax is VS Code's; olifant's `body` is a vim.snippet body. Both are
  TextMate-style `$1`/`${1:x}`; the e2e with a real snippet generator proves it or the plan adds
  a translation.
