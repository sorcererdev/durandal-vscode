import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { actionLog, file, open, reply, running, sleep, until } from './helpers';

const hintsAt = () => vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', file('one/main.py'), new vscode.Range(0, 0, 1, 0));
const hinted = (from: number) => actionLog().slice(from).filter(e => e.event === 'hinted');

describe('⚡ hints (fake server)', () => {
  after(async () => {
    reply('textDocument/inlayHint', null);
    await vscode.workspace.getConfiguration('durandal').update('hints', undefined, vscode.ConfigurationTarget.Global);
  });

  it('the server\'s hint, its command, logged once per line; the toggle turns them off and on', async () => {
    await running();
    // the fake answers every document alike: main.py must be the only one hinted
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const logged = actionLog().length;
    reply('olifant/fileActions', { actions: [{ generator: 'p/wire', name: 'Wire', label: 'Wire close_table', range: { start: [1, 1], end: [1, 6] }, sets: {}, missing: [], snippet: false }], nearby: [] });
    reply('textDocument/inlayHint', [{
      position: { line: 0, character: 5 },
      label: [{ value: '⚡ Wire close_table +1', command: { title: '⚡ Wire close_table +1', command: 'olifant.showActions', arguments: [file('one/main.py').toString(), { line: 0, character: 0 }] } }],
      paddingLeft: true,
    }]);
    await open(file('one/main.py'));
    let hints = await hintsAt();
    assert.equal(hints.length, 1);
    const part = (hints[0].label as vscode.InlayHintLabelPart[])[0];
    assert.equal(part.value, '⚡ Wire close_table +1');
    assert.equal(part.command?.command, 'olifant.showActions');
    await until(() => hinted(logged).length > 0, 'hinted logged');
    const n = hinted(logged).length;
    await hintsAt();
    await sleep(500);
    assert.equal(hinted(logged).length, n, 'once per line');

    const conf = () => vscode.workspace.getConfiguration('durandal');
    await vscode.commands.executeCommand('durandal.hints.toggle');
    assert.equal(conf().get('hints'), false);
    hints = await hintsAt();
    assert.equal(hints.length, 0);
    await vscode.commands.executeCommand('durandal.hints.toggle');
    assert.equal(conf().get('hints'), true);
    assert.equal((await hintsAt()).length, 1);
  });
});
