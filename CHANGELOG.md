# Changelog

## Unreleased

- Tested against olifant `127570e` (the commit in `.olifant-ref`).

## 0.1.1

- A review answered while its plan is closed no longer leaves the plan changed where nobody
  sees it: `plan <name> changed · unsaved` says so, with `Open` (#11).
- Closing a plan cancels its running ask or validate instead of letting the model run on; a
  running do still finishes, and its review opens (#14).
- No more `Illegal value for line` errors in the extension host log when a file shrinks above
  the cursor (#23).
- The README notes that a plan ghost is accepted whole (#20).
- Test only: the pause-window tests no longer race the page's first size report (#26).

## 0.1.0

- One `olifant lsp` per window, every Olifant project a workspace folder; the server's edits
  applied and saved as durandal.nvim does; Show Health (with `olifant doctor`) and Restart
  Server. The extension activates after startup, so a project file opened in a window without
  the project starts the server (#1).
- Actions at the cursor, the generate picker with a live preview and `+ New` steps, the review
  window, ⚡ hints, the migration report and the action log.
- Ghost text for the snippet anticipated at the cursor and fill-on-accept for completion
  snippets, with Esc's per-line dismissal and `durandal.ghosts`. Follow-ups, ghost blocks and
  recognitions pushed or answered by the server: an end-of-line ⚡, Tab to review and apply with
  the model, Esc to dismiss, recognitions' choose flow and feedback, and the ⚡ menu's
  recognition. A ghost-kind suggestion whose block goes under the cursor line shows its lines
  there.
- The TDD loop: test here, file and all with a results document and diagnostics, jump, stub,
  conjure, mutate with the survivors picker and waive, and the silent re-mutate after a green
  run.
- The pause window: a paused conjure opens a tab beside the file with the situation, the rounds,
  the offers on their keys and the diff they would land; resumes run in it with the server's
  words, `d` opens the details as markdown, and the pause survives the tab. Reviews in it: a
  do's review opens when the do ends, the plan lens and `Plan: Review` (chord `p r` on a plan)
  open do, past-do and reconcile reviews; their answers land as one undo step, with the plan's
  facts.
- Plans read as in durandal.nvim: theme colours for every plan token, glyphs for markers with
  `durandal.plans.conceal`, claim verdicts at the start of their line, done work and excerpts
  closed on entry with their conclusion at the line's end, Enter continuing a step, and a
  warning when typing inside a live excerpt.
- Plan verbs: ask, validate and do on a row with a pending mark and Plan: Cancel; answers land
  with their facts, an ask's straight in (one undo), outcomes sent; new step, excerpt, toggle,
  files, and stub and test on a step; a reopened do lands fully. A validate's blocks, and a
  do's in a project without git, wait under their row as a ghost (`ai · +N lines`, hover to
  read): `p y` or Tab writes them, `p n` drops them.
- The plan loop: automatic reconciles on entry, landings and saves elsewhere
  (`durandal.plans.reconcile`), `Plan: Reconcile` with the review of its readings, idle notices
  for the claim pass, `Plan: Open Past Do` on journal lines, the past-do and excerpt lenses, and
  the claim pass's actions in the chord-`a` menu.
- Releases: a `v*` tag runs CI and attaches the `.vsix` to a GitHub release. Tested against
  olifant `48f38ab`.
