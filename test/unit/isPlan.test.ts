import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlanPath } from '../../src/plans/isPlan';

test('a markdown file under <root>/plans/ is a plan, at any depth', () => {
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/sub/y.md', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one/', 'markdown'), true);
});

test('markdown is a .md name or the markdown language', () => {
  assert.equal(isPlanPath('/w/one/plans/x.md', '/w/one', 'plaintext'), true);
  assert.equal(isPlanPath('/w/one/plans/X.MD', '/w/one', 'plaintext'), true);
  assert.equal(isPlanPath('/w/one/plans/notes', '/w/one', 'markdown'), true);
  assert.equal(isPlanPath('/w/one/plans/x.py', '/w/one', 'python'), false);
});

test('outside plans/ or outside a project it is not', () => {
  assert.equal(isPlanPath('/w/plain/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plansx/a.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/other/plans/x.md', '/w/one', 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans/x.md', undefined, 'markdown'), false);
  assert.equal(isPlanPath('/w/one/plans/', '/w/one', 'markdown'), false);
});

test('Windows separators are the same rule', () => {
  assert.equal(isPlanPath('C:\\w\\one\\plans\\x.md', 'C:\\w\\one', 'markdown'), true);
  assert.equal(isPlanPath('C:\\w\\one\\src\\x.md', 'C:\\w\\one', 'markdown'), false);
});
