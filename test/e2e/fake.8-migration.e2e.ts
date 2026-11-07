import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { file, open, reply, running, until } from './helpers';

describe('the migration report (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('opens the report beside; a project not migrating says so', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await open(file('one/main.py'));
    reply('olifant/model', { project: 'one', elements: [], relations: [], problems: [], migration: { line: '+1 extracted (close-table)', switches: [{ name: 'close-table', on: true }], added_legacy: [], unregistered: [] } });
    await vscode.commands.executeCommand('durandal.migration');
    const doc = await until(() => vscode.workspace.textDocuments.find(d => d.uri.scheme === 'durandal-doc' && d.uri.path === '/Migration'), 'the report');
    assert.equal(doc.getText(), '+1 extracted (close-table)\n\nswitches\n  close-table  on');
    reply('olifant/model', { project: 'one', elements: [], relations: [], problems: [] });
    await open(file('one/main.py'));
    await vscode.commands.executeCommand('durandal.migration');
    assert.ok(ui.log.includes('info this project is not migrating (no [migrate] in .olifant/config.toml; olifant init --migrate PATH sets it up)'));
  });
});
