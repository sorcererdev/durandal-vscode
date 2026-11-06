# durandal-vscode M1: scaffold + client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `sorcererdev/durandal-vscode` extension that finds and gates the `olifant` binary, runs one `olifant lsp` per window with every Olifant project as a workspace folder, applies the server's edits the way durandal.nvim does, reports health with `olifant doctor`, types the whole `olifant/*` wire contract, and is tested against a fake server and the real one in CI. At the end, everything the stock client gives works: rule diagnostics (pulled), quick fixes, hover, `@` completion, folding, and regions on save.

**Architecture:** TypeScript on `vscode-languageclient` 11, bundled by esbuild to `dist/extension.js`. Modules without a `vscode` import (`root.ts`, `health.ts`, `settings.ts`, `protocol.ts`, `edits.ts`, `commandTable.ts`) are unit-tested with `node --test`. The VS Code glue (`server.ts`, `applyEdit.ts`, `projects.ts`, `commands.ts`, `extension.ts`) is covered by e2e suites that run in a real VS Code (`@vscode/test-electron` + mocha): a contract suite against durandal.nvim's fake server (vendored), and a smoke suite against an `olifant` built from `.olifant-ref` on python-htmx sandboxes.

**Tech Stack:** TypeScript 5.9 (`module: node16`), `vscode-languageclient` ^11, `vscode-languageserver-protocol` (the client's own dependency, imported directly by the pure modules), esbuild, `@vscode/vsce`, `@vscode/test-electron` + mocha ^11 (e2e), `node:test` (unit), eslint with `typescript-eslint`. Node 22. GHC 9.10.3 and cabal 3.16.1.0 in CI for olifant.

**Spec:** `docs/superpowers/specs/2026-11-06-durandal-vscode-design.md` (this repository). Sections this plan implements: §2 (repo, tooling, CI; not `release.yml`), §3 (client and protocol layer; not the action log), §4 (command ids, chords and `when` keys as registrations; `durandal.inProject`), §5 (unit, contract e2e and real-server e2e harnesses with the cases this milestone can pass), and milestone 1 in §6. Read the spec before starting a task.

**Reference code (read, do not depend on):** alder-vscode at `~/projects/alder-vscode` (house style; `src/client.ts`, `src/health.ts`, `src/root.ts`, `test/e2e/*` are the models for this plan's files), durandal.nvim at `~/projects/durandal.nvim` (`lua/durandal/lsp.lua` and `health.lua` are the behaviour being ported; `tests/fake-lsp` is vendored), olifant at `~/projects/olifant` (book `user/16-the-language-server.md` is the wire contract; `src/Olifant/Lsp.hs` the truth).

## Global Constraints

- Repository `sorcererdev/durandal-vscode`, private (created 2026-11-06), licence Apache-2.0 (already committed, copied from durandal.nvim).
- Extension `publisher: sorcererdev`, `name: durandal` (id `sorcererdev.durandal`), display name "Durandal", command category "Durandal", output channel "Durandal".
- `engines.vscode` `^1.91.0`; `@types/vscode` `1.91.0`; Node 22 in CI; esbuild target `node20` (VS Code 1.91's Electron).
- Runtime dependencies: `vscode-languageclient` ^11 and `vscode-languageserver-protocol` at the version `vscode-languageclient` itself depends on (bundled; no other runtime dependency). Everything else is a devDependency, at alder-vscode's versions.
- Activation: `workspaceContains:**/.olifant/config.toml`; contributed commands activate the extension on their own (VS Code ≥ 1.74).
- `capabilities.untrustedWorkspaces.supported: false` (`durandal.path` chooses the binary the extension runs).
- One `olifant lsp` per window, started with `args: ['lsp']`, the window's environment, document selector `[{ scheme: 'file' }]` (every language: the server answers empty outside a project).
- A project root is the nearest ancestor holding a directory entry named exactly `.olifant` (as the server and `vim.fs.root(buf, ".olifant")` find it). Roots are compared by real path.
- `initializationOptions` = `{ debug: false, keys: { plan_review: <chord label> }, debounce_ms: <durandal.debounceMs> }` plus `model` and `fills` only when their settings are non-empty.
- Chord prefix `ctrl+alt+d` (`cmd+alt+d` on macOS); chord label for `plan_review` is `Cmd+Alt+D P R` on macOS, `Ctrl+Alt+D P R` elsewhere.
- Settings: `durandal.path` (string, default `olifant`), `durandal.debounceMs` (number, default `300`, minimum `0`), `durandal.model` (string, default `""`), `durandal.fills` (string, default `""`), `durandal.trace.server` (`off | messages | verbose`, default `off`).
- No file outside `src/protocol.ts` spells an `olifant/*` method string or a server command name.
- The extension never rewords the server: refusals and errors are shown as the server sent them.
- Server not found, failed to start, or stopped: one error notification with "Show Health" and "Restart Server" (or "Open Settings" for the binary), until the next restart. No automatic restart.
- `.olifant-ref`: `1ae076fc29455069fc32d2d7e48fa206cf033947` (olifant main, 2026-11-06).
- CI secret `OLIFANT_TOKEN`: a fine-grained PAT with read-only Contents on `sorcererdev/olifant`. The user creates it; no task creates or prints a token.
- **Deviations from the spec, on purpose (say each in the PR description):**
  1. `olifant` has no `--version` (checked 2026-11-06 at the ref: "Invalid option `--version'"), so there is no `durandal.olifantMinimum` and no version comparison. The gate is `olifant --help` exiting 0 and listing an `lsp` command, as alder-vscode gates on `help --json`. The version pin returns when olifant prints a version (a follow-up issue, the user's call).
  2. Unit tests run on `node:test`, as in alder-vscode, whose tooling the spec says to copy; mocha ^11 runs the e2e suites. (The spec's "mocha ^11 unit tests" is read as that split.)
  3. The server's plan token legend is thirteen types and three modifiers (`Server/Plans.hs` `planTokenTypes`, `planTokenModifiers`), not "eleven types and the `stale` modifier". `protocol.ts` pins the server's legend; the `semanticTokenTypes`/`semanticTokenScopes` contributions (colours) belong to milestone 6 with the rest of the plan reading layer.
  4. The action log (`~/.cache/durandal/actions.jsonl`, `durandal.actionLog`) lands in milestone 2, the first milestone that offers actions (the spec's §6 table lists it there).
  5. `release.yml` and `scripts/release.ts` land in milestone 8 (release); M1 has `ci.yml` only.
  6. The vendored `tests/fake-lsp` gains one branch: `--help` prints an `lsp` command and exits, so it passes the gate. Nothing else in it changes.
  7. The real-server suite runs when `OLIFANT_BIN` and `OLIFANT_REPO` are set and builds its own sandboxes with `$OLIFANT_REPO/scripts/try-pack.sh python-htmx`; the `DURANDAL_E2E*` gates arrive with the per-nvim-spec ports in later milestones.
- Working hours (the user's rule): no agent or background work 9am–5pm America/New_York, Monday to Friday; weekends are free.

## Review Focus

1. **A server edit that touches several files and carries change annotations marked `needsConfirmation`** (olifant marks a multi-file region refresh so). Expected: applied at once, no refactor preview, each previously clean file saved, one message naming them. Pinned by `stripAnnotations` unit tests (Task 4) and the annotated-edit contract test (Task 6).
2. **The server crashes mid-session (OOM, `kill -9`).** Expected: one error notification, no restart loop, Health says stopped, typed requests fail with "not running", and Restart Server brings it back with every project re-sent as a workspace folder and no "command already exists" for `olifant.doctor`. Pinned by the crash and restart contract tests (Task 6).
3. **VS Code started from the Dock (short `PATH`).** Expected: `olifant` in `~/.local/bin` (where olifant's `scripts/install-olifant.sh` puts it), `~/.cabal/bin` or `~/bin` is found anyway. Pinned by the `candidates`/`checkBinary` unit tests (Task 2).
4. **A file under a project nested inside another project, and a project outside the workspace folders.** Expected: the file belongs to the nearest project; the outside project is added as a workspace folder when its file opens; a file in no project adds nothing and clears `durandal.inProject`. Pinned by the nested `findRoot` unit test (Task 1) and the outside-project contract test (Task 6).
5. **An edit the server made against a version the editor has since moved past** (typing while a refresh was in flight). Expected: refused whole with "<file> changed since", nothing applied. Pinned by the `versionConflict` unit tests (Task 4) and the stale-edit contract test (Task 6).

A sixth risk has no automated pin and goes on the PR's manual checklist: VS Code gives will-save participants about 1.5 s; a cold project's first `willSaveWaitUntil` can run past it, and VS Code then saves without the region (the next save repairs it). The real-server regions test warms the project first.

---

## File structure

```
durandal-vscode/
  .olifant-ref                     the olifant commit CI builds (Task 1)
  .github/workflows/ci.yml         olifant build, lint, unit, e2e (fake + real), package (Task 8)
  .gitignore, .vscodeignore        (Task 1)
  README.md, CHANGELOG.md          (Task 1; README grows in Task 8)
  eslint.config.mjs, tsconfig.json, package.json   (Task 1; package.json grows in Tasks 2, 3)
  src/root.ts                      project root of a path, plan files (Task 1)
  src/health.ts                    discovery, the --help gate, doctor lines, the report (Task 2)
  src/protocol.ts                  every olifant/* method, typed; server commands; plan legend (Task 3)
  src/settings.ts                  settings → initializationOptions, chord label (Task 3)
  src/commandTable.ts              not-yet commands, server-named commands, chord table (Task 3)
  src/edits.ts                     pure parts of workspace/applyEdit (Task 4)
  src/applyEdit.ts                 the workspace/applyEdit handler (Task 5)
  src/server.ts                    the one LanguageClient: start, folders, crash, restart, requests (Task 5)
  src/projects.ts                  discovery at activation, roots of opened files, durandal.inProject (Task 5)
  src/commands.ts                  registers not-yet and server-named commands (Task 5)
  src/extension.ts                 activation, Health, Restart, the API tests use (Tasks 1, 5)
  test/unit/*.test.ts              node:test (Tasks 1–4)
  test/fake-lsp/fake-lsp           vendored from durandal.nvim (Task 6)
  test/e2e/run.ts, index.ts, helpers.ts   launcher, mocha loader, helpers (Task 6; run.ts grows in Task 7)
  test/e2e/fake.*.e2e.ts           contract suite against the fake server (Task 6)
  test/e2e/real.*.e2e.ts           smoke suite against olifant lsp (Task 7)
```

---

### Task 1: Toolchain and the project root (`src/root.ts`)

**Files:**
- Create: `.gitignore`, `.vscodeignore`, `.olifant-ref`, `README.md`, `CHANGELOG.md`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, `src/root.ts`, `src/extension.ts`
- Test: `test/unit/root.test.ts`

**Interfaces:**
- Produces: `findRoot(path: string): Promise<string | undefined>` (the nearest ancestor directory, of a file or of the directory itself, whose listing has an entry named exactly `.olifant` that is a directory or a symlink to one; returned as given, not resolved); `realRoot(root: string): Promise<string>` (`fs.realpath`, falling back to `path.resolve`); `rootOfConfig(configPath: string): string` (`<root>/.olifant/config.toml` → `<root>`); `isPlanFile(path: string): Promise<boolean>` (a `.md` file under `<root>/plans/`, at any depth); `PLANS_DIR = 'plans'`. Scripts `npm run lint`, `npm run test:unit`, `npm run build`, `npm run package`. `activate(context)` / `deactivate()` in `src/extension.ts` (an empty API for now).

The repository exists at `~/projects/durandal-vscode` with the spec, `LICENSE` and this plan on `main`. Work on a branch.

- [ ] **Step 1: Branch**

```bash
cd ~/projects/durandal-vscode
git switch main && git pull --ff-only
git switch -c scaffold
```

- [ ] **Step 2: Write the toolchain files**

`.gitignore`:
```
node_modules/
out/
dist/
.vscode-test/
*.vsix
olifant/
```

`.vscodeignore`:
```
**
!dist/extension.js
!package.json
!README.md
!CHANGELOG.md
!LICENSE
```

`.olifant-ref`:
```
1ae076fc29455069fc32d2d7e48fa206cf033947
```

`CHANGELOG.md`:
```markdown
# Changelog

## Unreleased

- One `olifant lsp` per window, every Olifant project a workspace folder; the server's edits applied and saved as durandal.nvim does; Show Health (with `olifant doctor`) and Restart Server.
```

`README.md` (Task 8 extends it):
```markdown
# Durandal for VS Code

Olifant's conventions, generators and TDD loop in VS Code, over the `olifant lsp` language
server: rule findings and their fixes, regions kept on save, and (in later releases) actions,
generators, ghost text, the TDD loop and plans. The Neovim plugin is
[durandal.nvim](https://github.com/sorcererdev/durandal.nvim).

Requires an `olifant` binary with the `lsp` command. Build one from a checkout of
sorcererdev/olifant: `cabal build && scripts/install-olifant.sh` (installs `~/.local/bin/olifant`).
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "node16",
    "moduleResolution": "node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src", "test"]
}
```

`eslint.config.mjs` (CI checks olifant out into `olifant/`: it must not be linted):
```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', '.vscode-test/**', 'node_modules/**', 'olifant/**'] },
  ...tseslint.configs.recommended,
);
```

`package.json` (`contributes` grows in Tasks 2 and 3):
```json
{
  "name": "durandal",
  "displayName": "Durandal",
  "description": "Olifant in VS Code: conventions, generators, the TDD loop and plans over olifant lsp",
  "publisher": "sorcererdev",
  "version": "0.0.1",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "https://github.com/sorcererdev/durandal-vscode" },
  "engines": { "vscode": "^1.91.0" },
  "categories": ["Programming Languages", "Linters"],
  "main": "./dist/extension.js",
  "activationEvents": ["workspaceContains:**/.olifant/config.toml"],
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": false,
      "description": "durandal.path chooses the binary the extension runs."
    }
  },
  "contributes": {},
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --target=node20 --sourcemap",
    "compile": "tsc -p .",
    "lint": "tsc -p . --noEmit && eslint .",
    "test:unit": "tsc -p . && node --test \"out/test/unit/**/*.test.js\"",
    "test:e2e": "npm run build && tsc -p . && node out/test/e2e/run.js",
    "package": "vsce package --no-dependencies"
  }
}
```

- [ ] **Step 3: Install the dependencies**

```bash
npm install vscode-languageclient@^11
# the protocol package at exactly the version the client depends on
npm install vscode-languageserver-protocol@"$(node -p "require('vscode-languageclient/package.json').dependencies['vscode-languageserver-protocol']")"
npm install -D typescript@^5.9.3 esbuild@^0.28.2 @types/vscode@1.91.0 @types/node@^22.20.5 eslint@^10.14.0 \
  typescript-eslint@^8.72.1 @vscode/vsce@^4.1.0 @vscode/test-electron@^3.1.0 mocha@^11.8.0 @types/mocha@^10.0.10
```
Expected: `dependencies` holds exactly `vscode-languageclient` and `vscode-languageserver-protocol`; `package-lock.json` is created. mocha stays on ^11: the VS Code 1.91 host cannot `require` mocha 12 (ESM only).

- [ ] **Step 4: Write the failing test**

`test/unit/root.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRoot, realRoot, rootOfConfig, isPlanFile } from '../../src/root';

function dir(): string { return realpathSync(mkdtempSync(join(tmpdir(), 'durandal-root-'))); }

// project makes <t>/<rel> an Olifant project with one source file, src/pkg/a.py.
function project(t: string, rel: string): string {
  const root = join(t, rel);
  mkdirSync(join(root, '.olifant'), { recursive: true });
  writeFileSync(join(root, '.olifant/config.toml'), '');
  mkdirSync(join(root, 'src/pkg'), { recursive: true });
  writeFileSync(join(root, 'src/pkg/a.py'), '');
  return root;
}

test('a file, a directory and the config itself have the project as root', async () => {
  const t = dir();
  const svc = project(t, 'svc');
  assert.equal(await findRoot(join(svc, 'src/pkg/a.py')), svc);
  assert.equal(await findRoot(join(svc, 'src')), svc);
  assert.equal(await findRoot(svc), svc);
  assert.equal(await findRoot(join(svc, '.olifant/config.toml')), svc);
});

test('a file that does not exist yet finds its root through its directory', async () => {
  const svc = project(dir(), 'svc');
  assert.equal(await findRoot(join(svc, 'src/pkg/new.py')), svc);
});

test('no .olifant above: undefined', async () => {
  const t = dir();
  writeFileSync(join(t, 'loose.py'), '');
  assert.equal(await findRoot(join(t, 'loose.py')), undefined);
});

test('a nested project is its files\' root; the outer project keeps its own', async () => {
  const t = dir();
  const outer = project(t, 'outer');
  const inner = project(outer, 'inner');
  assert.equal(await findRoot(join(inner, 'src/pkg/a.py')), inner);
  assert.equal(await findRoot(join(outer, 'src/pkg/a.py')), outer);
});

test('a file named .olifant, or a directory .Olifant, is not a marker', async () => {
  const t = dir();
  mkdirSync(join(t, 'y'));
  writeFileSync(join(t, 'y/.olifant'), '');
  assert.equal(await findRoot(join(t, 'y/m.py')), undefined);
  mkdirSync(join(t, 'z/.Olifant'), { recursive: true });
  assert.equal(await findRoot(join(t, 'z/m.py')), undefined);
});

test('roots reached through a symlink: findRoot keeps the path, realRoot resolves it', async () => {
  const t = dir();
  const svc = project(t, 'svc');
  symlinkSync(svc, join(t, 'link'));
  assert.equal(await findRoot(join(t, 'link/src/pkg/a.py')), join(t, 'link'));
  assert.equal(await realRoot(join(t, 'link')), svc);
  mkdirSync(join(t, 'w'));
  symlinkSync(join(svc, '.olifant'), join(t, 'w/.olifant'));
  assert.equal(await findRoot(join(t, 'w/m.py')), join(t, 'w'), 'a symlinked .olifant directory counts');
});

test('rootOfConfig strips .olifant/config.toml', () => {
  assert.equal(rootOfConfig('/w/svc/.olifant/config.toml'), '/w/svc');
});

test('a plan file is a markdown file under <root>/plans/', async () => {
  const t = dir();
  const svc = project(t, 'svc');
  mkdirSync(join(svc, 'plans/sub'), { recursive: true });
  mkdirSync(join(svc, 'docs'));
  for (const f of ['plans/p.md', 'plans/sub/q.md', 'plans/p.txt', 'docs/p.md']) writeFileSync(join(svc, f), '');
  assert.equal(await isPlanFile(join(svc, 'plans/p.md')), true);
  assert.equal(await isPlanFile(join(svc, 'plans/sub/q.md')), true);
  assert.equal(await isPlanFile(join(svc, 'plans/p.txt')), false);
  assert.equal(await isPlanFile(join(svc, 'docs/p.md')), false);
  mkdirSync(join(t, 'loose/plans'), { recursive: true });
  writeFileSync(join(t, 'loose/plans/p.md'), '');
  assert.equal(await isPlanFile(join(t, 'loose/plans/p.md')), false, 'no project, no plan');
});
```

`src/extension.ts` (minimal, so the bundle builds; Task 5 replaces it):
```ts
import * as vscode from 'vscode';

export type Api = Record<string, never>;

export function activate(_context: vscode.ExtensionContext): Api {
  return {};
}

export function deactivate(): void {}
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/root'`.

- [ ] **Step 6: Write `src/root.ts`**

```ts
import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// The folder, under a project, whose markdown files are plans (durandal.nvim's plans.dir
// default; milestone 6 makes it a setting).
export const PLANS_DIR = 'plans';

// hasMarker reports whether dir has an entry named exactly `.olifant` that is a directory (or a
// symlink to one). It reads the listing instead of stat-ing dir/.olifant: on a case-insensitive
// file system that stat succeeds for `.Olifant`.
async function hasMarker(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  const e = entries.find(x => x.name === '.olifant');
  if (!e) return false;
  if (e.isDirectory()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return (await fs.stat(join(dir, '.olifant'))).isDirectory();
  } catch {
    return false;
  }
}

// findRoot returns the Olifant project of a file or directory: its nearest ancestor holding
// .olifant/, as olifant lsp finds a file's project.
export async function findRoot(path: string): Promise<string | undefined> {
  const p = resolve(path);
  let dir = p;
  try {
    if (!(await fs.stat(p)).isDirectory()) dir = dirname(p);
  } catch {
    dir = dirname(p);
  }
  for (;;) {
    if (await hasMarker(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// realRoot is a root's real path: roots are compared by it.
export async function realRoot(root: string): Promise<string> {
  try {
    return await fs.realpath(root);
  } catch {
    return resolve(root);
  }
}

// rootOfConfig is the project of a found .olifant/config.toml.
export function rootOfConfig(configPath: string): string {
  return dirname(dirname(configPath));
}

// isPlanFile: a markdown file under its project's plans/ folder, at any depth.
export async function isPlanFile(path: string): Promise<boolean> {
  if (!path.endsWith('.md')) return false;
  const root = await findRoot(path);
  if (!root) return false;
  return relative(root, resolve(path)).split(sep)[0] === PLANS_DIR;
}
```

- [ ] **Step 7: Run the tests to verify they pass, lint and build**

Run: `npm run test:unit && npm run lint && npm run build`
Expected: all PASS; no lint output; `dist/extension.js` exists.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "Scaffold: toolchain, the Olifant project root of a path, plan files"
```

---

### Task 2: Binary discovery, the gate, doctor lines, the health report (`src/health.ts`)

**Files:**
- Create: `src/health.ts`
- Modify: `package.json` (`contributes.configuration`)
- Test: `test/unit/health.test.ts`

**Interfaces:**
- Produces (no `vscode` import):
  - `candidates(setting: string, env: NodeJS.ProcessEnv, home: string): string[]`
  - `hasLsp(helpStdout: string): boolean`
  - `interface Gate { path?: string; ok: boolean; problem?: string; skipped?: string[] }`
  - `checkBinary(setting: string, env: NodeJS.ProcessEnv, home: string): Promise<Gate>`
  - `type ServerState = 'not started' | 'starting' | 'running' | 'stopped' | 'failed'`
  - `doctorLines(result: unknown): string[]`
  - `interface DoctorSection { root: string; result?: unknown; error?: string }`
  - `report(gate: Gate, state: ServerState, roots: string[], doctor?: DoctorSection): string[]`
  - `const BUILD_HINT: string`, `const STOPPED: string`

- [ ] **Step 1: Write the failing test**

`test/unit/health.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { candidates, checkBinary, hasLsp, doctorLines, report, BUILD_HINT, STOPPED } from '../../src/health';

function dir(): string { return realpathSync(mkdtempSync(join(tmpdir(), 'durandal-health-'))); }

// fake writes an executable shell script named olifant into d.
function fake(d: string, body: string): string {
  mkdirSync(d, { recursive: true });
  const p = join(d, 'olifant');
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

const HELP = `printf 'Usage: olifant COMMAND\\n\\nAvailable commands:\\n  list   List generators\\n  lsp    Run the language server over stdin/stdout\\n'`;

test('an absolute or ~ setting is the only candidate', () => {
  assert.deepEqual(candidates('/opt/olifant', { PATH: '/usr/bin' }, '/home/u'), ['/opt/olifant']);
  assert.deepEqual(candidates('~/bin/olifant', { PATH: '/usr/bin' }, '/home/u'), ['/home/u/bin/olifant']);
});

test('a bare name searches PATH, then ~/.local/bin, ~/.cabal/bin, ~/bin, without repeats', () => {
  const env = { PATH: ['/a', '/home/u/.local/bin', '/b'].join(delimiter) };
  assert.deepEqual(candidates('olifant', env, '/home/u'),
    ['/a/olifant', '/home/u/.local/bin/olifant', '/b/olifant', '/home/u/.cabal/bin/olifant', '/home/u/bin/olifant']);
});

test('the Dock case: not on PATH, found in ~/.local/bin', async () => {
  const home = dir();
  const p = fake(join(home, '.local/bin'), HELP);
  const g = await checkBinary('olifant', { PATH: '/nonexistent' }, home);
  assert.equal(g.ok, true, g.problem);
  assert.equal(g.path, p);
});

test('hasLsp needs an lsp command line in the help', () => {
  assert.equal(hasLsp('Available commands:\n  list   List\n  lsp    Run the language server\n'), true);
  assert.equal(hasLsp('Available commands:\n  list   List\n'), false);
  assert.equal(hasLsp('  lspx   something else\n'), false);
  assert.equal(hasLsp(''), false);
});

test('an olifant without lsp fails the gate with the build hint', async () => {
  const home = dir();
  fake(join(home, 'bin'), `printf 'Available commands:\\n  list   List generators\\n'`);
  const g = await checkBinary('olifant', { PATH: '' }, home);
  assert.equal(g.ok, false);
  assert.match(g.problem!, /--help/);
  assert.ok(g.problem!.includes(BUILD_HINT));
});

test('a binary that exits non-zero fails the gate', async () => {
  const home = dir();
  fake(join(home, 'bin'), 'exit 3');
  assert.equal((await checkBinary('olifant', { PATH: '' }, home)).ok, false);
});

test('the first candidate that passes wins; the ones passed over are listed', async () => {
  const home = dir();
  const old = fake(join(home, 'old'), `printf 'Available commands:\\n  list   List\\n'`);
  const good = fake(join(home, '.local/bin'), HELP);
  const g = await checkBinary('olifant', { PATH: join(home, 'old') }, home);
  assert.equal(g.ok, true);
  assert.equal(g.path, good);
  assert.deepEqual(g.skipped, [old]);
});

test('no binary: the problem names the setting, where it looked, and the build hint', async () => {
  const g = await checkBinary('olifant', { PATH: '' }, dir());
  assert.equal(g.ok, false);
  assert.equal(g.path, undefined);
  assert.match(g.problem!, /durandal\.path/);
  assert.match(g.problem!, /~\/\.local\/bin/);
  assert.ok(g.problem!.includes(BUILD_HINT));
});

test('doctor lines: a level per check, the fix under it', () => {
  assert.deepEqual(doctorLines({ checks: [
    { name: 'config', status: 'ok', detail: 'project at /w', fix: null },
    { name: 'model', status: 'warn', detail: 'no backend', fix: 'add [model]' },
    { name: 'ast-grep', status: 'error', detail: 'not on PATH', fix: '' },
    { name: 'odd', status: 'maybe', detail: 'x', fix: null },
  ] }), [
    'ok: config — project at /w',
    'warn: model — no backend',
    '  fix: add [model]',
    'error: ast-grep — not on PATH',
    'warn: odd — x',
  ]);
  assert.deepEqual(doctorLines(null), ['error: olifant doctor gave no checks']);
  assert.deepEqual(doctorLines({ checks: 'no' }), ['error: olifant doctor gave no checks']);
});

test('the report: binary, gate, server, projects, doctor', () => {
  const lines = report({ path: '/b/olifant', ok: true, skipped: ['/old/olifant'] }, 'running', ['/w/a', '/w/b'],
    { root: '/w/a', result: { checks: [{ name: 'config', status: 'ok', detail: 'project at /w/a', fix: null }] } });
  assert.deepEqual(lines, [
    'binary: /b/olifant',
    'skipped: /old/olifant: failed the `--help` lists `lsp` check',
    'ok: `olifant --help` lists `lsp`',
    'ok: olifant lsp running',
    'project: /w/a',
    'project: /w/b',
    '--- olifant doctor in /w/a',
    'ok: config — project at /w/a',
  ]);
});

test('the report when things are missing', () => {
  const text = report({ ok: false, problem: 'olifant: no `olifant` binary found' }, 'failed', []).join('\n');
  assert.match(text, /^binary: not found$/m);
  assert.match(text, /^error: olifant: no `olifant` binary found$/m);
  assert.match(text, /^error: olifant lsp did not start/m);
  assert.match(text, /^info: no Olifant project in this window/m);
  assert.match(text, /^info: open a file of an Olifant project/m);
  assert.match(report({ ok: true, path: '/b' }, 'stopped', ['/w']).join('\n'), new RegExp(`^error: ${STOPPED}`, 'm'));
  assert.match(report({ ok: true, path: '/b' }, 'running', ['/w'], { root: '/w', error: 'timed out' }).join('\n'),
    /^error: olifant doctor failed: timed out$/m);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/health'`.

- [ ] **Step 3: Write `src/health.ts`**

```ts
import { execFile } from 'node:child_process';
import { promises as fs, constants } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

export const BUILD_HINT = 'build it from a checkout of sorcererdev/olifant: cabal build && scripts/install-olifant.sh (installs ~/.local/bin/olifant), or set durandal.path';
export const STOPPED = 'olifant lsp stopped: Durandal is off until it runs again';

// candidates lists where the binary may be. VS Code opened from the Dock on macOS sees a
// shorter PATH than a shell, so olifant's install directory (~/.local/bin), cabal's
// (~/.cabal/bin) and ~/bin follow PATH.
export function candidates(setting: string, env: NodeJS.ProcessEnv, home: string): string[] {
  if (isAbsolute(setting)) return [setting];
  if (setting.startsWith('~/')) return [join(home, setting.slice(2))];
  if (setting.includes('/')) return [resolve(setting)];
  const dirs = (env.PATH ?? '').split(delimiter).filter(d => d !== '');
  dirs.push(join(home, '.local', 'bin'), join(home, '.cabal', 'bin'), join(home, 'bin'));
  return [...new Set(dirs.map(d => join(d, setting)))];
}

async function executable(p: string): Promise<boolean> {
  try {
    await fs.access(p, constants.X_OK);
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

// hasLsp: olifant prints no version, so the gate is its command list: `olifant --help`
// (optparse-applicative) lists each command indented under "Available commands:".
export function hasLsp(stdout: string): boolean {
  return /^\s+lsp\s/m.test(stdout);
}

function run(path: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise(res => {
    execFile(path, args, { timeout: 10_000, maxBuffer: 4 << 20 }, (err, stdout) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      res({ code, stdout: String(stdout ?? '') });
    });
  });
}

export interface Gate { path?: string; ok: boolean; problem?: string; skipped?: string[] }

async function gate(path: string): Promise<Gate> {
  const help = await run(path, ['--help']);
  if (help.code !== 0 || !hasLsp(help.stdout)) {
    return { path, ok: false, problem: `olifant: \`${path} --help\` lists no \`lsp\` command: this olifant predates the language server; ${BUILD_HINT}` };
  }
  return { path, ok: true };
}

// checkBinary: a path setting checks only that binary; a bare name takes the first candidate
// that passes the gate, listing the executables it passed over.
export async function checkBinary(setting: string, env: NodeJS.ProcessEnv, home: string): Promise<Gate> {
  const found: string[] = [];
  for (const p of candidates(setting, env, home)) if (await executable(p)) found.push(p);
  if (found.length === 0) {
    return { ok: false, problem: `olifant: no \`${setting}\` binary found (durandal.path, PATH, ~/.local/bin, ~/.cabal/bin, ~/bin); ${BUILD_HINT}` };
  }
  const failed: Gate[] = [];
  for (const p of found) {
    const g = await gate(p);
    if (g.ok) return failed.length ? { ...g, skipped: failed.map(f => f.path!) } : g;
    failed.push(g);
  }
  const [first, ...rest] = failed;
  return rest.length ? { ...first, skipped: rest.map(f => f.path!) } : first;
}

export type ServerState = 'not started' | 'starting' | 'running' | 'stopped' | 'failed';

// doctorLines are olifant doctor's checks (the `olifant.doctor` command's answer, the shape
// `olifant doctor --json` prints), as durandal.nvim's health shows them.
export function doctorLines(result: unknown): string[] {
  const checks = (result as { checks?: unknown } | null | undefined)?.checks;
  if (!Array.isArray(checks)) return ['error: olifant doctor gave no checks'];
  const out: string[] = [];
  for (const c of checks as Record<string, unknown>[]) {
    const level = c.status === 'ok' || c.status === 'warn' || c.status === 'error' ? c.status : 'warn';
    out.push(`${level}: ${String(c.name)} — ${String(c.detail)}`);
    if (typeof c.fix === 'string' && c.fix !== '') out.push(`  fix: ${c.fix}`);
  }
  return out;
}

export interface DoctorSection { root: string; result?: unknown; error?: string }

const STATE_LINE: Record<ServerState, string> = {
  'running': 'ok: olifant lsp running',
  'starting': 'info: olifant lsp starting',
  'stopped': `error: ${STOPPED} (Durandal: Restart Server; its log is the Durandal output channel)`,
  'failed': 'error: olifant lsp did not start (the Durandal output channel says why; Durandal: Restart Server)',
  'not started': 'info: olifant lsp not started (it starts when the window holds an Olifant project)',
};

// report is the `Durandal: Show Health` text.
export function report(gate: Gate, state: ServerState, roots: string[], doctor?: DoctorSection): string[] {
  const out: string[] = [];
  out.push(gate.path ? `binary: ${gate.path}` : 'binary: not found');
  for (const p of gate.skipped ?? []) out.push(`skipped: ${p}: failed the \`--help\` lists \`lsp\` check`);
  out.push(gate.ok ? 'ok: `olifant --help` lists `lsp`' : `error: ${gate.problem}`);
  out.push(STATE_LINE[state]);
  for (const r of roots) out.push(`project: ${r}`);
  if (roots.length === 0) out.push('info: no Olifant project in this window (no .olifant/ found)');
  if (!doctor) {
    out.push('info: open a file of an Olifant project (with olifant lsp running) to see what its generators need');
  } else {
    out.push(`--- olifant doctor in ${doctor.root}`);
    out.push(...(doctor.error !== undefined ? [`error: olifant doctor failed: ${doctor.error}`] : doctorLines(doctor.result)));
  }
  return out;
}
```

- [ ] **Step 4: Add the settings to `package.json`**

Set `contributes.configuration`:
```json
"configuration": {
  "title": "Durandal",
  "properties": {
    "durandal.path": {
      "type": "string",
      "default": "olifant",
      "markdownDescription": "The `olifant` binary: an absolute path, or a name looked up on `PATH`, `~/.local/bin`, `~/.cabal/bin` and `~/bin`."
    },
    "durandal.debounceMs": {
      "type": "number",
      "default": 300,
      "minimum": 0,
      "markdownDescription": "How long typing must pause before the server's slow work (suggestions) starts (`debounce_ms`)."
    },
    "durandal.model": {
      "type": "string",
      "default": "",
      "markdownDescription": "Which `[model.backends.NAME]` fills holes; empty: the project's `[model]` default."
    },
    "durandal.fills": {
      "type": "string",
      "default": "",
      "markdownDescription": "A recorded `[fills]` file standing in for the model (tests, demos); empty: none."
    },
    "durandal.trace.server": {
      "type": "string",
      "enum": ["off", "messages", "verbose"],
      "default": "off",
      "description": "Trace the LSP traffic with olifant lsp into the Durandal output channel."
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit && npm run lint`
Expected: PASS, no lint output.

- [ ] **Step 6: Commit**

```bash
git add src/health.ts test/unit/health.test.ts package.json
git commit -m "health: binary discovery, the --help gate, doctor lines, the health report; settings"
```

---

### Task 3: The wire contract, settings, commands and chords

**Files:**
- Create: `src/protocol.ts`, `src/settings.ts`, `src/commandTable.ts`
- Modify: `package.json` (`contributes.commands`, `contributes.keybindings`)
- Test: `test/unit/protocol.test.ts`, `test/unit/settings.test.ts`, `test/unit/manifest.test.ts`

**Interfaces:**
- Produces (no `vscode` import):
  - `protocol.ts`: `Olifant` (an object of `RequestType`/`NotificationType`, keys below), `METHODS: string[]`, `SERVER_COMMANDS = { doctor: 'olifant.doctor' }`, `CLIENT_COMMANDS = { showActions, planReview, planExcerpt, planErrand }`, `DoctorCheck`, `DoctorResult`, `PLAN_TOKEN_TYPES`, `PLAN_TOKEN_MODIFIERS`, and the param/result interfaces.
  - `settings.ts`: `interface Settings { debounceMs: number; model: string; fills: string }`, `settingsFrom(get: (key: string, fallback: unknown) => unknown): Settings`, `chordLabel(platform: string, rest: string): string`, `interface InitOptions`, `initOptions(s: Settings, platform: string): InitOptions`.
  - `commandTable.ts`: `NOT_YET`, `SERVER_NAMED` (`Record<string, { title: string; milestone: number }>`), `notYet(title: string): string`, `KEYS: { command: string; keys: string; when: string }[]`, `PREFIX = { key: 'ctrl+alt+d', mac: 'cmd+alt+d' }`.

The `Olifant` keys and wire methods (32): requests `generators`, `choices`, `preview`, `plan`, `fileActions`, `holes`, `model`, `suggest`, `stub`, `conjure`, `mutate`, `waive`, `testsRun` (`olifant/tests/run`), `testsFile` (`olifant/tests/file`), `debugState`, `plansAsk`, `plansValidate`, `plansDo`, `plansReconcile`, `plansAnchor`, `plansFiles`, `plansStub`, `plansTest`, `plansErrand`, `plansErrands`, `plansReviews`, `plansReview`, `plansReviewChoose` (`olifant/plans/review/choose`); notifications client→server `recognitionFeedback`, `plansOutcome`; server→client `suggestion`, `plansReviewReady` (`olifant/plans/review/ready`). Result types are typed to what the book and durandal.nvim read today; a later milestone that consumes a result tightens its type here (never adds a method string elsewhere).

- [ ] **Step 1: Write the failing tests**

`test/unit/protocol.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_COMMANDS, METHODS, Olifant, PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES, SERVER_COMMANDS } from '../../src/protocol';

const PINNED = [
  'olifant/choices', 'olifant/conjure', 'olifant/debugState', 'olifant/fileActions', 'olifant/generators',
  'olifant/holes', 'olifant/model', 'olifant/mutate', 'olifant/plan', 'olifant/plans/anchor', 'olifant/plans/ask',
  'olifant/plans/do', 'olifant/plans/errand', 'olifant/plans/errands', 'olifant/plans/files', 'olifant/plans/outcome',
  'olifant/plans/reconcile', 'olifant/plans/review', 'olifant/plans/review/choose', 'olifant/plans/review/ready',
  'olifant/plans/reviews', 'olifant/plans/stub', 'olifant/plans/test', 'olifant/plans/validate', 'olifant/preview',
  'olifant/recognitionFeedback', 'olifant/stub', 'olifant/suggest', 'olifant/suggestion', 'olifant/tests/file',
  'olifant/tests/run', 'olifant/waive',
];

test('every olifant/* method, once', () => {
  assert.deepEqual([...METHODS].sort(), PINNED);
  assert.equal(new Set(METHODS).size, METHODS.length);
  assert.equal(Olifant.testsRun.method, 'olifant/tests/run');
  assert.equal(Olifant.plansReviewChoose.method, 'olifant/plans/review/choose');
});

test('the commands and the plan legend', () => {
  assert.deepEqual(SERVER_COMMANDS, { doctor: 'olifant.doctor' });
  assert.deepEqual(Object.values(CLIENT_COMMANDS).sort(),
    ['olifant.plans.errand', 'olifant.plans.excerpt', 'olifant.plans.review', 'olifant.showActions']);
  assert.equal(PLAN_TOKEN_TYPES.length, 13);
  assert.deepEqual([...PLAN_TOKEN_MODIFIERS], ['done', 'stale', 'notFound']);
});

// hsFiles lists olifant's library sources, without the specs.
function hsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return hsFiles(p);
    return n.endsWith('.hs') && !n.endsWith('Spec.hs') ? [p] : [];
  });
}

// With an olifant checkout (OLIFANT_REPO, as CI has at .olifant-ref), the contract is checked
// against the server's source: a method or command it gains or drops fails here. When the scan
// finds a new name, add it to protocol.ts (and, for a command, to commandTable.ts's
// SERVER_NAMED); never loosen the scan.
test('the contract matches olifant\'s source', { skip: !process.env.OLIFANT_REPO && 'OLIFANT_REPO is not set' }, () => {
  const files = hsFiles(join(process.env.OLIFANT_REPO!, 'src'));
  const methods = new Set<string>();
  const commands = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/Proxy :: Proxy "(olifant\/[A-Za-z/]+)"/g)) methods.add(m[1]);
    for (const line of src.split('\n')) {
      if (!line.includes('Command')) continue;
      for (const m of line.matchAll(/"(olifant\.[A-Za-z][A-Za-z.]*)"/g)) commands.add(m[1]);
    }
  }
  assert.deepEqual([...methods].sort(), PINNED);
  assert.deepEqual([...commands].sort(), [...Object.values(CLIENT_COMMANDS), SERVER_COMMANDS.doctor].sort());
  const plans = readFileSync(join(process.env.OLIFANT_REPO!, 'src/Olifant/Server/Plans.hs'), 'utf8');
  const types = /planTokenTypes =\s*\[([^\]]*)\]/.exec(plans)?.[1].match(/"[A-Za-z]+"/g)?.map(s => s.slice(1, -1));
  assert.deepEqual(types, [...PLAN_TOKEN_TYPES]);
});
```

`test/unit/settings.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordLabel, initOptions, settingsFrom } from '../../src/settings';
import { KEYS } from '../../src/commandTable';

const getter = (values: Record<string, unknown>) => (key: string, fallback: unknown) => key in values ? values[key] : fallback;

test('settings: defaults, and a bad debounce falls back to 300', () => {
  assert.deepEqual(settingsFrom(getter({})), { debounceMs: 300, model: '', fills: '' });
  assert.deepEqual(settingsFrom(getter({ debounceMs: 120.4, model: ' qwen ', fills: '/f.toml' })),
    { debounceMs: 120, model: 'qwen', fills: '/f.toml' });
  for (const bad of [-1, Number.NaN, '300', null]) assert.equal(settingsFrom(getter({ debounceMs: bad })).debounceMs, 300);
  assert.equal(settingsFrom(getter({ model: 3 })).model, '');
});

test('the chord label follows the platform, and names the review chord of KEYS', () => {
  assert.equal(chordLabel('darwin', 'P R'), 'Cmd+Alt+D P R');
  assert.equal(chordLabel('linux', 'P R'), 'Ctrl+Alt+D P R');
  assert.equal(chordLabel('win32', 'P R'), 'Ctrl+Alt+D P R');
  assert.equal(KEYS.find(k => k.command === 'durandal.plan.review')?.keys, 'p r');
});

test('initializationOptions: debug off, the review key, the debounce; model and fills only when set', () => {
  assert.deepEqual(initOptions({ debounceMs: 300, model: '', fills: '' }, 'linux'),
    { debug: false, keys: { plan_review: 'Ctrl+Alt+D P R' }, debounce_ms: 300 });
  assert.deepEqual(initOptions({ debounceMs: 50, model: 'qwen', fills: '/f.toml' }, 'darwin'),
    { debug: false, keys: { plan_review: 'Cmd+Alt+D P R' }, debounce_ms: 50, model: 'qwen', fills: '/f.toml' });
});
```

`test/unit/manifest.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../package.json';
import { KEYS, NOT_YET, PREFIX, SERVER_NAMED } from '../../src/commandTable';

test('the contributed commands: Health, Restart, and every not-yet command, each in the Durandal category', () => {
  const ids = pkg.contributes.commands.map(c => c.command).sort();
  assert.deepEqual(ids, ['durandal.restartServer', 'durandal.showHealth', ...Object.keys(NOT_YET)].sort());
  assert.ok(pkg.contributes.commands.every(c => c.category === 'Durandal'));
  for (const c of pkg.contributes.commands) {
    if (NOT_YET[c.command]) assert.equal(c.title, NOT_YET[c.command].title, c.command);
  }
  for (const id of Object.keys(SERVER_NAMED)) assert.ok(!ids.includes(id), `${id} is registered, not contributed`);
});

test('the keybindings are KEYS under the chord prefix, without clashes', () => {
  const want = KEYS.map(k => ({ command: k.command, key: `${PREFIX.key} ${k.keys}`, mac: `${PREFIX.mac} ${k.keys}`, when: k.when }));
  assert.deepEqual(pkg.contributes.keybindings, want);
  const byWhen = new Map<string, string[]>();
  for (const k of KEYS) byWhen.set(k.when, [...(byWhen.get(k.when) ?? []), k.keys]);
  for (const [when, keys] of byWhen) assert.equal(new Set(keys).size, keys.length, `a clash under ${when}`);
  assert.ok(KEYS.filter(k => k.keys.startsWith('p ')).every(k => k.when === 'durandal.isPlan'));
  assert.ok(KEYS.filter(k => !k.keys.startsWith('p ')).every(k => k.when === 'durandal.inProject'));
});

test('the settings and the activation', () => {
  assert.deepEqual(Object.keys(pkg.contributes.configuration.properties).sort(),
    ['durandal.debounceMs', 'durandal.fills', 'durandal.model', 'durandal.path', 'durandal.trace.server']);
  assert.deepEqual(pkg.activationEvents, ['workspaceContains:**/.olifant/config.toml']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/protocol'` (and `settings`, `commandTable`).

- [ ] **Step 3: Write `src/protocol.ts`**

```ts
// The olifant/* wire contract: every custom method olifant lsp answers or sends, and the
// commands it names. References: the olifant book, user/16-the-language-server.md (the table
// "What it answers"), user/18-tdd-in-the-editor.md, user/19-plans.md, internals/03-plans.md;
// the truth is src/Olifant/Lsp.hs. No other file spells a method string. A milestone that
// consumes a result tightens its type here.
import {
  NotificationType, Position, RequestType, TextDocumentIdentifier, WorkspaceEdit,
} from 'vscode-languageserver-protocol';

export interface Doc { textDocument: TextDocumentIdentifier }
export interface At extends Doc { position: Position }
// Row: a 0-based line of a plan file.
export interface Row extends Doc { line: number }
export type Sets = Record<string, unknown>;
// Survivor: a mutate's surviving mutant (line 1-based), as olifant/mutate lists it.
export interface Survivor { line: number; operator: string; from: string; to: string; mutated: string }
type Open = Record<string, unknown>;

// --- generate (milestone 2)
export interface GeneratorsParams extends Doc { position?: Position }
export interface GeneratorItem extends Open { name: string; kind?: string; summary?: string; here?: boolean }
export interface GeneratorsResult extends Open { generators: GeneratorItem[] }
export interface ChoicesParams extends Doc { generator: string; sets: Sets }
export interface ChoicesResult extends Open { inputs: unknown[] }
export interface PreviewParams extends At { steps: unknown[] }
// olifant/plan: the generate picker's steps, a follow-up's planId, or a recognition's sets.
export type PlanParams =
  | (At & { steps: unknown[] })
  | { planId: string; fill?: boolean }
  | (Doc & { generator: string; sets: Sets; recognize: true });
export interface PlanResult extends Open { plan?: unknown; edit?: WorkspaceEdit }

// --- ghosts and follow-ups (milestone 3)
export interface Suggestion extends Open {
  uri: string; version: number; kind: string; label?: string; summary?: string; line?: number; lines?: unknown; at?: unknown; planId?: string;
}
export interface SuggestParams extends Doc { line: number }
export interface RecognitionFeedbackParams extends Doc { generator: string; outcome: string }

// --- the TDD loop (milestone 4)
export interface StubParams extends At { survivor?: Survivor }
export interface StubResult extends Open { file: string; line: number; name: string; edits: WorkspaceEdit }
export interface ConjureResume { token: string; choice: string; arg?: unknown; land?: boolean; hint?: string }
export interface ConjureParams extends At { selection?: { start: number; end: number }; resume?: ConjureResume }
export type ConjureResult =
  | (Open & { file: string; unit: string; edits: WorkspaceEdit; summary: string; green: boolean; tests?: unknown; rounds?: unknown; rungs?: unknown })
  | { paused: Open };
export interface MutateResult extends Open {
  file: string; unit: string; lines: unknown; killed: number; survived: number; survivors: (Survivor & { dim?: boolean })[]; summary: string;
}
export interface WaiveParams extends Doc { survivor: Survivor; reason: string }
export interface TestsRunResult extends Open {
  file: string; passed: number; failed: { id: string; line: number; message: string; output: string }[]; broken: string | null; seconds: number;
}
export interface TestsFileResult { file: string; kind: 'test' | 'module'; exists: boolean }

// --- plans (milestones 5 and 6)
export interface ErrandParams extends Row { resume?: unknown; text?: string }
export interface ErrandResult extends Open { id?: string; facts?: unknown; blocks?: unknown[]; review?: string }
export interface ReconcileParams extends Doc { forced: boolean }
export interface AnchorResult extends Open { file?: string; line?: number; unit?: string; fingerprint?: string }
export interface StepResult extends Open { edits?: WorkspaceEdit; facts?: unknown; name?: string; passed?: number; failed?: number; seconds?: number }
export type ErrandOneParams = Doc & ({ id: string } | { row: number });
export interface ErrandsParams extends Doc { row: number }
export interface ReviewParams extends Doc { id: string }
export interface ReviewChooseParams extends Doc { id: string; choice: string; [more: string]: unknown }
export interface ReviewReady { id: string; kind: string; textDocument: TextDocumentIdentifier }
export interface OutcomeParams extends Doc { id: string; block: number; outcome: 'accepted' | 'rejected' }

// --- tests of the server itself (initializationOptions.debug)
export interface DebugState extends Open { documents: unknown[]; projects: Record<string, number>; broken?: Record<string, string> }

const req = <P, R>(method: string) => new RequestType<P, R, void>(method);
const note = <P>(method: string) => new NotificationType<P>(method);

export const Olifant = {
  generators: req<GeneratorsParams, GeneratorsResult>('olifant/generators'),
  choices: req<ChoicesParams, ChoicesResult>('olifant/choices'),
  preview: req<PreviewParams, Open>('olifant/preview'),
  plan: req<PlanParams, PlanResult>('olifant/plan'),
  fileActions: req<Doc, unknown>('olifant/fileActions'),
  holes: req<Doc, unknown>('olifant/holes'),
  model: req<Doc, Open>('olifant/model'),
  suggest: req<SuggestParams, Suggestion | null>('olifant/suggest'),
  stub: req<StubParams, StubResult>('olifant/stub'),
  conjure: req<ConjureParams, ConjureResult>('olifant/conjure'),
  mutate: req<At, MutateResult>('olifant/mutate'),
  waive: req<WaiveParams, unknown>('olifant/waive'),
  testsRun: req<Doc, TestsRunResult>('olifant/tests/run'),
  testsFile: req<Doc, TestsFileResult>('olifant/tests/file'),
  debugState: req<Record<string, never>, DebugState>('olifant/debugState'),
  plansAsk: req<ErrandParams, ErrandResult>('olifant/plans/ask'),
  plansValidate: req<ErrandParams, ErrandResult>('olifant/plans/validate'),
  plansDo: req<ErrandParams, ErrandResult>('olifant/plans/do'),
  plansReconcile: req<ReconcileParams, Open>('olifant/plans/reconcile'),
  plansAnchor: req<Row, AnchorResult | null>('olifant/plans/anchor'),
  plansFiles: req<Doc, Open>('olifant/plans/files'),
  plansStub: req<Row, StepResult>('olifant/plans/stub'),
  plansTest: req<Row, StepResult>('olifant/plans/test'),
  plansErrand: req<ErrandOneParams, Open>('olifant/plans/errand'),
  plansErrands: req<ErrandsParams, { errands: unknown[] }>('olifant/plans/errands'),
  plansReviews: req<Doc, { reviews: unknown[] }>('olifant/plans/reviews'),
  plansReview: req<ReviewParams, Open>('olifant/plans/review'),
  plansReviewChoose: req<ReviewChooseParams, Open>('olifant/plans/review/choose'),
  recognitionFeedback: note<RecognitionFeedbackParams>('olifant/recognitionFeedback'),
  plansOutcome: note<OutcomeParams>('olifant/plans/outcome'),
  suggestion: note<Suggestion>('olifant/suggestion'),
  plansReviewReady: note<ReviewReady>('olifant/plans/review/ready'),
} as const;

export const METHODS: string[] = Object.values(Olifant).map(t => t.method);

// The server's own command (workspace/executeCommand); the library registers it from the
// server's executeCommandProvider.
export const SERVER_COMMANDS = { doctor: 'olifant.doctor' } as const;

// Commands the server names in its inlay hints and code lenses; the client runs them.
export const CLIENT_COMMANDS = {
  showActions: 'olifant.showActions',
  planReview: 'olifant.plans.review',
  planExcerpt: 'olifant.plans.excerpt',
  planErrand: 'olifant.plans.errand',
} as const;

export interface DoctorCheck { name: string; status: 'ok' | 'warn' | 'error'; detail: string; fix: string | null }
export interface DoctorResult { checks: DoctorCheck[] }

// The plan files' semantic token legend (Server/Plans.hs planTokenTypes, planTokenModifiers).
export const PLAN_TOKEN_TYPES: readonly string[] = [
  'planMarker', 'planStep', 'planStepDone', 'planQuestion', 'planEvidence', 'planClaim', 'planTest',
  'planAlso', 'planJournal', 'planAnchorPath', 'planAnchorUnit', 'planVerdict', 'planFingerprint',
];
export const PLAN_TOKEN_MODIFIERS: readonly string[] = ['done', 'stale', 'notFound'];
```
If `tsc` rejects an `interface … extends Open` whose fields are narrower than `unknown`, keep the fields and replace `extends Open` with an intersection type (`type X = Open & { … }`); the tests only check method names.

- [ ] **Step 4: Write `src/settings.ts`**

```ts
// The settings the server reads at initialize. A change needs Durandal: Restart Server.
export interface Settings { debounceMs: number; model: string; fills: string }

export function settingsFrom(get: (key: string, fallback: unknown) => unknown): Settings {
  const d = get('debounceMs', 300);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    debounceMs: typeof d === 'number' && Number.isFinite(d) && d >= 0 ? Math.round(d) : 300,
    model: str(get('model', '')),
    fills: str(get('fills', '')),
  };
}

// chordLabel is how a chord reads on this platform; the server prints it in its lenses
// ("looks done · tick? Ctrl+Alt+D P R").
export function chordLabel(platform: string, rest: string): string {
  return `${platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Alt+D ${rest}`;
}

export interface InitOptions {
  debug: false;
  keys: { plan_review: string };
  debounce_ms: number;
  model?: string;
  fills?: string;
}

export function initOptions(s: Settings, platform: string): InitOptions {
  const o: InitOptions = { debug: false, keys: { plan_review: chordLabel(platform, 'P R') }, debounce_ms: s.debounceMs };
  if (s.model) o.model = s.model;
  if (s.fills) o.fills = s.fills;
  return o;
}
```

- [ ] **Step 5: Write `src/commandTable.ts`**

```ts
// The commands later milestones build (spec §6); until then each says so when run.
export const NOT_YET: Record<string, { title: string; milestone: number }> = {
  'durandal.actions': { title: 'Actions Here', milestone: 2 },
  'durandal.generate': { title: 'Generate…', milestone: 2 },
  'durandal.test.file': { title: "Run This File's Tests", milestone: 4 },
  'durandal.test.all': { title: 'Run All Tests', milestone: 4 },
  'durandal.jump': { title: 'Jump to Test or Module', milestone: 4 },
  'durandal.stub': { title: 'Stub a Test', milestone: 4 },
  'durandal.conjure': { title: 'Conjure', milestone: 4 },
  'durandal.mutate': { title: 'Mutate', milestone: 4 },
  'durandal.plan.ask': { title: 'Plan: Ask', milestone: 6 },
  'durandal.plan.validate': { title: 'Plan: Validate', milestone: 6 },
  'durandal.plan.do': { title: 'Plan: Do', milestone: 6 },
  'durandal.plan.accept': { title: 'Plan: Accept', milestone: 6 },
  'durandal.plan.reject': { title: 'Plan: Reject', milestone: 6 },
  'durandal.plan.files': { title: 'Plan: Files', milestone: 6 },
  'durandal.plan.reconcile': { title: 'Plan: Reconcile', milestone: 6 },
  'durandal.plan.excerpt': { title: 'Plan: Excerpt', milestone: 6 },
  'durandal.plan.review': { title: 'Plan: Review', milestone: 5 },
  'durandal.plan.toggle': { title: 'Plan: Toggle Reading', milestone: 6 },
};

// Commands the server names in its inlay hints (⚡) and code lenses: registered so a click
// never fails with "command not found", not contributed (they need the server's arguments).
// Keys equal protocol.ts CLIENT_COMMANDS' values (the protocol unit test checks them against
// olifant's source).
export const SERVER_NAMED: Record<string, { title: string; milestone: number }> = {
  'olifant.showActions': { title: 'Actions', milestone: 2 },
  'olifant.plans.review': { title: 'Plan Review', milestone: 5 },
  'olifant.plans.excerpt': { title: 'Plan Excerpt', milestone: 6 },
  'olifant.plans.errand': { title: 'Plan Delegations', milestone: 6 },
};

export const notYet = (title: string) => `Durandal: ${title} is not implemented yet`;

// The chord prefix, then durandal.nvim's letters (spec §4).
export const PREFIX = { key: 'ctrl+alt+d', mac: 'cmd+alt+d' } as const;

export const KEYS: { command: string; keys: string; when: string }[] = [
  { command: 'durandal.actions', keys: 'a', when: 'durandal.inProject' },
  { command: 'durandal.generate', keys: 'g', when: 'durandal.inProject' },
  { command: 'durandal.test.file', keys: 't', when: 'durandal.inProject' },
  { command: 'durandal.test.all', keys: 'shift+t', when: 'durandal.inProject' },
  { command: 'durandal.jump', keys: 'j', when: 'durandal.inProject' },
  { command: 'durandal.stub', keys: 's', when: 'durandal.inProject' },
  { command: 'durandal.conjure', keys: 'c', when: 'durandal.inProject' },
  { command: 'durandal.mutate', keys: 'm', when: 'durandal.inProject' },
  { command: 'durandal.plan.ask', keys: 'p q', when: 'durandal.isPlan' },
  { command: 'durandal.plan.validate', keys: 'p v', when: 'durandal.isPlan' },
  { command: 'durandal.plan.do', keys: 'p d', when: 'durandal.isPlan' },
  { command: 'durandal.plan.accept', keys: 'p y', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reject', keys: 'p n', when: 'durandal.isPlan' },
  { command: 'durandal.plan.files', keys: 'p f', when: 'durandal.isPlan' },
  { command: 'durandal.plan.reconcile', keys: 'p c', when: 'durandal.isPlan' },
  { command: 'durandal.plan.excerpt', keys: 'p e', when: 'durandal.isPlan' },
  { command: 'durandal.plan.review', keys: 'p r', when: 'durandal.isPlan' },
  { command: 'durandal.plan.toggle', keys: 'p x', when: 'durandal.isPlan' },
];
```
`durandal.isPlan` is never set in this milestone (milestone 6 sets it), so the plan chords are inert until then; their commands still run from the palette. The plan chords have three parts (`ctrl+alt+d p q`): VS Code accepts multi-part chords since 1.80; the manual checklist (Task 8) confirms it on 1.91.

- [ ] **Step 6: Add commands and keybindings to `package.json`**

Under `contributes`, `commands` (Health and Restart first, then every `NOT_YET` entry in table order, each `{ "command", "title", "category": "Durandal" }` with the table's title):
```json
"commands": [
  { "command": "durandal.showHealth", "title": "Show Health", "category": "Durandal" },
  { "command": "durandal.restartServer", "title": "Restart Server", "category": "Durandal" },
  { "command": "durandal.actions", "title": "Actions Here", "category": "Durandal" },
  { "command": "durandal.generate", "title": "Generate…", "category": "Durandal" },
  { "command": "durandal.test.file", "title": "Run This File's Tests", "category": "Durandal" },
  { "command": "durandal.test.all", "title": "Run All Tests", "category": "Durandal" },
  { "command": "durandal.jump", "title": "Jump to Test or Module", "category": "Durandal" },
  { "command": "durandal.stub", "title": "Stub a Test", "category": "Durandal" },
  { "command": "durandal.conjure", "title": "Conjure", "category": "Durandal" },
  { "command": "durandal.mutate", "title": "Mutate", "category": "Durandal" },
  { "command": "durandal.plan.ask", "title": "Plan: Ask", "category": "Durandal" },
  { "command": "durandal.plan.validate", "title": "Plan: Validate", "category": "Durandal" },
  { "command": "durandal.plan.do", "title": "Plan: Do", "category": "Durandal" },
  { "command": "durandal.plan.accept", "title": "Plan: Accept", "category": "Durandal" },
  { "command": "durandal.plan.reject", "title": "Plan: Reject", "category": "Durandal" },
  { "command": "durandal.plan.files", "title": "Plan: Files", "category": "Durandal" },
  { "command": "durandal.plan.reconcile", "title": "Plan: Reconcile", "category": "Durandal" },
  { "command": "durandal.plan.excerpt", "title": "Plan: Excerpt", "category": "Durandal" },
  { "command": "durandal.plan.review", "title": "Plan: Review", "category": "Durandal" },
  { "command": "durandal.plan.toggle", "title": "Plan: Toggle Reading", "category": "Durandal" }
]
```
and `keybindings`, one per `KEYS` row in order, `{ "command", "key": "ctrl+alt+d <keys>", "mac": "cmd+alt+d <keys>", "when" }`, for example:
```json
"keybindings": [
  { "command": "durandal.actions", "key": "ctrl+alt+d a", "mac": "cmd+alt+d a", "when": "durandal.inProject" },
  { "command": "durandal.generate", "key": "ctrl+alt+d g", "mac": "cmd+alt+d g", "when": "durandal.inProject" },
  { "command": "durandal.test.file", "key": "ctrl+alt+d t", "mac": "cmd+alt+d t", "when": "durandal.inProject" },
  { "command": "durandal.test.all", "key": "ctrl+alt+d shift+t", "mac": "cmd+alt+d shift+t", "when": "durandal.inProject" },
  { "command": "durandal.jump", "key": "ctrl+alt+d j", "mac": "cmd+alt+d j", "when": "durandal.inProject" },
  { "command": "durandal.stub", "key": "ctrl+alt+d s", "mac": "cmd+alt+d s", "when": "durandal.inProject" },
  { "command": "durandal.conjure", "key": "ctrl+alt+d c", "mac": "cmd+alt+d c", "when": "durandal.inProject" },
  { "command": "durandal.mutate", "key": "ctrl+alt+d m", "mac": "cmd+alt+d m", "when": "durandal.inProject" },
  { "command": "durandal.plan.ask", "key": "ctrl+alt+d p q", "mac": "cmd+alt+d p q", "when": "durandal.isPlan" },
  { "command": "durandal.plan.validate", "key": "ctrl+alt+d p v", "mac": "cmd+alt+d p v", "when": "durandal.isPlan" },
  { "command": "durandal.plan.do", "key": "ctrl+alt+d p d", "mac": "cmd+alt+d p d", "when": "durandal.isPlan" },
  { "command": "durandal.plan.accept", "key": "ctrl+alt+d p y", "mac": "cmd+alt+d p y", "when": "durandal.isPlan" },
  { "command": "durandal.plan.reject", "key": "ctrl+alt+d p n", "mac": "cmd+alt+d p n", "when": "durandal.isPlan" },
  { "command": "durandal.plan.files", "key": "ctrl+alt+d p f", "mac": "cmd+alt+d p f", "when": "durandal.isPlan" },
  { "command": "durandal.plan.reconcile", "key": "ctrl+alt+d p c", "mac": "cmd+alt+d p c", "when": "durandal.isPlan" },
  { "command": "durandal.plan.excerpt", "key": "ctrl+alt+d p e", "mac": "cmd+alt+d p e", "when": "durandal.isPlan" },
  { "command": "durandal.plan.review", "key": "ctrl+alt+d p r", "mac": "cmd+alt+d p r", "when": "durandal.isPlan" },
  { "command": "durandal.plan.toggle", "key": "ctrl+alt+d p x", "mac": "cmd+alt+d p x", "when": "durandal.isPlan" }
]
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:unit && npm run lint`, then once with the drift check: `OLIFANT_REPO=~/projects/olifant npm run test:unit` (check `git -C ~/projects/olifant rev-parse HEAD` first; if it is not `.olifant-ref`, run it on a worktree at the ref: `git -C ~/projects/olifant worktree add --detach <scratchpad>/olifant-ref $(cat .olifant-ref)`, and remove the worktree afterwards).
Expected: PASS, including "the contract matches olifant's source". If the drift test finds a name the pinned list lacks, the list is wrong: add the name to `protocol.ts` (and `SERVER_NAMED` for a command), never loosen the scan.

- [ ] **Step 8: Commit**

```bash
git add src test/unit package.json
git commit -m "protocol: every olifant/* method typed, checked against olifant's source; settings, commands and chords"
```

---

### Task 4: The pure parts of the server's edits (`src/edits.ts`)

**Files:**
- Create: `src/edits.ts`
- Test: `test/unit/edits.test.ts`

**Interfaces:**
- Produces (no `vscode` import; `WorkspaceEdit` from `vscode-languageserver-protocol`):
  - `stripAnnotations(edit: WorkspaceEdit): WorkspaceEdit` — a deep copy without `changeAnnotations` or any `annotationId`.
  - `editedUris(edit: WorkspaceEdit): string[]` — the uris of text edits and created files, distinct, in order.
  - `fileName(uri: string): string` — the decoded last path segment.
  - `versionConflict(edit: WorkspaceEdit, versionOf: (uri: string) => number | undefined): string | undefined` — `"<file> changed since"` for the first `TextDocumentEdit` whose numeric version differs from the open document's (`versionOf` returns undefined for a document that is not open; a `null` version matches any).
  - `appliedMessage(label: string | undefined, saved: string[], unsaved: string[]): string | undefined` — `"<label or Olifant>: a.py, b.py, c.py (unsaved)"`, undefined when both are empty.

- [ ] **Step 1: Write the failing test**

`test/unit/edits.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { appliedMessage, editedUris, fileName, stripAnnotations, versionConflict } from '../../src/edits';

const R = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

const regions: WorkspaceEdit = {
  documentChanges: [
    { textDocument: { uri: 'file:///w/a.py', version: 3 }, edits: [{ range: R, newText: 'x', annotationId: 'r' }] },
    { kind: 'create', uri: 'file:///w/new%20file.py', annotationId: 'r' },
    { textDocument: { uri: 'file:///w/b.py', version: null }, edits: [{ range: R, newText: 'y', annotationId: 'r' }] },
    { textDocument: { uri: 'file:///w/a.py', version: 3 }, edits: [{ range: R, newText: 'z' }] },
  ],
  changes: { 'file:///w/c.py': [{ range: R, newText: 'c' }] },
  changeAnnotations: { r: { label: 'regions', needsConfirmation: true } },
};

test('stripAnnotations drops every annotation and leaves the input alone', () => {
  const s = stripAnnotations(regions);
  assert.equal(s.changeAnnotations, undefined);
  assert.ok(!JSON.stringify(s).includes('annotationId'));
  assert.equal(s.documentChanges!.length, 4);
  assert.ok(JSON.stringify(regions).includes('annotationId'), 'the input is not modified');
  assert.deepEqual(stripAnnotations({}), {});
});

test('editedUris: text edits and created files, each once, in order', () => {
  assert.deepEqual(editedUris(regions), ['file:///w/a.py', 'file:///w/new%20file.py', 'file:///w/b.py', 'file:///w/c.py']);
});

test('fileName decodes the last segment', () => {
  assert.equal(fileName('file:///w/new%20file.py'), 'new file.py');
  assert.equal(fileName('file:///w/plans/p.md#x'), 'p.md');
});

test('versionConflict: a numeric version must equal the open document\'s', () => {
  const versions: Record<string, number> = { 'file:///w/a.py': 3, 'file:///w/b.py': 9 };
  assert.equal(versionConflict(regions, u => versions[u]), undefined, 'a.py at 3; b.py has no version');
  versions['file:///w/a.py'] = 4;
  assert.equal(versionConflict(regions, u => versions[u]), 'a.py changed since');
  assert.equal(versionConflict(regions, () => undefined), undefined, 'a document that is not open has no version to differ');
});

test('appliedMessage names saved files, then the unsaved ones', () => {
  assert.equal(appliedMessage('Olifant: regions', ['a.py', 'b.py'], ['c.py']), 'Olifant: regions: a.py, b.py, c.py (unsaved)');
  assert.equal(appliedMessage(undefined, ['a.py'], []), 'Olifant: a.py');
  assert.equal(appliedMessage('  ', [], ['a.py']), 'Olifant: a.py (unsaved)');
  assert.equal(appliedMessage('x', [], []), undefined);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit`
Expected: FAIL, `Cannot find module '../../src/edits'`.

- [ ] **Step 3: Write `src/edits.ts`**

```ts
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';

// stripAnnotations: a server edit is what the person already asked for (a region refresh, a
// landing), so it goes in at once. Annotated as needing confirmation, VS Code would open the
// refactor preview for it (olifant marks a multi-file region refresh so).
export function stripAnnotations(edit: WorkspaceEdit): WorkspaceEdit {
  const copy = JSON.parse(JSON.stringify(edit ?? {})) as WorkspaceEdit;
  delete copy.changeAnnotations;
  const strip = (x: unknown) => { delete (x as { annotationId?: unknown }).annotationId; };
  for (const c of copy.documentChanges ?? []) {
    strip(c);
    if ('edits' in c) for (const e of c.edits) strip(e);
  }
  for (const es of Object.values(copy.changes ?? {})) for (const e of es) strip(e);
  return copy;
}

// editedUris are the files an edit writes: its text edits' documents and the files it creates.
export function editedUris(edit: WorkspaceEdit): string[] {
  const out: string[] = [];
  const add = (u: string) => { if (!out.includes(u)) out.push(u); };
  for (const c of edit.documentChanges ?? []) {
    if ('textDocument' in c) add(c.textDocument.uri);
    else if (c.kind === 'create') add(c.uri);
  }
  for (const u of Object.keys(edit.changes ?? {})) add(u);
  return out;
}

export function fileName(uri: string): string {
  const path = uri.replace(/[?#].*$/, '');
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

// versionConflict: an edit made at a version of an open document that is not its version now
// is refused whole (durandal.nvim's rule; olifant ties its edits to versions).
export function versionConflict(edit: WorkspaceEdit, versionOf: (uri: string) => number | undefined): string | undefined {
  for (const c of edit.documentChanges ?? []) {
    if (!('textDocument' in c)) continue;
    const want = c.textDocument.version;
    if (typeof want !== 'number') continue;
    const have = versionOf(c.textDocument.uri);
    if (have !== undefined && have !== want) return `${fileName(c.textDocument.uri)} changed since`;
  }
  return undefined;
}

// appliedMessage is the one notice after an edit: the files it saved, then those it could not.
export function appliedMessage(label: string | undefined, saved: string[], unsaved: string[]): string | undefined {
  const names = [...saved, ...unsaved.map(n => `${n} (unsaved)`)];
  if (names.length === 0) return undefined;
  return `${label && label.trim() !== '' ? label : 'Olifant'}: ${names.join(', ')}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edits.ts test/unit/edits.test.ts
git commit -m "edits: the server's edits without annotations, the version check, the notice"
```

---

### Task 5: The client: one server, projects as folders, the edit handler, Health, Restart

**Files:**
- Create: `src/applyEdit.ts`, `src/server.ts`, `src/projects.ts`, `src/commands.ts`
- Modify: `src/extension.ts` (replace)

**Interfaces:**
- Consumes: `findRoot`, `realRoot`, `rootOfConfig`, `isPlanFile` (Task 1); `checkBinary`, `report`, `Gate`, `ServerState`, `DoctorSection`, `STOPPED` (Task 2); `Olifant`, `SERVER_COMMANDS`, `DoctorResult` (Task 3); `settingsFrom`, `initOptions` (Task 3); `NOT_YET`, `SERVER_NAMED`, `notYet` (Task 3); `stripAnnotations`, `editedUris`, `versionConflict`, `appliedMessage` (Task 4).
- Produces:
  - `applyEdit.ts`: `applyServerEdit(lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void): Promise<ApplyWorkspaceEditResult>`.
  - `server.ts`: `type Say = (level: 'info' | 'warn' | 'error', text: string, ...actions: string[]) => Thenable<string | undefined>`; `NOT_RUNNING`; `class Server` with `state(): ServerState`, `roots(): string[]`, `client(): LanguageClient | undefined` (only while running), `checkGate(): Promise<Gate>`, `addRoot(root: string): Promise<void>`, `start(): Promise<boolean>`, `stop(): Promise<void>`, `restart(): Promise<void>`, `request<P, R>(type: RequestType<P, R, void>, params: P, token?: vscode.CancellationToken): Promise<R>`, `notify<P>(type: NotificationType<P>, params: P): Promise<void>`, `doctor(uri: vscode.Uri): Promise<DoctorResult>`.
  - `projects.ts`: `discover(): Promise<string[]>`, `trackProjects(context, server): { inProject(): boolean }`.
  - `commands.ts`: `registerNotYet(context, say: Say): void`.
  - `extension.ts`: `interface Api { server: Server; health(): Promise<string[]>; shown: { level: string; text: string }[]; inProject(): boolean }` returned from `activate`. `shown` records every notification the extension shows, for the e2e tests.

This task's code is proven by Tasks 6 and 7; its own gate is lint, unit and build.

- [ ] **Step 1: Write `src/applyEdit.ts`**

```ts
import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ApplyWorkspaceEditParams, ApplyWorkspaceEditResult, LanguageClient } from 'vscode-languageclient/node';
import { appliedMessage, editedUris, stripAnnotations, versionConflict } from './edits';
import { isPlanFile } from './root';

// key compares a server's uri with VS Code's spelling of it (encoding differs: %3A, [, ]).
const key = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (k: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === k);

// applyServerEdit is durandal.nvim's workspace/applyEdit: refused whole if an open document
// moved past the version the edit was made at; applied without its annotations; then each
// edited file that had no unsaved changes before, and is not a plan, is saved (as regions are
// kept on save); one notice names the files saved, and those it could not save.
export async function applyServerEdit(
  lc: LanguageClient, params: ApplyWorkspaceEditParams, say: (text: string) => void,
): Promise<ApplyWorkspaceEditResult> {
  const edit = stripAnnotations(params.edit);
  const conflict = versionConflict(edit, uri => openDoc(key(uri))?.version);
  if (conflict) return { applied: false, failureReason: conflict };
  const targets = editedUris(edit).map(u => vscode.Uri.parse(u));
  const dirtyBefore = new Set(targets.filter(u => openDoc(u.toString())?.isDirty).map(u => u.toString()));
  let ok: boolean;
  try {
    ok = await vscode.workspace.applyEdit(await lc.protocol2CodeConverter.asWorkspaceEdit(edit));
  } catch (err) {
    return { applied: false, failureReason: err instanceof Error ? err.message : String(err) };
  }
  if (!ok) return { applied: false, failureReason: 'VS Code did not apply the edit' };
  const saved: string[] = [];
  const unsaved: string[] = [];
  for (const uri of targets) {
    if (uri.scheme !== 'file' || dirtyBefore.has(uri.toString()) || await isPlanFile(uri.fsPath)) continue;
    // an edit to a file that was not open leaves it open, unsaved, in VS Code's documents
    const doc = openDoc(uri.toString()) ?? await vscode.workspace.openTextDocument(uri).then(d => d, () => undefined);
    if (!doc || !doc.isDirty) continue;
    (await doc.save() ? saved : unsaved).push(basename(uri.fsPath));
  }
  const text = appliedMessage(params.label, saved, unsaved);
  if (text) say(text);
  return { applied: true };
}
```

- [ ] **Step 2: Write `src/server.ts`**

```ts
import * as os from 'node:os';
import * as vscode from 'vscode';
import {
  ApplyWorkspaceEditRequest, CloseAction, DidChangeWorkspaceFoldersNotification, ErrorAction, ExecuteCommandRequest,
  LanguageClient, LanguageClientOptions, NotificationType, RequestType, ServerOptions,
} from 'vscode-languageclient/node';
import { applyServerEdit } from './applyEdit';
import { checkBinary, Gate, ServerState, STOPPED } from './health';
import { DoctorResult, SERVER_COMMANDS } from './protocol';
import { realRoot } from './root';
import { initOptions, settingsFrom } from './settings';

export type Say = (level: 'info' | 'warn' | 'error', text: string, ...actions: string[]) => Thenable<string | undefined>;

export const NOT_RUNNING = 'olifant lsp is not running here (Durandal: Show Health)';

// OlifantClient keeps the library's forced notifications out of a start: the extension reports
// a failed start itself, once. They still reach the output channel.
class OlifantClient extends LanguageClient {
  quiet = true;
  override error(message: string, data?: unknown, showNotification: boolean | 'force' = true): void {
    super.error(message, data, this.quiet ? false : showNotification);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(what)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// Server is the window's one olifant lsp (durandal.nvim's one client per session). Every
// Olifant project the window holds is one of its workspace folders: VS Code's folders go in
// initialize; the projects found under them, and those of files opened from elsewhere, follow
// with workspace/didChangeWorkspaceFolders.
export class Server {
  private lc: OlifantClient | undefined;
  private starting: Promise<boolean> | undefined;
  private st: ServerState = 'not started';
  private gate: Gate | undefined;
  private reported = false;
  private stopping = false;
  private known = new Set<string>();
  private sent = new Set<string>();

  constructor(private readonly output: vscode.LogOutputChannel, private readonly say: Say) {}

  state(): ServerState { return this.st; }
  roots(): string[] { return [...this.known]; }
  client(): LanguageClient | undefined { return this.st === 'running' ? this.lc : undefined; }

  async checkGate(): Promise<Gate> {
    if (!this.gate) {
      const setting = vscode.workspace.getConfiguration('durandal').get<string>('path', 'olifant');
      this.gate = await checkBinary(setting, process.env, os.homedir());
    }
    return this.gate;
  }

  // addRoot records a project (by real path); a running server hears of it at once.
  async addRoot(root: string): Promise<void> {
    this.known.add(await realRoot(root));
    if (this.st === 'running') this.sendFolders();
  }

  private sendFolders(): void {
    const lc = this.lc;
    if (!lc) return;
    const vsFolders = new Set((vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath));
    const added = [...this.known].filter(r => !this.sent.has(r) && !vsFolders.has(r));
    for (const r of added) this.sent.add(r);
    if (added.length === 0) return;
    void lc.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
      event: { added: added.map(r => ({ uri: vscode.Uri.file(r).toString(), name: r })), removed: [] },
    });
  }

  // reportOnce is the one error notification per failure until the next restart.
  private reportOnce(text: string, ...actions: string[]): void {
    if (this.reported) return;
    this.reported = true;
    void this.say('error', text, ...actions).then(pick => {
      if (pick === 'Show Health') void vscode.commands.executeCommand('durandal.showHealth');
      if (pick === 'Restart Server') void vscode.commands.executeCommand('durandal.restartServer');
      if (pick === 'Open Settings') void vscode.commands.executeCommand('workbench.action.openSettings', 'durandal.path');
    });
  }

  // start starts the server once; false when the binary failed its check or the start failed.
  start(): Promise<boolean> {
    if (!this.starting) this.starting = this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<boolean> {
    const gate = await this.checkGate();
    if (!gate.ok || !gate.path) {
      this.st = 'failed';
      this.reportOnce(gate.problem ?? 'olifant: the binary failed its check', 'Open Settings', 'Show Health');
      return false;
    }
    this.st = 'starting';
    const config = vscode.workspace.getConfiguration('durandal');
    const settings = settingsFrom((k, fallback) => config.get(k, fallback));
    const serverOptions: ServerOptions = { command: gate.path, args: ['lsp'], options: { env: { ...process.env } } };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file' }],
      initializationOptions: initOptions(settings, process.platform),
      outputChannel: this.output,
      // a failed initialize is reported by the start failure below, not by the library
      initializationFailedHandler: () => false,
      errorHandler: {
        error: err => {
          this.output.error(`olifant lsp: connection error: ${err.message}`);
          return { action: ErrorAction.Continue, handled: true };
        },
        closed: () => {
          if (!this.stopping && this.st === 'running') {
            this.st = 'stopped';
            this.reportOnce(STOPPED, 'Show Health', 'Restart Server');
          }
          return { action: CloseAction.DoNotRestart, handled: true };
        },
      },
    };
    const lc = new OlifantClient('durandal', 'Durandal (olifant lsp)', serverOptions, clientOptions);
    this.lc = lc;
    try {
      await lc.start();
    } catch (err) {
      lc.quiet = false;
      const message = err instanceof Error ? err.message : String(err);
      this.output.error(`olifant lsp failed to start: ${message}`);
      if (this.lc === lc) {
        this.lc = undefined;
        this.st = 'failed';
      }
      if (!this.stopping) this.reportOnce(`olifant lsp failed to start: ${message}`, 'Show Health', 'Restart Server');
      return false;
    }
    lc.quiet = false;
    // The library installs its own workspace/applyEdit handler while starting; registering after
    // start replaces it (the connection keeps one handler per method). The server sends none
    // before initialized.
    lc.onRequest(ApplyWorkspaceEditRequest.type, params => applyServerEdit(lc, params, text => void this.say('info', text)));
    this.st = 'running';
    this.sent.clear();
    this.sendFolders();
    return true;
  }

  // stop disposes the client (its features, and the olifant.doctor command it registered).
  async stop(): Promise<void> {
    const lc = this.lc;
    const starting = this.starting;
    this.lc = undefined;
    this.starting = undefined;
    if (lc) {
      this.stopping = true;
      try {
        await starting;
        await lc.dispose().catch(() => undefined);
      } finally {
        this.stopping = false;
      }
    }
    this.st = 'not started';
  }

  // restart forgets the gate and the reported failure, and starts again.
  async restart(): Promise<void> {
    await this.stop();
    this.gate = undefined;
    this.reported = false;
    await this.start();
  }

  async request<P, R>(type: RequestType<P, R, void>, params: P, token?: vscode.CancellationToken): Promise<R> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    return token ? lc.sendRequest(type, params, token) : lc.sendRequest(type, params);
  }

  async notify<P>(type: NotificationType<P>, params: P): Promise<void> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    await lc.sendNotification(type, params);
  }

  // doctor is olifant doctor for the project of uri (the server never runs tests for it).
  async doctor(uri: vscode.Uri): Promise<DoctorResult> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    const r = await withTimeout(
      lc.sendRequest(ExecuteCommandRequest.type, { command: SERVER_COMMANDS.doctor, arguments: [uri.toString()] }),
      15_000, 'olifant doctor took longer than 15 s');
    return r as DoctorResult;
  }
}
```
If `tsc` rejects the `error` override's signature or `lc.dispose()`'s return type in v11, keep the behaviour and adjust only the types (alder-vscode's `src/client.ts` compiles the same override against v11).

- [ ] **Step 3: Write `src/projects.ts`**

```ts
import * as vscode from 'vscode';
import { findRoot, rootOfConfig } from './root';
import type { Server } from './server';

// discover lists the window's projects at activation: every .olifant/config.toml under its
// folders (the activation event's own glob).
export async function discover(): Promise<string[]> {
  const uris = await vscode.workspace.findFiles('**/.olifant/config.toml', '**/node_modules/**');
  return [...new Set(uris.map(u => rootOfConfig(u.fsPath)))];
}

// trackProjects adds the project of every file opened (one outside the workspace folders too)
// and starts the server for it; and keeps durandal.inProject: the active editor's file is in a
// project.
export function trackProjects(context: vscode.ExtensionContext, server: Server): { inProject(): boolean } {
  let inProject = false;
  const onOpen = async (doc: vscode.TextDocument) => {
    if (doc.uri.scheme !== 'file') return;
    const root = await findRoot(doc.uri.fsPath);
    if (!root) return;
    await server.addRoot(root);
    await server.start();
  };
  const update = async (editor: vscode.TextEditor | undefined) => {
    const yes = !!editor && editor.document.uri.scheme === 'file' && !!(await findRoot(editor.document.uri.fsPath));
    // the last editor wins: a slower lookup for an earlier editor must not overwrite it
    if (editor !== vscode.window.activeTextEditor) return;
    inProject = yes;
    await vscode.commands.executeCommand('setContext', 'durandal.inProject', yes);
  };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => void onOpen(doc)),
    vscode.window.onDidChangeActiveTextEditor(e => void update(e)),
  );
  for (const doc of vscode.workspace.textDocuments) void onOpen(doc);
  void update(vscode.window.activeTextEditor);
  return { inProject: () => inProject };
}
```

- [ ] **Step 4: Write `src/commands.ts`**

```ts
import * as vscode from 'vscode';
import { NOT_YET, SERVER_NAMED, notYet } from './commandTable';
import type { Say } from './server';

// registerNotYet: the commands later milestones build, and the server-named ones, say so.
export function registerNotYet(context: vscode.ExtensionContext, say: Say): void {
  for (const [id, { title }] of Object.entries({ ...NOT_YET, ...SERVER_NAMED })) {
    context.subscriptions.push(vscode.commands.registerCommand(id, () => say('info', notYet(title))));
  }
}
```

- [ ] **Step 5: Replace `src/extension.ts`**

```ts
import * as vscode from 'vscode';
import { registerNotYet } from './commands';
import { DoctorSection, report } from './health';
import { discover, trackProjects } from './projects';
import { findRoot } from './root';
import { Say, Server } from './server';

export interface Api {
  server: Server;
  health(): Promise<string[]>;
  // every notification the extension showed, in order (the e2e tests read it)
  shown: { level: string; text: string }[];
  inProject(): boolean;
}

let server: Server | undefined;

export function activate(context: vscode.ExtensionContext): Api {
  const output = vscode.window.createOutputChannel('Durandal', { log: true });
  context.subscriptions.push(output);
  const shown: Api['shown'] = [];
  const say: Say = (level, text, ...actions) => {
    shown.push({ level, text });
    output.appendLine(`${level}: ${text}`);
    if (level === 'info') return vscode.window.showInformationMessage(text, ...actions);
    if (level === 'warn') return vscode.window.showWarningMessage(text, ...actions);
    return vscode.window.showErrorMessage(text, ...actions);
  };
  const s = new Server(output, say);
  server = s;

  // health: the binary, the server, the projects, and olifant doctor for the active file's project
  const health = async (): Promise<string[]> => {
    const gate = await s.checkGate();
    const doc = vscode.window.activeTextEditor?.document;
    const root = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
    let doctor: DoctorSection | undefined;
    if (doc && root && s.client()) {
      try {
        doctor = { root, result: await s.doctor(doc.uri) };
      } catch (err) {
        doctor = { root, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return report(gate, s.state(), s.roots(), doctor);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('durandal.showHealth', async () => {
      const lines = await health();
      output.appendLine(`--- Durandal health ${new Date().toISOString()}`);
      for (const line of lines) output.appendLine(line);
      output.show(true);
    }),
    vscode.commands.registerCommand('durandal.restartServer', () => s.restart()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (['path', 'debounceMs', 'model', 'fills'].some(k => e.affectsConfiguration(`durandal.${k}`))) {
        void say('info', 'Durandal: run Durandal: Restart Server to apply the new setting');
      }
    }),
  );
  registerNotYet(context, say);
  const projects = trackProjects(context, s);
  void (async () => {
    for (const r of await discover()) await s.addRoot(r);
    if (s.roots().length > 0) await s.start();
  })();
  return { server: s, health, shown, inProject: projects.inProject };
}

export async function deactivate(): Promise<void> {
  await server?.stop();
}
```

- [ ] **Step 6: Run unit tests, lint and build**

Run: `npm run test:unit && npm run lint && npm run build`
Expected: PASS, no lint output, `dist/extension.js` rebuilt.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "client: one olifant lsp per window, projects as workspace folders, the server's edits, Health, Restart"
```

---

### Task 6: The contract suite against the fake server

**Files:**
- Create: `test/fake-lsp/fake-lsp` (vendored), `test/e2e/run.ts`, `test/e2e/index.ts`, `test/e2e/helpers.ts`, `test/e2e/fake.1-client.e2e.ts`, `test/e2e/fake.2-edits.e2e.ts`, `test/e2e/fake.3-lifecycle.e2e.ts`

**Interfaces:**
- Consumes: `Api` (Task 5: `server.state()`, `server.roots()`, `server.client()`, `server.request()`, `health()`, `shown`, `inProject()`); `Olifant` (Task 3); `chordLabel` (Task 3); `STOPPED` (Task 2); `NOT_RUNNING` (Task 5).
- Environment the launcher sets for the extension host (and so for the server it spawns): `DURANDAL_E2E_SUITE` (`fake` or `real`), `DURANDAL_E2E_WS`, `DURANDAL_E2E_OUTSIDE`, `FAKE_LSP_LOG`, `FAKE_LSP_REPLIES`, optional `DURANDAL_E2E_ONLY` (a file-name prefix), optional `VSCODE_VERSION` (default `stable`).

The fake (durandal.nvim's `tests/fake-lsp`, Python 3) records every message it gets in `$FAKE_LSP_LOG`, answers a request from `$FAKE_LSP_REPLIES/<method with / as _>.json` (an `{"lsp_error": "…"}` answer is a refusal; `{"notify": [{method, params, request?}], …}` sends those first, `"$uri"`/`"$version"`/`"$stale"` substituted), exits on the `test/crash` notification, and sends a `workspace/applyEdit` labelled `Olifant: regions` on every `didSave` while `$FAKE_LSP_APPLY` names an edit file. It reads its environment when it starts, so a test that changes `FAKE_LSP_APPLY` sets `process.env` in the extension host and restarts the server.

- [ ] **Step 1: Vendor the fake**

```bash
mkdir -p test/fake-lsp
cp ~/projects/durandal.nvim/tests/fake-lsp test/fake-lsp/fake-lsp
chmod 755 test/fake-lsp/fake-lsp
```
Then make two edits with the Edit tool. In the header comment, after the first line, add:
```python
# Vendored from sorcererdev/durandal.nvim tests/fake-lsp at 7969a55; one change: `--help`
# lists an `lsp` command and exits, so the fake passes durandal-vscode's binary gate.
```
and right after `import signal, os, sys` add:
```python
if "--help" in sys.argv[1:]:
    print("Available commands:\n  lsp   Run the language server over stdin/stdout")
    sys.exit(0)
```
Check: `test/fake-lsp/fake-lsp --help` prints the two lines and exits 0; `git add` keeps mode 100755 (`git ls-files -s test/fake-lsp/fake-lsp` after staging).

- [ ] **Step 2: Write the launcher `test/e2e/run.ts`**

```ts
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const ROOT = resolve(__dirname, '../../..');

function write(path: string, text: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

// settings writes the workspace settings every suite shares.
function settings(ws: string, olifant: string): void {
  write(join(ws, '.vscode/settings.json'), JSON.stringify({
    'durandal.path': olifant,
    'durandal.trace.server': process.env.DURANDAL_E2E_TRACE ?? 'off',
    'security.workspace.trust.enabled': false,
    // the chat view's input editor otherwise keeps the text focus
    'chat.disableAIFeatures': true,
  }, null, 2));
}

async function launch(ws: string, env: Record<string, string>): Promise<void> {
  await runTests({
    version: process.env.VSCODE_VERSION ?? 'stable',
    extensionDevelopmentPath: ROOT,
    extensionTestsPath: join(__dirname, 'index.js'),
    launchArgs: [ws, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { DURANDAL_E2E_WS: ws, DURANDAL_E2E_ONLY: process.env.DURANDAL_E2E_ONLY ?? '', ...env },
  });
}

// fake: two projects (one, two), a folder in no project (plain), and a project outside the
// workspace (outside), served by the vendored fake.
async function fake(): Promise<void> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'durandal-e2e-')));
  const ws = join(base, 'ws');
  const outside = join(base, 'outside');
  const replies = join(base, 'replies');
  try {
    for (const p of ['one', 'two']) {
      write(join(ws, p, '.olifant/config.toml'), '');
      write(join(ws, p, 'main.py'), 'x = 1\n');
    }
    write(join(ws, 'one/other.py'), 'y = 2\n');
    write(join(ws, 'one/plans/p.md'), '# A plan\n\n- [ ] a step\n');
    write(join(ws, 'plain/notes.txt'), 'notes\n');
    write(join(outside, '.olifant/config.toml'), '');
    write(join(outside, 'lib.py'), 'z = 3\n');
    mkdirSync(replies);
    settings(ws, join(ROOT, 'test/fake-lsp/fake-lsp'));
    await launch(ws, {
      DURANDAL_E2E_SUITE: 'fake',
      DURANDAL_E2E_OUTSIDE: outside,
      FAKE_LSP_LOG: join(base, 'fake.log'),
      FAKE_LSP_REPLIES: replies,
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await fake();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Write the mocha loader `test/e2e/index.ts` and `test/e2e/helpers.ts`**

`test/e2e/index.ts`:
```ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Mocha from 'mocha';

// run loads the suite's files (<suite>.*.e2e.js), in name order; DURANDAL_E2E_ONLY=<prefix>
// narrows them while iterating.
export function run(): Promise<void> {
  const suite = process.env.DURANDAL_E2E_SUITE ?? 'fake';
  const mocha = new Mocha({ ui: 'bdd', timeout: suite === 'real' ? 180_000 : 60_000, color: true });
  const only = process.env.DURANDAL_E2E_ONLY;
  for (const f of readdirSync(__dirname).filter(f => f.startsWith(`${suite}.`) && f.endsWith('.e2e.js') && (!only || f.startsWith(only))).sort()) {
    mocha.addFile(join(__dirname, f));
  }
  return new Promise((res, rej) => mocha.run(failures => (failures ? rej(new Error(`${failures} failed`)) : res())));
}
```

`test/e2e/helpers.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';

export const ws = () => process.env.DURANDAL_E2E_WS!;
export const file = (rel: string) => vscode.Uri.file(join(ws(), rel));

export async function api(): Promise<Api> {
  const ext = vscode.extensions.getExtension<Api>('sorcererdev.durandal');
  if (!ext) throw new Error('extension sorcererdev.durandal is not loaded');
  return ext.activate();
}

// until polls f every 100 ms until it is truthy or the timeout passes.
export async function until<T>(f: () => Promise<T> | T, what: string, ms = 20_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 100));
  }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function running(): Promise<Api> {
  const a = await api();
  await until(() => a.server.state() === 'running', 'olifant lsp running', 60_000);
  return a;
}

export async function restart(): Promise<Api> {
  await vscode.commands.executeCommand('durandal.restartServer');
  return running();
}

export async function open(uri: vscode.Uri): Promise<vscode.TextEditor> {
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
}

// revert drops a document's unsaved edits (the command works on the active editor).
export async function revert(doc: vscode.TextDocument): Promise<void> {
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('workbench.action.files.revert');
}

// Msg is one message the fake server received.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Msg = { id?: string | number; method?: string; params?: any; result?: any };

export function log(): Msg[] {
  const p = process.env.FAKE_LSP_LOG!;
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(l => l !== '').map(l => JSON.parse(l) as Msg);
}

// reply sets the fake's answer to a request method.
export function reply(method: string, value: unknown): void {
  writeFileSync(join(process.env.FAKE_LSP_REPLIES!, `${method.replace(/\//g, '_')}.json`), JSON.stringify(value));
}

// added are the folders the client added, in order, from msgs (default: the whole log).
export function added(msgs: Msg[] = log()): string[] {
  return msgs.filter(m => m.method === 'workspace/didChangeWorkspaceFolders')
    .flatMap(m => (m.params.event.added as { uri: string }[]).map(f => f.uri));
}

export const count = (method: string) => log().filter(m => m.method === method).length;
```

- [ ] **Step 4: Write `test/e2e/fake.1-client.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { Olifant } from '../../src/protocol';
import { chordLabel } from '../../src/settings';
import { added, file, log, open, reply, running, until, ws } from './helpers';

describe('the client (fake server)', () => {
  it('starts one olifant lsp with the options, then adds the projects it found', async () => {
    const a = await running();
    const inits = log().filter(m => m.method === 'initialize');
    assert.equal(inits.length, 1);
    assert.deepEqual(inits[0].params.initializationOptions,
      { debug: false, keys: { plan_review: chordLabel(process.platform, 'P R') }, debounce_ms: 300 });
    assert.deepEqual(inits[0].params.workspaceFolders.map((f: { uri: string }) => f.uri), [vscode.Uri.file(ws()).toString()]);
    await until(() => added().length >= 2, 'the projects as workspace folders');
    assert.deepEqual(added().sort(), [file('one').toString(), file('two').toString()].sort());
    assert.deepEqual(a.server.roots().sort(), [join(ws(), 'one'), join(ws(), 'two')].sort());
  });

  it('documents of every language reach the server', async () => {
    await running();
    await open(file('plain/notes.txt'));
    await open(file('one/main.py'));
    await until(() => {
      const opened = log().filter(m => m.method === 'textDocument/didOpen').map(m => m.params.textDocument.uri);
      return opened.includes(file('plain/notes.txt').toString()) && opened.includes(file('one/main.py').toString());
    }, 'didOpen for notes.txt and main.py');
  });

  it('a project outside the workspace joins when its file opens; a file in no project adds none', async () => {
    const a = await running();
    const outside = process.env.DURANDAL_E2E_OUTSIDE!;
    await open(vscode.Uri.file(join(outside, 'lib.py')));
    await until(() => added().includes(vscode.Uri.file(outside).toString()), 'the outside project added');
    await until(() => a.inProject(), 'durandal.inProject for a project file');
    await open(file('plain/notes.txt'));
    await until(() => !a.inProject(), 'durandal.inProject cleared for a file in no project');
    assert.equal(a.server.roots().length, 3);
    assert.equal(new Set(added()).size, added().length, 'no folder added twice');
  });

  it('a typed request reaches the server; its refusal is an error with the server\'s words', async () => {
    const a = await running();
    const params = { textDocument: { uri: file('one/main.py').toString() } };
    reply('olifant/tests/file', { file: '/w/one/main__test.py', kind: 'test', exists: false });
    assert.deepEqual(await a.server.request(Olifant.testsFile, params), { file: '/w/one/main__test.py', kind: 'test', exists: false });
    reply('olifant/tests/file', { lsp_error: 'no [test] table for this language' });
    await assert.rejects(a.server.request(Olifant.testsFile, params), /no \[test\] table for this language/);
  });
});
```

- [ ] **Step 5: Write `test/e2e/fake.2-edits.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { file, log, open, reply, restart, revert, running, until, ws } from './helpers';

const R = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

// insert is an edit putting text at the top of uri; annotated, as olifant marks a region refresh.
function insert(uri: string, text: string, annotated = false): unknown {
  return {
    documentChanges: [{ textDocument: { uri, version: null }, edits: [{ range: R, newText: text, ...(annotated ? { annotationId: 'r' } : {}) }] }],
    ...(annotated ? { changeAnnotations: { r: { label: 'regions', needsConfirmation: true } } } : {}),
  };
}

// serve restarts the fake so that every save sends edit (FAKE_LSP_APPLY).
async function serve(edit: unknown) {
  const p = join(process.env.FAKE_LSP_REPLIES!, 'apply.json');
  writeFileSync(p, JSON.stringify(edit));
  process.env.FAKE_LSP_APPLY = p;
  return restart();
}

async function saveTouched(rel: string): Promise<void> {
  const ed = await open(file(rel));
  await ed.edit(b => b.insert(new vscode.Position(0, 0), '# touched\n'));
  assert.ok(await ed.document.save(), `${rel} saved`);
}

const disk = (rel: string) => readFileSync(join(ws(), rel), 'utf8');
const docOf = (rel: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === file(rel).toString());

describe('the server\'s edits (fake server)', () => {
  after(async () => {
    delete process.env.FAKE_LSP_APPLY;
    await restart();
  });

  it('an annotated edit to a file not open goes in at once, is saved, and is named once', async () => {
    const a = await serve(insert(file('one/other.py').toString(), '# region\n', true));
    const before = a.shown.length;
    await saveTouched('one/main.py');
    await until(() => disk('one/other.py').startsWith('# region\n'), 'other.py saved with the edit');
    await until(() => a.shown.slice(before).some(s => s.text === 'Olifant: regions: other.py'), 'the notice');
    assert.equal(a.shown.slice(before).filter(s => s.text.startsWith('Olifant: regions')).length, 1);
    const answer = log().filter(m => m.id === 'apply-1' && !m.method).pop();
    assert.deepEqual(answer?.result, { applied: true });
  });

  it('an open file with unsaved changes takes the edit and stays unsaved, unnamed', async () => {
    const a = await serve(insert(file('one/other.py').toString(), '# again\n'));
    const other = await open(file('one/other.py'));
    const end = other.document.lineAt(other.document.lineCount - 1).range.end;
    await other.edit(b => b.insert(end, '# mine\n'));
    const onDisk = disk('one/other.py');
    const before = a.shown.length;
    await saveTouched('one/main.py');
    await until(() => other.document.getText().startsWith('# again\n'), 'the edit in the open document');
    assert.ok(other.document.isDirty);
    assert.equal(disk('one/other.py'), onDisk);
    assert.ok(!a.shown.slice(before).some(s => s.text.includes('other.py')));
    await revert(other.document);
  });

  it('a plan takes the edit and stays unsaved', async () => {
    await serve(insert(file('one/plans/p.md').toString(), '- [x] done\n'));
    const onDisk = disk('one/plans/p.md');
    await saveTouched('one/main.py');
    await until(() => docOf('one/plans/p.md')?.getText().startsWith('- [x] done\n'), 'the plan edited');
    assert.ok(docOf('one/plans/p.md')!.isDirty);
    assert.equal(disk('one/plans/p.md'), onDisk);
    await revert(docOf('one/plans/p.md')!);
  });

  it('an edit made at an older version is refused whole, naming the file', async () => {
    const a = await running();
    reply('test/applyStale', {
      notify: [{
        method: 'workspace/applyEdit', request: true,
        params: { label: 'Olifant: stale', edit: { documentChanges: [{ textDocument: { uri: '$uri', version: '$stale' }, edits: [{ range: R, newText: 'STALE\n' }] }] } },
      }],
      ok: true,
    });
    const ed = await open(file('one/main.py'));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# typed\n'));
    const v = ed.document.version;
    await until(() => log().some(m => m.method === 'textDocument/didChange' && m.params.textDocument.version === v), 'the server has the version');
    const n = log().length;
    await a.server.client()!.sendRequest('test/applyStale', { textDocument: { uri: ed.document.uri.toString() } });
    const answer = await until(() => log().slice(n).find(m => typeof m.id === 'string' && m.id.startsWith('srv-') && !m.method), 'the client\'s answer');
    assert.deepEqual(answer.result, { applied: false, failureReason: 'main.py changed since' });
    assert.ok(!ed.document.getText().includes('STALE'));
    await revert(ed.document);
  });
});
```

- [ ] **Step 6: Write `test/e2e/fake.3-lifecycle.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { STOPPED } from '../../src/health';
import { Olifant } from '../../src/protocol';
import { added, api, count, file, log, open, reply, restart, running, sleep, until } from './helpers';

describe('lifecycle and health (fake server)', () => {
  it('health runs olifant doctor for the open file\'s project', async () => {
    const a = await running();
    reply('workspace/executeCommand', { checks: [
      { name: 'config', status: 'ok', detail: 'project at /w/one', fix: null },
      { name: 'model', status: 'warn', detail: 'no [model] backend', fix: 'add [model] to .olifant/config.toml' },
    ] });
    await open(file('one/main.py'));
    const text = (await a.health()).join('\n');
    assert.match(text, /^binary: .*fake-lsp$/m);
    assert.match(text, /^ok: olifant lsp running$/m);
    assert.match(text, /^project: .*\/one$/m);
    assert.match(text, /^ok: config — project at \/w\/one$/m);
    assert.match(text, /^warn: model — no \[model\] backend\n {2}fix: add \[model\] to \.olifant\/config\.toml$/m);
    const call = log().filter(m => m.method === 'workspace/executeCommand').pop();
    assert.deepEqual(call?.params, { command: 'olifant.doctor', arguments: [file('one/main.py').toString()] });
  });

  it('a server-named command not built yet says so', async () => {
    const a = await running();
    await vscode.commands.executeCommand('olifant.showActions');
    assert.ok(a.shown.some(s => s.text === 'Durandal: Actions is not implemented yet'));
  });

  it('a crash is one notification and no restart; requests say it is not running', async () => {
    const a = await running();
    const inits = count('initialize');
    const before = a.shown.length;
    void a.server.client()!.sendNotification('test/crash');
    await until(() => a.server.state() === 'stopped', 'the server stopped');
    await sleep(1500);
    assert.equal(a.server.state(), 'stopped');
    assert.equal(count('initialize'), inits, 'no restart');
    assert.deepEqual(a.shown.slice(before).filter(s => s.level === 'error').map(s => s.text), [STOPPED]);
    assert.match((await a.health()).join('\n'), /^error: olifant lsp stopped/m);
    await assert.rejects(a.server.request(Olifant.testsFile, { textDocument: { uri: file('one/main.py').toString() } }), /not running/);
  });

  it('Restart Server brings it back, with its projects and olifant.doctor', async () => {
    const n = log().length;
    const a = await restart();
    await until(() => added(log().slice(n)).length >= 2, 'the projects sent again');
    const again = added(log().slice(n));
    assert.ok(again.includes(file('one').toString()) && again.includes(file('two').toString()), again.join(', '));
    assert.ok(!a.shown.some(s => s.text.includes('already exists')), 'olifant.doctor registered once');
    reply('workspace/executeCommand', { checks: [] });
    await open(file('one/main.py'));
    assert.match((await a.health()).join('\n'), /^--- olifant doctor in /m);
  });

  it('a missing binary is one error, and health says where it looked', async () => {
    const conf = vscode.workspace.getConfiguration('durandal');
    const fake = conf.get<string>('path')!;
    try {
      await conf.update('path', '/nonexistent/olifant', vscode.ConfigurationTarget.Workspace);
      const a = await api();
      const before = a.shown.length;
      await vscode.commands.executeCommand('durandal.restartServer');
      await until(() => a.server.state() === 'failed', 'the start to fail');
      assert.equal(a.shown.slice(before).filter(s => s.level === 'error').length, 1);
      const text = (await a.health()).join('\n');
      assert.match(text, /^binary: not found$/m);
      assert.match(text, /no `\/nonexistent\/olifant` binary found/);
    } finally {
      await conf.update('path', fake, vscode.ConfigurationTarget.Workspace);
      await restart();
    }
  });
});
```

- [ ] **Step 7: Run the contract suite**

Run: `npm run test:e2e`
Expected: VS Code downloads into `.vscode-test/`, the fake suite runs, all PASS (the real suite is not wired yet). Then once on the floor: `VSCODE_VERSION=1.91.0 npm run test:e2e`.
If one fails, debug it (superpowers:systematic-debugging) with the server traffic: `DURANDAL_E2E_TRACE=verbose DURANDAL_E2E_ONLY=fake.2 npm run test:e2e` and read the Durandal output. Known traps:
- No `didSave` in the fake's log: the fake declares `textDocumentSync: 2` (a number); the library resolves that to open/close + change + save. If saves are missing, check `client.initializeResult` and the library's `resolvedTextDocumentSync` before touching the fake.
- The annotated-edit test hangs on a refactor preview: `stripAnnotations` did not run, or the library's own handler answered (the `onRequest` after `start()` did not replace it). Check which handler answered by logging in `applyServerEdit`.
- "command 'olifant.doctor' already exists" after Restart: the old client was not disposed (`stop()` must `dispose()`, not only `stop()`).
- Local runs are unreliable while other sessions load the machine; re-run a timeout once before debugging it.

- [ ] **Step 8: Commit**

```bash
git add test/fake-lsp test/e2e
git commit -m "e2e: the contract suite against durandal.nvim's fake server (options, folders, edits, crash, restart, health)"
```

---

### Task 7: The smoke suite against olifant lsp

**Files:**
- Modify: `test/e2e/run.ts` (the `real` suite)
- Create: `test/e2e/real.1-server.e2e.ts`, `test/e2e/real.2-rules.e2e.ts`, `test/e2e/real.3-regions.e2e.ts`, `test/e2e/real.4-health.e2e.ts`

**Interfaces:**
- Consumes: `Api` (Task 5), `Olifant`, `SERVER_COMMANDS`, `PLAN_TOKEN_TYPES`, `PLAN_TOKEN_MODIFIERS` (Task 3), helpers (Task 6).
- Environment: `OLIFANT_BIN` (an olifant built from `.olifant-ref`), `OLIFANT_REPO` (that checkout; `scripts/try-pack.sh` makes the sandboxes). `uv` on `PATH` makes `try-pack.sh` sync the Python environment; without it the sandbox still works for everything this suite checks.

Facts this suite relies on (checked 2026-11-06 against the CLI at the ref, in a python-htmx sandbox): adding `import sqlite3` at the top of `src/bistro/booking/commands/create_booking.py` is a `commands-use-ports` finding (severity warn) with two fixes labelled "Use an existing port" and "Add a repository (a port with in-memory and SQLite adapters)"; `src/bistro/web/resources.py` holds the region `resources`, one item per `src/bistro/web/*/routes.py` directory (`    "bookings",`); `olifant doctor` in the sandbox reports `ok config` first.

Locally, build the binary at the ref once:
```bash
REF=$(cat .olifant-ref); S=<scratchpad>/olifant-ref
git -C ~/projects/olifant fetch -q && git -C ~/projects/olifant worktree add --detach "$S" "$REF"
(cd "$S" && cabal build -v0 exe:olifant) && OLIFANT_BIN=$(cd "$S" && cabal list-bin exe:olifant)
```
and remove the worktree when the milestone is done (`git -C ~/projects/olifant worktree remove "$S"`). If `~/projects/olifant` is already at the ref, `OLIFANT_REPO=~/projects/olifant OLIFANT_BIN=$(cd ~/projects/olifant && cabal list-bin exe:olifant)` does.

- [ ] **Step 1: Add the `real` suite to `test/e2e/run.ts`**

Add the import `import { execFileSync } from 'node:child_process';`, this function, and replace `main`:
```ts
// real: two python-htmx sandboxes (py, py2) served by the olifant at .olifant-ref.
async function real(bin: string, repo: string): Promise<void> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'durandal-real-')));
  try {
    for (const name of ['py', 'py2']) {
      execFileSync('bash', [join(repo, 'scripts/try-pack.sh'), 'python-htmx', join(ws, name)], { stdio: 'ignore' });
    }
    settings(ws, bin);
    await launch(ws, { DURANDAL_E2E_SUITE: 'real' });
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await fake();
  const bin = process.env.OLIFANT_BIN;
  const repo = process.env.OLIFANT_REPO;
  if (bin && repo) await real(bin, resolve(repo));
  else console.log('the real-server suite is skipped: set OLIFANT_BIN and OLIFANT_REPO');
}
```

- [ ] **Step 2: Write `test/e2e/real.1-server.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { PLAN_TOKEN_MODIFIERS, PLAN_TOKEN_TYPES, SERVER_COMMANDS } from '../../src/protocol';
import { file, open, running, until, ws } from './helpers';

describe('olifant lsp', () => {
  it('is olifant, with doctor and the plan legend, holding both projects', async () => {
    await open(file('py/src/bistro/main.py'));
    const a = await running();
    const init = a.server.client()!.initializeResult!;
    assert.equal(init.serverInfo?.name, 'olifant');
    assert.ok(init.capabilities.executeCommandProvider?.commands.includes(SERVER_COMMANDS.doctor));
    const legend = (init.capabilities.semanticTokensProvider as { legend: { tokenTypes: string[]; tokenModifiers: string[] } }).legend;
    assert.deepEqual(legend.tokenTypes, [...PLAN_TOKEN_TYPES]);
    assert.deepEqual(legend.tokenModifiers, [...PLAN_TOKEN_MODIFIERS]);
    await until(() => a.server.roots().length === 2, 'both projects');
    assert.deepEqual(a.server.roots().sort(), [join(ws(), 'py'), join(ws(), 'py2')].sort());
  });
});
```

- [ ] **Step 3: Write `test/e2e/real.2-rules.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { file, open, revert, running, until } from './helpers';

const COMMAND = 'src/bistro/booking/commands/create_booking.py';
const codeOf = (d: vscode.Diagnostic) =>
  typeof d.code === 'object' && d.code !== null ? String(d.code.value) : String(d.code);

// finding adds a sqlite3 import to a command (unsaved) and waits for the rule's diagnostic.
async function finding(project: string) {
  const ed = await open(file(`${project}/${COMMAND}`));
  await running();
  await ed.edit(b => b.insert(new vscode.Position(0, 0), 'import sqlite3\n'));
  const d = await until(() => vscode.languages.getDiagnostics(ed.document.uri)
    .find(x => x.source === 'olifant' && codeOf(x) === 'commands-use-ports'), `the commands-use-ports finding in ${project}`, 90_000);
  return { ed, d };
}

describe('rules (olifant lsp)', () => {
  it('a rule finding is a diagnostic, with its quick fixes', async () => {
    const { ed, d } = await finding('py');
    assert.equal(d.severity, vscode.DiagnosticSeverity.Warning);
    assert.equal(d.range.start.line, 0);
    const titles = await until(async () => {
      const acts = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider', ed.document.uri, d.range, vscode.CodeActionKind.QuickFix.value);
      const ts = (acts ?? []).map(a => a.title);
      return ts.some(t => t.includes('Use an existing port')) ? ts : undefined;
    }, 'the quick fixes', 60_000);
    assert.ok(titles.some(t => t.includes('Add a repository')), titles.join(' | '));
    await revert(ed.document);
  });

  it('the other project in the window gets its own finding', async () => {
    const { ed } = await finding('py2');
    await revert(ed.document);
  });
});
```

- [ ] **Step 4: Write `test/e2e/real.3-regions.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { Olifant } from '../../src/protocol';
import { file, open, running, until, ws } from './helpers';

const RESOURCES = 'py/src/bistro/web/resources.py';
const disk = (rel: string) => readFileSync(join(ws(), rel), 'utf8');

describe('regions on save (olifant lsp)', () => {
  after(() => {
    const cwd = join(ws(), 'py');
    execFileSync('git', ['checkout', '--', '.'], { cwd });
    execFileSync('git', ['clean', '-fdq'], { cwd });
  });

  it('saving the regions file puts its region back in the same write', async () => {
    const ed = await open(file(RESOURCES));
    const a = await running();
    // warm the project: a cold first will-save can run past VS Code's ~1.5 s budget
    await a.server.request(Olifant.fileActions, { textDocument: { uri: ed.document.uri.toString() } });
    const original = disk(RESOURCES);
    const item = '    "bookings",\n';
    const i = ed.document.getText().indexOf(item);
    assert.ok(i >= 0, 'the region lists bookings');
    await ed.edit(b => b.delete(new vscode.Range(ed.document.positionAt(i), ed.document.positionAt(i + item.length))));
    assert.ok(await ed.document.save());
    assert.equal(disk(RESOURCES), original);
    assert.ok(!ed.document.isDirty);
  });

  it('a new web resource lands in the regions file, which is saved and named', async () => {
    const a = await running();
    const before = a.shown.length;
    const dir = join(ws(), 'py/src/bistro/web/menu');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '__init__.py'), '');
    writeFileSync(join(dir, 'routes.py'), '"""The menu."""\n');
    const ed = await open(file('py/src/bistro/web/menu/routes.py'));
    await ed.edit(b => b.insert(new vscode.Position(1, 0), '\n'));
    assert.ok(await ed.document.save());
    await until(() => disk(RESOURCES).includes('    "menu",\n'), 'menu in resources.py on disk', 90_000);
    await until(() => a.shown.slice(before).some(s => s.level === 'info' && s.text.endsWith('resources.py')), 'the notice naming resources.py');
  });
});
```

- [ ] **Step 5: Write `test/e2e/real.4-health.e2e.ts`**

```ts
import * as assert from 'node:assert/strict';
import { file, open, running } from './helpers';

describe('health (olifant lsp)', () => {
  it('runs olifant doctor for the open project', async () => {
    await open(file('py/src/bistro/main.py'));
    const a = await running();
    const text = (await a.health()).join('\n');
    assert.match(text, /^ok: olifant lsp running$/m);
    assert.match(text, /^--- olifant doctor in .*\/py$/m);
    assert.match(text, /^ok: config — /m);
  });
});
```

- [ ] **Step 6: Run both suites**

Run: `OLIFANT_BIN=<bin> OLIFANT_REPO=<checkout at the ref> npm run test:e2e`
Expected: the fake suite PASSES, then the real suite PASSES.
If a real test fails, read the server's own behaviour before changing a test: `olifant check --file <f> --content -` and `olifant doctor --json` in the sandbox say what the server should report; durandal.nvim's `tests/e2e_lsp_spec.lua` and `tests/lsp_features_spec.lua` say what the editor should see. A quick-fix title that differs from the CLI's label only by a prefix is fine (the test matches by `includes`). The regions-on-save test failing only on the first run of a cold machine is the will-save budget (Review Focus, sixth item): re-run once; if it fails warm, debug it.

- [ ] **Step 7: Commit**

```bash
git add test/e2e
git commit -m "e2e: the smoke suite against olifant lsp (legend, rules and fixes, two projects, regions on save, doctor)"
```

---

### Task 8: CI, packaging, README, the PR

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Package locally**

Run: `npm run package && unzip -l durandal-0.0.1.vsix`
Expected: `durandal-0.0.1.vsix`, listing `extension/dist/extension.js`, `extension/package.json`, README, CHANGELOG, LICENSE, and nothing from `src/`, `test/`, `node_modules/` or `out/`. If `vsce` warns about a missing field, add the field to `package.json` rather than passing a flag.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
env:
  GHC: '9.10.3'
  CABAL: '3.16.1.0'
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: ubuntu-latest, vscode: stable, package: true }
          - { os: macos-latest, vscode: stable, package: false }
          - { os: ubuntu-latest, vscode: 1.91.0, package: false }
    name: test (${{ matrix.os }}, vscode ${{ matrix.vscode }})
    runs-on: ${{ matrix.os }}
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - name: olifant ref
        id: ref
        run: echo "sha=$(cat .olifant-ref)" >> "$GITHUB_OUTPUT"
      # olifant is private: a fine-grained PAT with read-only Contents on sorcererdev/olifant
      - uses: actions/checkout@v4
        with:
          repository: sorcererdev/olifant
          ref: ${{ steps.ref.outputs.sha }}
          path: olifant
          token: ${{ secrets.OLIFANT_TOKEN }}
      - uses: haskell-actions/setup@v2
        id: haskell
        with:
          ghc-version: ${{ env.GHC }}
          cabal-version: ${{ env.CABAL }}
      # the store (dependencies) and olifant's own build, keyed on the ref: a ref bump rebuilds
      # olifant on top of the previous store
      - uses: actions/cache@v4
        with:
          path: |
            ${{ steps.haskell.outputs.cabal-store }}
            olifant/dist-newstyle
          key: cabal-${{ runner.os }}-ghc${{ env.GHC }}-${{ steps.ref.outputs.sha }}
          restore-keys: cabal-${{ runner.os }}-ghc${{ env.GHC }}-
      - name: olifant
        working-directory: olifant
        run: |
          cabal build -v1 exe:olifant
          echo "OLIFANT_BIN=$(cabal list-bin exe:olifant)" >> "$GITHUB_ENV"
          echo "OLIFANT_REPO=$PWD" >> "$GITHUB_ENV"
      - uses: astral-sh/setup-uv@v6
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - name: unit
        run: npm run test:unit
      - uses: actions/cache@v4
        with:
          path: .vscode-test
          key: vscode-test-${{ runner.os }}-${{ matrix.vscode }}
      - name: e2e (fake server, then olifant lsp)
        run: |
          if [ "$RUNNER_OS" = Linux ]; then xvfb-run -a npm run test:e2e; else npm run test:e2e; fi
        env:
          VSCODE_VERSION: ${{ matrix.vscode }}
      - name: package
        if: matrix.package
        run: npm run package
      - uses: actions/upload-artifact@v4
        if: matrix.package
        with:
          name: vsix
          path: '*.vsix'
```
This is the decision milestone 1 owns (spec §6): the token is `OLIFANT_TOKEN`; the cache holds the cabal store and `olifant/dist-newstyle`, keyed on OS, GHC and the ref, restoring from the newest earlier ref. The unit step runs the protocol drift test (OLIFANT_REPO is set). `uv` is there for `try-pack.sh`'s Python environment.

- [ ] **Step 3: Extend `README.md`**

Append:
```markdown
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
```

- [ ] **Step 4: Run everything once more**

Run: `npm run lint && OLIFANT_REPO=<checkout> npm run test:unit && OLIFANT_BIN=<bin> OLIFANT_REPO=<checkout> npm run test:e2e && npm run package`
Expected: all PASS, `durandal-0.0.1.vsix` built.

- [ ] **Step 5: Commit, check the secret, push, open the PR**

```bash
git add .github README.md
git commit -m "CI (olifant at the ref, lint, unit, e2e fake + real, vsix artifact) and README"
gh secret list -R sorcererdev/durandal-vscode
```
If `OLIFANT_TOKEN` is not listed, stop and ask the user to create it (a fine-grained PAT, resource owner sorcererdev, repository sorcererdev/olifant, Contents: read-only; then `gh secret set OLIFANT_TOKEN -R sorcererdev/durandal-vscode`). Never create, read or print a token. Then:
```bash
git push -u origin scaffold
gh pr create --base main --title "M1: scaffold + client (olifant lsp, edits, health, contract and smoke e2e, CI)" --body-file <scratchpad>/pr-body.md
```
The PR body: a summary; the seven deviations from Global Constraints; the manual checklist below; the attribution lines from the session's system reminder. Watch CI with `gh pr checks --watch` (one foreground call). The first run builds olifant cold: expect it to be slow; if a cell times out only in the olifant step, raise `timeout-minutes` rather than splitting the job. Merging is the user's call.

Manual checklist for the PR (the user walks it once before merge):
- [ ] `Ctrl/Cmd+Alt+D G` in a project file shows "Durandal: Generate… is not implemented yet"; outside a project it does nothing.
- [ ] VS Code 1.91 accepts the three-part plan chords: no keybinding error in the Keyboard Shortcuts editor for `ctrl+alt+d p q`.
- [ ] `Durandal: Show Health` reads well: binary, server, projects, doctor (with fixes).
- [ ] `kill -9` the `olifant lsp` process: one error with Show Health and Restart Server; Restart brings rule findings back.
- [ ] VS Code started from the Dock finds `~/.local/bin/olifant`.
- [ ] The first save of `resources.py` in a freshly opened project (cold) keeps the region (the will-save budget).

---

## Self-review notes

- Spec coverage for milestone 1: §2 repository, id, activation, tooling, `.olifant-ref`, CI with the PAT and cabal cache (Tasks 1, 8); the version pin is a stated deviation (no `olifant --version`). §3 one client over stdio, selector, workspace folders from VS Code plus discovered and opened roots, `durandal.inProject` (Task 5; e2e Task 6); `initializationOptions` and the three settings (Task 3; e2e Task 6); the `workspace/applyEdit` handler with refusal, save rules and one notice (Tasks 4, 5; e2e Tasks 6, 7); `willSaveWaitUntil` region edits in the same write (Task 7); `$/progress` is the library's (no task: the library's status-bar progress needs no code); `protocol.ts` whole, checked against olifant's source (Task 3); not found / crashed notification with Show Health and Restart Server, no restart loop (Task 5; e2e Task 6); the action log moved to M2 (deviation). §4 command ids, chord prefix and letters, `when` keys as registrations (Task 3); the glyph, token-colour, Tab and webview conventions belong to later milestones. §5 unit, contract e2e (fake vendored, replies dir, `FAKE_LSP_LOG` asserted) and real-server e2e harnesses (Tasks 1–7); the four `*paused.json` fixtures are vendored with milestone 5, which uses them; the manual checklist (Task 8). Free from the client and covered: rules, quick fixes (Task 7), regions on save (Task 7); free and not asserted: hover, `@` completion, folding (they need plan files or project knowledge milestone 6 brings; the manual checklist does not list them either, since nothing in M1 depends on them).
- Not in this milestone: actions, generators, hints, migration report, action log (2); ghost text and snippets (3); Test Explorer, jump, stub, conjure, mutate (4); the pause/review webview (5); plans, glyphs, token colours (6); ghost blocks (7); `release.yml`, publishing (8).
