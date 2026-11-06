import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { SERVER_COMMANDS } from '../../src/protocol';
import { file, open, restart, running } from './helpers';

describe('health (olifant lsp)', () => {
  it('runs olifant doctor for the open project', async () => {
    await open(file('py/src/bistro/main.py'));
    const a = await running();
    const text = (await a.health()).join('\n');
    assert.match(text, /^ok: olifant lsp running$/m);
    assert.match(text, /^--- olifant doctor in .*\/py$/m);
    assert.match(text, /^ok: config — /m);
  });

  it('after Restart Server, the server\'s doctor command runs (registered once, not "already exists")', async () => {
    const a = await running();
    const before = a.shown.length;
    await restart();
    const result = await vscode.commands.executeCommand<{ checks?: { name: string; status: string }[] }>(
      SERVER_COMMANDS.doctor, file('py/src/bistro/main.py').toString());
    assert.equal(result?.checks?.[0]?.name, 'config', JSON.stringify(result));
    assert.equal(result?.checks?.[0]?.status, 'ok', JSON.stringify(result));
    assert.deepEqual(a.shown.slice(before).filter(s => s.level === 'error').map(s => s.text), []);
  });
});
