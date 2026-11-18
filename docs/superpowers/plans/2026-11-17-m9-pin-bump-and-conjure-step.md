# durandal-vscode M9: olifant pin bump and the conjure step review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the olifant pin to olifant main (after an olifant change that names the editor's keys in the hover footer), replace the conjure pause window with durandal.nvim's one-step review, and fix the other breaks the bump causes (`olifant/plans/ask`, the server command list), merged to main with no release.

**Architecture:** One olifant change lands first, on olifant main. The extension then works on one branch, `m9`, in five tasks. Task 2 moves the pin and fixes the protocol breaks. Task 3 adds the step review's pure parts beside the old pause code (types, view model, held-step store, fixtures). Task 4 switches conjure over in one cut: the wire types, `tdd/conjure.ts`, the controller's step source, the extension wiring, and the deletion of the pause half. Task 5 adds the step window's e2e suite and the recorded real-server conjure. Task 6 updates the docs, runs the whole-branch review and opens the PR.

**Tech Stack:** Haskell (olifant: GHC 9.10.3, cabal 3.16.1.0, hspec). TypeScript 5.9, `node:test` (unit), `@vscode/test-electron` + mocha over `test/fake-lsp/fake-lsp` (e2e), the real `olifant lsp` for `real.*`.

**Spec:** `docs/superpowers/specs/2026-11-17-m9-pin-bump-and-conjure-step-design.md` (on main `29db90f`). Read §0 for the rulings and the §3 subsection of the item you implement. Where this plan and the spec differ, this plan wins; each difference is listed under "Plan-time findings" below.

**Facts behind this plan:** `~/projects/notes/vscode-port/m9/plan-facts/` (`olifant.md`, `olifant-proposed.diff`, `extension-core.md`, `pause-window.md`, `real-e2e-probe.md`). Read the file your task names when a step says so; do not re-derive.

## Plan-time findings (2026-11-17, on durandal-vscode `29db90f`, olifant `origin/main` `0f8a5c1`, durandal.nvim `770834e`)

1. **Drift since the spec.** durandal.nvim has not moved past `770834e`. Olifant main moved from `6c47430` to `0f8a5c1`: inspect resolves a finding not found again, olifant inspects itself, and a conjure step's `situation` text now includes inspect's open findings and the project's rules. None of it changes the wire: `stepJson`, the eight commands, the methods and the init options are as the spec says. The pin target is the footer-keys merge on top of olifant main (Task 1).
2. **Check 1 (sandbox).** `scripts/try-pack.sh` (olifant repo) writes only `[packs] python-htmx = { path = … }`. It sets no `[conjure]`, `[model]`, `wire` or `rounds`. On main `[conjure] wire` and `[model.backends.X] rounds` are config errors. `step_replies` is a **string path to a plain-text file**, not JSON. Its whole text answers every conjure writer of any backend kind, opening call and `harder` alike, and it needs no `[model]` and no `[conjure] writer`. The shown `writer` is then `"recorded"`. `took` is true when at least one `<file path="…">…</file>` block parses. `<goal>nothing</goal>` alone gives `took: false`. `harder` still needs `[conjure] harder` naming a defined non-jev backend, so the real sandbox does not exercise `h`.
3. **Check 2 (build).** olifant main builds with GHC 9.10.3 / cabal 3.16.1.0: about 3 minutes cold for `exe:olifant`, 4.5 minutes for the first `cabal test spec` build.
4. **Check 3 (protocol scan).** `olifant/plans/ask` is still served on main (`Lsp.hs:807`), so `PINNED` keeps it and `Olifant.plansAsk` stays in `protocol.ts`, marked "served, not called". The method scan finds the same 33 methods. The command scan finds the 8 server commands plus the 4 client ones. **Not in the spec:** `TDD_KEYS` fails on main for 9 keys the server no longer sends (`stopped, diagnosis, expires, checker, wired, flipped, proposal, arg, land`). Task 2 prunes them; Task 4 drops the rest of the pause keys and Task 3 adds the step's.
5. **Check 4 (progress middleware).** Nothing but the pause uses `hooks.progress`. With `src/pause/progress.ts` gone, the whole `handleWorkDoneProgress` entry (`src/server.ts:226-234`), `ClientHooks.progress` (`:43-45`), the `ProgressValue` import (`:9`) and `hooks.progress = …` (`src/extension.ts:253`) go. The library's status-bar progress is then untouched.
6. **Check 5 (`applyServerEdit`).** It already handles `documentChanges` with `CreateFile` + `TextDocumentEdit`. A created file not yet open is opened and saved. No change is needed.
7. **Check 6 (doctor).** `olifant doctor` crashes on main with a `claude` backend: `Doctor.hs:235` has no `Claude` case (`Non-exhaustive patterns in case`, reproduced). Task 1 fixes it with the backend's own probe.
8. **Check 7 (release text).** `releaseText.test.ts` accepts the sha anywhere in `CHANGELOG.md` (a plain `includes`). The new sha goes into `## Unreleased`; the old `48f38ab` line in `## 0.1.0` stays as history.
9. **Spec corrections.**
   - The init-options parser is `src/Olifant/Lsp.hs:244`, not `Server/Lsp.hs`.
   - The after-run is marked with `Tests.show(run, false)` (`src/tdd/tests.ts:98`), not `test.mark`.
   - `src/settings.ts` names no sha. `test/planTokens.ts:4` does, and the spec missed it.
   - `put`, `fit`, `span`, `diffTitle`, `diffLines` are private in `src/pause/reviewModel.ts`. Task 3 exports them; `stepModel.ts` imports them. `wrapped` is not needed.
   - nvim's `step_spec.lua` has eleven cases, not nine. Ten port as unit tests. The eleventh ("with no server, a key says so") is the controller's server check and is not unit-testable here.
   - nvim prints the seconds with one decimal (`4.2 s`). This plan does the same.
   - nvim's diff pane shows the line `the step changes no file` under the title `no change`. This plan does the same.
   - Spec §3.7 drops `PAGE_KEYS` `0-9`. The reconcile review uses `1-9`, so only `0` goes, with `c s w x C P T W`.
   - Spec §3.1 titles the command "Plan: answer this". Every command title is title case, so it is `Plan: Answer This`.
   - Spec §3.5 says a failed `h` keeps the step. An `h` answered with `this step is gone …` or `the file changed since the step was shown …` cannot keep it (the server has dropped the token), so those two close and forget as any answer's error does. Every other failed `h` keeps the step and says why in the footer.
   - The spec's `test/fixtures/step/` README provenance is kept. The fixtures are wrapped `{ "shown": … }` as the server answers.
10. **Real e2e probe.** The existing real suite was run against olifant `0f8a5c1` twice: once with the old `pass_cost = 0` sandbox, once with Task 2's new one (`[decide]` Jev, `check_model = "sonnet"`, `[inspect]` on, recorded decide and inspect answers). Both runs had 22 passing, 2 pending (the model-gated conjure and ask) and none failing, so the pin and the config break no existing real test. The suite does not record `window/showMessage`, so a silent error notice from inspect or the claim pass would not show; run with `DURANDAL_E2E_TRACE=messages` if a real test misbehaves. Details: `plan-facts/real-e2e-probe.md`.

## Branches, PR, models and hours

- **Olifant (Task 1)** takes no GitHub PRs. A branch is merged locally in the main checkout (`~/projects/olifant`) with `--no-ff` and pushed to `origin main`. The full suite runs only in the main checkout, never in a worktree (olifant's `CLAUDE.md`).
- **The extension (Tasks 2-6)** works on one branch, `m9`, from `main`, with one PR. No release, tag or version bump: `package.json` stays `0.1.1`.
- **Approving this plan authorizes** the executor to merge and push Task 1's olifant branch to olifant `main`, push `m9` and open its PR. The executor never merges the extension PR.
- **Models:**
  - Task 1: Sonnet.
  - Task 2: Opus (protocol-sensitive).
  - Task 3: Opus.
  - Task 4: Opus.
  - Task 5: Sonnet, with an Opus review.
  - Task 6: Sonnet for the docs.
  - Scoped reviews after Tasks 1-4: Sonnet. After Task 5: Opus.
  - The whole-branch review before the PR: **Fable** (the step window applies server edits to the person's files).
- **Working hours:** no agent work 9am-5pm America/New_York on weekdays. Run every e2e and every cabal suite in the foreground under a timeout. macOS has no `timeout`: use `perl -e 'alarm 1500; exec @ARGV' npm run test:e2e`.

**Running tests (extension):**

```bash
npm run lint                                    # tsc for src and webview, then eslint
npm run test:unit                               # tsc -p . then node --test over out/test/unit
npx tsc -p . && node --test out/test/unit/stepModel.test.js   # one unit file
OLIFANT_REPO=~/projects/olifant-pin npm run test:unit         # the scans against the pin
DURANDAL_E2E_ONLY=fake.12 npm run test:e2e                     # one fake e2e file (stable)
VSCODE_VERSION=1.91.0 DURANDAL_E2E_ONLY=fake.12 npm run test:e2e   # the oldest supported
OLIFANT_BIN=$(cd ~/projects/olifant-pin && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-pin DURANDAL_E2E_ONLY=real npm run test:e2e
```

`~/projects/olifant-pin` is a detached worktree of olifant at the new pin, made in Task 2 Step 1 and removed in Task 6. It is read and built only; the olifant suite never runs there.

## Global Constraints

- The pin is an olifant `main` commit at or after the footer-keys merge (spec §7). `.olifant-ref` holds its full 40-character sha.
- No release: `package.json` stays `0.1.1`; nothing is tagged (spec §0.A.3).
- Parity with durandal.nvim at `770834e`, nothing ahead of it (spec §0.A.1). Inspect's four actions and the doctor row get command routing only.
- `src/pause/`, `PausePanel` and `PauseApi` keep their names; prose says "the review window" (spec §0.B.8).
- The do, errand and reconcile reviews are untouched; their unit and e2e tests stay green after every task (spec §3.7).
- Settings are removed, not deprecated: `durandal.plans.reviewAnswers` goes (spec §0.B.12).
- No client-side conjure state beyond one held step per document; nothing reads `.olifant/state/conjure-steps.jsonl` (spec §0.B.5).
- Words, exactly (spec §3.3-§3.5):
  - `conjured · <goal> · <saved word>`, with `the step` for a null goal and `nothing changed` for null edits. The saved word comes from `savedWord` (`saved`, `N files saved`, `unsaved`, `N files unsaved`, `N saved, M unsaved`). Always info.
  - `step rejected · nothing landed` (info).
  - `conjure: an answer olifant does not give` (error).
  - `conjure cancelled · nothing landed` (info).
  - `no step to accept: h asks the harder writer, d shows the reply`.
  - `no harder writer: name one with [conjure] harder`.
  - `the last answer is still on its way`.
  - `landing…` / `rejecting…` / `asking the harder writer…`.
  - `ask: nothing to answer here (checked already? hover reads it)` (info).
- `initializationOptions.keys` = `{ plan_review: 'Ctrl+Alt+D P R', plan_keep: 'Ctrl+Alt+D P K', definition: 'F12' }`.
- Every source file keeps the repo's comment style: a comment says what a thing is or why, in plain sentences.

## Review Focus

1. **A step whose edit spells the document's uri differently** (the server's `file:///…%3A…` against VS Code's spelling). The person expects `c` on the step's lines to reopen it. → Task 3, `stepStore.test.ts` "a uri spelled differently still finds the lines".
2. **A step whose edits touch only the test file.** The person expects `q` then `c` in the module to ask afresh, not reopen a step it cannot place. → Task 3, `stepStore.test.ts` "edits elsewhere only: no lines, never reopens".
3. **A restart while an answer is in the air.** The person expects the window closed, nothing landed and no error notice. → Task 5, `fake.12-step` "a restart while an answer is out".
4. **An accept into a document with unsaved edits from before the conjure.** The person expects the step to land and the file to stay unsaved: `conjured · fill f · unsaved`. → Task 5, `fake.12-step` "an accept into a file with unsaved edits".
5. **A second `a`, `r` or `h` while the first answer is out.** The person expects one request and `the last answer is still on its way`. → Task 3 unit (`stepRefusal`), and Task 5 e2e "busy".

---

### Task 1: olifant names the editor's keys in the hover footer; doctor knows a `claude` backend

**Repo:** `~/projects/olifant` (the main checkout). **Model:** Sonnet.

**Files:**
- Modify: `src/Olifant/Server/Plans.hs` (exports `:20-27`; `claimHover` `:277-283`; `keepFooter` `:338-341`)
- Modify: `src/Olifant/Lsp.hs` (import `:81`; `planHover` `:1762-1770`)
- Modify: `src/Olifant/Doctor.hs` (`modelCheck`, before the `Jev` case near `:245`)
- Test: `src/Olifant/Server/PlansSpec.hs`, `src/Olifant/LspSpec.hs`, `src/Olifant/DoctorSpec.hs`
- Modify: `book/user/16-the-language-server.md` (`:37-44`), `book/user/19-plans.md` (`:487-492`), `book/internals/03-plans.md` (`:511-513`), and the doctor chapter that lists the model row (find it with `grep -rn "via Anthropic" book/`)

**Interfaces:**
- Produces (olifant): `data FooterKeys = FooterKeys {fkDefinition :: Text, fkKeep :: Text}`, `defaultFooterKeys`, `claimHoverWith :: FooterKeys -> ClaimStore -> S.Set Text -> [Sentence] -> Maybe Text`; `keepFooter, keepAnswerFooter :: FooterKeys -> Text`. The server reads `initializationOptions.keys.definition` (default `gd`) and `keys.plan_keep` (default `<leader>mpk`).
- Produces (for Task 2): the merge commit's full sha, written to the task report as `OLIFANT_SHA`.

The whole patch was compiled and its specs run at plan time; it is in `~/projects/notes/vscode-port/m9/plan-facts/olifant-proposed.diff`. The steps below give it in full.

- [ ] **Step 1: Start from a clean main and record the suite's baseline**

```bash
cd ~/projects/olifant
git status -sb          # must print "## main...origin/main" and nothing else
git pull --ff-only
perl -e 'alarm 1800; exec @ARGV' cabal test spec 2>&1 | tail -30
```

If the checkout is not on `main` or is dirty, another session is working there: stop and report BLOCKED. Write down every failing example of the baseline run. At plan time one failed on a clean main, `ServerSpec.hs:560` "the equivalent one dim and last" (mutate), possibly environmental; the end of this task compares against this list.

- [ ] **Step 2: Branch and write the failing specs**

```bash
git checkout -b footer-keys
```

In `src/Olifant/Server/PlansSpec.hs`, after the case that ends with `claimHover (M.fromList [("Queued one.", queuedEntry)]) S.empty (ss ["Queued one."]) \`shouldBe\` Just "Unchecked · Check this, or Check the plan"` (near `:301`), add:

```haskell
    it "the footer names the client's keys: definition and keep, verdict or answer" $ do
      let ss = sentences . parsePlan . T.unlines
          keys = FooterKeys "F12" "Ctrl+Alt+D P K"
      claimHoverWith keys (M.fromList [("Right one.", verdictEntry JRight "it returns 1")]) S.empty (ss ["Right one."])
        `shouldBe` Just "Right · it returns 1 · src/a.py:Foo\n\nF12: the code · Keep this verdict: Ctrl+Alt+D P K"
```

In `src/Olifant/LspSpec.hs`, in `claimPassSpec`, after test "(b) checked wrong: …" (ends near `:3541`) and before "(f) the actions", add:

```haskell
  it "(b2) the hover footer names the keys the client gave (keys.definition, keys.plan_keep); with none, gd and <leader>mpk" $
    withPass wrong $ \ports dir _ cfg -> do
      let footerOf h = fmap (\x -> case x ^. L.contents of InL (MarkupContent _ md) -> last (T.lines md); _ -> "") h
          checkedHover cfg' = fst <$> inProcessWithConfig cfg' ports dir (do
            p <- openWritten dir
            sendNotification SMethod_TextDocumentDidSave (DidSaveTextDocumentParams p Nothing)
            _ <- waitFor (maybe False (isJust . seCheck) . M.lookup "the helper returns one" <$> readClaims plainPorts dir "plans/t.md")
            getHover p (Position 0 4))
      custom <- checkedHover (("keys", object ["definition" .= ("F12" :: Text), "plan_keep" .= ("Ctrl+Alt+D P K" :: Text)]) : cfg)
      footerOf custom `shouldBe` Just "F12: the code · Keep this verdict: Ctrl+Alt+D P K"
      -- a client naming only one key keeps the other's default
      half <- checkedHover (("keys", object ["plan_keep" .= ("<leader>k" :: Text)]) : cfg)
      footerOf half `shouldBe` Just "gd: the code · Keep this verdict: <leader>k"
```

In `src/Olifant/DoctorSpec.hs`, before the case "(c) a check run through `env VAR=… uv …` …" (near `:79`), add:

```haskell
  it "(e2) claude: probed for its runner; ok when found, a warning with the install hint when not" $ do
    let viaClaude = defaultModelConfig {mcDefault = Just "sonnet", mcBackends = [("sonnet", Claude "sonnet" "claude")]}
        row probe = [(checkStatus c, checkDetail c, checkFix c) | c <- runIdentity (doctor (ports ["ast-grep", "cargo"] probe []) (input viaClaude)), checkName c == "model"]
    row (Right ()) `shouldBe` [(Ok, "sonnet via Claude Code (`claude`)", Nothing)]
    row (Left "claude is not installed") `shouldBe` [(Warn, "claude is not installed: holes stay placeholders", Just "install Claude Code, or set `runner = \"…\"` on the backend")]
```

- [ ] **Step 3: Run the new specs and see them fail**

```bash
perl -e 'alarm 900; exec @ARGV' cabal test spec --test-show-details=direct --test-options='-m "(b2) the hover footer" -m "the footer names the client" -m "(e2) claude"'
```

Expected: the build fails (`FooterKeys` and `claimHoverWith` not in scope). The doctor case alone would fail with `Non-exhaustive patterns in case`.

- [ ] **Step 4: Implement**

`src/Olifant/Server/Plans.hs`: add to the export list, after `countsText`:

```haskell
  , FooterKeys (..)
  , defaultFooterKeys
  , claimHoverWith
```

Replace `claimHover` (`:277-283`) with:

```haskell
claimHover :: ClaimStore -> S.Set Text -> [Sentence] -> Maybe Text
claimHover = claimHoverWith defaultFooterKeys

-- | 'claimHover' with the editor's keys named in its footer.
claimHoverWith :: FooterKeys -> ClaimStore -> S.Set Text -> [Sentence] -> Maybe Text
claimHoverWith keys store stale ss = case [if code `elem` hoverOnly then msg else T.drop 2 msg | x <- ss, Just (code, _, msg) <- [claimLine True store S.empty stale x]] of
  [] -> Nothing
  ls -> Just (T.intercalate "\n\n" (ls ++ [footer | not (null checks)]))
  where
    checks = [c | x <- ss, Just c <- [M.lookup (sentenceKey (snText x)) store >>= seCheck]]
    footer = (if all ((== JAnswered) . cfJudgement . cjConfirmed) checks then keepAnswerFooter else keepFooter) keys
```

Replace the `keepFooter` block (`:338-341`) with:

```haskell
-- | The editor's keys a hover's last line names: *go to definition* and
-- *Keep this verdict* (`keys.definition`, `keys.plan_keep`).
data FooterKeys = FooterKeys {fkDefinition :: Text, fkKeep :: Text}
  deriving stock (Eq, Show)

-- | durandal.nvim's keys, for a client that names none.
defaultFooterKeys :: FooterKeys
defaultFooterKeys = FooterKeys "gd" "<leader>mpk"

-- | The last line of a checked sentence's hover, with the client's keys
-- (nvim's by default).
keepFooter, keepAnswerFooter :: FooterKeys -> Text
keepFooter k = fkDefinition k <> ": the code \183 Keep this verdict: " <> fkKeep k
keepAnswerFooter k = fkDefinition k <> ": the code \183 Keep this answer: " <> fkKeep k
```

`src/Olifant/Lsp.hs`: in the `Olifant.Server.Plans` import (`:81`) replace `claimHover` with `claimHoverWith` and add `FooterKeys (..)`. In `planHover` replace the off-an-anchor branch's first lines (`:1765-1769`) with:

```haskell
      (store, ss, stale, keys) <- readMVar (envState env) >>= \s -> do
        store <- claimsOf s (prRoot project) path
        (store,,,scKeys (ssConfig s)) <$> sentencesOf s (prRoot project) path (parsePlan text) <*> staleIn s project store
      let row = fromIntegral l
          key name d = fromMaybe d (lookup name keys)
          footerKeys = FooterKeys (key "definition" "gd") (key "plan_keep" "<leader>mpk")
      pure $ case claimHoverWith footerKeys store stale [x | x <- openSentences (parsePlan text) ss, snRow x <= row, row <= snEndRow x] of
```

(the two lines after it, `Just md -> …` and `Nothing -> Nothing`, stay).

`src/Olifant/Doctor.hs`: in the model row's `case`, before `Just (Jev m keyEnv) ->`, add:

```haskell
        Just b@(Claude m runner) ->
          dpProbe ports b >>= \case
            Right () -> pure (Check "model" Ok (m <> " via Claude Code (`" <> runner <> "`)") Nothing)
            Left why -> pure (Check "model" Warn (why <> ": holes stay placeholders") (Just "install Claude Code, or set `runner = \"…\"` on the backend"))
```

- [ ] **Step 5: Run the new specs and see them pass**

Run the Step 3 command. Expected: the three examples pass.

- [ ] **Step 6: The books**

`book/user/16-the-language-server.md`, the `initializationOptions` table (`:39-44`): add this row after `debug`:

```markdown
| `keys` | none | the editor's key names, an object of strings: `plan_review` (named in the plan's lenses), and `definition` (default `gd`) and `plan_keep` (default `<leader>mpk`), named in a checked sentence's hover footer |
```

`book/user/19-plans.md:487-492`: replace the sentence "when one is checked it ends with `gd: the code · Keep this verdict: <leader>mpk` (`Keep this answer` when every check on the row is an answer) (the server does not know your key: it names durandal.nvim's default)." with:

```markdown
when one is checked it ends with `gd: the code · Keep this verdict: <leader>mpk` (`Keep this answer`
when every check on the row is an answer), naming the keys your editor gave in
`initializationOptions.keys` (`definition`, `plan_keep`); an editor that names none gets
durandal.nvim's `gd` and `<leader>mpk`.
```

Keep the line breaks of the surrounding paragraph as they are; only the sentence changes.

`book/internals/03-plans.md:511-513`: where it says `claimHover` adds `keepFooter` or `keepAnswerFooter`, say instead that `claimHoverWith` adds `keepFooter` or `keepAnswerFooter` with the client's `FooterKeys` (`planHover` in `Lsp.hs` builds them from `scKeys`, defaulting to `defaultFooterKeys`), and that `claimHover` is `claimHoverWith defaultFooterKeys`.

The doctor chapter (`grep -rn "via Anthropic" book/`): beside the Anthropic sentence of the model row, add one for a `claude` backend: "`kind = \"claude\"`: ok as `<model> via Claude Code (\`claude\`)` when the runner is on `PATH`; otherwise a warning, `<runner> is not installed: holes stay placeholders`, with the hint to install Claude Code or set `runner`."

- [ ] **Step 7: Full suite, same failures as the baseline**

```bash
perl -e 'alarm 1800; exec @ARGV' cabal test spec 2>&1 | tail -30
```

Expected: every failure is one from Step 1's list; no new one. A new failure: fix it before going on.

- [ ] **Step 8: Commit, merge, push**

```bash
git add -A src book
git commit -m "feat(lsp): the hover footer names the editor's keys (keys.definition, keys.plan_keep); doctor probes a claude backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
git checkout main
git pull --ff-only
git merge --no-ff footer-keys -m "Merge branch 'footer-keys': the hover footer names the editor's keys; doctor knows a claude backend"
git push origin main
git branch -d footer-keys
git rev-parse HEAD
```

Write the printed sha in the task report as `OLIFANT_SHA`. If `git pull` brought new commits, check them as plan-time finding 1 did (`git log --stat <old>..origin/main`, no change to `Lsp.hs` method or command tables, `stepJson`, or init options); a change there: stop and report.

---

### Task 2: the pin bump and the breaks it causes

**Repo:** `~/projects/durandal-vscode`, branch `m9`. **Model:** Opus.

**Files:**
- Modify: `.olifant-ref`, `README.md:27`, `CHANGELOG.md` (`## Unreleased`)
- Modify: `src/protocol.ts` (`SERVER_COMMANDS` `:293-302`, comments `:175-178`, `:263`, `:320-321`)
- Modify: `src/settings.ts` (`InitOptions`, `initOptions`)
- Modify: `src/plans/blocks.ts:7`, `src/plans/words.ts:9`, `src/plans/settings.ts:6,34-35`, `src/plans/verbs.ts` (`:48`, `:88`, `:187-206`, `writeBlocks`), `src/plans/sourceActions.ts` (new `pickTitled`), `src/plans/actions.ts` (`runTitled`, the `durandal.plan.ask` handler), `src/commandTable.ts:16`, `package.json` (`:149-153`, `:274-278`)
- Modify: `test/fake-lsp/fake-lsp` (header `:8-9`, `initialize` `:63`), `test/planTokens.ts:4`, `test/e2e/run.ts` (`real()`)
- Test: `test/unit/protocol.test.ts`, `settings.test.ts`, `words.test.ts`, `plansSettings.test.ts`, `manifest.test.ts`, `blocks.test.ts`, `ghosts.test.ts`, `sourceActions.test.ts`; `test/e2e/fake.15-verbs.e2e.ts`, `fake.16-loop.e2e.ts`, `real.9-plans.e2e.ts`

**Interfaces:**
- Consumes: `OLIFANT_SHA` (Task 1).
- Produces:
  - `SERVER_COMMANDS` with eight entries: `doctor, checkSentence, answerSentence, checkPlan, showWhy, showCode, inspectShowWhy, inspectDismiss`.
  - `InitOptions.keys: { plan_review: string; plan_keep: string; definition: string }`; `InitOptions.step_replies?`, `decide_answers?`, `inspect_answers?: string` (from `DURANDAL_STEP_REPLIES`, `DURANDAL_DECIDE_ANSWERS`, `DURANDAL_INSPECT_ANSWERS`).
  - `type Verb = 'validate' | 'do'` in `src/plans/blocks.ts`.
  - `pickTitled(xs: unknown, prefixes: readonly string[], o?: { exact?: boolean; needsEdit?: boolean }): CodeAction | undefined` in `src/plans/sourceActions.ts`.
  - `PlanActions.runTitled(prefixes: readonly string[], none: string, o?: { exact?: boolean; needsEdit?: boolean }): Promise<void>` in `src/plans/actions.ts`.
  - `ASK_NONE` in `src/plans/words.ts`.
  - The real sandbox's env: `DURANDAL_STEP_REPLIES` (a plain-text file the real tests rewrite), `DURANDAL_DECIDE_ANSWERS`, `DURANDAL_INSPECT_ANSWERS`.

- [ ] **Step 1: Branch, the pin, an olifant worktree at the pin**

```bash
cd ~/projects/durandal-vscode
git checkout main && git pull --ff-only && git checkout -b m9
printf '%s\n' "$OLIFANT_SHA" > .olifant-ref
git -C ~/projects/olifant fetch -q origin
git -C ~/projects/olifant worktree add --detach ~/projects/olifant-pin "$OLIFANT_SHA"
(cd ~/projects/olifant-pin && perl -e 'alarm 900; exec @ARGV' cabal build exe:olifant)
```

- [ ] **Step 2: Write the failing unit tests**

`test/unit/protocol.test.ts`, test "the commands and the plan legend": replace the `SERVER_COMMANDS` assertion with

```ts
  assert.deepEqual(SERVER_COMMANDS, {
    doctor: 'olifant.doctor', checkSentence: 'olifant.checkSentence', answerSentence: 'olifant.answerSentence',
    checkPlan: 'olifant.checkPlan', showWhy: 'olifant.showWhy', showCode: 'olifant.showCode',
    inspectShowWhy: 'olifant.inspectShowWhy', inspectDismiss: 'olifant.inspectDismiss',
  });
```

In `TDD_KEYS` delete exactly `stopped`, `diagnosis`, `expires`, `checker`, `wired`, `flipped`, `proposal`, `arg`, `land` (the server no longer sends them; the client stops reading them in Task 4).

`test/unit/settings.test.ts`: replace the test "initializationOptions: …" and add one:

```ts
test('initializationOptions: debug off, the review, keep and definition keys, the debounce; model and fills only when set', () => {
  const keys = { plan_review: 'Ctrl+Alt+D P R', plan_keep: 'Ctrl+Alt+D P K', definition: 'F12' };
  assert.deepEqual(initOptions({ debounceMs: 300, model: '', fills: '' }, 'linux', {}),
    { debug: false, keys, debounce_ms: 300 });
  assert.deepEqual(initOptions({ debounceMs: 50, model: 'qwen', fills: '/f.toml' }, 'darwin', {}),
    { debug: false, keys, debounce_ms: 50, model: 'qwen', fills: '/f.toml' });
});

test('step_replies, decide_answers and inspect_answers pass olifant\'s test hooks through from the environment, only when set', () => {
  const s = settingsFrom(getter({}));
  const none = initOptions(s, 'linux', {});
  assert.deepEqual([none.step_replies, none.decide_answers, none.inspect_answers], [undefined, undefined, undefined]);
  const o = initOptions(s, 'linux', { DURANDAL_STEP_REPLIES: '/t/steps.txt', DURANDAL_DECIDE_ANSWERS: '/t/decide.json', DURANDAL_INSPECT_ANSWERS: '/t/inspect.json' });
  assert.deepEqual([o.step_replies, o.decide_answers, o.inspect_answers], ['/t/steps.txt', '/t/decide.json', '/t/inspect.json']);
});
```

`test/unit/words.test.ts`: line 9 becomes `assert.equal(landedWord('validate', 2, { dropped: 1, unresolved: 0, seconds: 9.1, cost: 0.0123 }), 'validate: 2 lines · 1 not found · 9.1 s · $0.0123');`; line 12 becomes `assert.deepEqual(PENDING, { validate: ' ⋯ validating', do: ' ⋯ doing' });`. Add `ASK_NONE` to the import and:

```ts
test('P Q with nothing to answer says so', () => {
  assert.equal(ASK_NONE, 'ask: nothing to answer here (checked already? hover reads it)');
});
```

`test/unit/plansSettings.test.ts`: delete every `reviewAnswers` expectation (`:9` default and the boolean-only test at `:42-45`); add `assert.ok(!('reviewAnswers' in plansOptionsFrom(() => undefined)));` to the defaults test.

`test/unit/manifest.test.ts`: drop `durandal.plans.reviewAnswers` from the configuration list (`:63`) and delete its boolean test (`:205-207`). In the test "M6b: ask, validate, do and cancel are built …" add `assert.equal(BUILT['durandal.plan.ask'].title, 'Plan: Answer This');`.

`test/unit/blocks.test.ts` (`:54, 65, 73, 91-93`) and `test/unit/ghosts.test.ts` (`:15-17`): pass `'validate'` where they pass `'ask'` (only `'do'` is special in `replaces`, so the expectations do not change).

`test/unit/sourceActions.test.ts`: add

```ts
test('pickTitled: the first code action whose title starts with a prefix; bare Commands and edit-less ones skipped when asked', () => {
  const cmd = (title: string) => ({ title, kind: '', command: { title, command: 'olifant.x', arguments: [] } });
  const xs = [
    { title: 'Answer this (bare)', command: 'olifant.answerSentence', arguments: [] },
    cmd('Check this (sonnet, ~$0.10)'),
    cmd('Answer this (sonnet, ~$0.12)'),
    { title: 'Keep this verdict', kind: 'quickfix', edit: { changes: {} } },
  ];
  assert.equal(pickTitled(xs, ['Answer this'])?.title, 'Answer this (sonnet, ~$0.12)');
  assert.equal(pickTitled(xs, ['Nope']), undefined);
  assert.equal(pickTitled(xs, ['Check this'], { exact: true }), undefined);
  assert.equal(pickTitled(xs, ['Keep this verdict'], { exact: true, needsEdit: true })?.kind, 'quickfix');
  assert.equal(pickTitled(xs, ['Answer this'], { needsEdit: true }), undefined);
  assert.equal(pickTitled(null, ['Answer this']), undefined);
});
```

(import `pickTitled` from `../../src/plans/sourceActions`.)

- [ ] **Step 3: Run the unit tests and see them fail**

```bash
npm run test:unit 2>&1 | tail -30
```

Expected: tsc fails: `pickTitled` and `ASK_NONE` are not exported, and `step_replies`, `decide_answers`, `inspect_answers` are not on `InitOptions`. Fix nothing yet.

- [ ] **Step 4: Implement the protocol, settings and fake changes**

`src/protocol.ts`:
- Replace `SERVER_COMMANDS` and its comment (`:293-302`) with:

```ts
// The server's own commands (workspace/executeCommand, Lsp.hs:204 at the pin); the library
// registers them from the server's executeCommandProvider. They are code actions' commands
// (the claim pass's, inspect's) and the doctor: the lightbulb and the chord-a menu run them on
// the server (actions/command.ts), showWhy, showCode and inspectShowWhy answer with
// window/showDocument.
export const SERVER_COMMANDS = {
  doctor: 'olifant.doctor',
  checkSentence: 'olifant.checkSentence',
  answerSentence: 'olifant.answerSentence',
  checkPlan: 'olifant.checkPlan',
  showWhy: 'olifant.showWhy',
  showCode: 'olifant.showCode',
  inspectShowWhy: 'olifant.inspectShowWhy',
  inspectDismiss: 'olifant.inspectDismiss',
} as const;
```

- `:263` becomes `  // served, not called: P Q runs the server's Answer this code action (plans/actions.ts)` above the unchanged `plansAsk` line.
- The comment at `:175-178` starts `// plans/validate, do (and plans/ask, served but not called) (Lsp.hs errandJson): …` keeping the rest of its text.
- `:320-321` becomes `// At the pin: checked and wrong mark a bare line's text by its stored check; resolved is no` / `// longer given and stays for older clients.`

`src/settings.ts`: replace `InitOptions` and `initOptions` (`:21-38`) with:

```ts
export interface InitOptions {
  debug: false;
  // the keys the server names: plan_review in its lenses, plan_keep and definition in a
  // checked sentence's hover footer
  keys: { plan_review: string; plan_keep: string; definition: string };
  debounce_ms: number;
  model?: string;
  fills?: string;
  check_answers?: string;
  step_replies?: string;
  decide_answers?: string;
  inspect_answers?: string;
}

// env: the extension host's environment. The DURANDAL_*_ANSWERS and DURANDAL_STEP_REPLIES
// variables are olifant's test hooks (recorded claim checks, decisions, inspect finds, and the
// text every conjure writer answers); only the real e2e sets them.
export function initOptions(s: Settings, platform: string, env: NodeJS.ProcessEnv = process.env): InitOptions {
  const o: InitOptions = {
    debug: false,
    keys: { plan_review: chordLabel(platform, 'P R'), plan_keep: chordLabel(platform, 'P K'), definition: 'F12' },
    debounce_ms: s.debounceMs,
  };
  if (s.model) o.model = s.model;
  if (s.fills) o.fills = s.fills;
  if (env.DURANDAL_CHECK_ANSWERS) o.check_answers = env.DURANDAL_CHECK_ANSWERS;
  if (env.DURANDAL_STEP_REPLIES) o.step_replies = env.DURANDAL_STEP_REPLIES;
  if (env.DURANDAL_DECIDE_ANSWERS) o.decide_answers = env.DURANDAL_DECIDE_ANSWERS;
  if (env.DURANDAL_INSPECT_ANSWERS) o.inspect_answers = env.DURANDAL_INSPECT_ANSWERS;
  return o;
}
```

`test/fake-lsp/fake-lsp`: in the header (`:8-9`) replace `olifant 48f38ab's six` with `the pinned olifant's six` and `olifant 48f38ab's four commands` with `the pinned olifant's eight commands`. In the `initialize` reply (`:63`) replace the `executeCommandProvider` list with `["olifant.doctor", "olifant.checkSentence", "olifant.answerSentence", "olifant.checkPlan", "olifant.showWhy", "olifant.showCode", "olifant.inspectShowWhy", "olifant.inspectDismiss"]`.

`test/planTokens.ts:4`: replace `olifant 48f38ab` with `the pinned olifant`.

`README.md:27`: replace `48f38ab` with the first 7 characters of `OLIFANT_SHA`. `CHANGELOG.md`: under `## Unreleased` add

```markdown
- Tested against olifant `<first 7 of OLIFANT_SHA>` (the commit in `.olifant-ref`).
```

- [ ] **Step 5: Implement the `ask` removal and `P Q`**

`src/plans/blocks.ts:7`: `export type Verb = 'validate' | 'do';`

`src/plans/words.ts`: `PENDING` becomes `{ validate: ' ⋯ validating', do: ' ⋯ doing' }`. Add after `NOTHING_RUNNING`:

```ts
// P Q at a sentence the server offers no Answer this for
export const ASK_NONE = 'ask: nothing to answer here (checked already? hover reads it)';
```

`src/plans/settings.ts`: drop `reviewAnswers` from `PlansOptions` and its two lines in `plansOptionsFrom` (`:34-35`).

`src/plans/verbs.ts`:
- `REQUEST` (`:48`) becomes `{ validate: Olifant.plansValidate, do: Olifant.plansDo } as const`.
- Delete the `durandal.plan.ask` registration (`:88`); `PlanActions` registers it now.
- In `land` (`:166-207`) delete the `straight` constant and its branch, so the non-straight path is the only one:

```ts
    const placed = placeBlocks(withFacts, r.blocks, e.verb, e.request, tracked);
    // the facts now; the blocks become ghosts, placed on the plan as the facts left it
    if (!(await writeLines(doc, lines, withFacts))) {
      void this.d.say('error', NOT_APPLIED);
      return;
    }
    const rows = placed.map(p => p.row);
    const count = placed.reduce((k, p) => k + p.lines.length, 0);
    void this.d.say('info', landedWord(e.verb, count, r));
    this.flashRow(doc, rows.at(-1) ?? tracked);
    if (e.verb === 'do') this.d.landed.fire('do');
    if (placed.length > 0) this.hold(e.uri, e.verb, placed, typeof r.id === 'string' ? r.id : undefined);
```

- Delete `writeBlocks` (its only caller was the straight branch) and any import only it used; fix the comments at `:54-57`, `:302`, `:357-358` that mention ask so they name validate and do only.

`src/plans/sourceActions.ts`: add (beside `sources`):

```ts
// pickTitled: the first code action (not a bare Command) whose title starts with one of
// PREFIXES, tried in order; exact: the title is the prefix; needsEdit: it carries its edit.
// The plan chords that run the server's own actions by name (P Q's Answer this; M10's P S,
// P shift+S, P K) pick with it.
export function pickTitled(xs: unknown, prefixes: readonly string[], o: { exact?: boolean; needsEdit?: boolean } = {}): CodeAction | undefined {
  if (!Array.isArray(xs)) return undefined;
  const actions = xs.filter((x): x is CodeAction =>
    !!x && typeof x === 'object' && typeof (x as { title?: unknown }).title === 'string' && typeof (x as { command?: unknown }).command !== 'string');
  for (const p of prefixes) {
    const a = actions.find(x => (o.exact ? x.title === p : x.title.startsWith(p)) && (!o.needsEdit || x.edit !== undefined));
    if (a) return a;
  }
  return undefined;
}
```

`src/plans/actions.ts`: import `ExecuteCommandRequest` from `vscode-languageserver-protocol` (beside `CodeAction`), `errorMessage` from `../errors`, `pickTitled` from `./sourceActions`, `ASK_NONE` from `./words`. Register in `register` (beside the other three):

```ts
      vscode.commands.registerCommand('durandal.plan.ask', () => this.runTitled(['Answer this'], ASK_NONE)),
```

and add the method:

```ts
  // runTitled: the server's own code action at the cursor whose title starts with one of
  // PREFIXES (pickTitled), run: its edit applied, or its command run on the server with its
  // arguments verbatim. None: NONE, as info. A refusal (a ResponseError) is said as info too:
  // the server's sentence is an answer, not a fault (spec §3.1).
  async runTitled(prefixes: readonly string[], none: string, o: { exact?: boolean; needsEdit?: boolean } = {}): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    // the cursor's point, its column in UTF-16 code units (VS Code's and LSP's both)
    const at = { line: h.editor.selection.active.line, character: h.editor.selection.active.character };
    let xs: unknown;
    try {
      xs = await this.d.server.request(Lsp.codeAction, { textDocument: { uri: h.uri }, range: { start: at, end: at }, context: { diagnostics: [] } });
    } catch (err) {
      if (this.d.server.client() === h.lc) void this.d.say('info', errorMessage(err));
      return;
    }
    if (this.d.server.client() !== h.lc) return;
    const a = pickTitled(xs, prefixes, o);
    if (!a) {
      void this.d.say('info', none);
      return;
    }
    if (a.edit) {
      await this.apply(a);
      return;
    }
    if (!a.command) {
      void this.d.say('info', none);
      return;
    }
    try {
      await this.d.server.request(ExecuteCommandRequest.type, { command: a.command.command, arguments: a.command.arguments ?? [] });
    } catch (err) {
      if (this.d.server.client() === h.lc) void this.d.say('info', errorMessage(err));
    }
  }
```

`src/commandTable.ts:16`: `'durandal.plan.ask': { title: 'Plan: Answer This' },`. `package.json`: the command contribution (`:274-278`) gets `"title": "Plan: Answer This"`; delete the `durandal.plans.reviewAnswers` setting (`:149-153`). The `p q` keybinding stays.

- [ ] **Step 6: Run the unit tests and see them pass**

```bash
npm run lint && OLIFANT_REPO=~/projects/olifant-pin npm run test:unit 2>&1 | tail -30
```

Expected: lint clean; every unit test passes, the OLIFANT_REPO scans included (methods 33, commands 8 + 4, legend, `KEYS`, `TDD_KEYS`). `releaseText` passes once README and CHANGELOG carry the new short sha.

- [ ] **Step 7: The fake e2e for P Q, the routing, and the verbs without ask**

`test/e2e/fake.15-verbs.e2e.ts`:
- In `REPLIES` replace `'olifant/plans/ask'` with `'workspace/executeCommand'`.
- Delete the tests "an ask goes straight in …" (`:67-93`) and "with reviewAnswers an ask leaves a ghost …" (`:489-510`).
- "a RequestFailed shows the reason …" (`:95-105`): use `olifant/plans/validate` and `durandal.plan.validate`; the empty answer says `validate: nothing came back`.
- "typing above the row …" (`:131-145`): use validate (`verb: 'validate'`, `durandal.plan.validate`, `running` reports `{ row: 4, verb: 'validate' }`). A validate's block becomes a ghost, so replace the last assertion with:

```ts
    assert.deepEqual(lines().slice(0, 6), ['typed', '# T', '- a', '- b', '- c', '- d']);
    assert.deepEqual(a.planVerbs.ghosts(uriOf(PLAN)).map(g => [g.row, g.lines]), [[4, ['  - so']]]);
```

- "a plan closed … before the answer: the ask is cancelled …" (`:147-167`): use validate throughout (title words "the validate is cancelled").
- The `for (const verb of ['ask', 'validate'])` loop (`:169-188`): keep only the validate case (no loop; the held reply's title is `'validating'`).
- "a plan closed with a do and an ask in the air …" (`:190-214`): use validate for the second verb (`reply('olifant/plans/validate', { hold: true, title: 'validating' })`, `durandal.plan.validate`, `cancelled('olifant/plans/validate')`); rename it "… a do and a validate …".
- "an ask whose blocks hold no lines …" (`:216-232`): use validate; the notice is `validate: 0 lines · 1 not found · 1 s`.
- Add the P Q tests:

```ts
  it('P Q runs the server\'s Answer this action at the cursor: olifant.answerSentence on the server, its arguments verbatim', async () => {
    reply('textDocument/codeAction', [
      { title: 'Check this (sonnet, ~$0.10)', kind: '', command: { title: 'Check this (sonnet, ~$0.10)', command: 'olifant.checkSentence', arguments: [uriOf(PLAN), 'b'] } },
      { title: 'Answer this (sonnet, ~$0.12)', kind: '', command: { title: 'Answer this (sonnet, ~$0.12)', command: 'olifant.answerSentence', arguments: [uriOf(PLAN), 'b'] } },
    ]);
    reply('workspace/executeCommand', null);
    const n = sent('workspace/executeCommand').length;
    const ed = await at(2);
    ed.selection = new vscode.Selection(2, 2, 2, 2);
    await vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => sent('workspace/executeCommand').length > n, 'the command sent');
    assert.deepEqual(sent('workspace/executeCommand').at(-1)!.params, { command: 'olifant.answerSentence', arguments: [uriOf(PLAN), 'b'] });
    const asked = sent('textDocument/codeAction').at(-1)!.params;
    assert.deepEqual(asked.range, { start: { line: 2, character: 2 }, end: { line: 2, character: 2 } });
    assert.deepEqual(asked.context, { diagnostics: [] });
  });

  it('P Q with no Answer this says so as info; the server\'s refusal is said as info', async () => {
    const a = await running();
    reply('textDocument/codeAction', []);
    await at(2);
    await vscode.commands.executeCommand('durandal.plan.ask');
    assert.deepEqual([a.shown.at(-1)!.level, a.shown.at(-1)!.text], ['info', 'ask: nothing to answer here (checked already? hover reads it)']);
    reply('textDocument/codeAction', [
      { title: 'Answer this (sonnet, ~$0.12)', kind: '', command: { title: 'Answer this (sonnet, ~$0.12)', command: 'olifant.answerSentence', arguments: [uriOf(PLAN), 'b'] } },
    ]);
    reply('workspace/executeCommand', { lsp_error: 'this sentence is being checked now' });
    await vscode.commands.executeCommand('durandal.plan.ask');
    await until(() => a.shown.at(-1)!.text === 'this sentence is being checked now' || undefined, 'the refusal said');
    assert.equal(a.shown.at(-1)!.level, 'info');
  });
```

`test/e2e/fake.16-loop.e2e.ts`: after the test "a claim-pass command the server refuses …" add (it uses that file's `menu` and `sent`):

```ts
  for (const [title, command] of [
    ['Answer this (sonnet, ~$0.12)', 'olifant.answerSentence'], ['Check the plan (~$0.40)', 'olifant.checkPlan'],
    ['Show why (inspect)', 'olifant.inspectShowWhy'], ['Dismiss here', 'olifant.inspectDismiss'],
  ] as const) {
    it(`${command} from the chord-a menu runs on the server, its arguments verbatim`, async () => {
      reply('workspace/executeCommand', null);
      reply('textDocument/codeAction', [{ title, kind: '', command: { title, command, arguments: [uriOf(PLAN), 'f-1', 'here'] } }]);
      const n = sent('workspace/executeCommand').length;
      await menu(3, title.split(' (')[0]);
      await until(() => sent('workspace/executeCommand').length > n, `${command} sent`);
      assert.deepEqual(sent('workspace/executeCommand').at(-1)!.params, { command, arguments: [uriOf(PLAN), 'f-1', 'here'] });
    });
  }
```

(`menu(row, label)` picks the item whose label starts with `label`; read its definition in `fake.16` and pass what it expects.)

Run:

```bash
perl -e 'alarm 1500; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: the whole fake and bare suites pass, except fake.11's and fake.12's conjure tests and fake.13's pause-swap test, which still use the old pause and are ported in Task 4. Any other failure is a bug of this task.

- [ ] **Step 8: The real sandbox and its hooks (spec §0.B.11)**

`test/e2e/run.ts`, `real()`: replace the `pass_cost` append and its comment (`:102-105`) with:

```ts
      // the pinned olifant's sandbox: a recorded decide model (Jev, answered by decide_answers),
      // checks on sonnet alone (answered by check_answers), inspect on with a short settle
      // (answered by inspect_answers). No `[plans] pass_cost = 0`: M10 asserts the ○ and the
      // Check actions it hides. Committed, so the suites' `git checkout -- .` cleanups keep it.
      appendFileSync(join(ws, name, '.olifant/config.toml'), SANDBOX);
      execFileSync('git', ['-C', join(ws, name), '-c', 'user.name=olifant', '-c', 'user.email=olifant@localhost', 'commit', '-qam', 'the e2e sandbox']);
```

with, above `real()`:

```ts
// The real sandbox's config after try-pack.sh's [packs] (plan-time finding 2, 10).
const SANDBOX = [
  '', '[decide]', 'model = "jev"', '[model.backends.jev]', 'kind = "jev"',
  '[plans]', 'check_model = "sonnet"', '[inspect]', 'enabled = true', 'settle = 0.5', '',
].join('\n');
```

After `checks.json` is written, add the three other hook files and pass them:

```ts
    // recorded decisions: the claim pass's triage, and inspect's three questions
    const decide = join(ws, 'decide.json');
    writeFileSync(decide, JSON.stringify({ answers: {
      'sentence-kind': { choice: 'claim', confidence: 0.9, probabilities: { claim: 0.9 } }, 'about-code': { choice: true, confidence: 0.9 },
      'stops-early': { choice: false, confidence: 0.9 }, nitpick: { choice: false, confidence: 0.9 }, same: { choice: true, confidence: 0.9 },
    } }));
    // inspect's find calls: none recorded yet (M10 adds its finding)
    const inspect = join(ws, 'inspect.json');
    writeFileSync(inspect, JSON.stringify({ replies: {} }));
    // what every conjure writer answers: the real tests rewrite it before each conjure
    const steps = join(ws, 'steps.txt');
    writeFileSync(steps, '<goal>nothing</goal>\n');
    settings(ws, bin);
    await launch(ws, {
      DURANDAL_E2E_SUITE: 'real', DURANDAL_CHECK_ANSWERS: checks,
      DURANDAL_DECIDE_ANSWERS: decide, DURANDAL_INSPECT_ANSWERS: inspect, DURANDAL_STEP_REPLIES: steps,
    });
```

(the old `settings(ws, bin); await launch(…)` lines go.)

At plan time this exact `SANDBOX`, with these `decide.json` and `inspect.json`, ran the existing real suite against olifant `0f8a5c1`: 22 passing, 2 pending (the model-gated conjure and ask), none failing, the same as with `pass_cost = 0` (plan-time finding 10). Keep it as written.

`test/e2e/real.9-plans.e2e.ts`:
- Delete the test "asks about a question line and lands the answer" (`:99-122`).
- In "Check this from the chord-a menu …", after the margin `until(…)` and before `assert.deepEqual(ui.log…)`, add the footer check (acceptance §7):

```ts
      // the hover footer names this editor's keys (olifant reads keys.definition and keys.plan_keep)
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', ed.document.uri, new vscode.Position(0, 4));
      const md = hovers.flatMap(h => h.contents).map(c => (typeof c === 'string' ? c : c.value)).join('\n');
      assert.ok(md.includes('F12: the code · Keep this verdict: Ctrl+Alt+D P K'), md);
```

Run the real suite (it builds the extension first):

```bash
OLIFANT_BIN=$(cd ~/projects/olifant-pin && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-pin DURANDAL_E2E_ONLY=real perl -e 'alarm 1500; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: every real test passes or is skipped (the model-gated conjure in `real.8` is still the old one and stays skipped without `DURANDAL_E2E_MODEL`; Task 5 replaces it).

- [ ] **Step 9: Commit**

```bash
git add -A .olifant-ref README.md CHANGELOG.md package.json src test
git commit -m "feat: pin olifant main; eight server commands, keys.plan_keep/definition, P Q runs Answer this, ask and reviewAnswers removed, the real sandbox's hooks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
```

---

### Task 3: the step review's pure parts (types, view model, held-step store, fixtures)

**Model:** Opus. Nothing here changes behaviour: the old pause still runs conjure until Task 4.

**Files:**
- Modify: `src/protocol.ts` (add the step types after `StubResult`, `:112`)
- Modify: `src/pause/model.ts` (`SHARED_KEYS`; `conjureKeys` reads it)
- Modify: `src/pause/reviewModel.ts` (`shared()` reads `SHARED_KEYS`; export `put`, `span`, `fit`, `diffTitle`, `diffLines`)
- Create: `src/pause/stepModel.ts`, `src/pause/stepStore.ts`
- Create: `test/fixtures/step/{took,nostep,failing}.json`, `test/fixtures/step/README.md`, `test/stepFixtures.ts`
- Test: `test/unit/stepModel.test.ts`, `test/unit/stepStore.test.ts`; `test/unit/protocol.test.ts` (`TDD_KEYS`)

**Interfaces:**
- Produces (protocol.ts):

```ts
export type StepChoice = 'accept' | 'reject' | 'harder';
export interface StepTests { passing: string[]; failing: string[]; stillRed: string[]; noTests: boolean }
export interface Shown {
  token: string; file: string; unit: string; writer: string; goal: string | null; took?: boolean;
  edits: WorkspaceEdit | null; dropped: string[]; parses: { file: string; ok: boolean }[];
  tests: StepTests; after: TestsRunResult | null; cost: number | null; seconds: number; harder: boolean;
  diffs: { file: string; diff: string }[]; situation: string; reply: string;
}
```

- Produces (stepModel.ts): `took(s: Shown): boolean`, `stepFiles(s: Shown): { file: string; diff: string }[]`, `STEP_KEYS: KeyHelp[]`, `STEP_BUSY`, `NO_HARDER`, `NO_STEP` (strings), `stepRefusal(s: Shown, choice: StepChoice, busy: boolean): string | undefined`, `STEP_BUSY_WORDS: Record<StepChoice, string>`, `stepLegend(s: Shown, narrow: boolean): string`, `stepView(s: Shown, o: { cols: number; selected: number; flipped: boolean; help: boolean; busy?: StepChoice }): View`.
- Produces (stepStore.ts): `interface Lines { first: number; last: number }` (0-based, inclusive), `interface HeldStep { uri: string; shown: Shown; position: { line: number; character: number }; version: number; lines: Lines | undefined }`, `stepLines(uri: string, shown: Shown, position: { line: number }, same?: (a: string, b: string) => boolean): Lines | undefined`, `reopens(h: HeldStep, version: number, line: number, selection: boolean): boolean`, `class StepStore { set(h: HeldStep): void; get(uri: string): HeldStep | undefined; drop(uri: string): void; dropAll(): void }`.
- Produces (model.ts): `SHARED_KEYS: { j: KeyHelp; PageDown: KeyHelp; Tab: KeyHelp; d: KeyHelp; '?': KeyHelp }`.
- Produces (test): `stepAnswer(name: StepName): { shown: Shown }`, `stepFixture(name: StepName): Shown`, `type StepName = 'took' | 'nostep' | 'failing'`.

- [ ] **Step 1: Lift the shared keys (the `shared()` trap, spec §3.7)**

`src/pause/model.ts`: above `conjureKeys` add

```ts
// The keys every source of the window shares, as its help names them: the review's tables and
// the step's read them from here (reviewModel.ts shared()), so none depends on another's table.
export const SHARED_KEYS = {
  j: { keys: ['j', 'k'], help: 'scroll the diff: a line' },
  PageDown: { keys: ['PageDown', 'PageUp'], help: 'scroll the diff: a page' },
  Tab: { keys: ['Tab'], help: 'narrow: flip the situation and the diff' },
  d: { keys: ['d'], help: 'details, in a document beside this one' },
  '?': { keys: ['?'], help: 'this help; any key closes it' },
} satisfies Record<string, KeyHelp>;
```

and in `conjureKeys` replace the five literal entries for `j k`, `PageDown PageUp`, `Tab`, `d` and `?` with `SHARED_KEYS.j`, `SHARED_KEYS.PageDown`, `SHARED_KEYS.Tab`, `SHARED_KEYS.d`, `SHARED_KEYS['?']`.

`src/pause/reviewModel.ts`: import `SHARED_KEYS` instead of `conjureKeys`, and replace `shared` with

```ts
// The shared key KEY names (scroll, Tab, d, ?): they read the same in every source.
function shared(key: keyof typeof SHARED_KEYS): KeyHelp {
  return SHARED_KEYS[key];
}
```

Put `export` on `put`, `span`, `fit`, `diffTitle` and `diffLines` (`:163-241`); their bodies do not change.

Run `npm run test:unit`. Expected: green (`reviewModel.test.ts:180-188` pins the help words; they did not change).

- [ ] **Step 2: The step types and fixtures**

`src/protocol.ts`, after `StubResult` (`:112`):

```ts
// --- the conjure step (olifant ConjureStep.hs stepJson :415-443): one step, shown for review,
// answered accept, reject or harder. Read every nullable through given() (src/pause/text.ts);
// only an explicit took: false is a step that took none.
export type StepChoice = 'accept' | 'reject' | 'harder';
export interface StepTests { passing: string[]; failing: string[]; stillRed: string[]; noTests: boolean }
// file: absolute; diffs[].file and parses[].file: root-relative; after: the tests' run over the
// step's text (scope "file"), marked when the step lands
export interface Shown {
  token: string; file: string; unit: string; writer: string; goal: string | null; took?: boolean;
  edits: WorkspaceEdit | null; dropped: string[]; parses: { file: string; ok: boolean }[];
  tests: StepTests; after: TestsRunResult | null; cost: number | null; seconds: number; harder: boolean;
  diffs: { file: string; diff: string }[]; situation: string; reply: string;
}
```

`test/fixtures/step/took.json`:

```json
{ "shown": {
  "token": "step-1", "file": "/p/src/a.py", "unit": "f", "writer": "claude-haiku-5-5", "goal": "fill f", "took": true,
  "edits": null, "dropped": [], "parses": [{ "file": "src/a.py", "ok": true }],
  "tests": { "passing": ["src/a__test.py::test_f"], "failing": [], "stillRed": [], "noTests": false },
  "after": null, "cost": 0.001, "seconds": 4.2, "harder": true,
  "diffs": [
    { "file": "src/a.py", "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,2 +1,2 @@\n def f():\n-    raise NotImplementedError\n+    return 1\n" },
    { "file": "src/a__test.py", "diff": "--- a/src/a__test.py\n+++ b/src/a__test.py\n@@ -0,0 +1,1 @@\n+x = 1\n" }
  ],
  "situation": "The cursor is in `f`", "reply": "<goal>fill f</goal>"
} }
```

`test/fixtures/step/nostep.json`:

```json
{ "shown": {
  "token": "step-1", "file": "/p/src/a.py", "unit": "f", "writer": "claude-haiku-5-5", "goal": "nothing", "took": false,
  "edits": null, "dropped": [], "parses": [],
  "tests": { "passing": [], "failing": [], "stillRed": ["t::a"], "noTests": false },
  "after": null, "cost": 0.001, "seconds": 1.5, "harder": true,
  "diffs": [], "situation": "The cursor is in `f`", "reply": "<goal>nothing</goal>"
} }
```

`test/fixtures/step/failing.json`:

```json
{ "shown": {
  "token": "step-1", "file": "/p/src/a.py", "unit": "f", "writer": "claude-haiku-5-5", "goal": "fill f", "took": true,
  "edits": null, "dropped": ["../evil.py"], "parses": [{ "file": "src/a.py", "ok": false }],
  "tests": { "passing": [], "failing": ["t::a"], "stillRed": ["t::b", "t::c"], "noTests": false },
  "after": null, "cost": null, "seconds": 7, "harder": false,
  "diffs": [{ "file": "src/a.py", "diff": "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,2 +1,2 @@\n def f():\n-    raise NotImplementedError\n+    return (\n" }],
  "situation": "The cursor is in `f`", "reply": "<goal>fill f</goal>"
} }
```

`test/fixtures/step/README.md`:

```markdown
`olifant/conjure` shown steps, hand-built (spec §0.B.10): durandal.nvim has no recorded step.
Each is `{ "shown": … }` as the server answers, with the fields of olifant's `stepJson`
(`src/Olifant/Server/ConjureStep.hs:415-443` at the pin) and the values of durandal.nvim's
`tests/step_spec.lua` `shown()` builder at `770834e`. `took` is a step the writer took,
`nostep` one it took none of (goal `nothing`), `failing` one whose tests went red, whose file
does not parse and which dropped a path. Do not edit them to suit a test: build variants in
code (`test/stepFixtures.ts`).
```

`test/stepFixtures.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shown } from '../src/protocol';

// stepFixtures: the hand-built shown steps of test/fixtures/step (see its README). Compiled to
// out/test/, so the repository is two folders up. A fresh copy each call.
export type StepName = 'took' | 'nostep' | 'failing';

const root = join(__dirname, '..', '..');

// stepAnswer: the file as the server answers it, { shown }
export function stepAnswer(name: StepName): { shown: Shown } {
  return JSON.parse(readFileSync(join(root, 'test', 'fixtures', 'step', `${name}.json`), 'utf8')) as { shown: Shown };
}

// stepFixture: the shown step itself
export function stepFixture(name: StepName): Shown {
  return stepAnswer(name).shown;
}
```

`test/unit/protocol.test.ts`: add to `TDD_KEYS`, after the `// the pause …` group, a group

```ts
  // the conjure step (ConjureStep.hs stepJson, the landed and rejected answers)
  'shown', 'took', 'harder', 'rejected', 'landed', 'situation', 'reply', 'dropped', 'parses', 'ok',
  'stillRed', 'noTests', 'passing', 'diffs', 'diff', 'goal', 'writer',
```

and add a compile check:

```ts
test('compile check: a shown step reads as the server sends it (ConjureStep.hs stepJson)', () => {
  const s: Shown = stepFixture('took');
  const choice: StepChoice = 'harder';
  assert.ok(s.token === 'step-1' && s.tests.noTests === false && choice === 'harder');
});
```

(import `Shown`, `StepChoice` types and `stepFixture` from `../stepFixtures`.)

- [ ] **Step 3: Write the failing view-model and store tests**

`test/unit/stepModel.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Shown } from '../../src/protocol';
import { NO_HARDER, NO_STEP, STEP_BUSY, STEP_KEYS, stepRefusal, stepView, took } from '../../src/pause/stepModel';
import { PAGE_KEYS, plain, type Line, type View } from '../../src/pause/viewModel';
import { stepFixture } from '../stepFixtures';

// Ported from durandal.nvim tests/step_spec.lua (770834e): nvim draws at 80 cells; WIDE's text
// pane is 74, which every assertion here fits.
const WIDE = 200;
const NARROW = 100;
const texts = (ls: Line[]): string[] => ls.map(plain);
const has = (ls: Line[], s: string): boolean => texts(ls).some(l => l.includes(s));
const shown = (o: Partial<Shown> = {}, name: 'took' | 'nostep' | 'failing' = 'took'): Shown => ({ ...stepFixture(name), ...o });
const view = (s: Shown, o: Partial<Parameters<typeof stepView>[1]> = {}): View =>
  stepView(s, { cols: WIDE, selected: 0, flipped: false, help: false, ...o });

test('shows the goal, the writer with its seconds and cost, the tests moved and each file (step_spec 1)', () => {
  const v = view(shown());
  assert.equal(plain(v.title), 'conjure · f · fill f');
  assert.equal(plain(v.lines[0]), 'claude-haiku-5-5 · 4.2 s · $0.001');
  assert.ok(has(v.lines, 'tests   +1 passing'));
  assert.ok(has(v.lines, '> ✓ src/a.py'));
  assert.ok(has(v.lines, '  ✓ src/a__test.py'));
  assert.equal(plain(v.diff.title), 'file 1 of 2 · src/a.py');
  assert.ok(has(v.diff.lines, '+    return 1'));
  assert.deepEqual(v.rows, []);
  assert.equal(v.state, 'review');
  assert.equal(v.tab, 'conjure · f');
});

test('says newly failing, still red and a file that does not parse (step_spec 2)', () => {
  const v = view(shown({}, 'failing'));
  assert.ok(has(v.lines, 'tests   -1 newly failing · 2 still red'));
  assert.ok(has(v.lines, '> ✗ src/a.py'));
  assert.ok(has(v.lines, 'dropped: ../evil.py'));
  const tests = v.lines.find(l => plain(l).startsWith('tests'))!;
  assert.equal(tests.at(-1)!.kind, 'red');
});

test('no tests, a dropped path, and no goal stated (step_spec 3)', () => {
  const v = view(shown({ goal: null, tests: { passing: [], failing: [], stillRed: [], noTests: true }, dropped: ['../evil.py'] }));
  assert.equal(plain(v.title), 'conjure · f · (no goal stated)');
  assert.ok(has(v.lines, 'tests   no tests'));
  assert.ok(has(v.lines, 'dropped: ../evil.py'));
});

test('the second file\'s diff when it is selected (step_spec 4)', () => {
  const v = view(shown(), { selected: 1 });
  assert.equal(v.selected, 1);
  assert.equal(plain(v.diff.title), 'file 2 of 2 · src/a__test.py');
  assert.ok(has(v.diff.lines, '+x = 1'));
  assert.ok(has(v.lines, '> ✓ src/a__test.py'));
});

test('a step that took none: titled no step with its goal, says so and how the tests stand; no a in the legend (step_spec 5)', () => {
  const v = view(shown({ goal: 'fill f' }, 'nostep'));
  assert.equal(plain(v.title), 'conjure · no step · fill f');
  assert.ok(has(v.lines, 'the writer took no step: h asks the harder writer, d shows its reply'));
  assert.ok(has(v.lines, 'tests   1 still red'));
  assert.ok(!v.legend.includes('a accept'));
  assert.ok(v.legend.includes('h harder') && v.legend.includes('d details'));
  assert.equal(plain(v.diff.title), 'no change');
  assert.deepEqual(texts(v.diff.lines), ['the step changes no file']);
  assert.ok(!has(v.lines, 'files'));
});

test('a step that took none with the goal nothing: the writer saw nothing to do (step_spec 6)', () => {
  assert.equal(plain(view(shown({}, 'nostep')).title), 'conjure · no step · the writer saw nothing to do');
  assert.ok(has(view(shown({ harder: false }, 'nostep')).lines, 'the writer took no step: d shows its reply'));
});

test('a refused before any request: a step that took none (step_spec 7), no harder writer (9), an answer on its way (11)', () => {
  assert.equal(stepRefusal(shown({}, 'nostep'), 'accept', false), NO_STEP);
  assert.equal(NO_STEP, 'no step to accept: h asks the harder writer, d shows the reply');
  assert.equal(stepRefusal(shown({ harder: false }), 'harder', false), NO_HARDER);
  assert.equal(NO_HARDER, 'no harder writer: name one with [conjure] harder');
  for (const c of ['accept', 'reject', 'harder'] as const) assert.equal(stepRefusal(shown(), c, true), STEP_BUSY);
  assert.equal(STEP_BUSY, 'the last answer is still on its way');
  for (const c of ['accept', 'reject', 'harder'] as const) assert.equal(stepRefusal(shown(), c, false), undefined);
  // r is never refused for a step that took none
  assert.equal(stepRefusal(shown({}, 'nostep'), 'reject', false), undefined);
});

test('a step that took one keeps a in the legend (step_spec 8); took absent reads as took', () => {
  const v = view(shown());
  assert.equal(v.legend, 'a accept · r reject · h harder · [ ] files · d details · ? help · q later');
  const s = shown();
  delete s.took;
  assert.ok(took(s));
  assert.ok(view(s).legend.startsWith('a accept'));
  assert.equal(view(shown({ harder: false })).legend, 'a accept · r reject · [ ] files · d details · ? help · q later');
});

test('narrow: the legend starts with Tab diff, the diff title ends with Tab back, the short title drops the unit', () => {
  const v = view(shown(), { cols: NARROW });
  assert.ok(v.narrow);
  assert.ok(v.legend.startsWith('Tab diff · a accept'), v.legend);
  assert.ok(plain(v.diff.title).endsWith(' · Tab back'), plain(v.diff.title));
  assert.equal(plain(v.short), 'conjure · fill f');
  assert.equal(view(shown(), { cols: NARROW, flipped: true }).flipped, true);
  assert.equal(view(shown(), { cols: WIDE, flipped: true }).flipped, false);
});

test('busy: the legend says what is on its way; the state is busy', () => {
  const v = view(shown(), { busy: 'harder' });
  assert.equal(v.state, 'busy');
  assert.equal(v.legend, 'asking the harder writer…');
  assert.equal(view(shown(), { busy: 'accept' }).legend, 'landing…');
  assert.equal(view(shown(), { busy: 'reject' }).legend, 'rejecting…');
});

test('the facts: the writer when null, no cost when null; a took step with no file says so', () => {
  const v = view(shown({ writer: null as unknown as string, cost: null, diffs: [], parses: [] }));
  assert.equal(plain(v.lines[0]), 'the writer · 4.2 s');
  assert.ok(has(v.lines, 'the step changes no file'));
  assert.equal(v.entries, 0);
  assert.equal(v.selected, -1);
});

test('help: every step key, and every one is a key the page reports', () => {
  const v = view(shown(), { help: true });
  assert.ok(v.help && v.help.length > STEP_KEYS.length);
  const help = texts(v.help!).join('\n');
  for (const k of ['a', 'r', 'h', 'Esc', '?']) assert.ok(help.includes(`  ${k}`), k);
  for (const k of STEP_KEYS.flatMap(x => x.keys)) assert.ok(PAGE_KEYS.includes(k), `${k} is reported by the page`);
});
```

`test/unit/stepStore.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Shown } from '../../src/protocol';
import { HeldStep, reopens, stepLines, StepStore } from '../../src/pause/stepStore';
import { stepFixture } from '../stepFixtures';

const U = 'file:///p/src/a.py';
const T = 'file:///p/src/a__test.py';
const at = (line: number) => ({ line, character: 0 });
const edit = (uri: string, a: number, b: number) => ({ textDocument: { uri, version: 3 }, edits: [{ range: { start: { line: a, character: 0 }, end: { line: b, character: 4 } }, newText: 'x' }] });
const withEdits = (edits: Shown['edits'], name: 'took' | 'nostep' = 'took'): Shown => ({ ...stepFixture(name), edits });

test('the lines the step edits in this document: documentChanges and changes, other documents left out', () => {
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [edit(U, 4, 6), edit(T, 0, 9), edit(U, 2, 2)] }), at(5)), { first: 2, last: 6 });
  assert.deepEqual(stepLines(U, withEdits({ changes: { [U]: [{ range: { start: at(7), end: at(8) }, newText: 'y' }] } }), at(5)), { first: 7, last: 8 });
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [{ kind: 'create', uri: T }, edit(T, 0, 1)] }), at(5)), undefined);
});

test('a uri spelled differently still finds the lines (Review Focus 1)', () => {
  const server = 'file:///p/src/a%2Epy';
  const same = (a: string, b: string) => decodeURIComponent(a) === decodeURIComponent(b);
  assert.deepEqual(stepLines(U, withEdits({ documentChanges: [edit(server, 3, 4)] }), at(3), same), { first: 3, last: 4 });
});

test('edits elsewhere only: no lines, never reopens (Review Focus 2)', () => {
  const s = withEdits({ documentChanges: [edit(T, 0, 3)] });
  const lines = stepLines(U, s, at(5));
  assert.equal(lines, undefined);
  const h: HeldStep = { uri: U, shown: s, position: at(5), version: 3, lines };
  assert.equal(reopens(h, 3, 5, false), false);
});

test('a step that took none: the asked line; null edits on a took step: no lines', () => {
  assert.deepEqual(stepLines(U, withEdits(null, 'nostep'), at(9)), { first: 9, last: 9 });
  assert.equal(stepLines(U, withEdits(null), at(9)), undefined);
});

test('reopens: the same version, the cursor on its lines, no selection', () => {
  const h: HeldStep = { uri: U, shown: stepFixture('took'), position: at(4), version: 3, lines: { first: 2, last: 6 } };
  assert.equal(reopens(h, 3, 2, false), true);
  assert.equal(reopens(h, 3, 6, false), true);
  assert.equal(reopens(h, 3, 7, false), false);
  assert.equal(reopens(h, 4, 4, false), false);
  assert.equal(reopens(h, 3, 4, true), false);
});

test('the store: one step a document, replaced, dropped, all dropped', () => {
  const st = new StepStore();
  const h = (uri: string, token: string): HeldStep => ({ uri, shown: { ...stepFixture('took'), token }, position: at(0), version: 1, lines: undefined });
  st.set(h(U, 'step-1'));
  st.set(h(U, 'step-2'));
  st.set(h(T, 'step-3'));
  assert.equal(st.get(U)?.shown.token, 'step-2');
  st.drop(U);
  assert.equal(st.get(U), undefined);
  assert.equal(st.get(T)?.shown.token, 'step-3');
  st.dropAll();
  assert.equal(st.get(T), undefined);
});
```

- [ ] **Step 4: Run them and see them fail**

```bash
npm run test:unit 2>&1 | tail -20
```

Expected: tsc fails: `../../src/pause/stepModel` and `../../src/pause/stepStore` do not exist.

- [ ] **Step 5: Implement `stepStore.ts`**

```ts
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { Shown } from '../protocol';
import { took } from './stepModel';

// The held step (spec §3.6): one shown step a document, kept until it is answered, a new
// conjure replaces it, or the server stops. Nothing watches the document: a conjure compares
// the version it was shown at and the cursor with the step's lines. No vscode import.

// Lines: 0-based, inclusive
export interface Lines { first: number; last: number }
export interface HeldStep { uri: string; shown: Shown; position: { line: number; character: number }; version: number; lines: Lines | undefined }

// stepLines: the lines the step's edits change in the document at URI (its documentChanges'
// text edits and its changes'), compared by SAME (the server can spell a uri differently from
// VS Code); for a step that took none, the line it was asked at; else none (durandal.nvim
// step.lua lines_in).
export function stepLines(uri: string, shown: Shown, position: { line: number }, same: (a: string, b: string) => boolean = (a, b) => a === b): Lines | undefined {
  let first: number | undefined;
  let last: number | undefined;
  const take = (es: readonly { range: { start: { line: number }; end: { line: number } } }[] | undefined) => {
    for (const e of es ?? []) {
      first = first === undefined ? e.range.start.line : Math.min(first, e.range.start.line);
      last = last === undefined ? e.range.end.line : Math.max(last, e.range.end.line);
    }
  };
  const edits: WorkspaceEdit | null = shown.edits ?? null;
  for (const c of edits?.documentChanges ?? []) if ('textDocument' in c && same(c.textDocument.uri, uri)) take(c.edits);
  for (const [u, es] of Object.entries(edits?.changes ?? {})) if (same(u, uri)) take(es);
  if (first !== undefined && last !== undefined) return { first, last: Math.max(last, first) };
  return took(shown) ? undefined : { first: position.line, last: position.line };
}

// reopens: a conjure at LINE of the document at VERSION, without a selection, shows the held
// step again instead of asking (spec §3.6)
export function reopens(h: HeldStep, version: number, line: number, selection: boolean): boolean {
  return !selection && h.version === version && h.lines !== undefined && line >= h.lines.first && line <= h.lines.last;
}

export class StepStore {
  private readonly held = new Map<string, HeldStep>();
  set(h: HeldStep): void { this.held.set(h.uri, h); }
  get(uri: string): HeldStep | undefined { return this.held.get(uri); }
  drop(uri: string): void { this.held.delete(uri); }
  dropAll(): void { this.held.clear(); }
}
```

- [ ] **Step 6: Implement `stepModel.ts`**

```ts
// The conjure step's View (durandal.nvim step.lua's situation, ported; spec §3.4): a shown step
// laid out in display cells at the panel's width. The window's fourth source, beside the do,
// the errand and the reconcile. No vscode import.
import type { Shown, StepChoice } from '../protocol';
import { cutLine, helpLines, layout, SHARED_KEYS, type KeyHelp } from './model';
import { diffLines, diffTitle, fit, put, span } from './reviewModel';
import { given } from './text';
import type { Line, SpanKind, View } from './viewModel';

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

// took: whether the writer took a step; only an explicit false is none
export const took = (s: Shown): boolean => given(s.took) !== false;
export const stepFiles = (s: Shown): { file: string; diff: string }[] => list(s.diffs);

export const STEP_BUSY = 'the last answer is still on its way';
export const NO_HARDER = 'no harder writer: name one with [conjure] harder';
export const NO_STEP = 'no step to accept: h asks the harder writer, d shows the reply';
export const STEP_BUSY_WORDS: Record<StepChoice, string> = { accept: 'landing…', reject: 'rejecting…', harder: 'asking the harder writer…' };

// The step's keys as its help names them (step.lua M.keys).
export const STEP_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'accept: the step lands, one undo step per file' },
  { keys: ['r'], help: 'reject: nothing lands' },
  { keys: ['h'], help: 'harder: the same step again from [conjure] harder, replacing this one' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  SHARED_KEYS.j,
  SHARED_KEYS.PageDown,
  SHARED_KEYS.Tab,
  { keys: ['d'], help: "details: the situation the writer read and its reply, beside the window" },
  { keys: ['q', 'Escape'], help: 'later: the window closes; the step stays, a conjure on its lines reopens it' },
  SHARED_KEYS['?'],
];

// stepRefusal: why CHOICE is not sent for S (BUSY: an answer is on its way), or undefined
export function stepRefusal(s: Shown, choice: StepChoice, busy: boolean): string | undefined {
  if (busy) return STEP_BUSY;
  if (choice === 'harder' && given(s.harder) !== true) return NO_HARDER;
  if (choice === 'accept' && !took(s)) return NO_STEP;
  return undefined;
}

// The footer: `Tab diff` first when narrow; a only when the writer took a step, h only with a
// harder writer (step.lua's legend parts).
export function stepLegend(s: Shown, narrow: boolean): string {
  const parts: string[] = [];
  if (narrow) parts.push('Tab diff');
  if (took(s)) parts.push('a accept');
  parts.push('r reject');
  if (given(s.harder) === true) parts.push('h harder');
  parts.push('[ ] files', 'd details', '? help', 'q later');
  return parts.join(' · ');
}

// How the tests moved, in words, and their colour: red when any newly fails, dim when only
// still red (or no change, or no tests), green otherwise.
function testsWords(s: Shown): { text: string; kind: SpanKind } {
  const t = given(s.tests) ? s.tests : { passing: [], failing: [], stillRed: [], noTests: false };
  if (given(t.noTests) === true) return { text: 'no tests', kind: 'dim' };
  const passing = list(t.passing).length;
  const failing = list(t.failing).length;
  const red = list(t.stillRed).length;
  const parts: string[] = [];
  if (passing > 0) parts.push(`+${passing} passing`);
  if (failing > 0) parts.push(`-${failing} newly failing`);
  if (red > 0) parts.push(`${red} still red`);
  if (parts.length === 0) return { text: 'no change in the tests', kind: 'dim' };
  return { text: parts.join(' · '), kind: failing > 0 ? 'red' : red > 0 ? 'dim' : 'green' };
}

// The titles: full `conjure · <unit> · <goal>`, short `conjure · <goal>`; a step that took
// none: `conjure · no step · <goal>` (goal nothing: the writer saw nothing to do).
function titles(s: Shown): { full: Line; short: Line } {
  let goal = given(s.goal) ? String(s.goal) : '(no goal stated)';
  if (!took(s)) {
    if (goal === 'nothing') goal = 'the writer saw nothing to do';
    const t = put([span('conjure · no step · ', 'title'), span(goal, 'proposal')]);
    return { full: t, short: t };
  }
  const unit = given(s.unit) ? ` · ${s.unit}` : '';
  return {
    full: put([span(`conjure${unit} · `, 'title'), span(goal, 'proposal')]),
    short: put([span('conjure · ', 'title'), span(goal, 'proposal')]),
  };
}

// stepView: the whole View of S for a panel COLS cells wide, file SELECTED (0-based; out of
// range: the first), BUSY the answer on its way.
export function stepView(s: Shown, o: { cols: number; selected: number; flipped: boolean; help: boolean; busy?: StepChoice }): View {
  const geo = layout(o.cols);
  const w = geo.text;
  const files = stepFiles(s);
  const sel = o.selected >= 0 && o.selected < files.length ? o.selected : files.length > 0 ? 0 : -1;
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };

  const facts = [given(s.writer) ? String(s.writer) : 'the writer'];
  if (typeof s.seconds === 'number') facts.push(`${s.seconds.toFixed(1)} s`);
  if (typeof s.cost === 'number') facts.push(`$${s.cost.toFixed(3)}`);
  push(put([span(facts.join(' · '), 'dim')], w));
  const t = testsWords(s);
  push(put([span('tests   ', 'section'), span(t.text, t.kind)], w));
  const dropped = list(s.dropped);
  if (dropped.length > 0) push(put([span(`dropped: ${dropped.map(String).join(', ')}`, 'red')], w));
  if (!took(s)) {
    const next = given(s.harder) === true ? 'h asks the harder writer, d shows its reply' : 'd shows its reply';
    push(put([span(`the writer took no step: ${next}`, 'strong')], w));
  }
  push([]);

  // the files, each with whether it parses, the selected one marked: its diff is on the right
  const ok = new Map(list(s.parses).map(p => [String(p.file), given(p.ok)]));
  if (files.length > 0) {
    const right = '[ ] file';
    push([span('files', 'section'), span(' '.repeat(Math.max(w - 5 - right.length, 1))), span('[ ]', 'key'), span(' file', 'dim')]);
    files.forEach((f, i) => {
      const bad = ok.get(String(f.file)) === false;
      push(put([span(i === sel ? '> ' : '  '), span(bad ? '✗ ' : '✓ ', bad ? 'red' : 'green'), span(String(f.file))], w), i);
    });
  } else if (took(s)) {
    push([span('the step changes no file', 'dim')]);
  }
  while (lines.length > 0 && lines[lines.length - 1].length === 0) { lines.pop(); entryAt.pop(); }

  const file = sel >= 0 ? files[sel] : undefined;
  const diff = file
    ? { title: diffTitle(`file ${sel + 1} of ${files.length} · ${file.file}`, geo.narrow), lines: diffLines(given(file.diff) ? String(file.diff) : '') }
    : { title: diffTitle('no change', geo.narrow), lines: [[span('the step changes no file', 'dim')]] };
  const tt = titles(s);
  const view: View = {
    state: o.busy !== undefined ? 'busy' : 'review',
    tab: `conjure${given(s.unit) ? ` · ${s.unit}` : ''}`,
    title: fit([tt.full, tt.short], w),
    short: fit([tt.short], w),
    lines, entryAt, entries: files.length, selected: sel,
    rows: [],
    diff: { title: cutLine(diff.title, Math.max(geo.right - 4, 8)), lines: diff.lines },
    legend: o.busy !== undefined ? STEP_BUSY_WORDS[o.busy] : stepLegend(s, geo.narrow),
    narrow: geo.narrow, flipped: geo.narrow && o.flipped, width: w,
  };
  if (o.help) view.help = helpLines(geo.narrow ? w : geo.right - 4, STEP_KEYS);
  return view;
}
```

- [ ] **Step 7: Run the tests and see them pass**

```bash
npm run lint && OLIFANT_REPO=~/projects/olifant-pin npm run test:unit 2>&1 | tail -20
```

Expected: green, the `TDD_KEYS` scan included. If a step key fails the scan, look at what `stepJson` sends at the pin and fix `Shown`; never drop the key.

- [ ] **Step 8: Commit**

```bash
git add -A src test
git commit -m "feat(pause): the conjure step's view model, held-step store and fixtures (not wired yet)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
```

---

### Task 4: the switch: conjure answers with a step; the pause half goes

**Model:** Opus. This is one cut: the old pause and the step share `ConjureResult`, so the wire types, the flow, the controller and the wiring change together, and the pause's tests go with its code.

**Files:**
- Modify: `src/protocol.ts` (`:113-163`: the conjure types)
- Rewrite: `src/tdd/conjure.ts`; Modify: `src/tdd/landing.ts` (`conjureNotice` → `stepLanded`)
- Modify: `src/pause/controller.ts`, `src/extension.ts`, `src/server.ts`
- Create: `src/pause/acted.ts` (moved from `resume.ts`)
- Delete: `src/pause/resume.ts`, `progress.ts`, `reminder.ts`, `store.ts`
- Modify: `src/pause/model.ts` (pause-only exports out), `src/pause/details.ts` (`conjureDetails` out), `src/pause/viewModel.ts` (`PAGE_KEYS`, `SpanKind`, `ViewState`, `View.status`, `View.reason`), `webview/render.ts:43-47`, `webview/pause.css:103,106-112`
- Modify: `test/pauseFixtures.ts` (review parts only); Delete: `test/fixtures/paused/`
- Delete: `test/unit/resume.test.ts`, `pauseStore.test.ts`, `progress.test.ts`; Create: `test/unit/acted.test.ts`
- Modify: `test/unit/model.test.ts`, `details.test.ts`, `render.test.ts`, `landing.test.ts`, `protocol.test.ts`
- Delete: `test/e2e/fake.12-pause.e2e.ts`; Modify: `test/e2e/fake.11-tdd.e2e.ts` (`:218-300`), `fake.13-review.e2e.ts` (`:333-354`)

**Interfaces:**
- Consumes: Task 3's `Shown`, `StepChoice`, `stepView`, `stepRefusal`, `stepFiles`, `StepStore`, `stepLines`, `reopens`, `HeldStep`; Task 2's nothing new.
- Produces:
  - protocol: `ConjureResume { token: string; choice: StepChoice }`, `ConjureParams extends At { selection?; resume? }`, `ConjureResult = { shown: Shown } | { landed: { file: string; edits: WorkspaceEdit | null } } | { rejected: true }`.
  - `src/tdd/conjure.ts`: `interface StepWindow { showStep(uri: string): void; closeStep(uri: string): void }`, `ConjureDeps { server; say; flights; tests; flashes; landed; steps: StepStore }`, `class Conjure { register; setWindow(w: StepWindow); run(); answer(uri: string, choice: StepChoice): Promise<string | undefined> }`, `NO_ANSWER`.
  - `src/tdd/landing.ts`: `stepLanded(goal: string | null | undefined, written: string): string`.
  - `src/pause/controller.ts`: `SourceKind = 'step' | 'do' | 'errand' | 'reconcile'`; `PauseController implements StepWindow`; `ControllerDeps { server; say; ui; docs; panel; conjure: Pick<Conjure, 'answer'>; steps: StepStore; landed; redo }`.
  - `PauseApi`: `stored` and `reminders` removed; `held(uri: string): string | undefined` (the held step's token).
  - `src/pause/acted.ts`: `acted(act, key): Promise<true | string>` (the body moved verbatim).

- [ ] **Step 1: Write the failing unit tests**

`test/unit/landing.test.ts`: replace the `conjureNotice` tests (and the `ConjureLanded` import) with:

```ts
test('the landing\'s line: the goal and what was written; the step when no goal; nothing changed when no edit', () => {
  assert.equal(stepLanded('fill f', 'saved'), 'conjured · fill f · saved');
  assert.equal(stepLanded(null, '2 files saved'), 'conjured · the step · 2 files saved');
  assert.equal(stepLanded(undefined, 'nothing changed'), 'conjured · the step · nothing changed');
  assert.equal(stepLanded('', '1 saved, 1 unsaved'), 'conjured · the step · 1 saved, 1 unsaved');
});
```

(keep the `savedWord`, `changedSpan`, `selectionLines`, `cursorColumn` and `stubWord` tests.)

`test/unit/acted.test.ts`: move the `acted` test from `resume.test.ts:123-128` here, importing `acted` from `../../src/pause/acted`.

`test/unit/protocol.test.ts`:
- Imports: drop `ConjureLanded`, `ConjurePaused` and the `../pauseFixtures` import; add `ConjureResult`.
- In "compile check: the TDD answers …" replace the `landed` and `paused` constants and their uses with:

```ts
  const answers: ConjureResult[] = [
    { shown: stepFixture('took') },
    { landed: { file: '/p/a.py', edits: null } },
    { rejected: true },
  ];
```

  and assert `answers.length === 3` in place of `landed.edits === null && paused.paused.token === 't'`.
- "compile check: a resume, …": `const resume: ConjureResume = { token: 'step-1', choice: 'harder' };` and assert `resume.choice === 'harder'` instead of `resume.land`.
- Delete `PAUSED_FIELDS` and "the four pause fixtures …".
- `TDD_KEYS`: delete `green`, `rounds`, `rungs`, `paused`, and the whole `// the pause (ConjureNext.hs pausedJson)` group, except `failing`, which moves to the step group.

Run `npm run test:unit`. Expected: tsc fails (`stepLanded`, `../../src/pause/acted`, `ConjureResult` shape).

- [ ] **Step 2: The protocol**

`src/protocol.ts`: replace `:113-163` (from the `ResumeChoice` comment through `export type ConjureResult = …`) with:

```ts
// a step's answer: its token and the choice (ConjureStep.hs stepResumeOf :447-457)
export interface ConjureResume { token: string; choice: StepChoice }
// selection: 0-based lines, inclusive (the server adds 1); resume: an answer to the shown step,
// sent with the opening conjure's textDocument and position
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
// the answer: a step shown for review, a step landed (edits null when it changed nothing), or
// a step rejected (also an accepted step that took none)
export type ConjureResult = { shown: Shown } | { landed: { file: string; edits: WorkspaceEdit | null } } | { rejected: true };
```

Move Task 3's step-types block (`StepChoice`, `StepTests`, `Shown`) directly above it if it is not already there.

- [ ] **Step 3: The landing words and `acted`**

`src/tdd/landing.ts`: drop the `ConjureLanded` import and replace `Notice` and `conjureNotice` with:

```ts
// stepLanded: a landed step's one line (durandal.nvim conjure.lua answered): its goal, or the
// step, and what was written (savedWord's, or nothing changed). Always info.
export function stepLanded(goal: string | null | undefined, written: string): string {
  return `conjured · ${typeof goal === 'string' && goal !== '' ? goal : 'the step'} · ${written}`;
}
```

`src/pause/acted.ts`:

```ts
import { errorMessage } from '../errors';

// acted: a key's action, a throw or a rejection told as the footer's notice (never silent)
export async function acted(act: () => Promise<true | string> | true | string, key: string): Promise<true | string> {
  try {
    return await act();
  } catch (e) {
    return `${key}: ${errorMessage(e)}`;
  }
}
```

- [ ] **Step 4: Rewrite `src/tdd/conjure.ts`**

```ts
import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from '../applyEdit';
import type { Landed } from '../landed';
import { HeldStep, reopens, stepLines, StepStore } from '../pause/stepStore';
import { ConjureParams, ConjureResult, Olifant, Shown, StepChoice } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { settle } from './flights';
import { changedSpan, savedWord, selectionLines, stepLanded } from './landing';
import type { Tests } from './tests';

export interface ConjureDeps {
  server: Server; say: Say; flights: TddFlights; tests: Tests;
  // each landing's flashed span (Api.tdd.flashes, for the e2e tests)
  flashes: { first: number; last: number }[];
  landed: Landed;
  // the held steps, one a document (spec §3.6); the window reads them too
  steps: StepStore;
}

// StepWindow: where a shown step is drawn (the review window's step source, controller.ts)
export interface StepWindow {
  // the held step of URI shown: opened, or drawn again in place with its first file selected
  showStep(uri: string): void;
  // URI's step is over (landed, rejected, gone): the window closes if it shows it
  closeStep(uri: string): void;
}

export const NO_ANSWER = 'conjure: an answer olifant does not give';
const CANCELLED = 'conjure cancelled · nothing landed';
// an answer's errors after which the server holds no step: the window closes with them; any
// other failed h keeps the step and says why in the footer (spec §3.5)
const GONE = ['this step is gone', 'the file changed since the step was shown'];
const docOf = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
// the server can spell a uri differently from VS Code (%3A, [, ])
const sameUri = (a: string, b: string) => vscode.Uri.parse(a).toString() === vscode.Uri.parse(b).toString();

// Conjure: one step at the cursor (or the selected lines), shown for review (durandal.nvim
// conjure.lua, spec §3.3). The answer is a shown step, held and drawn by the window; a landed
// step applies its edits, flashes the changed lines, marks the step's after-run and says one
// line; a rejected one is said. The window's a, r and h come back through answer().
export class Conjure {
  private readonly flashed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });
  private window: StepWindow | undefined;

  constructor(private readonly d: ConjureDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.flashed, vscode.commands.registerCommand('durandal.conjure', () => this.run()));
  }

  setWindow(w: StepWindow): void { this.window = w; }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    const sel = selectionLines(h.editor.selection.start, h.editor.selection.end);
    // the held step again when the document is as it was shown and the cursor is on its
    // lines; otherwise it is forgotten (the server drops its own on a new conjure)
    const held = this.d.steps.get(h.uri);
    if (held) {
      if (reopens(held, h.editor.document.version, h.position.line, sel !== undefined)) {
        this.window?.showStep(h.uri);
        return;
      }
      this.forget(h.uri);
    }
    const params: ConjureParams = { textDocument: { uri: h.uri }, position: h.position };
    if (sel) params.selection = sel;
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const f = this.d.flights.start('conjure');
    const o = await withCancel('Durandal: conjuring…', f, () => settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method));
    if (o.kind === 'cancelled') {
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', CANCELLED);
      return;
    }
    // the opening call's refusal leaves nothing to forget: said as the server says it
    if (o.kind === 'error') {
      void this.d.say('error', o.message);
      return;
    }
    await this.answered(params, o.value, undefined);
  }

  // answer: the held step of URI answered with CHOICE (the window's a, r, h). Undefined when it
  // is done with (shown again, landed, rejected, or gone, each drawn or said); a sentence when
  // the step stays and the footer should say why (a failed h).
  async answer(uri: string, choice: StepChoice): Promise<string | undefined> {
    const held = this.d.steps.get(uri);
    if (!held) return 'nothing to do here';
    if (!this.d.server.client()) return NOT_RUNNING;
    const params: ConjureParams = { textDocument: { uri }, position: held.position, resume: { token: held.shown.token, choice } };
    const f = this.d.flights.start('conjure');
    const o = await settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method);
    if (o.kind === 'cancelled') {
      // a stop or a restart has dropped every step and closed the window already
      if (o.why === 'user' || o.why === 'server') {
        this.forget(uri);
        void this.d.say('info', CANCELLED);
      }
      return undefined;
    }
    if (o.kind === 'error') {
      if (choice === 'harder' && !GONE.some(g => o.message.startsWith(g))) return o.message;
      this.forget(uri);
      void this.d.say('error', o.message);
      return undefined;
    }
    await this.answered(params, o.value, held);
    return undefined;
  }

  // answered: the one branch point is the answer's shape (conjure.lua answered)
  private async answered(params: ConjureParams, v: ConjureResult, held: HeldStep | undefined): Promise<void> {
    const uri = params.textDocument.uri;
    const r = v as { shown?: unknown; landed?: unknown; rejected?: unknown };
    if (r.shown !== null && typeof r.shown === 'object') {
      const shown = r.shown as Shown;
      const version = docOf(uri)?.version ?? 0;
      this.d.steps.set({ uri, shown, position: params.position, version, lines: stepLines(uri, shown, params.position, sameUri) });
      this.window?.showStep(uri);
      return;
    }
    this.forget(uri);
    if (r.rejected === true) {
      void this.d.say('info', 'step rejected · nothing landed');
      return;
    }
    if (r.landed === null || typeof r.landed !== 'object') {
      void this.d.say('error', NO_ANSWER);
      return;
    }
    await this.land(uri, (r.landed as { edits?: WorkspaceEdit | null }).edits ?? null, held);
  }

  // land: the step's edits (one undo step a file, refused whole if a document moved), the
  // flash, the after-run marked, landed fired, one line said
  private async land(uri: string, edits: WorkspaceEdit | null, held: HeldStep | undefined): Promise<void> {
    let written = 'nothing changed';
    if (edits) {
      const lc = this.d.server.client();
      if (!lc) {
        void this.d.say('error', NOT_RUNNING);
        return;
      }
      const doc = docOf(uri);
      const before = doc?.getText().split('\n');
      let counts = { saved: 0, unsaved: 0 };
      const done = await applyServerEdit(lc, { label: 'conjure', edit: edits }, () => undefined, (saved, unsaved, kept) => {
        counts = { saved: saved.length, unsaved: unsaved.length + kept.length };
        return undefined;
      });
      if (!done.applied) {
        void this.d.say('error', done.failureReason ?? 'VS Code did not apply the conjure');
        return;
      }
      written = savedWord(counts.saved, counts.unsaved);
      if (doc && before) this.flash(doc, before);
    }
    const after = held?.shown.after;
    if (after !== null && after !== undefined && typeof after === 'object') this.d.tests.show(after, false);
    this.d.landed.fire('conjure');
    void this.d.say('info', stepLanded(held?.shown.goal, written));
  }

  private forget(uri: string): void {
    this.d.steps.drop(uri);
    this.window?.closeStep(uri);
  }

  // flash: the changed lines for half a second; the cursor to the first, when its editor is active
  private flash(doc: vscode.TextDocument, before: string[]): void {
    const span = changedSpan(before, doc.getText().split('\n'));
    if (!span) return;
    this.d.flashes.push(span);
    const range = new vscode.Range(span.first, 0, span.last, 0);
    const eds = vscode.window.visibleTextEditors.filter(e => e.document === doc);
    for (const e of eds) e.setDecorations(this.flashed, [range]);
    setTimeout(() => { for (const e of eds) e.setDecorations(this.flashed, []); }, 500);
    const active = vscode.window.activeTextEditor;
    if (active?.document !== doc) return;
    const at = new vscode.Position(span.first, doc.lineAt(span.first).firstNonWhitespaceCharacterIndex);
    active.selection = new vscode.Selection(at, at);
    active.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
```

- [ ] **Step 5: The controller's step source; its pause half out**

`src/pause/controller.ts`:

Imports: delete the imports of `ConjureParams`, `Paused`, `findRoot`, `chordLabel`, `Conjure`/`PauseSink`/`ResumeHooks`, `Flight`, `conjureDetails`, everything from `./model` except `layout`, everything from `./progress`, `./reminder`, `./resume` and `./store`. Add:

```ts
import type { StepChoice } from '../protocol';
import type { Conjure, StepWindow } from '../tdd/conjure';
import { acted } from './acted';
import { stepFiles, stepRefusal, stepView } from './stepModel';
import type { StepStore } from './stepStore';
```

Types and deps:

```ts
export type SourceKind = 'step' | 'do' | 'errand' | 'reconcile';

export interface ControllerDeps {
  server: Server; say: Say; ui: () => Ui; docs: VirtualDocs; panel: PausePanel; landed: Landed;
  // the window's a, r and h (tdd/conjure.ts); the held steps it draws
  conjure: Pick<Conjure, 'answer'>; steps: StepStore;
  // redo: plans/do resuming a review's thread on the plan's LINE, landed as Plan: Do lands it (M6b)
  redo(planUri: string, line: number, id: string, text: string): Promise<void>;
}

// a step shown: its document (its held step is in the store), the selected file, the answer in the air
interface StepState { uri: string; selected: number; busy?: StepChoice }
```

Delete `Run`, `DIGITS`, and the class members and methods named in spec §3.7: `store`, `shownUri`, `run`, `claims`, the constructor body (the class keeps an empty constructor with the deps), `register`, `shown`, `ended`, `atRun`, `progress`, `current`, `selectedOf`, `dropped`, `endRun`, `rowsOf`, `rowKey`, `resume`, `select`, the old private `step(d)`, `jump`, `cancel`, `details`. The class declaration becomes `export class PauseController implements StepWindow`, with a field `private step: StepState | undefined;` beside `rev`.

Add the step source (after `showReview`):

```ts
  // showStep: URI's held step in the window (tdd/conjure.ts, spec §3.4): opened, or drawn again
  // in place after h with its first file selected
  showStep(uri: string): void {
    this.rev = undefined;
    this.help = false;
    this.step = { uri, selected: 0 };
    this.paint(undefined, true);
  }

  closeStep(uri: string): void {
    if (this.step?.uri === uri) this.hide();
  }
```

`receive`'s `select` branch becomes:

```ts
      await this.answer('select', this.rev ? this.selectReview(this.rev, m.entry) : this.step ? this.selectFile(this.step, m.entry) : 'nothing to do here');
```

`source()`:

```ts
  source(): SourceKind | undefined {
    if (!this.d.panel.isOpen()) return undefined;
    if (this.rev) return this.rev.review.kind;
    return this.step ? 'step' : undefined;
  }
```

`stopped()`:

```ts
  // stopped: the server stopped; no step it showed stands
  stopped(): void {
    this.d.steps.dropAll();
    this.hide();
  }
```

`paint` keeps the review branch and replaces the conjure branch with:

```ts
    const s = this.step;
    const h = s ? this.d.steps.get(s.uri) : undefined;
    if (!s || !h) return;
    const view = stepView(h.shown, { cols: this.cols, selected: s.selected, flipped: this.flipped, help: this.help, busy: s.busy });
    const beside = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === s.uri)?.viewColumn;
    this.d.panel.show(view, { beside, flash, focus });
```

`hide()` and `closed()` set `this.step = undefined` where they cleared `shownUri` (a closed tab keeps the step held: it is in the store).

`table()`:

```ts
  private table(): KeyAct[] {
    if (this.rev) return this.reviewTable(this.rev);
    if (this.step) return this.stepTable(this.step);
    return [];
  }
```

Add the step's keys (before `// --- the review source`):

```ts
  // --- the step source (step.lua M.keys)

  private stepTable(s: StepState): KeyAct[] {
    return [
      { keys: ['a'], act: () => this.answerStep(s, 'accept') },
      { keys: ['r'], act: () => this.answerStep(s, 'reject') },
      { keys: ['h'], act: () => this.answerStep(s, 'harder') },
      { keys: ['['], act: () => this.stepFile(s, -1) },
      { keys: [']'], act: () => this.stepFile(s, 1) },
      // the page scrolls the diff pane itself; reported so every key is accounted for
      { keys: ['j', 'k', 'PageUp', 'PageDown'], act: () => true },
      { keys: ['Tab'], act: () => this.flip() },
      { keys: ['d'], act: () => this.stepDetails(s) },
      { keys: ['q', 'Escape'], act: () => { this.hide(); return true; } },
      { keys: ['?'], act: () => { this.help = !this.help; this.paint(); return true; } },
    ];
  }

  // answerStep: the refusals first (nothing sent), then the answer with its busy footer. A new
  // shown step (h) is drawn in place by showStep; a landing or a rejection closes the window;
  // a failed h keeps the step and says why.
  private async answerStep(s: StepState, choice: StepChoice): Promise<true | string> {
    const h = this.d.steps.get(s.uri);
    if (!h) return 'nothing to do here';
    const no = stepRefusal(h.shown, choice, s.busy !== undefined);
    if (no) return no;
    if (!this.d.server.client()) return NOT_RUNNING;
    s.busy = choice;
    this.paint();
    let kept: string | undefined;
    try {
      kept = await this.d.conjure.answer(s.uri, choice);
    } finally {
      s.busy = undefined;
    }
    if (kept === undefined) return true;
    // the window moved on (closed, or another source): the sentence as a notification
    if (this.step !== s) {
      void this.d.say('error', kept);
      return true;
    }
    this.paint();
    return kept;
  }

  private stepFile(s: StepState, d: number): true | string {
    const h = this.d.steps.get(s.uri);
    const n = h ? stepFiles(h.shown).length : 0;
    if (n === 0) return 'the step changes no file';
    const to = Math.min(Math.max(s.selected + d, 0), n - 1);
    if (to === s.selected) return d < 0 ? 'the first file' : 'the last file';
    s.selected = to;
    this.paint('entry');
    return true;
  }

  private selectFile(s: StepState, i: number): true | string {
    const h = this.d.steps.get(s.uri);
    if (!h || i < 0 || i >= stepFiles(h.shown).length) return 'nothing to do here';
    s.selected = i;
    this.paint('entry');
    return true;
  }

  // stepDetails: what the writer read and what it replied, as markdown beside the window
  private async stepDetails(s: StepState): Promise<true | string> {
    const h = this.d.steps.get(s.uri);
    if (!h) return 'nothing to do here';
    const text = reviewDetails(`conjure · ${h.shown.unit}`, [
      { title: 'the situation the writer read', text: String(h.shown.situation ?? '') },
      { title: "the writer's reply", text: String(h.shown.reply ?? '') },
    ]);
    const uri = this.d.docs.set(`details/${h.shown.token}.md`, text);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    return true;
  }
```

`press` keeps its body; `acted` now comes from `./acted`.

- [ ] **Step 6: The wiring and the progress hook**

`src/extension.ts`:
- Delete `import { Reminders } from './pause/reminder';`; add `import { StepStore } from './pause/stepStore';`.
- `PauseApi`: delete `stored(uri)` and `reminders(uri)`; add

```ts
  // the held step's token for a document (spec §3.6), undefined when none is held
  held(uri: string): string | undefined;
```

- Replace the conjure and pause block (`:163-185`) with:

```ts
  const flashes: { first: number; last: number }[] = [];
  // the held conjure steps, one a document: conjure keeps them, the window draws them
  const steps = new StepStore();
  const conjure = new Conjure({ server: s, say, flights, tests, flashes, landed, steps });
  conjure.register(context);
  // the review window (M5 spec §2): the panel knows nothing of conjure; the controller decides
  // the panel needs the controller and the controller the panel: the holder breaks the cycle
  const hold: { c?: PauseController } = {};
  const panel = new PausePanel({
    extensionUri: context.extensionUri,
    receive: m => void hold.c?.receive(m),
    closed: () => hold.c?.closed(),
  });
  context.subscriptions.push({ dispose: () => panel.close() });
  // the plan verbs are built with the plans below; the reopen reaches them through this holder
  const planHold: { verbs?: PlanVerbs } = {};
  const ctl = new PauseController({
    server: s, say, ui, docs, panel, conjure, steps, landed,
    redo: (planUri, line, id, text) => planHold.verbs?.run(planUri, 'do', line, { resume: id, text }) ?? Promise.resolve(),
  });
  hold.c = ctl;
  conjure.setWindow(ctl);
```

- In the `pause: PauseApi` object delete `stored` and `reminders` and add `held: uri => steps.get(uri)?.shown.token,`.
- Delete `hooks.progress = (token, v) => ctl.progress(token, v);` (`:253`).

`src/server.ts`: delete `import type { ProgressValue } from './pause/progress';` (`:9`), the `progress?(…)` member of `ClientHooks` with its comment (`:43-45`), and the `handleWorkDoneProgress` entry with its comment (`:226-234`).

- [ ] **Step 7: Delete the pause half**

```bash
git rm src/pause/resume.ts src/pause/progress.ts src/pause/reminder.ts src/pause/store.ts
git rm test/unit/resume.test.ts test/unit/pauseStore.test.ts test/unit/progress.test.ts
git rm -r test/fixtures/paused test/e2e/fake.12-pause.e2e.ts
```

`src/pause/model.ts`: delete `EntryKind`, `PauseEntry`, `PauseRow`, `Running`, `shortName`, `entries`, `defaultSelected`, `rows`, `NO_ROW`, `noRow`, `conjureLegend`, `conjureKeys`, `conjureView`, and the private helpers only they used (`str`, `num`, `list`, `basename`, `lastPart`, `wirePlaces`, `wireFileWords`, `adaptersWords`, `stepColumns`, `testLines`, `titles`, `situationLines`, `roundDiff`, `diffFiles`, `titleSpans`, `diffPane`, `reasonOf`, `statusLine`, `SPIN`, `VERDICT`, `PAUSE_STAYS`, `failureOf`), and the `progressWords` and pause-type imports. It keeps its header (reword it: "the review window's shared layout: rows, help, cutting and the panel's geometry"), `KeyHelp`, `SHARED_KEYS`, `rep`, the chunk types, `rtrim`, `spansOf`, `Sheet`, `LABEL`, `rowLines`, `joined`, `lineText`, `cutLine`, `layout`, `SCROLL_WORDS`, `SHOWN`, `keyText`, `helpLines`. Let `npm run lint` name anything left unused.

`src/pause/details.ts`: delete `conjureDetails`, `shortPath` and the private helpers only they used (`jevLine`, `shorteners`, `escapeRe`, `SEP`, `NO_DIFF`); reword the header so it names the reviews' and the step's details. `reviewDetails` and its helpers stay.

`src/pause/viewModel.ts`:
- `SpanKind`: drop `'paused'` and `'spinner'`.
- `ViewState = 'proposal' | 'review' | 'busy'`.
- `View`: drop `reason` and `status` with their comments.
- `PAGE_KEYS`:

```ts
export const PAGE_KEYS: readonly string[] = [
  'a', 'b', 'd', 'h', 'i', 'j', 'k', 'n', 'o', 'p', 'q', 'r', 't', '[', ']', '?',
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'Tab', 'Escape', 'PageUp', 'PageDown',
];
```

(`b` stays: nothing takes it, and the every-key test presses it to see `nothing to do here`.)

`webview/render.ts:43-47`: `offers` draws the rows only:

```ts
// offers: the rows
function offers(v: View): string {
  return `<section id="off">${v.rows.map(row).join('')}</section>`;
}
```

(keep its existing signature and name; only the status and reason lines go.) `webview/pause.css`: delete the `.k-paused` rule (`:103`), the `.k-spinner` rule and its keyframes (`:106-111`) and the reduced-motion line (`:112`).

`test/pauseFixtures.ts`: keep only `reviewFixture` and its overloads, the `root` constant and the imports it needs; reword the header to "the review payloads of test/fixtures/review".

`test/unit/model.test.ts`: delete the pause-only tests (`:126-328`, `:429-894`, `:941-1021`) and their imports. Rewrite the `helpLines` tests at `:896-939` onto `STEP_KEYS` (import from `../../src/pause/stepModel`): the same assertions about columns and wrapping, with a key list that exists. Keep `rowLines` (`:330-419`) and `layout` (`:421-427`).

`test/unit/details.test.ts`: delete `:26-276` (`conjureDetails`, `shortPath`); keep the `reviewDetails` tests.

`test/unit/render.test.ts`: delete the running-status and proposal-reason tests (`:121-138`) and the `conjureView` fixture tests (`:154-179`); in the literal view fixture (`:11-50`) change `state: 'paused'` to `state: 'review'`. Add one test that renders a step:

```ts
test('a step renders: its title, its files, no rows, its legend wrapped by the page', () => {
  const v = stepView(stepFixture('took'), { cols: 200, selected: 0, flipped: false, help: false });
  const html = render(v);
  assert.ok(html.includes('conjure · f · '));
  assert.ok(html.includes('src/a__test.py'));
  assert.ok(html.includes('a accept'));
});
```

(use the file's existing `render` import name; import `stepView` and `stepFixture`.)

- [ ] **Step 8: Unit and lint green**

```bash
npm run lint && OLIFANT_REPO=~/projects/olifant-pin npm run test:unit 2>&1 | tail -20
```

Expected: green.

- [ ] **Step 9: Port the fake e2e that used the old conjure**

`test/e2e/fake.11-tdd.e2e.ts`: replace `landed` (`:223-225`) with

```ts
  const landedAnswer = (edits: unknown = mainEdit('x = 2')) => ({ landed: { file: abs(MAIN), edits } });
```

and the conjure tests (`:257-290`) with:

```ts
  it('a landed answer lands: applied and saved, flashed, the cursor on it, info', async () => {
    await settle(MAIN, 'x = 1\n');
    const a = await running();
    await open(file(MAIN));
    reply('olifant/conjure', landedAnswer());
    const flashes = a.tdd.flashes.length;
    const fired = a.landed.fired.length;
    assert.equal(await said('durandal.conjure', t => t.startsWith('conjured')), 'conjured · the step · saved');
    await until(() => a.landed.fired.length > fired, 'the conjure landed');
    assert.equal(a.landed.fired.at(-1), 'conjure');
    assert.equal(disk(MAIN), 'x = 2\n');
    assert.deepEqual(a.tdd.flashes.slice(flashes), [{ first: 0, last: 0 }]);
    assert.equal(a.shown.at(-1)!.level, 'info');
    await settle(MAIN, 'x = 1\n');
  });

  it('a landed answer without edits: nothing applied, nothing changed', async () => {
    await open(file(MAIN));
    reply('olifant/conjure', landedAnswer(null));
    assert.equal(await said('durandal.conjure', t => t.startsWith('conjured')), 'conjured · the step · nothing changed');
    assert.equal(disk(MAIN), 'x = 1\n');
  });

  it('a rejected answer is said; an answer olifant does not give is an error', async () => {
    const a = await running();
    await open(file(MAIN));
    reply('olifant/conjure', { rejected: true });
    assert.equal(await said('durandal.conjure', t => t.startsWith('step')), 'step rejected · nothing landed');
    reply('olifant/conjure', { paused: { token: 't' } });
    assert.equal(await said('durandal.conjure', () => true), 'conjure: an answer olifant does not give');
    assert.equal(a.shown.at(-1)!.level, 'error');
  });

  it('a refusal of the opening call is said verbatim', async () => {
    await open(file(MAIN));
    reply('olifant/conjure', { lsp_error: 'no function or class at line 1: put the cursor in one to conjure it' });
    assert.equal(await said('durandal.conjure', () => true), 'no function or class at line 1: put the cursor in one to conjure it');
  });
```

In "a whole-line selection sends its last selected line" use `landedAnswer(null)`. In "conjure cancelled …" the held reply's progress words become `['conjuring with sonnet']`. Delete any helper (`red`) left unused.

`test/e2e/fake.13-review.e2e.ts`: imports drop `ConjurePaused` and `wrapped`; add `import { stepAnswer } from '../stepFixtures';`. Replace the test at `:333-354` with:

```ts
  it('a review opened over a step swaps the window; the step stays held; a conjure on its lines swaps back with no request (spec §5.4)', async () => {
    const a = await running();
    await settle(MAIN, Array.from({ length: 10 }, (_, i) => `v${i} = ${i}`).join('\n') + '\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(3, 0, 3, 0);
    const w = stepAnswer('took');
    w.shown.edits = { documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
      { range: { start: { line: 3, character: 0 }, end: { line: 5, character: 0 } }, newText: 'v3 = 33\n' },
    ] }] };
    reply('olifant/conjure', w);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step', 'the step window');
    await showing(reviewFixture('do'));
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    const n = sent('olifant/conjure').length;
    const back = await open(file(MAIN));
    back.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step', 'the step again');
    assert.equal(sent('olifant/conjure').length, n);
    await hidden();
    await settle(MAIN, 'x = 1\n');
  });
```

Run the fake suite:

```bash
perl -e 'alarm 1500; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: every fake and bare test passes (fake.12 is gone until Task 5).

- [ ] **Step 10: Commit**

```bash
git add -A src test webview
git commit -m "feat(conjure): a conjure answers with one step, reviewed in the window (a r h); the pause, its rounds and its reminders removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
```

---

### Task 5: the step window's e2e, and the recorded real conjure

**Model:** Sonnet (Opus reviews).

**Files:**
- Create: `test/e2e/fake.12-step.e2e.ts`
- Modify: `test/e2e/real.8-tdd.e2e.ts` (the model-gated conjure test, `:130-152`)

**Interfaces:**
- Consumes: `PauseApi.view/source/press/receive/sizes/notices/held`, `stepAnswer` / `stepFixture` (Task 3), the real env `DURANDAL_STEP_REPLIES` (Task 2), the words of Global Constraints.

- [ ] **Step 1: Write `fake.12-step.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import type { Shown } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { stepAnswer } from '../stepFixtures';
import { api, disk, file, log, open, reply, restart, revert, running, settle, tabsUnder, until, windowGone, windowTab, ws } from './helpers';

// The step window over the fake server (spec §3.3-§3.6, §4): a shown step, its keys, its
// answers, the held step. The fake answers each method with one reply, so a flow sets the next
// reply before the key that sends it.
const MAIN = 'one/main.py';
const MAIN_TEXT = Array.from({ length: 30 }, (_, i) => `line_${i + 1} = ${i + 1}`).join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const abs = (rel: string) => join(ws(), rel);
const conjures = () => log().filter(m => m.method === 'olifant/conjure');
const resumes = () => conjures().map(m => m.params.resume).filter(Boolean);
// line 3 (0-based 2) of main.py, as the step changes it
const mainEdit = (text: string) => ({ documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
  { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, newText: text },
] }] });
const DIFF = '--- a/one/main.py\n+++ b/one/main.py\n@@ -3 +3 @@\n-line_3 = 3\n+line_3 = 33\n';

// step: the took fixture placed on main.py's line 3, as the server would send it there
function step(o: Partial<Shown> = {}): { shown: Shown } {
  const w = stepAnswer('took');
  w.shown = {
    ...w.shown, file: abs(MAIN), unit: 'line_3', edits: mainEdit('line_3 = 33'),
    diffs: [{ file: MAIN, diff: DIFF }, { file: 'one/main__test.py', diff: '--- a/one/main__test.py\n+++ b/one/main__test.py\n@@ -0,0 +1 @@\n+x = 1\n' }],
    parses: [{ file: MAIN, ok: true }], ...o,
  };
  return w;
}
const landed = (edits: unknown = mainEdit('line_3 = 33')) => ({ landed: { file: abs(MAIN), edits } });

// QUIET_MS / pageQuiet: once the page's first size report has passed, wait until its size
// reports stop (#26), so a test's own size is not overwritten by a late one
const QUIET_MS = 300;
async function pageQuiet(a: Api, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  let seen = a.pause.sizes();
  let since = Date.now();
  while (Date.now() - since < QUIET_MS) {
    if (Date.now() > end) throw new Error('timed out waiting for the page\'s size reports to stop');
    await new Promise(r => setTimeout(r, 50));
    const now = a.pause.sizes();
    if (now !== seen) { seen = now; since = Date.now(); }
  }
}

// conjureAt: a conjure from LINE (0-based) of main.py answered with ANSWER; waits for the window
async function conjureAt(line: number, answer: unknown): Promise<void> {
  const a = await api();
  const ed = await open(file(MAIN));
  ed.selection = new vscode.Selection(line, 0, line, 0);
  reply('olifant/conjure', answer);
  const n = conjures().length;
  await vscode.commands.executeCommand('durandal.conjure');
  await until(() => conjures().length > n, 'the conjure sent');
  await until(() => a.pause.source() === 'step' || undefined, 'the step window');
  await until(windowTab, 'the window in the workbench');
}

// pressed: a key that sends an answer, and the resume it sent
async function pressed(key: string): Promise<Record<string, unknown>> {
  const a = await api();
  const n = resumes().length;
  await a.pause.press(key);
  await until(() => resumes().length > n, `the resume for ${key}`);
  return resumes()[n];
}

describe('the step window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(MAIN, MAIN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(MAIN, 'x = 1\n');
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    await windowGone();
    reply('olifant/conjure', null);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN));
    if (d?.isDirty) await revert(d);
    // a new version: a step still held is not reopened by the next test's conjure
    await settle(MAIN, MAIN_TEXT + '#\n');
    await settle(MAIN, MAIN_TEXT);
  });

  it('a shown step opens the window beside the file: the title, the facts, the tests, the files, the diff', async () => {
    const a = await running();
    const sizes = a.pause.sizes();
    await conjureAt(2, step());
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    await a.pause.receive({ type: 'size', cols: 200 });
    const v = a.pause.view()!;
    assert.equal(a.pause.source(), 'step');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    assert.equal(plain(v.title), 'conjure · line_3 · fill f');
    assert.equal(plain(v.lines[0]), 'claude-haiku-5-5 · 4.2 s · $0.001');
    assert.ok(v.lines.map(plain).includes('tests   +1 passing'));
    assert.ok(v.lines.map(plain).includes(`> ✓ ${MAIN}`));
    assert.equal(plain(v.diff.title), `file 1 of 2 · ${MAIN}`);
    assert.ok(v.diff.lines.map(plain).includes('+line_3 = 33'));
    assert.deepEqual(conjures().at(-1)!.params, { textDocument: { uri: uriOf(MAIN) }, position: { line: 2, character: 0 } });
    const panelTab = await until(() => vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input instanceof vscode.TabInputWebview), 'the webview tab');
    assert.notEqual(panelTab.group.viewColumn, vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uriOf(MAIN))?.viewColumn);
  });

  it('a lands the step as one undo step and says so; the window closes, the step is forgotten', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', landed());
    const from = a.shown.length;
    const fired = a.landed.fired.length;
    assert.deepEqual(await pressed('a'), { token: 'step-1', choice: 'accept' });
    await until(() => a.shown.slice(from).find(s => s.text.startsWith('conjured')), 'the landing said');
    assert.equal(a.shown.slice(from).find(s => s.text.startsWith('conjured'))!.text, 'conjured · fill f · saved');
    assert.equal(a.landed.fired.slice(fired).at(-1), 'conjure');
    assert.equal(disk(MAIN).split('\n')[2], 'line_3 = 33');
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    // the answer reused the opening conjure's document and position
    assert.deepEqual(conjures().at(-1)!.params.position, { line: 2, character: 0 });
    const ed = await open(file(MAIN));
    await vscode.commands.executeCommand('undo');
    assert.equal(ed.document.lineAt(2).text, 'line_3 = 3');
  });

  it('an accepted step that writes a new file creates it', async () => {
    const a = await running();
    await conjureAt(2, step());
    const created = file('one/new_test.py').toString();
    reply('olifant/conjure', landed({ documentChanges: [
      { kind: 'create', uri: created },
      { textDocument: { uri: created, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'def test_new():\n    pass\n' }] },
    ] }));
    const from = a.shown.length;
    await a.pause.press('a');
    await until(() => a.shown.slice(from).find(s => s.text.startsWith('conjured')), 'the landing said');
    assert.equal(disk('one/new_test.py'), 'def test_new():\n    pass\n');
    await settle('one/new_test.py', null);
  });

  it('an accept into a file with unsaved edits from before keeps it unsaved (Review Focus 4)', async () => {
    const a = await running();
    const ed = await open(file(MAIN));
    await ed.edit(b => b.insert(new vscode.Position(29, 0), '# typed\n'));
    await conjureAt(2, step());
    reply('olifant/conjure', landed());
    const from = a.shown.length;
    await a.pause.press('a');
    const s = await until(() => a.shown.slice(from).find(x => x.text.startsWith('conjured')), 'the landing said');
    assert.equal(s.text, 'conjured · fill f · unsaved');
    assert.ok(ed.document.isDirty);
  });

  it('r rejects: nothing lands, the step is forgotten', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { rejected: true });
    const from = a.shown.length;
    assert.deepEqual(await pressed('r'), { token: 'step-1', choice: 'reject' });
    await until(() => a.shown.slice(from).find(s => s.text === 'step rejected · nothing landed'), 'the rejection said');
    assert.equal(disk(MAIN), MAIN_TEXT);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(a.pause.view(), undefined);
  });

  it('h asks the harder writer; its step replaces the one shown, in place, its first file selected', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press(']');
    reply('olifant/conjure', step({ token: 'step-2', goal: 'fill f harder', writer: 'claude-sonnet-5-5' }));
    assert.deepEqual(await pressed('h'), { token: 'step-1', choice: 'harder' });
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the harder step held');
    const v = a.pause.view()!;
    assert.ok(plain(v.title).endsWith('fill f harder'), plain(v.title));
    assert.equal(v.selected, 0);
  });

  it('a failed h keeps the step and its token and says why in the footer', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { lsp_error: 'claude is not installed' });
    await a.pause.press('h');
    assert.equal(a.pause.notices().at(-1), 'h: claude is not installed');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    assert.equal(a.pause.source(), 'step');
  });

  it('h with no harder writer says so and sends nothing', async () => {
    const a = await running();
    await conjureAt(2, step({ harder: false }));
    const n = conjures().length;
    await a.pause.press('h');
    assert.equal(a.pause.notices().at(-1), 'h: no harder writer: name one with [conjure] harder');
    assert.equal(conjures().length, n);
  });

  it('a step that took none opens with its notice; a is refused and sends nothing', async () => {
    const a = await running();
    const w = stepAnswer('nostep');
    w.shown.file = abs(MAIN);
    await conjureAt(2, w);
    const v = a.pause.view()!;
    assert.equal(plain(v.title), 'conjure · no step · the writer saw nothing to do');
    assert.ok(v.lines.map(plain).includes('the writer took no step: h asks the harder writer, d shows its reply'));
    assert.ok(!v.legend.includes('a accept'));
    const n = conjures().length;
    await a.pause.press('a');
    assert.equal(a.pause.notices().at(-1), 'a: no step to accept: h asks the harder writer, d shows the reply');
    assert.equal(conjures().length, n);
  });

  it('q keeps the step; a conjure on its lines with the file unchanged reopens it with no request; after an edit it asks again', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('q');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || undefined, 'the window again');
    assert.equal(conjures().length, n);
    await a.pause.press('q');
    await ed.edit(b => b.insert(new vscode.Position(20, 0), '# moved\n'));
    reply('olifant/conjure', step({ token: 'step-2' }));
    ed.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'a new conjure');
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the new step held');
  });

  it('a conjure off the step\'s lines, or over a selection, asks afresh and sends the selection', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('q');
    const n = conjures().length;
    const ed = await open(file(MAIN));
    reply('olifant/conjure', step({ token: 'step-2' }));
    ed.selection = new vscode.Selection(2, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the selection conjure');
    assert.deepEqual(conjures().at(-1)!.params.selection, { start: 2, end: 3 });
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the new step held');
  });

  it('busy: a second a, r or h while the first answer is out says so and sends nothing (Review Focus 5)', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { delay: 1.5, ...landed() });
    const n = resumes().length;
    const first = a.pause.press('a');
    await until(() => resumes().length > n, 'the accept sent');
    for (const k of ['a', 'r', 'h']) {
      await a.pause.press(k);
      assert.equal(a.pause.notices().at(-1), `${k}: the last answer is still on its way`);
    }
    await first;
    assert.equal(resumes().length, n + 1);
  });

  it('an accept the engine refuses (the file moved) closes the window, says why, forgets the step', async () => {
    const a = await running();
    await conjureAt(2, step());
    const why = 'the file changed since the step was shown; your text stands (one/main.py): conjure again';
    reply('olifant/conjure', { lsp_error: why });
    const from = a.shown.length;
    await a.pause.press('a');
    await until(() => a.shown.slice(from).find(s => s.text === why), 'the refusal said');
    assert.equal(a.shown.slice(from).find(s => s.text === why)!.level, 'error');
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
  });

  it('d opens the situation and the reply beside the window; the window stays', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/step-1').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## the situation the writer read'));
    assert.ok(doc.getText().includes('## the writer\'s reply'));
    assert.ok(a.pause.view());
    await vscode.window.tabGroups.close(tab);
  });

  it('every key of the table does something or says why', async () => {
    const a = await running();
    await conjureAt(2, step());
    // a, r and h send (checked above); q closes. The rest leave the window up; these are silent
    const silent = [']', 'j', 'k', 'PageUp', 'PageDown', 'Tab'];
    for (const k of ['[', ']', 'j', 'k', 'PageUp', 'PageDown', 'Tab', 'b', 'x', 'c']) {
      const before = a.pause.notices().length;
      await a.pause.press(k);
      assert.ok(a.pause.view(), `${k} keeps the window`);
      assert.ok(a.pause.notices().length > before || silent.includes(k), `${k} says why`);
    }
    assert.ok(a.pause.notices().includes('[: the first file'));
    assert.ok(a.pause.notices().includes('b: nothing to do here'));
    assert.ok(a.pause.notices().includes('x: nothing to do here'));
    await a.pause.press('?');
    assert.ok(a.pause.view()!.help && a.pause.view()!.help!.length > 3);
    await a.pause.press('j');
    assert.equal(a.pause.view()!.help, undefined);
  });

  it('a narrow panel: Tab diff first, Tab flips, a wide one shows both', async () => {
    const a = await running();
    const sizes = a.pause.sizes();
    await conjureAt(2, step());
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    await a.pause.receive({ type: 'size', cols: 90 });
    let v = a.pause.view()!;
    assert.ok(v.narrow);
    assert.ok(v.legend.startsWith('Tab diff'), v.legend);
    assert.ok(plain(v.diff.title).endsWith(' · Tab back'), plain(v.diff.title));
    await a.pause.press('Tab');
    assert.ok(a.pause.view()!.flipped);
    await a.pause.receive({ type: 'size', cols: 160 });
    v = a.pause.view()!;
    assert.ok(!v.narrow);
    await a.pause.press('Tab');
    assert.equal(a.pause.notices().at(-1), 'Tab: both panes are shown');
  });

  it('a click on a file selects it', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.receive({ type: 'select', entry: 1 });
    assert.equal(a.pause.view()!.selected, 1);
    assert.equal(plain(a.pause.view()!.diff.title), 'file 2 of 2 · one/main__test.py');
  });

  it('a restart while an answer is out: the window closes, nothing lands, nothing is said but info (Review Focus 3)', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { hold: true, title: 'conjuring' });
    const n = resumes().length;
    void a.pause.press('a');
    await until(() => resumes().length > n, 'the accept sent');
    const from = a.shown.length;
    await restart();
    await until(() => a.server.state() === 'running' || undefined, 'running again', 60_000);
    await new Promise<void>(r => setTimeout(r, 500));
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(disk(MAIN), MAIN_TEXT);
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text.startsWith('conjured')), []);
  });

  it('a server restart drops the held step and closes the window, silently', async () => {
    const a = await running();
    await conjureAt(2, step());
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.restartServer');
    await until(() => a.server.state() === 'running' || undefined, 'running again', 60_000);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(a.pause.view(), undefined);
    assert.deepEqual(a.shown.slice(from).filter(s => s.text.includes('step')), []);
  });
});
```

Check against `test/e2e/helpers.ts` that every helper imported here exists with that name (`restart`, `windowGone`, `windowTab`, `tabsUnder`, `disk`, `settle`); the old `fake.12-pause` used them all. Remove any import lint reports unused.

- [ ] **Step 2: Run it**

```bash
DURANDAL_E2E_ONLY=fake.12 perl -e 'alarm 900; exec @ARGV' npm run test:e2e 2>&1 | tail -40
VSCODE_VERSION=1.91.0 DURANDAL_E2E_ONLY=fake.12 perl -e 'alarm 900; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: every test passes on both. A failure that is the product's, not the test's: fix it in the product with a regression assertion here, and say so in the report.

- [ ] **Step 3: The recorded real conjure (`real.8`)**

`test/e2e/real.8-tdd.e2e.ts`: add `readFileSync` to the `node:fs` import and `import { plain } from '../../src/pause/viewModel';`. In `afterEach`, before `git checkout`, add `if (a.pause.view()) await a.pause.press('q');`. Replace the model-gated test "conjures a stubbed method's body from its red tests" (`:130-152`) with:

```ts
  // a recorded step (olifant's step_replies: the file's text is every writer's reply), so CI
  // runs it; run.ts points DURANDAL_STEP_REPLIES at the file
  const STEPS = process.env.DURANDAL_STEP_REPLIES;
  const conjureHere = async (a: Api): Promise<void> => {
    const ed = await open(file(MODULE));
    const { def } = handleSpan(ed.document);
    ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
    void vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || a.shown.find(s => s.level === 'error') || undefined, 'the step window', 120_000);
    assert.equal(a.pause.source(), 'step', JSON.stringify(a.shown.slice(-3)));
  };

  it('conjure shows a recorded step with its goal; a lands it', async () => {
    const a = await running();
    assert.ok(STEPS, 'run.ts sets DURANDAL_STEP_REPLIES');
    const module = readFileSync(join(ws(), MODULE), 'utf8');
    writeFileSync(STEPS!, `<goal>mark the module</goal>\n<file path="src/bistro/booking/commands/create_booking.py">\n${module}# conjured\n</file>\n`);
    await conjureHere(a);
    assert.ok(plain(a.pause.view()!.title).includes('mark the module'), plain(a.pause.view()!.title));
    const from = a.shown.length;
    await a.pause.press('a');
    const s = await until(() => a.shown.slice(from).find(x => x.text.startsWith('conjured') || x.level === 'error'), 'the landing said', 60_000);
    assert.equal(s.text, 'conjured · mark the module · saved');
    assert.ok(readFileSync(join(ws(), MODULE), 'utf8').endsWith('# conjured\n'));
  });

  it('a recorded step that took none opens the no-step window; a is refused', async () => {
    const a = await running();
    writeFileSync(STEPS!, '<goal>nothing</goal>\n');
    await conjureHere(a);
    assert.equal(plain(a.pause.view()!.title), 'conjure · no step · the writer saw nothing to do');
    await a.pause.press('a');
    assert.equal(a.pause.notices().at(-1), 'a: no step to accept: h asks the harder writer, d shows the reply');
  });
```

(import `type Api` from `../../src/extension` if the file does not already.)

Run:

```bash
OLIFANT_BIN=$(cd ~/projects/olifant-pin && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-pin DURANDAL_E2E_ONLY=real.8 perl -e 'alarm 1500; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: every `real.8` test passes. If the step does not open, read `<ws>/steps.txt` and the server's log in the e2e output: the reply format is plan-time finding 2.

- [ ] **Step 4: The whole suites once**

```bash
perl -e 'alarm 1800; exec @ARGV' npm run test:e2e 2>&1 | tail -40
OLIFANT_BIN=$(cd ~/projects/olifant-pin && cabal list-bin exe:olifant) OLIFANT_REPO=~/projects/olifant-pin DURANDAL_E2E_ONLY=real perl -e 'alarm 1800; exec @ARGV' npm run test:e2e 2>&1 | tail -40
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -A test
git commit -m "test(conjure): the step window's e2e over the fake server, and a recorded step against the real one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
```

---

### Task 6: docs, the whole-branch review, the PR

**Model:** Sonnet for the docs; Fable for the review.

**Files:**
- Modify: `README.md` (`:5`, `:101-138`, `:165-167`, `:201`, `:222`), `CHANGELOG.md` (`## Unreleased`)
- Modify: `docs/superpowers/specs/2026-11-08-m5-pause-review-webview-design.md`, `docs/superpowers/plans/2026-11-08-m5-pause-review-webview.md` (one line each under the title)

- [ ] **Step 1: README**

- `:5`, the feature list: "the pause window" becomes "the review window (a conjure's step, a do, a reconcile)".
- Replace the section "The pause window" (`:101-137`, up to the review paragraph that stays) with:

```markdown
### Conjure

`Ctrl+Alt+D C` (`Durandal: Conjure`) asks olifant for one small step at the cursor: the writer
reads the unit, its tests and what you have been doing, names a goal and writes it. A selection
points it at those lines instead. The step is shown before anything lands, in the review window
beside the file: the goal, the writer with its seconds and cost, how the tests moved, whether
each file parses, and each file's diff.

| Key | Does |
|---|---|
| `a` | accept: the step lands, one undo step per file, and `conjured · <goal> · saved` says so |
| `r` | reject: nothing lands |
| `h` | ask the harder writer (`[conjure] harder`) for the same step; its step replaces this one |
| `[` `]` | previous / next file |
| `j` `k` `PgDn` `PgUp` | scroll the diff |
| `Tab` | on a narrow panel, flip between the situation and the diff |
| `d` | the situation the writer read and its reply, beside the window |
| `?` | the keys |
| `q` `Esc` | later: the window closes and the step stays |

A step that took none (nothing to do, or no file written) opens all the same, with nothing to
accept. After `q`, `Ctrl+Alt+D C` on the step's lines reopens it while the file is as it was
shown; after an edit, or anywhere else, it asks for a new step.
```

- The plan-verb rows (`:165-167`): the `ask` row becomes "`P Q` | Answer this: runs the server's *Answer this* on the question at the cursor (as the lightbulb does)"; drop the `⋯ asking` and straight-in wording.
- `:201`: delete the `durandal.plans.reviewAnswers` bullet.
- `:222`: drop `ask` from the `real.9` description.
- Search the README for "pause" and replace what remains with "review window" wording or delete it (`grep -n -i pause README.md` prints nothing afterwards, except in a file name).

- [ ] **Step 2: CHANGELOG and the M5 docs**

`CHANGELOG.md`, under `## Unreleased`, above the tested-against line:

```markdown
- Conjure is one step now, as olifant main makes it: the review window shows the writer's step
  (goal, tests, parses, diff) and `a` accepts it, `r` rejects it, `h` asks the harder writer.
  The pause, its rounds, its reminders and the `x` cancel are gone.
- `Plan: Answer This` (`P Q`) runs the server's *Answer this* action; the old ask, its straight
  landing and `durandal.plans.reviewAnswers` are removed.
- The hover on a checked plan sentence names VS Code's keys: `F12: the code · Keep this
  verdict: Ctrl+Alt+D P K`.
- Inspect's actions (*Show why*, *Dismiss*) and the claim pass's *Answer this* and *Check the
  plan* run on the server from the lightbulb and the chord-`a` menu.
```

Under the title of each M5 doc add: `> **Superseded (conjure half) by** \`2026-11-17-m9-pin-bump-and-conjure-step-design.md\`: conjure answers with one step, reviewed as the window's step source. The do, errand and reconcile review half stands.`

Run `npm run test:unit` (releaseText, manifest) and commit:

```bash
git add README.md CHANGELOG.md docs
git commit -m "docs: the conjure step in the README and CHANGELOG; M5's conjure half superseded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG"
```

- [ ] **Step 3: The whole-branch review (Fable)**

Dispatch a Fable reviewer over `git diff main...m9` with the spec, this plan and the Review Focus list. It checks above all: the step's edits are applied only through `applyServerEdit` (refused whole when a document moved), the held step can never land into a document whose version moved, a failed answer can never leave the window busy, and nothing of the pause remains reachable. Fix what it confirms, with a test each, and re-run the suites the fix touches.

- [ ] **Step 4: Push and open the PR; clean up**

```bash
git push -u origin m9
gh pr create --title "M9: olifant pin to main; the conjure step review" --body-file <body>
git -C ~/projects/olifant worktree remove ~/projects/olifant-pin
```

The PR body: what changed (the CHANGELOG bullets), the pin (`OLIFANT_SHA`, with the olifant footer-keys merge), the plan-time findings that changed the spec (finding 9), the test runs (unit, fake e2e on stable and 1.91.0, the real suite), and a manual checklist for the user: hover a checked sentence (the footer), `P Q` on a question, the lightbulb on an inspect finding (four actions), `Durandal: Show Health` (the `inspect` row). End it with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01VSwqPTccEdvyAkyJ2WtrhG
```

Wait for CI on all three cells (`gh pr checks --watch` under a timeout). Red CI that is not this branch's (a Hackage miss): re-run once and report; red that is: fix on the branch.
