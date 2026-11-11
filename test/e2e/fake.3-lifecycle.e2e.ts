import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { STOPPED } from '../../src/health';
import { Olifant } from '../../src/protocol';
import { NOT_RUNNING } from '../../src/server';
import { added, api, count, file, log, open, reply, restart, running, sleep, until } from './helpers';

describe('lifecycle and health (fake server)', () => {
  it('health runs olifant doctor for the open file\'s project', async () => {
    const a = await running();
    reply('workspace/executeCommand', { checks: [
      { name: 'config', status: 'ok', detail: 'project at /w/one', fix: null },
      { name: 'model', status: 'warn', detail: 'no [model] backend', fix: 'add [model] to .olifant/config.toml' },
    ] });
    await open(file('one/main.py'));
    const text = (await a.health()).join('\n');
    assert.match(text, /^binary: .*fake-lsp$/m);
    assert.match(text, /^ok: olifant lsp running$/m);
    assert.match(text, /^project: .*\/one$/m);
    assert.match(text, /^ok: config — project at \/w\/one$/m);
    assert.match(text, /^warn: model — no \[model\] backend\n {2}fix: add \[model\] to \.olifant\/config\.toml$/m);
    const call = log().filter(m => m.method === 'workspace/executeCommand').pop();
    assert.deepEqual(call?.params, { command: 'olifant.doctor', arguments: [file('one/main.py').toString()] });
  });

  it('a server-named command not built yet says so', async () => {
    const a = await running();
    await vscode.commands.executeCommand('olifant.plans.excerpt');
    assert.ok(a.shown.some(s => s.text === 'Durandal: Plan Excerpt is not implemented yet (milestone 6)'));
  });

  it('a crash is one notification and no restart; requests say it is not running', async () => {
    const a = await running();
    const inits = count('initialize');
    const before = a.shown.length;
    void a.server.client()!.sendNotification('test/crash');
    await until(() => a.server.state() === 'stopped', 'the server stopped');
    await sleep(1500);
    assert.equal(a.server.state(), 'stopped');
    assert.equal(count('initialize'), inits, 'no restart');
    assert.deepEqual(a.shown.slice(before).filter(s => s.level === 'error').map(s => s.text), [STOPPED]);
    assert.match((await a.health()).join('\n'), /^error: olifant lsp stopped/m);
    await assert.rejects(a.server.request(Olifant.testsFile, { textDocument: { uri: file('one/main.py').toString() } }), { message: NOT_RUNNING });
  });

  it('Restart Server brings it back, with its projects and olifant.doctor', async () => {
    const n = log().length;
    const a = await restart();
    await until(() => added(log().slice(n)).length >= 2, 'the projects sent again');
    const again = added(log().slice(n));
    assert.ok(again.includes(file('one').toString()) && again.includes(file('two').toString()), again.join(', '));
    reply('workspace/executeCommand', { checks: [] });
    await open(file('one/main.py'));
    assert.match((await a.health()).join('\n'), /^--- olifant doctor in /m);
  });

  it('a missing binary is one error, and health says where it looked', async () => {
    const conf = vscode.workspace.getConfiguration('durandal');
    const fake = conf.get<string>('path')!;
    try {
      await conf.update('path', '/nonexistent/olifant', vscode.ConfigurationTarget.Workspace);
      const a = await api();
      const before = a.shown.length;
      await vscode.commands.executeCommand('durandal.restartServer');
      await until(() => a.server.state() === 'failed', 'the start to fail');
      assert.equal(a.shown.slice(before).filter(s => s.level === 'error').length, 1);
      const text = (await a.health()).join('\n');
      assert.match(text, /^binary: not found$/m);
      assert.match(text, /no `\/nonexistent\/olifant` binary found/);
    } finally {
      await conf.update('path', fake, vscode.ConfigurationTarget.Workspace);
      await restart();
    }
  });
});
