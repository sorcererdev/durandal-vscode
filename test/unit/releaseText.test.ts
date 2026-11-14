import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';
import { main } from '../../scripts/release';

// tests run from out/test/unit; the texts live at the repo root
const ROOT = join(__dirname, '..', '..', '..');
const read = (name: string) => readFileSync(join(ROOT, name), 'utf8');

test('the shipped CHANGELOG has the notes the release workflow cuts for package.json\'s version', () => {
  let out = '', err = '';
  const code = main(['notes', `v${pkg.version}`], ROOT, { out: s => { out += s; }, err: s => { err += s; } });
  assert.equal(code, 0, err);
  assert.match(out, /^- /);
  assert.match(read('CHANGELOG.md'), /^# Changelog\n\n## Unreleased\n/);
});

test('README and CHANGELOG name the olifant the release was tested against (.olifant-ref)', () => {
  const short = read('.olifant-ref').trim().slice(0, 7);
  assert.ok(read('README.md').includes(`\`${short}\``), `README names ${short}`);
  assert.ok(read('CHANGELOG.md').includes(`\`${short}\``), `CHANGELOG names ${short}`);
});

test('no pre-release text in README or CHANGELOG', () => {
  for (const name of ['README.md', 'CHANGELOG.md']) {
    const t = read(name);
    for (const stale of ['Until a release', 'in later releases', 'OLIFANT_TOKEN', 'github.com/sorcererdev/durandal.nvim', 'Accept all']) {
      assert.ok(!t.includes(stale), `${name} still says "${stale}"`);
    }
  }
});
