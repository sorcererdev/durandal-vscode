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
- **Snippets in the completion list** (`Ctrl+Space`, or after `@` or `:`) are the same
  snippets by choice; picking one fills its holes the same way.
- `durandal.ghosts` or `Durandal: Toggle Ghost Text` turns the ghost text off (the completion
  list keeps its snippets). While VS Code's completion list, another extension's ghost text, or
  a snippet you are filling in has Tab, Tab is theirs.

## Settings

- `durandal.path`: the binary.
- `durandal.debounceMs`: how long typing must pause before suggestions are worked out.
- `durandal.model`: the model backend for holes (empty: the project's default).
- `durandal.fills`: a recorded fills file standing in for the model (tests, demos).
- `durandal.hints`: the ⚡ hints.
- `durandal.ghosts`: ghost text.
- `durandal.actionLog`: the action log.
- `durandal.trace.server`: LSP traffic into the Durandal output channel.

A change to the first four takes effect after `Durandal: Restart Server`.

## Development

`npm ci`, then `npm run test:unit`. `npm run test:e2e` runs the contract suite against the
vendored fake server (Python 3); with `OLIFANT_BIN` (an olifant built at `.olifant-ref`) and
`OLIFANT_REPO` (that checkout) it then runs the smoke suite against olifant lsp. CI needs the
`OLIFANT_TOKEN` secret: a fine-grained token with read-only Contents on sorcererdev/olifant.
