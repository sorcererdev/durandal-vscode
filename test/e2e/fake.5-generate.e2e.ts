import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Field } from '../../src/protocol';
import { FakeUi } from '../fakeUi';
import { actionLog, disk, file, log, open, reply, revert, running, settle, tabsUnder, until, ws } from './helpers';

const fld = (o: Partial<Field> & { name: string }): Field =>
  ({ value: null, source: null, valid: true, why: null, choices: null, needs: [], new: [], ...o });
const gens = { generators: [{ id: 'p/command', name: 'Command', summary: 'a use case', here: true }, { id: 'p/query', name: 'Query', summary: 'reads' }] };
const missing = {
  steps: [{ generator: 'p/command', fields: [fld({ name: 'command', valid: false })] }],
  files: [{ path: 'main.py', new: false, added: 1, removed: 0 }],
  main: { path: 'main.py', text: 'x = 1\n# ⟨command⟩\n', first: 2 },
  ready: false, error: null,
};
const filled = {
  ...missing,
  steps: [{ generator: 'p/command', fields: [fld({ name: 'command', value: 'close_table', source: 'you' })] }],
  main: { path: 'main.py', text: 'x = 1\n# close_table\n', first: 2 },
  ready: true,
};

// planOf: the plan Command makes from before (main.py's text): close_table.py new, a line
// added to main.py, and its edit.
function planOf(before: string) {
  const end = { line: before.split('\n').length - 1, character: 0 };
  return {
    plan: { files: [{ path: 'main.py', before, after: `${before}# close_table\n` }, { path: 'close_table.py', before: null, after: 'class CloseTable: pass\n' }], conflicts: [], warnings: [], holes: [], snippet: null },
    edit: { documentChanges: [
      { kind: 'create', uri: file('one/close_table.py').toString() },
      { textDocument: { uri: file('one/close_table.py').toString(), version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'class CloseTable: pass\n' }] },
      { textDocument: { uri: file('one/main.py').toString(), version: null }, edits: [{ range: { start: end, end }, newText: '# close_table\n' }] },
    ] },
  };
}

// start opens main.py, runs Generate with ui picking Command, and waits for the form's fields.
// The run is wrapped: an async function returning the thenable itself would wait for it.
async function start(ui: FakeUi, pick = 'p/command'): Promise<{ run: Thenable<unknown> }> {
  const a = await running();
  a.setUi(ui);
  ui.onPick = o => o.items.find(i => (i.value as { id?: string } | undefined)?.id === pick)?.value;
  await open(file('one/main.py'));
  const run = vscode.commands.executeCommand('durandal.generate');
  await until(() => ui.openForm?.model.rows.some(r => r.kind === 'field'), 'the form with its fields');
  return { run };
}

// typeCommand types close_table into the command field and waits for the ready preview.
async function typeCommand(ui: FakeUi): Promise<void> {
  reply('olifant/preview', filled);
  const n = ui.texts.length;
  ui.openForm!.answer({ kind: 'field', step: 0, name: 'command' });
  await until(() => ui.texts.length > n, 'the command input');
  const t = ui.texts[ui.texts.length - 1];
  t.onChange!('close_table');
  t.finish('close_table');
  await until(() => ui.openForm?.model.ready, 'the form ready');
}

describe('generate (fake server)', () => {
  afterEach(async () => (await running()).setUi(undefined));

  it('pick, the preview diff beside, a field, Ctrl+Enter: both files written and saved, logged', async () => {
    const a = await running();
    const before = disk('one/main.py');
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', planOf(before));
    const ui = new FakeUi();
    const { run } = await start(ui);
    assert.equal(ui.picks[0].title, 'Generate');
    await until(() => tabsUnder('/preview/').some(t => t.input instanceof vscode.TabInputTextDiff
      && t.input.original.toString() === file('one/main.py').toString()), 'the preview: main.py against its previewed text');
    await typeCommand(ui);
    await until(() => vscode.workspace.textDocuments.some(d => d.uri.scheme === 'durandal-doc' && d.uri.path.endsWith('/main.py')
      && d.getText() === filled.main.text), 'the preview updated in place');
    const n = a.shown.length;
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.generate.apply');
    await run;
    assert.equal(disk('one/close_table.py'), 'class CloseTable: pass\n');
    assert.equal(disk('one/main.py'), `${before}# close_table\n`);
    assert.ok(a.shown.slice(n).some(s => s.text === 'Applied Command: 2 files'), JSON.stringify(a.shown.slice(n)));
    const plans = log().filter(m => m.method === 'olifant/plan');
    assert.deepEqual(plans[plans.length - 1].params.steps, [{ generator: 'p/command', sets: { command: 'close_table' } }]);
    assert.deepEqual(actionLog().slice(logged).map(e => [e.event, e.generator]), [['generate-applied', 'p/command']]);
    await until(() => tabsUnder('/preview/').length === 0, 'the preview closed');
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), file('one/main.py').toString(), 'back in main.py');
    await settle('one/close_table.py', null);
    await settle('one/main.py', before);
  });

  it('a refused plan keeps the form, its values and the error', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', { lsp_error: 'close_table.py exists' });
    const ui = new FakeUi();
    const { run } = await start(ui);
    await typeCommand(ui);
    ui.openForm!.answer({ kind: 'apply' });
    await until(() => ui.openForm?.model.error === 'close_table.py exists', 'the error in the form');
    assert.ok(ui.log.includes('error close_table.py exists'));
    ui.openForm!.answer({ kind: 'escape' });
    await run;
  });

  it('+ New sends the new step first, with makes', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', { ...missing, steps: [{ generator: 'p/command', fields: [fld({ name: 'port', valid: false, choices: ['orders'], new: ['p/repository'] })] }] });
    const ui = new FakeUi();
    const { run } = await start(ui);
    ui.onPick = o => o.items.find(i => i.label === '+ New repository…')?.value;
    const n = log().length;
    ui.openForm!.answer({ kind: 'field', step: 0, name: 'port' });
    const sent = await until(() => log().slice(n).find(m => m.method === 'olifant/preview'), 'the preview with the new step');
    assert.deepEqual(sent.params.steps, [{ generator: 'p/repository', sets: {}, makes: { step: 1, input: 'port' } }, { generator: 'p/command', sets: {} }]);
    await until(() => ui.openForm, 'the form back');
    ui.openForm!.answer({ kind: 'escape' });
    await run;
  });

  it('a snippet plan puts its body in place of its line', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', { plan: { files: [], conflicts: [], warnings: [], holes: [], snippet: { file: 'main.py', line: 1, body: 'def ${1:close_table}():\n    pass' } } });
    const ui = new FakeUi();
    const { run } = await start(ui);
    await typeCommand(ui);
    ui.openForm!.answer({ kind: 'apply' });
    await run;
    const doc = vscode.window.activeTextEditor!.document;
    assert.ok(doc.getText().startsWith('def close_table():\n    pass'), doc.getText());
    await revert(doc);
  });

  it('Ctrl+O reviews; the review\'s Apply lands and logs generate-applied', async () => {
    const before = disk('one/main.py');
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    reply('olifant/plan', planOf(before));
    const ui = new FakeUi();
    ui.onReview = () => ({ kind: 'apply' });
    const { run } = await start(ui);
    await typeCommand(ui);
    const logged = actionLog().length;
    await vscode.commands.executeCommand('durandal.generate.review');
    await run;
    assert.equal(disk('one/close_table.py'), 'class CloseTable: pass\n');
    assert.ok(ui.log.includes('review Command'));
    assert.deepEqual(actionLog().slice(logged).map(e => e.event), ['generate-applied']);
    await settle('one/close_table.py', null);
    await settle('one/main.py', before);
  });

  it('outside a project with several open: which project, then its config.toml at 0:0', async () => {
    reply('olifant/generators', gens);
    reply('olifant/preview', missing);
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await open(file('plain/notes.txt'));
    ui.onPick = o => (o.title === 'Generate in which project?' ? o.items.find(i => i.label.endsWith('/one'))?.value : undefined);
    const n = log().length;
    await vscode.commands.executeCommand('durandal.generate');
    const asked = log().slice(n).find(m => m.method === 'olifant/generators');
    assert.deepEqual(asked?.params, { textDocument: { uri: vscode.Uri.file(`${ws()}/one/.olifant/config.toml`).toString() }, position: { line: 0, character: 0 } });
  });
});
