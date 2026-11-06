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
