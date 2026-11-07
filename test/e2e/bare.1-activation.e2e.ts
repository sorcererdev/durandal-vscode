import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { added, open, until } from './helpers';

describe('a window with no project folder (fake server, issue #1)', () => {
  it('activates after startup; a project file opened from outside starts the server and joins', async () => {
    const ext = vscode.extensions.getExtension<Api>('sorcererdev.durandal')!;
    // not ext.activate(): that would activate it whatever the manifest says
    await until(() => ext.isActive, 'the extension active after startup', 30_000);
    const a = ext.exports;
    assert.equal(a.server.state(), 'not started', 'no project, no server');
    const outside = process.env.DURANDAL_E2E_OUTSIDE!;
    await open(vscode.Uri.file(join(outside, 'lib.py')));
    await until(() => a.server.state() === 'running', 'olifant lsp running', 60_000);
    await until(() => a.inProject(), 'durandal.inProject for the outside file');
    await until(() => added().includes(vscode.Uri.file(outside).toString()), 'the outside project added as a folder');
    assert.deepEqual(a.server.roots(), [outside]);
  });
});
