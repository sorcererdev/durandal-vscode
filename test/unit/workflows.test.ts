import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// tests run from out/test/unit; the workflows live at the repo root
const wf = (name: string) => readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', name), 'utf8');

test('ci.yml: callable by the release workflow, olifant checked out without a token', () => {
  const ci = wf('ci.yml');
  assert.match(ci, /^on:\n(?:  .*\n)*  workflow_call:\n/m);
  assert.doesNotMatch(ci, /token:/);
  assert.doesNotMatch(ci, /OLIFANT_TOKEN/);
  assert.doesNotMatch(ci, /private/);
  assert.match(ci, /repository: sorcererdev\/olifant\n/);
});

test('ci.yml: the package leg checks the vsix before uploading it', () => {
  const ci = wf('ci.yml');
  const check = ci.indexOf('node out/scripts/release.js check-vsix "durandal-$(node -p');
  assert.ok(check > ci.indexOf('npm run package'), 'check-vsix after npm run package');
  assert.ok(check < ci.indexOf('actions/upload-artifact'), 'check-vsix before the upload');
});

test('release.yml: v* tags, CI first, on main, durandal\'s vsix, prerelease for a "-" tag', () => {
  const r = wf('release.yml');
  assert.match(r, /tags: \['v\*'\]/);
  assert.match(r, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(r, /needs: ci/);
  assert.match(r, /contents: write/);
  assert.match(r, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(r, /node out\/scripts\/release\.js notes "\$GITHUB_REF_NAME"/);
  assert.equal(r.match(/"durandal-\$\{GITHUB_REF_NAME#v\}\.vsix"/g)?.length, 2, 'check-vsix and gh release create name the same file');
  assert.match(r, /case "\$GITHUB_REF_NAME" in \*-\*\) ;; \*\) pre=;; esac/);
  assert.match(r, /--verify-tag \$pre/);
});

test('no workflow mentions alder', () => {
  for (const n of ['ci.yml', 'release.yml']) assert.doesNotMatch(wf(n), /alder/i, n);
});
