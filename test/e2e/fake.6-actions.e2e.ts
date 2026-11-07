import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Field } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { fld, plan } from '../fixtures';
import { actionLog, count, disk, file, log, open, reply, running, until } from './helpers';

const R0 = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
const fix = { title: 'Add a service', kind: 'quickfix', data: { kind: 'fix', rule: 'r/service', sets: { app: 'bistro' }, missing: ['service'], choices: { service: ['booking', 'orders'] } } };
const wire = { title: 'Wire close_table', kind: 'refactor.rewrite', data: { kind: 'action', generator: 'p/wire', sets: { command: 'close_table' }, missing: [], choices: {} } };
const topEdit = (rel: string, text: string) => ({ documentChanges: [{ textDocument: { uri: file(rel).toString(), version: null }, edits: [{ range: R0, newText: text }] }] });

// restore puts rel's text back through VS Code (an edit and a save): an outside write and a
// revert of a file saved moments before can leave VS Code 1.145's main process reading it, and
// spinning at quit.
async function restore(rel: string, text: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(file(rel));
  const all = new vscode.WorkspaceEdit();
  all.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
  await vscode.workspace.applyEdit(all);
  await doc.save();
  assert.equal(disk(rel), text);
}

async function withUi(): Promise<FakeUi> {
  const ui = new FakeUi();
  (await running()).setUi(ui);
  return ui;
}

describe('actions at the cursor (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('fixes first with what they ask; an input from its choices; resolved with the sets; reviewed, applied, logged', async () => {
    const before = disk('one/other.py');
    reply('textDocument/codeAction', [wire, fix]);
    reply('codeAction/resolve', { ...fix, data: { ...fix.data, plan: plan({ files: [{ path: 'other.py', before, after: `# service\n${before}` }] }) }, edit: topEdit('one/other.py', '# service\n') });
    const ui = await withUi();
    ui.onPick = o => (o.title === 'Olifant' ? o.items[0].value : o.title === 'service' ? 'orders' : undefined);
    ui.onReview = () => ({ kind: 'apply' });
    await open(file('one/main.py'));
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, i.description]), [['Fix: Add a service', '(asks service)'], ['Wire close_table', undefined]]);
    const resolve = log().filter(m => m.method === 'codeAction/resolve').pop()!;
    assert.deepEqual(resolve.params.data.sets, { app: 'bistro', service: 'orders' });
    assert.ok(ui.log.includes('review Add a service'));
    assert.equal(disk('one/other.py'), `# service\n${before}`);
    const events = actionLog().slice(logged);
    assert.deepEqual(events.map(e => e.event), ['shown', 'fix-picked', 'applied']);
    assert.deepEqual(events[0].generators, ['r/service', 'p/wire']);
    assert.equal(events[0].file, 'main.py');
    assert.equal(events[2].files, 1);
    await restore('one/other.py', before);
  });

  it('a fix naming a generator asks in the generate form, which hands its values back; then resolve', async () => {
    const fixGen = { ...fix, data: { ...fix.data, generator: 'p/service', choices: {} } };
    reply('textDocument/codeAction', [fixGen]);
    reply('olifant/generators', { generators: [{ id: 'p/service', name: 'Service', here: true }] });
    const shape = (service: Field, ready: boolean) => ({ steps: [{ generator: 'p/service', fields: [fld({ name: 'app', value: 'bistro', source: 'you' }), service] }], files: [], main: null, ready, error: null });
    reply('olifant/preview', shape(fld({ name: 'service', valid: false }), false));
    reply('codeAction/resolve', { ...fixGen, data: { ...fixGen.data, plan: plan() } });
    const ui = await withUi();
    ui.onPick = o => (o.title === 'Olifant' ? o.items[0].value : undefined);
    await open(file('one/main.py'));
    const run = vscode.commands.executeCommand('durandal.actions');
    await until(() => ui.openForm?.model.rows.some(r => r.kind === 'field'), 'the generate form');
    reply('olifant/preview', shape(fld({ name: 'service', value: 'orders', source: 'you' }), true));
    ui.openForm!.answer({ kind: 'field', step: 0, name: 'service' });
    await until(() => ui.texts.length > 0, 'the service input');
    ui.texts[0].onChange!('orders');
    ui.texts[0].finish('orders');
    await until(() => ui.openForm?.model.ready, 'ready');
    const plans = count('olifant/plan');
    ui.openForm!.answer({ kind: 'apply' });
    await run;
    assert.equal(count('olifant/plan'), plans, 'nothing planned in the form');
    const resolve = log().filter(m => m.method === 'codeAction/resolve').pop()!;
    assert.deepEqual(resolve.params.data.sets, { app: 'bistro', service: 'orders' });
  });

  it('nothing here: the file\'s actions elsewhere, what waits first; picking one moves there and asks again', async () => {
    reply('textDocument/codeAction', []);
    reply('olifant/fileActions', { actions: [{ generator: 'g', name: 'G', label: 'Do it', range: { start: [1, 2], end: [1, 4] }, sets: {}, missing: [], snippet: false }], nearby: [{ generator: 'p/wire', name: 'Wire', label: 'Wire', why: 'on a field of a command' }] });
    const ui = await withUi();
    let menus = 0;
    ui.onPick = o => {
      menus++;
      return menus === 1 ? o.items.find(i => !i.separator)?.value : undefined;
    };
    await open(file('one/main.py'));
    const asked = count('olifant/fileActions');
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.picks[0].items.map(i => [i.label, !!i.separator]), [['Wire applies on a field of a command — none yet', true], ['⚡ Do it — line 1', false]]);
    assert.equal(menus, 2, 'asked again where it moved');
    assert.ok(count('olifant/fileActions') >= asked + 2, 'the file\'s actions asked each time');
    const sel = vscode.window.activeTextEditor!.selection.active;
    assert.deepEqual([sel.line, sel.character], [0, 1]);
  });

  it('nothing here and nothing elsewhere: what waits, or that nothing applies', async () => {
    reply('textDocument/codeAction', []);
    const ui = await withUi();
    await open(file('one/main.py'));
    reply('olifant/fileActions', { actions: [], nearby: [{ generator: 'p/wire', why: 'on a field of a command' }] });
    await vscode.commands.executeCommand('durandal.actions');
    reply('olifant/fileActions', { actions: [], nearby: [] });
    await vscode.commands.executeCommand('durandal.actions');
    assert.deepEqual(ui.log.filter(l => l.startsWith('info')), ['info p/wire applies on a field of a command — none yet', 'info No Olifant generators apply to main.py']);
  });

  it('the ⚡ hint\'s command opens the menu at its line; outside a project it says so', async () => {
    reply('textDocument/codeAction', [wire]);
    const ui = await withUi();
    const n = log().length;
    await vscode.commands.executeCommand('olifant.showActions', file('one/main.py').toString(), { line: 0, character: 0 });
    assert.equal(ui.picks[0].title, 'Olifant');
    assert.ok(log().slice(n).some(m => m.method === 'textDocument/codeAction' && m.params.textDocument.uri === file('one/main.py').toString()
      && m.params.range.start.line === 0 && m.params.context.diagnostics.length === 0));
    await open(file('plain/notes.txt'));
    await vscode.commands.executeCommand('durandal.actions');
    assert.ok(ui.log.includes('info not in an Olifant project (no .olifant/ above this file)'));
  });

  it('the lightbulb: a resolved action\'s edit is applied the server-edit way, saved and named', async () => {
    const a = await running();
    const before = disk('one/other.py');
    reply('textDocument/codeAction', [wire]);
    reply('codeAction/resolve', { ...wire, edit: topEdit('one/other.py', '# wired\n') });
    await open(file('one/main.py'));
    const got = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', file('one/main.py'), new vscode.Range(0, 0, 0, 0), undefined, 1);
    const act = got.find(x => x.title === 'Wire close_table')!;
    assert.equal(act.edit, undefined, 'no edit for VS Code to apply');
    assert.equal(act.command?.command, 'durandal.applyResolvedEdit');
    const n = a.shown.length;
    await vscode.commands.executeCommand(act.command!.command, ...act.command!.arguments!);
    assert.equal(disk('one/other.py'), `# wired\n${before}`);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Wire close_table: other.py'));
    await restore('one/other.py', before);
  });
});
