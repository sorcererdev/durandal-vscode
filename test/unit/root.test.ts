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
