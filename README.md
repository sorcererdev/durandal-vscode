# Durandal for VS Code

Olifant's conventions, generators and TDD loop in VS Code, over the `olifant lsp` language
server: rule findings and their fixes, regions kept on save, and (in later releases) actions,
generators, ghost text, the TDD loop and plans. The Neovim plugin is
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

## Settings

- `durandal.path`: the binary.
- `durandal.debounceMs`: how long typing must pause before suggestions are worked out.
- `durandal.model`: the model backend for holes (empty: the project's default).
- `durandal.fills`: a recorded fills file standing in for the model (tests, demos).
- `durandal.trace.server`: LSP traffic into the Durandal output channel.

A change to the first four takes effect after `Durandal: Restart Server`.

## Development

`npm ci`, then `npm run test:unit`. `npm run test:e2e` runs the contract suite against the
vendored fake server (Python 3); with `OLIFANT_BIN` (an olifant built at `.olifant-ref`) and
`OLIFANT_REPO` (that checkout) it then runs the smoke suite against olifant lsp. CI needs the
`OLIFANT_TOKEN` secret: a fine-grained token with read-only Contents on sorcererdev/olifant.
