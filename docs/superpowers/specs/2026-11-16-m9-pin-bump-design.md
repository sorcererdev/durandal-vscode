# durandal-vscode M9: olifant pin bump to main, plan-prose and inspect parity

Date: 2026-11-16. Status: brainstormed on Fable; the user's rulings are in §0.A and every other
point is ruled here. Umbrella: `2026-11-06-durandal-vscode-design.md`. Supersedes the verbs,
claim-pass and margin sections of `2026-11-09-m6-plans-design.md` (§3.4, §4, §5.6) and the ask
ghost / `reviewAnswers` decisions of `2026-11-12-m7-ghost-blocks-design.md`. Release precedent:
`2026-11-15-v0.1.1-design.md`. Facts: `~/projects/notes/vscode-port/m9/olifant-drift.md` (every
editor-facing change in olifant, with file:line) and `nvim-and-vscode-surface.md` (how
durandal.nvim renders each feature; what the extension hard-codes). Paths: vsc = durandal-vscode
at `3f0a461` (v0.1.1), nvim = durandal.nvim `376c607` `lua/durandal/`, olifant = `origin/main`
`b13f4f3` (read with `git show origin/main:<path>`; the pin is `48f38ab`, 92 commits behind).

The extension pins olifant at `48f38ab`. Since then olifant shipped three plan-prose waves (steps
checked, Check the plan, stale verdicts, questions answered beside the plan, web checks, the
cascade) and *inspect* (the checker on saved code, first called vet). durandal.nvim already
renders all of it. M9 moves the pin to main and gives VS Code users the same thing: the margin
shows every verdict, three chords check and keep, `P Q` answers a question beside the plan,
inspect findings get a margin glyph in code files, and the four inspect actions and the doctor
row work through the existing menu and health page. Nothing new is invented on the client: the
extension stays a thin LSP consumer, as nvim is. The milestone ends with release 0.2.0.

## 0. Decisions

### A. Ruled by the user (2026-11-15)

1. **Scope: pin bump + plan-prose + inspect parity with nvim.** Everything nvim renders today.
   Inspect's four actions and doctor row get only command routing (as in nvim, they work through
   generic code actions and the generic doctor renderer); no dedicated inspect UI until nvim has
   one.
2. **Chords follow nvim's letters.** `P S` = Check this / Re-check, `P shift+S` = Check the plan,
   `P K` = Keep this verdict / answer. The old `P S` (plan stub) and `P T` (plan test) chords are
   dropped; bare `S` and `T` still do those in a plan. One breaking keybinding change, noted in
   the CHANGELOG.
3. **The hover footer's keys are fixed in olifant, first.** The server prints nvim's `gd` and
   `<leader>mpk` in every checked sentence's hover (`Server/Plans.hs:339-341`). An olifant PR
   makes it read the client's keys from `initializationOptions.keys`; M9 pins the olifant commit
   that includes it. Not a client-side rewrite of hover text; not left as is.
4. **M9 ends with release 0.2.0** (minor: new features and a breaking chord/setting change).
   The release task is last, as in 0.1.1.

### B. Ruled here

5. **Approach A, thin consumer.** No client-side model of checks (no Checks view, no reading of
   `.olifant/state/claims`, no `plans cost --checks` shell-outs). That is a follow-up idea (§9).
6. **`olifant/plans/ask` leaves the client.** On main it means *Answer this*, returns
   `{key, verdict, answer}`, never blocks, writes nothing. The verb `ask`, its ghost landing, the
   `' ⋯ asking'` mark and the `durandal.plans.reviewAnswers` setting are removed. `P Q` runs the
   server's *Answer this* code action instead (§3.2).
7. **New diagnostic codes render as nvim's rank table** (§3.3), stale variants dimmed, hover-only
   codes never arrive. `plan-unchecked` has no margin glyph; VS Code's own Information squiggle on
   the heading is left alone, as every plan diagnostic's squiggle is today.
8. **The spinner animates** (nvim's 10 braille frames at 100 ms) while any open plan has a
   `claim-checking` diagnostic; `plans.glyphs.checking` accepts a string or an array of frames.
9. **Inspect's diagnostics keep flowing to VS Code** (Hint dots, Problems panel, native hover with
   the statement). The extension adds only the margin glyph. Suppressing VS Code's own rendering
   per source, as nvim does for its signs, is not worth the fight.
10. **The real e2e suite stops setting `[plans] pass_cost = 0`.** On main `checksCanRun`
    (`Server/Plans.hs:180-190`) is false when `pass_cost` or `pass_budget` is 0, which hides every
    `○`, the `plan-unchecked` line and the Check actions. The suite relies on recorded replies
    instead: `check_answers` (exists today) plus `decide_answers` and `inspect_answers`, passed
    through new env hooks (§5). A recorded decider replaces Jev entirely, no API key
    (`Server/State.hs:deciderUnder`).
11. **Settings are removed, not deprecated.** `plans.reviewAnswers` goes; the extension is at
    0.1.1 with GitHub-release distribution only.

## 1. Scope and non-goals

In scope: the pin bump and every breakage it causes; chords `P Q` (re-meant), `P S`,
`P shift+S`, `P K`; the full verdict table with stale dimming, `»`, `!`, the spinner and the
shared-row marks; the inspect margin glyph and `durandal.inspect.glyphs`; `SERVER_COMMANDS` to the
server's eight; the init-option keys and the olifant PR behind them; env hooks for recorded
decide/inspect replies; README, CHANGELOG, package.json; release 0.2.0.

Not in scope: a Checks view or costs UI (§9); inspect chords, a dedicated Show-why page or a
findings list; suppressing VS Code's native Hint rendering; the `P O` past-do chord (unchanged);
anything the pause/review webview does; Marketplace or Open VSX; any olifant change beyond the
footer keys.

## 2. Components and files

Olifant (`~/projects/olifant`, one PR to main, first):
- `src/Olifant/Lsp.hs:241` `scKeys`: no change in parsing (it is already a map of strings).
- `src/Olifant/Server/Plans.hs:339-341` `keepFooter`, `keepAnswerFooter` become
  `keepFooter :: Text -> Text -> Text` (definition key, keep key), called from `claimHover` with
  `lookup "definition"` / `lookup "plan_keep"` of `scKeys`, defaults `gd` and `<leader>mpk`.
- `src/Olifant/LspSpec.hs`: one case, keys given → footer prints them; keys absent → defaults.
- `book/user/16-the-language-server.md` (init options row) and `19-plans.md` (the footer line).

Extension (`~/projects/durandal-vscode`):
- `.olifant-ref` → the olifant main sha after the PR above merges.
- `src/protocol.ts`: `SERVER_COMMANDS` (8 names, §3.1); the `plans/ask` method entry (§6 check 3);
  comments at :295, :320.
- `src/settings.ts`: `initOptions.keys` gains `plan_keep`, `definition`; `decide_answers`,
  `inspect_answers` from `DURANDAL_DECIDE_ANSWERS`, `DURANDAL_INSPECT_ANSWERS`; comment :30.
- `src/commandTable.ts`: BUILT titles and KEYS for `durandal.plan.check`,
  `durandal.plan.checkAll`, `durandal.plan.keep`; `durandal.plan.ask` retitled; the `p s` / `p t`
  rows removed. package.json regenerated (commands, keybindings, configuration).
- `src/plans/actions.ts`: `runTitledAction` (§3.2) and the four chord handlers.
- `src/plans/verbs.ts`, `rowMarks.ts`, `words.ts`, `src/plans/settings.ts`: `ask` removed;
  nvim's four info strings added to `words.ts`.
- `src/plans/verdicts.ts`, `glyphs.ts`, `decorate.ts`, `layer.ts`: the rank table, `misfit` and
  `answered` glyphs, `checking` frames, the dim colour, the spinner timer, shared-row marks.
- `src/inspect/margin.ts` (new) and `src/inspect/settings.ts` (new, `durandal.inspect.glyphs`);
  wired from `extension.ts`.
- `test/fake-lsp/fake-lsp`: executeCommandProvider lists the 8 commands; header comment.
- `test/e2e/run.ts`: sandbox config (§5); `real.10-inspect.e2e.ts` (new); `real.9` extended;
  `fake.15-verbs` loses its ask cases; a new fake file for chords/margin/inspect.
- `test/fixtures/recorded/`: `decide.json`, `checks.json`, `inspect.json` (§5).
- `test/unit/*`: verdicts, glyphs, inspect glyph map, titled-action picking, manifest, releaseText.
- README.md, CHANGELOG.md, package.json (version 0.2.0), specs M6/M7 (one "superseded" line each).

## 3. Design per item

### 3.1 Pin and protocol

- The pin moves to olifant main after the footer-keys PR merges. CI's shape is unchanged (checkout
  at the sha, cabal cache keyed per sha with the prefix restore key, hackage tarball fallback); one
  cold cabal build per OS is expected (`olifant.cabal` grew 28 lines of deps).
- `SERVER_COMMANDS` = `olifant.doctor`, `olifant.checkSentence`, `olifant.answerSentence`,
  `olifant.checkPlan`, `olifant.showWhy`, `olifant.showCode`, `olifant.inspectShowWhy`,
  `olifant.inspectDismiss` (`Lsp.hs:203`). `src/actions/command.ts:106` then routes every
  server-built action to the server; nothing else in the menu changes. Arguments are passed
  verbatim (`[uri, key]`, `[uri]`, `[absPath, line]`, `[uri, findingId]`,
  `[uri, findingId, "here"|"everywhere"]`).
- Left to vscode-languageclient, no code: `textDocument/definition` returning `Location[]` (F12
  peeks a list), `window/showDocument` (Show why / Show code pages, with selection), Markdown
  hover, `window/showMessage` Info (`Already checking this plan`, `Stopped at $X.XX · N left`, the
  inspect day-cap line), `$/progress` "checking" / "answering" with `checking N of M` reports and
  cancel (the status-bar progress). The `handleWorkDoneProgress` middleware (`server.ts:227-234`)
  must fall through to the library for titles the pause code does not own (§6 check 4).
- `initOptions.keys` = `{ plan_review: chordLabel('p r'), plan_keep: chordLabel('p k'),
  definition: 'F12' }`.

### 3.2 Chords (plans only, `durandal.isPlan`)

| Chord | Command | Picks | None → info (nvim's words) |
|---|---|---|---|
| `P Q` | `durandal.plan.ask` (id kept; title "Plan: answer this") | first title starting `Answer this` | `ask: nothing to answer here (checked already? hover reads it)` |
| `P S` | `durandal.plan.check` | first title starting `Re-check`, else `Check this` | `check: nothing to check here` |
| `P shift+S` | `durandal.plan.checkAll` | first title starting `Check the plan` | `check: nothing left to check in this plan` |
| `P K` | `durandal.plan.keep` | first title exactly `Keep this verdict` or `Keep this answer`, with an `edit` | `keep: no verdict to keep here (none checked, or kept already)` |

`runTitledAction(editor, prefixes, { exact?, needsEdit? })` in `src/plans/actions.ts`: sends
`textDocument/codeAction` with the cursor as a point range (UTF-16 column), `context.diagnostics:
[]`, no `only`; filters out bare `Command`s; picks by title; a command-bearing action runs
`workspace/executeCommand` on the server with its `command.arguments`; an edit-bearing action is
applied with `applyServerEdit` (one undo step, the server's `TextEdit` verbatim). The chord's
handler reports the server's `ResponseError` message as an info notice (e.g. `this sentence is
being checked now`), as the menu does today. The `durandal.plan.stub` / `durandal.plan.test`
commands stay (bare `S` / `T`); only their `p s` / `p t` rows go.

### 3.3 Margin

`src/plans/verdicts.ts` becomes nvim's table (`plans.lua:170-187`): code → glyph name, rank, colour.

| Codes | Glyph | Rank | Colour |
|---|---|---|---|
| `claim-wrong` | wrong ✗ | 8 | `editorWarning.foreground` |
| `step-misfit`, `step-ticked` | misfit ! | 7 | warning |
| `claim-unsure`, `question-unsure` | unsure ? | 6 | hint |
| `question-answered` | answered » | 5 | hint |
| `claim-checking` | checking (frames) | 4 | hint |
| `claim-queued`, `step-stale` | queued ○ | 3 | hint |
| `claim-right`, `step-done` | right ✓ | 2 | `testing.iconPassed` |
| `claim-right-stale`, `claim-wrong-stale`, `step-done-stale`, `step-misfit-stale`, `question-answered-stale` | the base code's glyph | 1 | `disabledForeground` |

`plan-unchecked` and unknown codes: `plan-unchecked` draws nothing; other unknown codes keep
today's severity letter. Sources stay `olifant-plan` and `olifant`. A row's glyph is its highest
rank, as today (`worstPerLine`). Glyph names gain `misfit` and `answered` (`glyphs.ts`,
package.json `plans.glyphs`, `additionalProperties: false`); `checking` is a string or an array
of strings, default `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`.

Spinner: one `setInterval` at 100 ms, started when a repaint finds any `claim-checking` row in
any open plan, stopped when none remain; each tick advances the frame index and re-sets only the
checking rows' decorations. A single-string `checking` glyph paints once, no timer. Disposed with
the layer.

Shared-row marks: when a row carries two or more verdict diagnostics, each sentence's end gets an
inline `after` decoration ` <glyph>` (the sentence's own glyph, the current frame if checking) in
`disabledForeground`, so `✗ ... ✓` on one row is not reduced to `✗`. Rows with one verdict get
none. The sentence ranges come from the diagnostics themselves.

Hover and gd are native: the server's Markdown shows on hover; F12 goes to the cited code (a peek
list when several). Documented in README; asserted once each in the real suite.

### 3.4 Inspect margin (code files)

`src/inspect/margin.ts`: for every visible editor whose document is not a plan, read
`vscode.languages.getDiagnostics(uri)`, keep source `olifant-inspect`, take the first finding per
row, and draw one `before` decoration at column 0 (the plan margin's `decorate.ts` technique and
spacing). Glyph by code: `bug` → `!`, `assumption` → `?`, `convention` → `§`, `design` → `~`,
anything else `•`; a code ending `-stale` uses its kind's glyph in `disabledForeground`, otherwise
`editorHint.foreground`. Repaint on `onDidChangeDiagnostics` for the changed URIs and on
`onDidChangeVisibleTextEditors`. Setting `durandal.inspect.glyphs` with the four names
(`additionalProperties: false`), read in `src/inspect/settings.ts`. The diagnostics stay in VS
Code (§0.B.9). The four actions run from the lightbulb and the chord-a menu through §3.1; the
doctor's `inspect` row appears through `health.ts`'s generic `doctorLines`. Nothing is drawn
while a pass runs because the server sends nothing then.

### 3.5 Olifant: footer keys

`keepFooter`/`keepAnswerFooter` print `<definition>: the code · Keep this verdict: <plan_keep>`
(and `Keep this answer`), where the two keys come from `scKeys` with defaults `gd` and
`<leader>mpk`. durandal.nvim passes neither and is unchanged. The book's init-options row names
`plan_review`, `plan_keep`, `definition`.

## 4. Release (the last task)

Version `0.2.0` in package.json; CHANGELOG `## 0.2.0` with: olifant pin `<sha7>` (the README
Requirements line and the CHANGELOG both carry it in backticks, as `releaseText.test.ts`
demands); new: verdict glyphs for steps, questions, stale verdicts; the spinner; `P S`,
`P shift+S`, `P K`; `P Q` answers beside the plan; inspect margin and `durandal.inspect.glyphs`;
Show why / Show code / Dismiss from the menu; breaking: `P S` and `P T` repurposed (bare `S` / `T`
still stub and test a step), `durandal.plans.reviewAnswers` removed, `P Q` no longer writes into
the plan. Tag `v0.2.0` on main after merge; `release.yml` as in 0.1.1 (CI via `workflow_call`,
`check-vsix`, the .vsix marked Latest).

## 5. Testing summary

- Unit (`npm run test:unit`): verdict table (every code's glyph, rank, colour; stale dim;
  `plan-unchecked` blank); `checking` string vs frames; inspect glyph map incl. `-stale` and
  unknown kinds; `runTitledAction` picking (prefix, exact, needsEdit, bare Commands dropped);
  `manifest.test.ts` equality after the chord change; `protocol.test.ts` OLIFANT_REPO scans
  (methods, 8 commands, legend, keys) against the new pin; `releaseText` sha in README and
  CHANGELOG.
- Fake e2e (always runs): canned `textDocument/codeAction` replies carrying the real titles
  (`Check this (cascade, ~$0.04)`, `Re-check (...)`, `Answer this (...)`, `Check the plan (2
  unchecked, ~$0.08)`, `Keep this verdict` with an edit); each chord picks the right one, the
  `olifant.*` command reaches the server (the fake's request log), Keep applies the edit as one
  undo step; every new diagnostic code via `diag()` renders its glyph; a stale code is dim; a row
  with two verdicts shows the inline marks; the spinner's frame changes between two repaints; an
  `olifant-inspect` `convention` and `bug-stale` diagnostic in a `.py` file draw `§` and dim `!`,
  and none in a plan; `plans/ask` is never requested; `plan-unchecked` draws nothing. fake-lsp's
  initialize reply lists the 8 commands; fixtures that fed `ask` blocks are deleted.
- Real e2e (OLIFANT_BIN + OLIFANT_REPO; CI): `run.ts` writes the sandbox's `.olifant/config.toml`
  with `[decide] model = "jev"`, `[model.backends.jev] kind = "jev"`, `[plans] check_model =
  "sonnet"`, `[inspect] enabled = true`, `settle = 0.5`, no `pass_cost = 0`; `.olifant/inspect.md`
  = `## Rules\n### A\nNo twos.\n`; env `DURANDAL_CHECK_ANSWERS`, `DURANDAL_DECIDE_ANSWERS`,
  `DURANDAL_INSPECT_ANSWERS` → init options `check_answers`, `decide_answers`, `inspect_answers`,
  recordings shaped like olifant's `claimPassSpec` and `inspectSpec` (`LspSpec.hs:~4235`,
  `:4548`) under `test/fixtures/recorded/`. `real.9` asserts `○` and `plan-unchecked`, a `Check
  this (` action, `✗` after `P S` on the recorded `wrong` sentence, `»` after `P Q` on a recorded
  question, the evidence line after `P K`, and F12 returning a Location. `real.10-inspect` saves
  `src/vetme.py`-style content and asserts the `convention` Hint, the `§` glyph, and the four
  action titles at that line.
- CI: no structural change; one cold cabal build per OS.

## 6. Plan-time checks

1. `olifant.cabal` on main builds with GHC 9.10.3 / cabal 3.16.1.0 (ci.yml:10-11); otherwise bump
   them in the same PR.
2. The footer-keys olifant PR is merged and its sha is what `.olifant-ref` gets.
3. `protocol.test.ts`'s method scan: does it require `olifant/plans/ask` to be listed because the
   server still serves it? If yes the entry stays in `protocol.ts` (unused); if no, it goes.
4. `handleWorkDoneProgress` middleware (`server.ts:227-234`) passes "checking" and "answering"
   tokens through to the library (status-bar progress with cancel) rather than swallowing them.
5. A recorded checker (`check_answers`) given an unrecorded sentence fails that check promptly
   (the margin returns to `○`) rather than hanging the sweep; and `decide_answers` with no
   `JEV_API_KEY` runs inspect in the sandbox (as `inspectSpec` does).
6. The inspect diagnostic's range ends at the next line's column 0 (one past EOF on the last
   line); VS Code clamps it without complaint.
7. `window/showDocument` on `.olifant/state/inspect/why-<id>.md` opens in VS Code although the
   folder is ignored (`files.exclude` does not block `showTextDocument`).
8. After removing `p s` / `p t`, the `S` / `T` bare chords still fire in a plan (their `when` is
   `durandal.isPlan`).

## 7. Task order

1. Olifant PR: footer keys (Sonnet; `~/projects/olifant`, branch off main, merge, note the sha).
2. Pin bump and the breaks: `.olifant-ref`, `SERVER_COMMANDS`, `initOptions.keys`, remove `ask`
   and `reviewAnswers`, fake-lsp's command list, comments; unit scans green against the new pin;
   real suite's sandbox config and env hooks; recordings (Opus: protocol-sensitive).
3. Chords: `runTitledAction`, the four handlers, commandTable/package.json, words (Sonnet).
4. Margin: verdict table, glyphs, spinner, shared-row marks (Sonnet).
5. Inspect margin and setting (Sonnet).
6. Real e2e additions (`real.9`, `real.10-inspect`) and fake coverage (Sonnet; Opus review).
7. Docs, version, CHANGELOG, specs' superseded lines; release 0.2.0 (Sonnet).

## 8. Acceptance criteria

- `.olifant-ref` names an olifant main commit at or after the footer-keys merge; CI green on all
  three cells, `check-vsix` passes.
- In a plan against the real server: hovering a checked sentence shows `F12: the code · Keep this
  verdict: Ctrl+Alt+D P K`; `P S`, `P shift+S`, `P K`, `P Q` behave per §3.2; every code in §3.3
  draws its glyph; a checking row animates; a two-verdict row shows inline marks.
- In a code file with `[inspect] enabled` and findings: one glyph per finding row; the lightbulb
  and `Ctrl+Alt+D A` offer Show why, Show code, Dismiss here, Dismiss everywhere, and each runs;
  `Durandal: Health` shows the `inspect` row.
- `plans.reviewAnswers` and `p s`/`p t` are gone from package.json; bare `S`/`T` still work in a
  plan.
- README, CHANGELOG 0.2.0 and the tag are on main; the release is marked Latest.

## 9. Follow-ups (not filed here)

- A Checks view or status-bar costs from `plans cost --checks --json` (approach B).
- Inspect chords / a findings list once durandal.nvim has them.
- Suppressing VS Code's Hint rendering for `olifant-inspect` if the dots prove noisy.
- `P O` (open past do) still has no nvim counterpart (M6 §0).
