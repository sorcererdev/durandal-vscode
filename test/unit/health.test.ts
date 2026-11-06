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
