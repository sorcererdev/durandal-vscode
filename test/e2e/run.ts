import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
      DURANDAL_LOG_DIR: join(base, 'log'),
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// bare: a window whose folder holds no project (issue #1). The extension activates after
// startup anyway, and a project file opened from outside starts the server.
async function bare(): Promise<void> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'durandal-bare-')));
  const ws = join(base, 'ws');
  const outside = join(base, 'outside');
  const replies = join(base, 'replies');
  try {
    write(join(ws, 'notes.txt'), 'notes\n');
    write(join(outside, '.olifant/config.toml'), '');
    write(join(outside, 'lib.py'), 'z = 3\n');
    mkdirSync(replies);
    settings(ws, join(ROOT, 'test/fake-lsp/fake-lsp'));
    await launch(ws, {
      DURANDAL_E2E_SUITE: 'bare',
      DURANDAL_E2E_OUTSIDE: outside,
      FAKE_LSP_LOG: join(base, 'fake.log'),
      FAKE_LSP_REPLIES: replies,
      DURANDAL_LOG_DIR: join(base, 'log'),
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// real: two python-htmx sandboxes (py, py2) served by the olifant at .olifant-ref.
async function real(bin: string, repo: string): Promise<void> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), 'durandal-real-')));
  try {
    for (const name of ['py', 'py2']) {
      execFileSync('bash', [join(repo, 'scripts/try-pack.sh'), 'python-htmx', join(ws, name)], { stdio: 'ignore' });
      // olifant 48f38ab checks a plan's claims with the model on open and save: never in the suite.
      // Committed, so the suites' `git checkout -- .` cleanups keep it.
      appendFileSync(join(ws, name, '.olifant/config.toml'), '\n[plans]\npass_cost = 0\n');
      execFileSync('git', ['-C', join(ws, name), '-c', 'user.name=olifant', '-c', 'user.email=olifant@localhost', 'commit', '-qam', 'pass_cost = 0']);
    }
    // one recorded claim check (olifant's check_answers test hook, LspSpec claimPassSpec): a
    // deterministic verdict with no model; the sentence key is the line's words, anchor dropped
    const checks = join(ws, 'checks.json');
    writeFileSync(checks, JSON.stringify({ replies: { 'CreateBooking checks the party size.': {
      text: '```json\n' + JSON.stringify({ verdict: 'wrong', why: 'it checks nothing', evidence: [{ path: 'src/bistro/booking/commands/create_booking.py', unit: 'CreateBooking' }] }) + '\n```',
      cost: 0.1,
    } } }));
    settings(ws, bin);
    await launch(ws, { DURANDAL_E2E_SUITE: 'real', DURANDAL_CHECK_ANSWERS: checks });
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await fake();
  await bare();
  const bin = process.env.OLIFANT_BIN;
  const repo = process.env.OLIFANT_REPO;
  if (bin && repo) await real(bin, resolve(repo));
  else console.log('the real-server suite is skipped: set OLIFANT_BIN and OLIFANT_REPO');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
