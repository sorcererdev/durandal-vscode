import * as assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { actionLog, api, file, log, open, reply, restart, revert, settle, sleep, until } from './helpers';

const MAIN = 'one/main.py';
const uri = () => file(MAIN).toString();
const pushFile = join(mkdtempSync(join(tmpdir(), 'durandal-push-')), 'suggestion.json');
// push sets what the fake pushes after every edit (FAKE_LSP_SUGGEST: its uri and version filled)
const push = (s: Record<string, unknown>) => writeFileSync(pushFile, JSON.stringify(s));
const FOLLOWUP = { kind: 'followup', label: 'Failure arms', summary: '1 file', line: 1, lines: null, at: 1, planId: 7, generator: null, sets: {} };
const plans = () => log().filter(m => m.method === 'olifant/plan');
const events = (from: number, name: string) => actionLog().slice(from).filter(e => e.event === name);

// edited opens main.py as "x = 1\n", types on line 0 (the fake pushes for that version) and
// leaves the cursor at its end.
async function edited(): Promise<vscode.TextEditor> {
  await settle(MAIN, 'x = 1\n');
  const ed = await open(file(MAIN));
  await ed.edit(b => b.insert(new vscode.Position(0, 5), '0'));
  const at = new vscode.Position(0, 6);
  ed.selection = new vscode.Selection(at, at);
  return ed;
}

const shownKind = async () => (await api()).suggest.state(uri())?.kind;

describe('pushed and pulled suggestions (fake server)', () => {
  before(async () => {
    push(FOLLOWUP);
    process.env.FAKE_LSP_SUGGEST = pushFile;
    await restart();
  });
  after(async () => {
    delete process.env.FAKE_LSP_SUGGEST;
    await restart();
  });
  afterEach(async () => {
    for (const m of ['olifant/plan', 'olifant/suggest', 'textDocument/inlayHint', 'olifant/choices', 'textDocument/codeAction']) reply(m, null);
    push(FOLLOWUP);
    (await api()).setUi(undefined);
    await vscode.workspace.getConfiguration('durandal').update('ghosts', undefined, vscode.ConfigurationTarget.Global);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uri());
    if (d?.isDirty) await revert(d);
    // each case types the same line: a dismissal (forgotten when VS Code drops the document,
    // which it does lazily) must not carry over
    (await api()).suggest.controller.closed(uri());
  });

  it('a push shows for its version and line only; its plan is asked once', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const before = plans().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.deepEqual(plans().slice(before).map(m => m.params), [{ planId: 7 }]);
    assert.equal(events(from, 'followup-shown').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await until(async () => (await shownKind()) === undefined, 'cleared off its line');
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await until(async () => (await shownKind()) === 'followup', 'shown again on its line');
    assert.equal(plans().length - before, 1, 'the plan asked once per push');
  });

  it('the ⚡ hint is hidden on the suggestion\'s line and comes back', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    reply('textDocument/inlayHint', [{ position: { line: 0, character: 6 }, label: '⚡ Wire', paddingLeft: true }]);
    const hintsAt = () => vscode.commands.executeCommand<vscode.InlayHint[]>('vscode.executeInlayHintProvider', file(MAIN), new vscode.Range(0, 0, 1, 0));
    await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.equal((await hintsAt()).length, 0);
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal((await hintsAt()).length, 1);
  });

  it('Esc dismisses and remembers the line; the action log says so', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    const from = actionLog().length;
    const ed = await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    await vscode.commands.executeCommand('durandal.suggest.dismiss');
    assert.equal(await shownKind(), undefined);
    assert.equal(events(from, 'followup-dismissed').length, 1);
    ed.selection = new vscode.Selection(1, 0, 1, 0);
    await sleep(500);
    ed.selection = new vscode.Selection(0, 6, 0, 6);
    await sleep(1000);
    assert.equal(await shownKind(), undefined, 'not offered again on this line\'s text');
  });

  it('ghosts off: nothing pulled, nothing shown', async () => {
    await vscode.workspace.getConfiguration('durandal').update('ghosts', false, vscode.ConfigurationTarget.Global);
    const n = log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length;
    await edited();
    await sleep(1000);
    assert.equal(log().filter(m => m.method === 'olifant/suggest' || m.method === 'olifant/plan').length, n);
    assert.equal(await shownKind(), undefined);
  });

  it('a restart clears the shown follow-up', async () => {
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: null } });
    await edited();
    await until(async () => (await shownKind()) === 'followup', 'the follow-up shown');
    assert.match((await api()).suggest.decorated(uri()) ?? '', /^⚡ Tab: review Failure arms/);
    await restart();
    assert.equal(await shownKind(), undefined);
    assert.equal((await api()).suggest.decorated(uri()), undefined, 'no decoration left');
  });
});
