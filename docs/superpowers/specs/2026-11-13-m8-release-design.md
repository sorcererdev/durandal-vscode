# durandal-vscode M8: release

Date: 2026-11-13. Status: drafted on Fable from the repo and the precedents; two decisions are
left to the user (§0.B), everything else is ruled here. Umbrella:
`2026-11-06-durandal-vscode-design.md` §2 (release tooling), §4 (amended here, §5), §6 row 8
("README, packaging, `v0.1.0`"). Inputs: alder-vscode's v0.1.0 release (tapegram/alder-vscode,
tag 2026-11-05, the house precedent), the M7 spec's handoff (§9), the open issues #2, #5–#18,
and the facts in `~/projects/notes/vscode-port/m8/` (`alder-vscode-release-precedent.md`,
`repo-facts.md`, `notes-triage.md`). Paths: vsc = durandal-vscode at `a05d690`, olifant pin
`48f38ab` unchanged.

The user of the extension downloads `durandal-0.1.0.vsix` from a GitHub release, installs it
with `code --install-extension`, builds `olifant` from the public repo as the README says, and
`Durandal: Show Health` finds it. Nothing else changes in the extension: M8 is tooling, text and
gates, and the one commit that turns `0.0.1` into `0.1.0`.

## 0. Decisions

### A. Ruled by the spec (one reason each)

1. **Distribution = a GitHub release with the `.vsix` attached, cut by a `v*` tag.** The
   umbrella §2 and alder-vscode's release do exactly this; a Marketplace or Open VSX listing is
   a separate decision (§0.B.2) and is not needed to ship.
2. **Version `0.1.0`, tag `v0.1.0`, annotated, message `durandal-vscode 0.1.0`.** The umbrella
   names `v0.1.0`; the tag form copies alder's. The bump (`npm version 0.1.0
   --no-git-tag-version`) is part of the release PR, not a separate commit, as alder's was.
3. **The user tags after the release PR merges; the plan never tags.** Alder's rule; the tag is
   the one irreversible act and it stays the user's.
4. **CI is fixed by dropping `token:` from the olifant checkout; `OLIFANT_TOKEN` is not
   created.** `sorcererdev/olifant` is public (verified 2026-11-13 with `gh repo view`; the
   ci.yml comment and the project memory are stale), so an unauthenticated checkout at
   `.olifant-ref` works and the empty-secret error ("Input required and not supplied: token")
   goes away. No secret, no account, no money.
5. **`scripts/release.ts` + `release.yml` are copied from alder-vscode and adapted,** with the
   on-main guard, `--prerelease` for tags containing `-`, `notes <tag>` cut from the CHANGELOG
   and `check-vsix` pinning the exact vsix entry list. Umbrella §2 already names these; the
   M1 PR deferred them to M8.
6. **Umbrella §4 is amended: command ids are flat `durandal.<verb>`, with a sub-namespace only
   where the shipped manifest has one** (`durandal.generate.*`, `durandal.plan.*`,
   `durandal.test.*`, `durandal.hints.toggle`, `durandal.ghosts.toggle`, `durandal.suggest.*`).
   M7 §0.4 ruled "no rename before `v0.1.0`"; the ids are public API from this release on.
7. **None of #2, #5–#18 blocks the release.** Every one is a grouped "follow-up minors"
   checklist or an edge case (symlinked roots, a race on close, stale picker lines); none is a
   crash, data loss or a broken core command. #11 and #14 (a `do` or a push-opened review
   touching a plan the user did not open) are the first candidates for `0.1.1`.
8. **The unfiled follow-ups in `~/projects/notes/vscode-port/m*/` stay there, except M7's,
   which gets its grouped issue** ("M7 follow-up minors", the three items in `m7/m7-pr.md`),
   because every other milestone already has one (#2, #6, #9, #10, #12, #15–#18) and the
   pattern is cheap to complete. The light triage (`notes-triage.md`) found nothing blocking.
9. **One release-wide manual checklist, walked by the user once, after the release PR merges
    and before the tag (as alder's pre-tag issue #10 was),** = the unwalked M7
   checklist (`m7/m7-manual-checklist.md`, 12 items) + an install smoke of the packaged vsix
   (§4.3, ~8 items). M1–M6 were walked at their merges and are not re-walked. Umbrella §5 and
   §7 make the manual walk the guard for what tests cannot see; M7 merged without its walk, so
   the release owes it.
10. **The model-gated real e2e (`real.8` conjure, `real.9` ask) run locally with
    `DURANDAL_E2E_MODEL` set, once, before the tag; their output is pasted in the release PR.**
    CI has no model (umbrella §5, M5a's "run before release"); they are the only paths a real
    model exercises end to end.
11. **No installer; discover-and-diagnose holds for `0.1.0`.** Olifant publishes no binaries
    (no releases, no CI; umbrella line 21: "an installer waits for Olifant to publish
    binaries"). The README's build instruction now works for anyone because olifant is public.
12. **License stays Apache-2.0.** Already committed (`LICENSE`, `package.json`), the same as
    olifant and alder-vscode; nothing to decide.
13. **No icon, gallery banner or keywords for `0.1.0`.** They matter only on a Marketplace
    page; the vsix installs without them.
14. **The README drops the link to `sorcererdev/durandal.nvim`** (the name stays): the repo is
    private and the extension's repo is public, so the link 404s for every reader.
15. **The CHANGELOG is regrouped by surface, in the README's section order, under `## 0.1.0`,
    with an empty `## Unreleased` above it** (alder's layout, no dates). Users read surfaces,
    not milestones; the M7 entry is missing and the 6b line still describes the "Accept all /
    Reject all" prompt M7 removed.
16. **`~/projects/olifant-48f38ab` is removed when the release is tagged and the real e2e have
    run against it.** The next work bumps the pin (olifant main is far past `48f38ab`) and will
    make a fresh worktree; a stale `dist-newstyle` is gigabytes, and the recipe to recreate one
    goes in the README's Development section so a hotfix at this pin costs one command and a
    build.
17. **The olifant commit the release was tested against (`.olifant-ref`) is named in the
    release notes and README Requirements.** Olifant has no `--version`; the only gate is
    `--help` listing `lsp` (M1), so the ref is the one fact a user can line up with.
18. **CI's cold Haskell build time is a plan-time check, not a redesign.** CI has never passed
    the checkout step, so the cabal build, cache and test steps have never run; the first green
    run of the release branch measures them against the 90-minute limit (M1 flagged it).

### B. Left to the user (each with the recommended answer)

1. **Public release of a public repo?** `sorcererdev/durandal-vscode` is already public
   (verified; the memory's "private for now" is wrong), as is olifant. Recommended: keep it
   public and publish the GitHub release as `Latest`; nothing in the repo or the notes assumes
   privacy except the stale ci.yml comment. (If "private": flip the repo before the tag and the
   release is visible to collaborators only; nothing else in this spec changes.)
2. **Marketplace / Open VSX now, or GitHub releases only?** Recommended: GitHub releases only
   for `0.1.0`, as alder-vscode did ("not on the Marketplace or Open VSX yet"). A listing needs
   a Marketplace publisher under an Azure DevOps account and an Open VSX namespace (accounts,
   PATs as repo secrets; no money), and it would draw users who must still build a Haskell
   binary. The `publisher` field stays `sorcererdev` as the name a future listing would claim.

## 1. Scope and non-goals

In scope: `scripts/release.ts` and `release.yml`; the ci.yml fix and `workflow_call` trigger;
`check-vsix` in CI's package leg; version `0.1.0`; the CHANGELOG and README for the release;
the umbrella §4 amendment; the M7 follow-up issue; the pre-tag issue with the manual checklist;
the model-gated e2e run; the worktree removal and its recipe.

Not in scope: Marketplace or Open VSX publishing (§0.B.2); an installer or binary download;
renaming command ids; fixing #2, #5–#18 or the archived minors; olifant changes or a pin bump;
GitHub Actions major-version bumps (the `actions/checkout@v4` Node 20 deprecation warning is
noise for this release); an icon or gallery metadata; any extension behaviour change.

Success: `git tag -a v0.1.0 && git push origin v0.1.0` on the merged main produces a GitHub
release `v0.1.0` (Latest, not prerelease) whose `durandal-0.1.0.vsix` installs in a clean VS
Code and finds a locally built olifant; main CI green on all three cells; the model-gated e2e
and the manual checklist recorded in the pre-tag issue.

## 2. Components and files

- `scripts/release.ts` (new, from alder): `check-vsix <file>` (entry list = `EXPECTED_VSIX`,
  bundle requires only `vscode` and Node built-ins), `notes <tag>` (prints the CHANGELOG
  section `## <version>`; a missing, empty or prefix-matching section fails), `main()` with the
  fence alder's follow-ups PR added. Compiled by `tsc -p .` into `out/scripts/release.js`
  (tsconfig `include` gains `scripts`); unit tests in `test/unit/release.test.ts`.
- `.github/workflows/ci.yml`: add `workflow_call` to the triggers; drop `token:` and the
  "olifant is private" comment from the olifant checkout; after `npm run package`, run
  `node out/scripts/release.js check-vsix "durandal-$(node -p "require('./package.json').version").vsix"`
  before the artifact upload.
- `.github/workflows/release.yml` (new, from alder): on `push` tags `v*`; job `ci` calls
  `ci.yml`; job `release` (needs ci, `permissions: contents: write`): checkout `fetch-depth: 0`,
  guard `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` ("is not on main: tag a commit
  that is"), node 22, `npm ci`, `npm run compile`, `notes` → `$RUNNER_TEMP/notes.md`,
  `npm run package`, `check-vsix`, `gh release create "$GITHUB_REF_NAME" durandal-<ver>.vsix
  --title "$GITHUB_REF_NAME" --notes-file … --verify-tag [--prerelease]` with `github.token`.
- `package.json`: `version` 0.1.0 (and the lockfile); `bugs` and `homepage` pointing at the
  repo (vsce reads them; free). Nothing else.
- `CHANGELOG.md`: §3.1. `README.md`: §3.2.
- `docs/superpowers/specs/2026-11-06-durandal-vscode-design.md` §4: the command-id amendment
  (§5 below), dated.
- GitHub: issue "M7 follow-up minors"; issue "Release 0.1.0: pre-tag checklist" (§4.3) that the
  user ticks and closes after the tag.
- Local: `git -C ~/projects/olifant worktree remove ~/projects/olifant-48f38ab` after the tag.

## 3. Text

### 3.1 CHANGELOG

```
# Changelog

## Unreleased

## 0.1.0

- One `olifant lsp` per window … Show Health (with `olifant doctor`) and Restart Server;
  activation after startup (#1).           ← server/health (M1)
- Actions, generators, ⚡ hints, migration report, action log.          ← M2
- Ghost text, snippets, follow-ups and recognitions, Tab/Esc.          ← M3a+M3b
- The TDD loop …                                                        ← M4
- The pause window and reviews …                                        ← M5a+M5b
- Plans: reading layer, verbs, the loop …                               ← M6a–M6c, without the
  "Accept all / Reject all" clause
- Ghost rows: engine answers wait under their plan row as ghost lines (`p y` / `p n`, Tab),
  suggestion ghosts draw their lines under the line (Tab plans, Esc dismisses).   ← M7, from
  m7/m7-pr.md
- Releases: a `v*` tag runs CI and attaches the `.vsix` to a GitHub release. Tested against
  olifant `48f38ab`.
```

The bullets keep the existing sentences where they are already surface-shaped; the arrows are
this spec's, not the file's. `release.js notes v0.1.0` must find exactly this `## 0.1.0`.

### 3.2 README

- Intro: drop "(in later releases)"; everything listed has shipped. Name durandal.nvim without
  the link (§0.A.14).
- Install: replace the CI-artifact paragraph with alder's: download `durandal-<version>.vsix`
  from the latest release (`gh release download -R sorcererdev/durandal-vscode -p '*.vsix'`),
  `code --install-extension durandal-<version>.vsix`; "not on the Marketplace or Open VSX".
- Requirements: keep the build instruction; add "this release was tested against olifant
  `48f38ab` (`.olifant-ref`); the extension needs an `olifant` whose `--help` lists `lsp`".
- Ghost sections (M7 §9 handoff): check the plan-ghost chords, the suggestion ghost lines, the
  hover-toolbar accept note and `editor.inlineSuggest.enabled` are each stated once; commits
  `757c1d9` and `a05d690` added most of it, so this is a read, not a rewrite.
- Development: the worktree recipe —
  `git -C ~/projects/olifant worktree add ~/projects/olifant-$(cut -c1-7 .olifant-ref) $(cat .olifant-ref)`,
  `cabal build exe:olifant` there, `OLIFANT_BIN=$(cabal list-bin exe:olifant)
  OLIFANT_REPO=<worktree> npm run test:e2e`; `DURANDAL_E2E_MODEL=<model>` for `real.8`/`real.9`;
  releasing = "bump, CHANGELOG, merge, then `git tag -a vX.Y.Z -m 'durandal-vscode X.Y.Z' &&
  git push origin vX.Y.Z`".

## 4. Gates

### 4.1 Automated, in CI

Lint, unit (incl. `release.test.ts`), fake-lsp e2e, real e2e against the pin, `check-vsix` —
all three cells green on the release branch and on main after the merge. The release workflow
reruns the same CI on the tag and refuses a tag off main.

### 4.2 Automated, local, once before the tag

`DURANDAL_E2E_MODEL=<the user's model> OLIFANT_BIN=… OLIFANT_REPO=… npm run test:e2e` with
`real.8` and `real.9` no longer pending (the conjure waits up to 300 s). Pasted into the
pre-tag issue.

### 4.3 Manual, once before the tag (the pre-tag issue)

1. M7's checklist, `~/projects/notes/vscode-port/m7/m7-manual-checklist.md`, items 1–12, in an
   Olifant project with a model configured (copied into the issue so the issue stands alone).
2. Install smoke of the vsix from the release branch's CI artifact, in a VS Code with no
   previous Durandal: install, open an Olifant project, Show Health reports the binary and
   `olifant doctor`; one action at the cursor; one generate with its preview; `t` runs the
   file's tests and the results document opens; the pause window opens on a paused conjure
   (or the `*paused.json` fixture via the fake, if no model); a plan shows its glyphs and a
   `p v` on a row; Restart Server; uninstall leaves no error.
3. Rendering only an eye checks: plan token colours in a light and a dark theme; glyph
   alignment; the pause window's layout at a narrow width.

## 5. Umbrella deviations and follow-ups

- §4 amended (this spec, §0.A.6): "Commands `durandal.<area>.<verb>`" → "Commands
  `durandal.<verb>`, with a sub-namespace where a surface has several (`durandal.plan.*`,
  `durandal.generate.*`, `durandal.test.*`, `*.toggle`, `durandal.suggest.*`); the shipped ids
  are the public ones from `0.1.0`."
- §2 amended: "private for now" → public (verified 2026-11-13); the olifant checkout needs no
  token. The umbrella's "CI token" decision of row 1 is moot.
- §7 risk retired: "olifant lsp is private" — it is not; contributors can run the whole suite.
- Follow-ups (not filed): Marketplace/Open VSX publishing as its own milestone if §0.B.2 says
  later; an installer once olifant publishes binaries; GitHub Actions version bumps; #11 and
  #14 for `0.1.1`.

## 6. Testing

Unit (node:test): `release.test.ts` ports alder's — `check-vsix` accepts the expected 9 entries
(manifest, Content_Types, changelog, LICENSE, readme, package.json, dist/extension.js,
dist/webview.js, dist/pause.css) and rejects an extra, a missing one and a bundle requiring a
non-builtin; `notes` returns the `## 0.1.0` body, fails on missing/empty/prefix (`0.1.0-rc.1`
must not match `0.1.0`); `main()` fence. Manifest test: version `0.1.0`, `bugs`/`homepage`
present.

E2e: unchanged; the fake suite and the real suite run in CI for the first time (§0.A.18).

Workflow: a dry run of the release job is not possible without a tag, so the plan verifies the
pieces separately: `check-vsix` in CI's package leg; `notes` in unit; the on-main guard and
`gh release create` flags are copied verbatim from the workflow that produced alder's `v0.1.0`.
If the user wants a rehearsal, tag `v0.1.0-rc.1` on main (prerelease) and delete it after.

## 7. Plan-time checks

1. **CI goes green with `token:` removed.** Push the branch; the first run proves the public
   checkout and measures the cold cabal build (GHC 9.10.3) on ubuntu and macOS against the
   90-minute job timeout. If a cell exceeds it, the fix is a longer timeout or dropping the
   macOS cell to a weekly schedule, decided at the plan.
2. **`vsce package --no-dependencies` with @vscode/vsce ^4.1.0 produces exactly the 9 entries**
   `EXPECTED_VSIX` will pin (run it on `a05d690`; `m7-pr.md` says 9 files).
3. **`gh release create` with `github.token` under the `sorcererdev` org**: org "Workflow
   permissions" may be read-only by default; `permissions: contents: write` at job level must
   be allowed, else the org setting is flipped (a settings click, no account).
4. **`DURANDAL_E2E_MODEL` format**: read `test/e2e/real.8-tdd.e2e.ts` and the olifant config
   to name the value the README and the pre-tag issue tell the user to set.
5. **The CHANGELOG section regex in alder's `notes`** matches `## 0.1.0` followed by bullets
   with a blank `## Unreleased` above it (the alder tests cover this; confirm after the copy).
6. **`gh issue create` on the repo and `gh secret list` are available to the executing
   agent** (both are plain `gh` with the user's login; no new token).

## 8. Handoffs

To the user: the two §0.B answers; the manual walk (§4.3); then the tag. To the next session (after the tag): check
the release run and the asset; close the pre-tag issue; update memory (public repos, no
`OLIFANT_TOKEN`, worktree removed); then the next milestone is the user's pick between the
`0.1.1` candidates (#11, #14), Marketplace/Open VSX, and a pin bump to olifant main.
