import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { disk, file, log, Msg, open, reply, revert, running, until } from './helpers';

const R = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

// insert is an edit putting text at the top of uri; annotated, as olifant marks a region refresh.
function insert(uri: string, text: string, annotated = false): unknown {
  return {
    documentChanges: [{ textDocument: { uri, version: null }, edits: [{ range: R, newText: text, ...(annotated ? { annotationId: 'r' } : {}) }] }],
    ...(annotated ? { changeAnnotations: { r: { label: 'regions', needsConfirmation: true } } } : {}),
  };
}

// serverEdit has the fake send edit as a workspace/applyEdit request, labelled label, while it
// answers a request about doc ("$uri" and "$stale" in edit name doc and the version before the
// server's last one); it returns the client's answer as the fake received it.
async function serverEdit(label: string, edit: unknown, doc = file('one/main.py')): Promise<Msg> {
  const a = await running();
  reply('test/applyEdit', { notify: [{ method: 'workspace/applyEdit', request: true, params: { label, edit } }], ok: true });
  const n = log().length;
  await a.server.client()!.sendRequest('test/applyEdit', { textDocument: { uri: doc.toString() } });
  return until(() => log().slice(n).find(m => typeof m.id === 'string' && m.id.startsWith('srv-') && !m.method), 'the client\'s answer');
}

const docOf = (rel: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === file(rel).toString());

describe('the server\'s edits (fake server)', () => {
  it('an annotated edit to a file not open goes in at once, is saved, and is named once', async () => {
    const a = await running();
    const before = a.shown.length;
    const answer = await serverEdit('Olifant: regions', insert(file('one/other.py').toString(), '# region\n', true));
    assert.deepEqual(answer.result, { applied: true });
    assert.ok(disk('one/other.py').startsWith('# region\n'), 'other.py saved with the edit');
    await until(() => a.shown.slice(before).some(s => s.text === 'Olifant: regions: other.py'), 'the notice');
    assert.equal(a.shown.slice(before).filter(s => s.text.startsWith('Olifant: regions')).length, 1);
  });

  it('an open file with unsaved changes takes the edit and stays unsaved, unnamed', async () => {
    const a = await running();
    const other = await open(file('one/other.py'));
    const end = other.document.lineAt(other.document.lineCount - 1).range.end;
    await other.edit(b => b.insert(end, '# mine\n'));
    const onDisk = disk('one/other.py');
    const before = a.shown.length;
    const answer = await serverEdit('Olifant: regions', insert(file('one/other.py').toString(), '# again\n'));
    assert.deepEqual(answer.result, { applied: true });
    assert.ok(other.document.getText().startsWith('# again\n'), 'the edit in the open document');
    assert.ok(other.document.isDirty);
    assert.equal(disk('one/other.py'), onDisk);
    assert.ok(!a.shown.slice(before).some(s => s.text.includes('other.py')));
    await revert(other.document);
  });

  it('a plan takes the edit and stays unsaved', async () => {
    const onDisk = disk('one/plans/p.md');
    const answer = await serverEdit('Olifant: regions', insert(file('one/plans/p.md').toString(), '- [x] done\n'));
    assert.deepEqual(answer.result, { applied: true });
    assert.ok(docOf('one/plans/p.md')?.getText().startsWith('- [x] done\n'), 'the plan edited');
    assert.ok(docOf('one/plans/p.md')!.isDirty);
    assert.equal(disk('one/plans/p.md'), onDisk);
    await revert(docOf('one/plans/p.md')!);
  });

  it('an edit made at an older version is refused whole, naming the file', async () => {
    await running();
    const ed = await open(file('one/main.py'));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# typed\n'));
    const v = ed.document.version;
    await until(() => log().some(m => m.method === 'textDocument/didChange' && m.params.textDocument.version === v), 'the server has the version');
    const answer = await serverEdit('Olifant: stale',
      { documentChanges: [{ textDocument: { uri: '$uri', version: '$stale' }, edits: [{ range: R, newText: 'STALE\n' }] }] }, ed.document.uri);
    assert.deepEqual(answer.result, { applied: false, failureReason: 'main.py changed since' });
    assert.ok(!ed.document.getText().includes('STALE'));
    await revert(ed.document);
  });
});
