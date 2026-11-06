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
