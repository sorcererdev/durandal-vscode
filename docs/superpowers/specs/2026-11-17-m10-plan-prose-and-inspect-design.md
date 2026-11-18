# durandal-vscode M10: plan-prose chords and margin, the inspect margin, release 0.2.0

Date: 2026-11-17 (first drafted 2026-11-16 as the M9 spec; split when olifant's conjure overhaul
made the step review part of the pin bump). Status: brainstormed on Fable; the user's rulings are
in §0.A and every other point is ruled here. Umbrella: `2026-11-06-durandal-vscode-design.md`.
Depends on `2026-11-17-m9-pin-bump-and-conjure-step-design.md` being on main (the pin, the eight
server commands, `initOptions.keys`, `runTitledAction`, the recorded-reply env hooks and the real
sandbox config all land there). Supersedes the verbs, claim-pass and margin sections of
`2026-11-09-m6-plans-design.md` (§3.4, §4, §5.6). Release precedent: `2026-11-15-v0.1.1-design.md`.
Facts: `~/projects/notes/vscode-port/m9/olifant-drift.md` (+ addendum), `nvim-and-vscode-surface.md`,
`nvim-conjure-inspect-vs-vscode.md` §A3/§B4. Paths: nvim = durandal.nvim `origin/main` `770834e`
`lua/durandal/`, olifant = the M9 pin (read with `git show <pin>:<path>`).

With the pin on olifant main, the server already sends everything below: step and question
verdicts, stale verdicts, the plan summary line, retitled actions, inspect findings. M10 renders
it the way durandal.nvim does — the full glyph table with stale dimming and an animated spinner,
three chords to check and keep, a per-kind inspect margin with a bug's words at the line end —
updates the docs, and ships 0.2.0.

## 0. Decisions

### A. Ruled by the user

1. **(2026-11-15) Scope: parity with durandal.nvim.** Everything nvim renders today; inspect's
   four actions and doctor row only via command routing (done in M9).
2. **(2026-11-15) Chords follow nvim's letters.** `P S` = Check this / Re-check, `P shift+S` =
   Check the plan, `P K` = Keep this verdict / answer. The old `P S` (plan stub) and `P T` (plan
   test) rows are dropped; bare `S` and `T` still do those in a plan. One breaking keybinding
   change, noted in the CHANGELOG.
3. **(2026-11-15) M10 ends with release 0.2.0** (minor: new features and a breaking chord/setting
   change). The release task is last.
4. **(2026-11-17) No substitute for nvim's line-number tint on inspect findings.** VS Code has no
   per-line line-number colour; the per-kind glyph colour and the bug's end-of-line words suffice.

### B. Ruled here

5. **Thin consumer.** No client-side model of checks (no Checks view, no `.olifant/state/claims`,
   no `plans cost --checks`); a follow-up idea (§9).
6. **New diagnostic codes render as nvim's rank table** (§3.2), stale variants dimmed, hover-only
   codes never arrive. `plan-unchecked` has no margin glyph; VS Code's own Information squiggle on
   the heading is left alone, as every plan diagnostic's squiggle is today.
7. **The spinner animates** (nvim's 10 braille frames at 100 ms) while any open plan has a
   `claim-checking` diagnostic; `plans.glyphs.checking` accepts a string or an array of frames.
8. **Inspect's diagnostics keep flowing to VS Code** (Hint dots, Problems panel, native hover with
   the statement). The extension adds the margin glyph and the bug's words; suppressing VS Code's
   own rendering per source is not worth the fight.
9. **Inspect colours follow nvim's groups**: bug error, assumption warning, convention
   information, design and unknown hint; stale = `disabledForeground`. A bug wins a shared row.

## 1. Scope and non-goals

In scope: chords `P S`, `P shift+S`, `P K` (and dropping `p s` / `p t`); the verdict table with
stale dimming, `»`, `!`, the spinner and the shared-row marks; the inspect margin, the bug's
end-of-line words and `durandal.inspect.glyphs`; real and fake e2e for all of it; README,
CHANGELOG, package.json; release 0.2.0.

Not in scope: a Checks view or costs UI (§9); inspect chords, a Show-why page or a findings list;
suppressing VS Code's native Hint rendering; a line-number tint; anything in the review window;
the `P O` chord (unchanged); Marketplace or Open VSX.

## 2. Components and files

- `src/commandTable.ts`: BUILT titles and KEYS for `durandal.plan.check`, `durandal.plan.checkAll`,
  `durandal.plan.keep`; the `p s` / `p t` rows removed; package.json regenerated (commands,
  keybindings, configuration).
- `src/plans/actions.ts`: the three chord handlers over M9's `runTitledAction`; `words.ts`: nvim's
  three info strings.
- `src/plans/verdicts.ts`, `glyphs.ts`, `decorate.ts`, `layer.ts`: the rank table, `misfit` and
  `answered` glyphs, `checking` frames, the dim colour, the spinner timer, shared-row marks.
- `src/inspect/margin.ts` (new), `src/inspect/words.ts` (new, `firstSentence`),
  `src/inspect/settings.ts` (new, `durandal.inspect.glyphs`); wired from `extension.ts`.
- Tests: `test/unit/verdicts.test.ts`, `glyphs`, `inspectMargin.test.ts`, `manifest`,
  `releaseText`; a new fake e2e file for chords/margin/inspect; `real.9-plans` extended;
  `real.10-inspect.e2e.ts` (new); recordings under `test/fixtures/recorded/` (`decide.json`,
  `checks.json`, `inspect.json`) shaped like olifant's `claimPassSpec` / `inspectSpec`.
- README.md, CHANGELOG.md (`## 0.2.0`), package.json (version), M6 spec (one "superseded" line).

## 3. Design per item

### 3.1 Chords (plans only, `durandal.isPlan`)

| Chord | Command | Picks | None → info (nvim's words) |
|---|---|---|---|
| `P S` | `durandal.plan.check` | first title starting `Re-check`, else `Check this` | `check: nothing to check here` |
| `P shift+S` | `durandal.plan.checkAll` | first title starting `Check the plan` | `check: nothing left to check in this plan` |
| `P K` | `durandal.plan.keep` | first title exactly `Keep this verdict` or `Keep this answer`, with an `edit` | `keep: no verdict to keep here (none checked, or kept already)` |

All three go through `runTitledAction` (M9 §3.1): a command-bearing action runs
`workspace/executeCommand` on the server with its arguments; an edit-bearing action (Keep) is
applied with `applyServerEdit` as one undo step, the server's `TextEdit` verbatim; a
`ResponseError` (`this sentence is being checked now`, …) shows as an info notice. `P Q` (Answer
this) is already in place from M9. The `durandal.plan.stub` / `durandal.plan.test` commands stay
(bare `S` / `T`); only their `p s` / `p t` rows go.

### 3.2 Margin

`src/plans/verdicts.ts` becomes nvim's table (`plans.lua:170-187`): code → glyph name, rank, colour.

| Codes | Glyph | Rank | Colour |
|---|---|---|---|
| `claim-wrong` | wrong ✗ | 8 | `editorWarning.foreground` |
| `step-misfit`, `step-ticked` | misfit ! | 7 | warning |
| `claim-unsure`, `question-unsure` | unsure ? | 6 | `editorHint.foreground` |
| `question-answered` | answered » | 5 | hint |
| `claim-checking` | checking (frames) | 4 | hint |
| `claim-queued`, `step-stale` | queued ○ | 3 | hint |
| `claim-right`, `step-done` | right ✓ | 2 | `testing.iconPassed` |
| `claim-right-stale`, `claim-wrong-stale`, `step-done-stale`, `step-misfit-stale`, `question-answered-stale` | the base code's glyph | 1 | `disabledForeground` |

`plan-unchecked` draws nothing; other unknown codes keep today's severity letter. Sources stay
`olifant-plan` and `olifant`. A row's glyph is its highest rank (`worstPerLine`). Glyph names gain
`misfit` and `answered` (`glyphs.ts`, package.json `plans.glyphs`, `additionalProperties: false`);
`checking` is a string or an array of strings, default `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`.

Spinner: one `setInterval` at 100 ms, started when a repaint finds any `claim-checking` row in
any open plan, stopped when none remain; each tick advances the frame and re-sets only the
checking rows' decorations. A single-string `checking` paints once, no timer. Disposed with the
layer.

Shared-row marks: a row with two or more verdict diagnostics gets an inline `after` decoration
` <glyph>` at each sentence's end (its own glyph, the current frame if checking) in
`disabledForeground`, so `✗ … ✓` on one row is not reduced to `✗`. Rows with one verdict get none.
Sentence ranges come from the diagnostics.

Hover and gd are native: the server's Markdown shows on hover (with the keys M9 passes), F12 goes
to the cited code (a peek list when several). Documented in README; asserted once each in the real
suite.

### 3.3 Inspect margin (code files)

`src/inspect/margin.ts`: for every visible editor whose document is not a plan, read
`vscode.languages.getDiagnostics(uri)`, keep source `olifant-inspect`, pick one finding per row
(a `bug` wins; else the first), and draw:

- a `before` decoration at column 0 (the plan margin's `decorate.ts` technique and spacing) with
  the kind's glyph — `bug !`, `assumption ?`, `convention §`, `design ~`, unknown `•` — in the
  kind's colour: `editorError.foreground`, `editorWarning.foreground`, `editorInfo.foreground`,
  `editorHint.foreground` (design, unknown); a code ending `-stale` keeps the kind's glyph in
  `disabledForeground`;
- for a `bug` (stale or not), an `after` decoration at the line end: `<bug glyph> <first
  sentence>` where `firstSentence(message, 60)` takes the first line, trimmed, cut at the first
  `.` / `!` / `?` followed by whitespace, and past 60 characters keeps 59 + `…` (so at most 62 with
  the glyph); error colour, `disabledForeground` when stale.

Repaint on `onDidChangeDiagnostics` for the changed URIs and on `onDidChangeVisibleTextEditors`.
Setting `durandal.inspect.glyphs` with the four names (`additionalProperties: false`), read in
`src/inspect/settings.ts`; the 60 is a constant. The diagnostics stay in VS Code (§0.B.8); the
four actions and the doctor row work since M9. Nothing is drawn while a pass runs (the server
sends nothing then).

## 4. Release (the last task)

Version `0.2.0`; CHANGELOG `## 0.2.0` folding M9's `## Unreleased` entries in: olifant pin
`<sha7>` (README Requirements and CHANGELOG both carry it in backticks, per `releaseText.test.ts`);
new: the conjure step review (M9), verdict glyphs for steps, questions and stale verdicts, the
spinner, `P S` / `P shift+S` / `P K`, `P Q` answers beside the plan, the inspect margin with a
bug's words and `durandal.inspect.glyphs`, Show why / Show code / Dismiss from the menu; breaking:
the conjure pause window replaced by the step review (no rounds, offers, wire, hints), `P S` and
`P T` repurposed (bare `S` / `T` still stub and test a step), `durandal.plans.reviewAnswers`
removed, `P Q` no longer writes into the plan. Tag `v0.2.0` on main after merge; `release.yml` as
in 0.1.1 (CI via `workflow_call`, `check-vsix`, the .vsix marked Latest).

## 5. Testing summary

- Unit: verdict table (every code's glyph, rank, colour; stale dim; `plan-unchecked` blank);
  `checking` string vs frames; inspect: glyph and colour per kind, `-stale`, unknown kind, bug wins
  the row, `firstSentence` (cut at sentence end; 59 + `…` past 60; first line only); chord
  picking via `runTitledAction` (prefix, exact, needsEdit); `manifest.test.ts` after the chord
  change; `releaseText` sha in README and CHANGELOG `## 0.2.0`.
- Fake e2e (always runs): canned `textDocument/codeAction` replies with the real titles (`Check
  this (cascade, ~$0.04)`, `Re-check (…)`, `Check the plan (2 unchecked, ~$0.08)`, `Keep this
  verdict` with an edit); each chord picks the right one and the `olifant.*` command reaches the
  server (the fake's request log); Keep applies the edit as one undo step; every new diagnostic
  code via `diag()` renders its glyph; a stale code is dim; a row with two verdicts shows inline
  marks; the spinner's frame changes between two repaints; in a `.py` file an `olifant-inspect`
  `convention` draws `§`, a `bug` draws `!` plus `! <first sentence>` at the line end cut to 62, a
  `bug-stale` draws both dimmed, a bug and a convention on one row show the bug, and none in a
  plan; `plan-unchecked` draws nothing.
- Real e2e (OLIFANT_BIN + OLIFANT_REPO; CI; M9's sandbox config and env hooks): `real.9` asserts
  `○` and `plan-unchecked`, a `Check this (` action, `✗` after `P S` on the recorded `wrong`
  sentence, `»` after `P Q` on a recorded question, the evidence line after `P K`, F12 returning a
  Location, the hover footer naming `F12` and `Ctrl+Alt+D P K`. `real.10-inspect` saves
  `src/vetme.py`-style content and asserts the `convention` Hint, the `§` glyph, and the four
  action titles at that line (recordings shaped like olifant's `inspectSpec`: `decide_answers`
  with `stops-early` / `nitpick` / `same`, `inspect_answers` keyed by sorted `file:unit` pairs).
- CI: no structural change.

## 6. Plan-time checks

1. A recorded checker (`check_answers`) given an unrecorded sentence fails that check promptly
   (the margin returns to `○`) rather than hanging the sweep; `decide_answers` with no
   `JEV_API_KEY` runs inspect in the sandbox (as `inspectSpec` does).
2. The inspect diagnostic's range ends at the next line's column 0 (one past EOF on the last
   line); VS Code clamps it; the `after` decoration goes on the finding's first line only.
3. `window/showDocument` on `.olifant/state/inspect/why-<id>.md` opens in VS Code although the
   folder is ignored (`files.exclude` does not block `showTextDocument`).
4. After removing `p s` / `p t`, the `S` / `T` bare chords still fire in a plan.
5. `releaseText.test.ts` expects the sha in `## 0.2.0` once the Unreleased section is folded.

## 7. Task order

1. Chords: the three handlers, commandTable/package.json, words (Sonnet).
2. Margin: verdict table, glyphs, spinner, shared-row marks (Sonnet).
3. Inspect margin, `firstSentence`, setting (Sonnet).
4. Fake coverage and the real e2e additions (`real.9`, `real.10-inspect`, recordings) (Sonnet;
   Opus review).
5. Docs, version, CHANGELOG 0.2.0, M6 superseded line; release (Sonnet).

## 8. Acceptance criteria

- In a plan against the real server: `P S`, `P shift+S`, `P K` behave per §3.1; every code in
  §3.2 draws its glyph; a checking row animates; a two-verdict row shows inline marks.
- In a code file with `[inspect] enabled` and findings: one glyph per finding row in its kind's
  colour; a bug's first sentence at the line end; a bug wins a shared row; stale dims both.
- `p s` / `p t` are gone from package.json; bare `S` / `T` still work in a plan.
- README, CHANGELOG 0.2.0 and the tag are on main; the release is marked Latest.

## 9. Follow-ups (not filed here)

- A Checks view or status-bar costs from `plans cost --checks --json`.
- Inspect chords / a findings list once durandal.nvim has them.
- Suppressing VS Code's Hint rendering for `olifant-inspect` if the dots prove noisy.
- `P O` (open past do) still has no nvim counterpart (M6 §0).
