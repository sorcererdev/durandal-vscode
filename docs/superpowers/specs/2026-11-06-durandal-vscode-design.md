# durandal-vscode: design (umbrella spec)

Date: 2026-11-06. Status: approved in conversation, awaiting written review.
Inputs: `2026-11-01-vscode-port-assessment.md`, `2026-11-01-durandal-nvim-inventory.md`,
olifant book `user/{14,16,18,19}.md` and `internals/03-plans.md`, alder-vscode (v0.1.0) as the
house style. This file moves to `docs/superpowers/specs/` in the new repo at milestone 1.

## 1. Goal

A VS Code extension with full parity to durandal.nvim, for people who use VS Code. The author
uses Neovim and will not dogfood it daily, so automated tests and per-milestone manual
checklists carry the quality, not daily use.

durandal.nvim is ~7.5k lines of Lua UI over `olifant lsp` (Haskell, private,
`sorcererdev/olifant`). Nothing client-side parses or decides; the port is a UI rebuild on
`vscode-languageclient`. The wire contract is standard LSP plus the `olifant/*` methods in book
ch. 16, 18, 19 and internals ch. 3. Olifant is not changed by this work unless a milestone spec
shows a feature is clearly cheaper server-side.

Out of scope: installing olifant or its toolchains (the extension discovers and diagnoses; an
installer waits for Olifant to publish binaries), a shared npm package with alder-vscode, any
webview beyond the one named in §4.

## 2. Repo, tooling, CI

- Repo `sorcererdev/durandal-vscode`, private for now (same org as olifant and durandal.nvim;
  flips public with them). Extension id `durandal`, display name "Durandal". Activation:
  `workspaceContains:**/.olifant/config.toml` and `onCommand:durandal.*`.
- Tooling copied from alder-vscode, not shared: TypeScript, `vscode-languageclient` ^11, engines
  `^1.91.0`, Node 22, eslint, mocha ^11 unit tests, `@vscode/test-electron` e2e on 1.91.0 and
  stable, `scripts/release.ts` + `release.yml` on `v*` tags with the on-main guard and
  `--prerelease` for `-` tags.
- `.olifant-ref` pins the olifant commit CI builds and tests against (as `.alder-ref` does).
- Code sharing: copy `src/generate/*`, `virtualDocs.ts`, `health.ts`, `root.ts`, `client.ts`
  from alder-vscode and adapt. If the copies diverge less than expected after milestone 2,
  extracting a package becomes a later issue.
- CI (`ci.yml`): checks out `sorcererdev/olifant` at `.olifant-ref` with a fine-grained PAT
  (`OLIFANT_TOKEN`, contents read-only), builds with cabal, caches `~/.cabal` and
  `dist-newstyle` keyed on the ref and GHC version. Matrix: ubuntu stable, macOS stable, ubuntu
  1.91.0. Each cell runs unit, fake-lsp e2e and real-server e2e. Engine toolchains for the
  sandboxes the real-server specs use (ast-grep, python/uv, cargo) are installed in CI only
  where those specs run.
- Version pin: at startup the extension runs `olifant --version` and compares with a minimum
  recorded in `package.json` (`durandal.olifantMinimum`); Health reports a mismatch, the
  client still starts.

## 3. Client and protocol layer

- One client, one `olifant lsp` process per VS Code window, over stdio. Document selector:
  scheme `file`, every language (the server answers empty for files in no project).
- Workspace folders: VS Code's folders at init, plus every `.olifant/` project root the client
  discovers, added with `workspace/didChangeWorkspaceFolders`: at activation from
  `findFiles('**/.olifant/config.toml')`, and the nearest root of any opened file. This is the
  nvim plugin's "project root as workspace folder" rule; nested projects keep their own
  conventions. Context key `durandal.inProject` is true when the active file is under a root.
- `initializationOptions`: `{ debug: false, keys: { plan_review: <chord label> } }`; settings
  `durandal.debounceMs`, `durandal.model`, `durandal.fills` map to the server's
  `debounce_ms`, `model`, `fills` (fills matters for e2e and demos).
- `workspace/applyEdit` handler replaces the library's: refuse the whole edit if any
  `TextDocumentEdit.textDocument.version` differs from the open document's version; apply;
  then save each edited file that was unmodified before the edit and is not a plan file; one
  information message naming the files, "(unsaved)" where it could not save. Plans' own edits
  (reconcile facts, outcomes) go through this path too.
- `willSaveWaitUntil`: the library's handling; an e2e proves region edits land in the same
  write.
- `$/progress`: the library's status-bar progress. The pause/review webview (milestone 5) can
  claim a progress token and show it inline, as the nvim pause window does.
- `src/protocol.ts`: typed request and notification definitions for every `olifant/*` method
  (generators, preview, plan, choices, fileActions, holes, model, suggestion, suggest,
  recognitionFeedback, stub, conjure, mutate, waive, tests/run, tests/file, debugState, the
  `plans/*` family and the `plans/review/ready` and `plans/outcome` notifications), plus the
  `olifant.doctor` command. Written whole in milestone 1; later milestones never touch raw
  method strings.
- Server not found or crashed: one notification with "Show Health" and "Restart Server"; no
  automatic restart loop (alder-vscode's behaviour).
- Action log: offered and picked actions appended to `~/.cache/durandal/actions.jsonl`
  (`DURANDAL_LOG_DIR` overrides, as in nvim), setting `durandal.actionLog` default on.

## 4. UI conventions

- Commands `durandal.<area>.<verb>`, titles "Durandal: …". Chord prefix `ctrl+alt+d`
  (`cmd+alt+d` on macOS) then the nvim letter: `a` actions, `g` generate, `t` test file,
  `shift+t` test all, `j` jump, `s` stub, `c` conjure, `m` mutate, `p` then `q v d y n f c e r
  x` for the plan verbs. `when` clauses use `durandal.inProject`, `durandal.isPlan`,
  `durandal.ghostVisible`, `durandal.pauseOpen`, and alder's `formOpen && inQuickOpen` pattern
  for Ctrl/Cmd+Enter in forms.
- Tab accepts a ghost or walks a snippet only under `durandal.ghostVisible &&
  !inlineSuggestionVisible`, so other inline-suggestion providers are not shadowed; Esc
  dismisses under the same key.
- Native first. A surface gets a webview only if it needs both live multi-part state and its
  own key handling. That is the pause/review window (conjure pause, do review, reconcile
  review) and nothing else. Everything else uses QuickPick, InputBox, read-only virtual
  documents (scheme `durandal-doc`), the diff editor, decorations, CodeLens, inlay hints, the
  Test Explorer and DiagnosticCollections. Reasons: those surfaces follow the theme,
  keybindings, find, screen readers and remote VS Code for free, and VS Code users know them;
  several are upgrades on the nvim floats (the real diff editor for previews, the Test Explorer
  for runs).
- Semantic tokens: `contributes.semanticTokenTypes` for the eleven `plan*` types and the
  `stale` modifier, each with a `superType` so themes colour them without durandal rules;
  `semanticTokenScopes` as the TextMate fallback.
- Glyphs: VS Code has no conceal. Default is a decoration with `opacity: 0` on the marker text
  plus a `before` glyph; setting `durandal.plans.glyphs` (false disables). Details are the
  milestone 6 spec's.
- Notifications: `showInformationMessage` for results; modal only for delete confirmations.

## 5. Testing

- Unit (mocha, no VS Code): the portable logic ported with its nvim specs: rank, the picker's
  next-required-input and narrowing, the preview model, `accepted` (strip change annotations),
  ghost-block row matching, the pause and review windows' data-to-view models, the journal-line
  and `@path:Unit` regexes.
- Contract e2e (VS Code + fake server): durandal.nvim's `tests/fake-lsp` (Python) vendored into
  the repo, `durandal.path` pointed at it, a replies dir per test with the `<method>.json`
  convention (`lsp_error`, `hold`, `notify`, `request` forms as the fake defines them),
  `FAKE_LSP_LOG` asserted for what the client sent (versions, cancels, folders). The four
  `tests/fixtures/*paused.json` payloads are vendored and drive the pause window. This layer
  runs in every CI cell and must stay fast.
- Real-server e2e: the olifant build at `.olifant-ref` against sandboxes from
  `olifant/scripts/try-pack.sh` (rust-htmx, python-htmx, python-strangler), one spec per nvim
  `e2e_*_spec`, gated on `DURANDAL_E2E`, `DURANDAL_E2E_PY`, `DURANDAL_E2E_LEGACY` as nvim does.
  CI runs rust and python; legacy stays local until it proves cheap.
- Manual: each milestone PR carries a checklist of what only an eye can check (colours, glyphs,
  webview layout, chords). The author walks it once per milestone before merge.

## 6. Milestones

Each milestone gets its own short spec and plan before it starts (as alder-vscode M1–M7 did).
Order is cheapest-and-shared first; the generator surface and the ghost/Tab machinery set the
vocabulary the later milestones reuse, and the review webview (5) lands before plans (6) need
it.

| # | Milestone | Delivers | Decision it owns |
|---|---|---|---|
| 1 | Scaffold + client | §2, §3, `protocol.ts`, Health, fake-lsp harness, real-server smoke. Free from the client: rules (pulled diagnostics), quickfixes, hover, `@` completion, folding, regions on save | CI token and cabal cache layout |
| 2 | Generators | actions at cursor, generate picker/form/live preview/apply, ⚡ inlay hints, migration report, action log | how much of alder's `generate/*` survives `olifant/choices` and `olifant/preview` |
| 3 | Ghost text + snippets | inline completion provider (`vscode-languageclient` 11 ships the feature), follow-ups, Tab/Esc, recognition feedback, hole snippets | Tab coordination with other inline providers |
| 4 | TDD loop | Test Explorer runs of `olifant/tests/run`, jump, stub, conjure (non-paused path), mutate + survivors | Test Explorer vs a results document |
| 5 | Pause / review webview | the one webview: conjure pause, do review, reconcile review, details view | the webview's message protocol and key handling |
| 6 | Plans | plan detection, reading layer, glyph decorations, fold conclusions, verbs, lenses, errands, outcome notifications, auto-reconcile, plan diagnostics style | glyphs by decoration vs token colours only |
| 7 | Ghost blocks | accept/reject blocks under plan rows | real text with diff decorations and Accept/Discard CodeLens (inline-chat idiom) vs CodeLens only |
| 8 | Release | README, packaging, `v0.1.0` | — |

## 7. Risks

- The Haskell build in CI: slow on a cold cache; mitigated by caching on the ref, and the ref
  bumps rarely.
- `olifant lsp` is private: contributors without access can still run unit and fake-lsp e2e.
- VS Code has no virtual lines, no conceal, no custom fold text: milestones 6 and 7 own these;
  the fallbacks (token colours without glyphs, CodeLens without inline text) are acceptable
  first versions.
- Nobody dogfoods daily: the manual checklist per milestone and the real-server e2e are the
  guard; a feature that cannot be e2e-tested needs a named manual check.
