# Changelog

## Unreleased

- The plan loop as in durandal.nvim: automatic reconciles on entry, landings and saves
  elsewhere (`durandal.plans.reconcile`), `Plan: Reconcile` with the review of its readings,
  idle notices for the claim pass, `Plan: Open Past Do` on journal lines, the past-do and
  excerpt lenses, and the claim pass's actions in the chord-`a` menu (milestone 6c).
- Plan verbs as in durandal.nvim: ask, validate and do on a row with a pending mark and Plan:
  Cancel; answers land with their facts, an ask's straight in (one undo), other blocks behind
  Accept all / Reject all beside the plan, outcomes sent; new step, excerpt, toggle, files, and
  stub and test on a step; a reopened do lands fully (milestone 6b).
- Plans read as in durandal.nvim: theme colours for every plan token, glyphs for markers with
  `durandal.plans.conceal`, claim verdicts at the start of their line, done work and excerpts
  closed on entry with their conclusion at the line's end, Enter continuing a step, and a warning
  when typing inside a live excerpt; olifant pinned at 48f38ab (milestone 6a).
- Reviews in the pause window: a do's review opens when the do ends, the plan lens and
  `Plan: Review` (chord `p r` on a plan) open do, past-do and reconcile reviews; their answers
  land as one undo step, with the plan's facts (milestone 5b).
- The pause window: a paused conjure opens a tab beside the file with the situation, the rounds,
  the offers on their keys and the diff they would land; resumes run in it with the server's
  words, `d` opens the details as markdown, and the pause survives the tab (milestone 5a).
- The TDD loop: test here, file and all with a results document and diagnostics, jump, stub,
  conjure, mutate with the survivors picker and waive, and the silent re-mutate after a green
  run (milestone 4).
- Follow-ups, ghost blocks and recognitions pushed or answered by the server: an end-of-line ⚡,
  Tab to review and apply with the model, Esc to dismiss, recognitions' choose flow and feedback,
  and the ⚡ menu's recognition (milestone 3b).
- Ghost text for the snippet anticipated at the cursor and fill-on-accept for completion
  snippets, with Esc's per-line dismissal and `durandal.ghosts` (milestone 3a).
- Actions at the cursor, the generate picker with a live preview and `+ New` steps, the review
  window, ⚡ hints, the migration report and the action log (milestone 2).
- The extension activates after startup, so a project file opened in a window without the
  project starts the server (#1).
- One `olifant lsp` per window, every Olifant project a workspace folder; the server's edits applied and saved as durandal.nvim does; Show Health (with `olifant doctor`) and Restart Server.
