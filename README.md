# Durandal for VS Code

Olifant's conventions, generators and TDD loop in VS Code, over the `olifant lsp` language
server: rule findings and their fixes, regions kept on save, actions and generators with a
live preview, ⚡ hints, the migration report, and (in later releases) ghost text, the TDD loop
and plans. The Neovim plugin is
[durandal.nvim](https://github.com/sorcererdev/durandal.nvim).

Requires an `olifant` binary with the `lsp` command. Build one from a checkout of
sorcererdev/olifant: `cabal build && scripts/install-olifant.sh` (installs `~/.local/bin/olifant`).

## Install

Until a release: download `durandal-<version>.vsix` from a CI run's `vsix` artifact and run
`code --install-extension durandal-<version>.vsix`.

## Requirements

An `olifant` binary with the `lsp` command. The extension looks at the `durandal.path` setting,
then `PATH`, `~/.local/bin`, `~/.cabal/bin` and `~/bin` (VS Code started from the Dock sees a
shorter `PATH` than your shell). `Durandal: Show Health` says what it found, and runs
`olifant doctor` for the project of the file you are in.

One `olifant lsp` serves the window. Every folder holding `.olifant/` is a project and keeps its
own conventions; a project's file opened from outside the workspace joins it.

## Actions and generators

- **Actions here** (`Ctrl+Alt+D A`, `Cmd+Alt+D A` on macOS): the server's actions at the cursor,
  a rule's fixes first. Pick one: it asks what it still needs, then shows the plan in the review
  window (notes, then each file's diff beside); Enter applies it. With nothing at the cursor it
  says why, or lists the actions elsewhere in the file to jump to.
- **Generate** (`Ctrl+Alt+D G`): the project's generators (those that apply at the cursor first,
  then the ones you used recently), then a form of their inputs with a live preview beside it.
  `Ctrl+Enter` (`Cmd+Enter`) applies, `Ctrl+O` reviews the plan first. An input another
  generator can make offers `+ New …`, which adds that generator's inputs to the form.
- **The lightbulb** (`Ctrl+.`) offers the same actions and applies the chosen one at once,
  without the review window. Either way, a file you changed since the plan was made is never
  overwritten: nothing is applied, and the message says to plan again.
- **⚡ hints** mark the lines where an action applies; click one for its menu.
  `durandal.hints` or `Durandal: Toggle ⚡ Hints` turns them off.
- **Durandal: Migration Report**: how a strangler migration stands (switches, legacy code added).

Durandal appends what it offered and what you picked to an action log, to tune where generators
apply: `$DURANDAL_LOG_DIR/actions.jsonl` if that is set, else
`$XDG_CACHE_HOME/durandal/actions.jsonl`, else `~/.cache/durandal/actions.jsonl` (the file
durandal.nvim writes). `durandal.actionLog` turns it off.

## Ghost text and snippets

- **The snippet Olifant anticipates** at the cursor (a failure variant under the last failure,
  a test case in a describe block) shows as ghost text. `Tab` inserts it with its holes as tab
  stops, then the model fills the holes in place (status bar: "Filling holes"). If you type
  while it fills, your text is kept and the holes stay as they were. `Esc` dismisses it, and
  it is not offered again on that line's text.
- **Snippets in the completion list** (`Ctrl+Space`) are the same
  snippets by choice; picking one fills its holes the same way.
- **Follow-ups**: after an edit settles, what follows from it (the match arms for a new failure,
  a test for a new command) shows at the end of the line as `⚡ Tab: review <name> (<summary>)`;
  a multi-line block as `⚡ Tab: <name> (+N lines)`. `Tab` opens the review window on the plan;
  Apply plans it again with the model and applies it. `Esc` dismisses it on that line.
- **Recognitions**: code written your own way that a convention covers shows as
  `⚡ <name> — Tab: review` (an offer), `⚡ <name> or a <other> — Tab: choose` (two fit: pick
  one, then answer its inputs) or a quiet `⚡ <name>` (no Tab; it leads the ⚡ menu, where
  "Show recognitions for … again" undoes the quiet). Accepting or dismissing tells Olifant, which
  goes quiet about conventions you keep dismissing.
- The ⚡ hint of a line steps aside while a suggestion is shown there.
- `durandal.ghosts` or `Durandal: Toggle Ghost Text` turns the ghost text off (the completion
  list keeps its snippets). While VS Code's completion list, another extension's ghost text, or
  a snippet you are filling in has Tab, Tab is theirs.

## The TDD loop

The chord is Ctrl+Alt+D (Cmd+Alt+D on macOS) followed by a letter.

| Chord | Command | What it does |
|---|---|---|
| `t` | Run the Test Here | The test under the cursor; in a module, its test file. |
| `shift+t` | Run This File's Tests | The file's tests (a module's test file). |
| (palette) | Run All Tests | The project's tests. |
| `j` | Jump to Test or Module | Between a module and its test file; a missing test file opens untitled at its path. |
| `s` | Stub a Test | A new test for the function at the cursor, at the end of its test file, saved; the cursor on its name. |
| `c` | Conjure | Fills the body at the cursor, or the selected lines, until its tests pass; lands as one undo step. |
| `m` | Mutate | Mutates the unit at the cursor; survivors are warnings and a picker stubs or waives them. |

A run writes its summary as a notice and its failures as errors on their lines (press F8 to walk them).
The full output is in the results document, which opens beside the editor when something failed;
Ctrl/Cmd-click a `✗` line to go to it; `t` or `shift+t` there runs the last run again, and
`s` works in the untitled test file a jump opens. A green run of a module's tests mutates its marked units
again and says which survivors it killed. Runs, conjures and mutates show a Cancel button. A
conjure that pauses opens the pause window (below). There is no Test Explorer: olifant lists no
tests.

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

The same tab reviews a plan's do, a past do, and a reconcile's readings. A do's review opens by
itself when the do ends; the plan's lenses and `Cmd+Alt+D P R` (`Ctrl+Alt+D P R`) on a plan open
any review waiting there. A do review: `a` keeps the change, `r` reverts it, `t` runs the step's
tests, `p` allows the tools the do was refused, `o` reopens its thread with what to change,
`[` `]` move between its files. A reconcile: `a` applies the selected reading, `r` leaves it, a
digit places a unit under that open step, `n` makes it a new step, `i` ignores it. `q` closes the
tab; the review stays on the server, under its lens.

## Plans

A plan is a markdown file under the project's `plans/` folder (`durandal.plans.dir`, which must
match `[plans] dir` in `.olifant/config.toml`). The server reads it and Durandal shows what it
says:

- **Colours.** Steps, questions, claims, evidence, journal lines, anchors and verdicts are
  semantic tokens; every theme colours them through their base types, and a stale fingerprint
  reads as a comment. Themes with semantic highlighting off (`editor.semanticHighlighting.enabled`)
  show none of it, and no glyphs or fold conclusions either.
- **Glyphs.** With `durandal.plans.conceal` on, `- [ ]` reads ☐, `- [x]` ☑, `- ?` ?, `- test:` ·,
  `- also` +, and anchor paths and fingerprints hide, on every line but the cursor's.
  `durandal.plans.glyphs` changes any of them.
- **Verdicts.** A claim's check shows at the start of its line: ✗ wrong, ? could not tell,
  … checking, ○ waiting, ✓ right; other Olifant findings show E, W, I or H. The worst one on a line
  wins.
- **Folds.** Done steps, answered questions and code excerpts close when a plan is first shown
  (`durandal.plans.foldDone` off: excerpts only). A closed fold shows its conclusion, or a done
  step's unit and verdict, at the end of its line.
- **Typing.** Enter after an open step starts another; after a done step, a plain item. Typing
  inside a live excerpt warns once: the next reconcile replaces it.
- **Claim checks.** Opening or saving a plan can start an olifant claim pass that runs paid model
  checks; `[plans] pass_cost = 0` in `.olifant/config.toml` turns it off.

## Settings

- `durandal.path`: the binary.
- `durandal.debounceMs`: how long typing must pause before suggestions are worked out.
- `durandal.model`: the model backend for holes (empty: the project's default).
- `durandal.fills`: a recorded fills file standing in for the model (tests, demos).
- `durandal.hints`: the ⚡ hints.
- `durandal.ghosts`: ghost text.
- `durandal.actionLog`: the action log.
- `durandal.plans.dir`: the plans folder under each project (default `plans`).
- `durandal.plans.conceal`: plan glyphs (off by default).
- `durandal.plans.glyphs`: glyph overrides by name.
- `durandal.plans.foldDone`: close done work on entry, not only excerpts (on by default).
- `durandal.trace.server`: LSP traffic into the Durandal output channel.

A change to the first four takes effect after `Durandal: Restart Server`.

## Development

`npm ci`, then `npm run test:unit`. `npm run test:e2e` runs the contract suite against the
vendored fake server (Python 3); with `OLIFANT_BIN` (an olifant built at `.olifant-ref`) and
`OLIFANT_REPO` (that checkout) it then runs the smoke suite against olifant lsp. CI needs the
`OLIFANT_TOKEN` secret: a fine-grained token with read-only Contents on sorcererdev/olifant.
