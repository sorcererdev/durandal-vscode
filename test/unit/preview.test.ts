import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileLine, fileSummary, previewView } from '../../src/generate/preview';
import { empty as base } from '../fixtures';

test('fileLine: + for a new file; ~ with what it adds and removes for a changed one', () => {
  assert.equal(fileLine({ path: 'a.py', new: true, added: 20, removed: 0 }), '+ a.py');
  assert.equal(fileLine({ path: 'b.py', new: false, added: 3, removed: 1 }), '~ b.py +3 −1');
  assert.equal(fileSummary([{ path: 'a.py', new: true, added: 2, removed: 0 }, { path: 'b.py', new: false, added: 3, removed: 1 }]), '+ a.py, ~ b.py +3 −1');
});

test('previewView: an error is its "; " parts', () => {
  assert.deepEqual(previewView({ ...base, error: 'choose app, service to see what it writes; b.py: a conflict' }),
    { kind: 'error', lines: ['choose app, service to see what it writes', 'b.py: a conflict'] });
});

test('previewView: no files and no error is nothing to change', () => {
  assert.deepEqual(previewView(base), { kind: 'nothing' });
});

test('previewView: the main file, changed or new, at its first differing line (0-based), titled with every file', () => {
  const files = [{ path: 'b.py', new: false, added: 3, removed: 1 }, { path: 'a.py', new: true, added: 2, removed: 0 }];
  assert.deepEqual(previewView({ ...base, files, main: { path: 'b.py', text: 'x\ny\n', first: 2 } }),
    { kind: 'changed', path: 'b.py', text: 'x\ny\n', line: 1, title: '~ b.py +3 −1, + a.py' });
  assert.deepEqual(previewView({ ...base, files, main: { path: 'a.py', text: 'z\n', first: 1 } }).kind, 'new');
});
