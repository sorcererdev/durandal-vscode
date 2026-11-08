import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { RESULTS_PATH } from '../../src/tdd/results';
import { FakeUi } from '../fakeUi';
import { api, disk, file, log, open, reply, restart, revert, running, settle, tabsUnder, until, ws } from './helpers';

const MAIN = 'one/main.py';
const TEST = 'one/main__test.py';
const TEST_TEXT = 'def test_one():\n    assert 1 == 1\n\n\ndef test_two():\n    assert 1 == 2\n';
const abs = (rel: string) => join(ws(), rel);
const uriOf = (rel: string) => file(rel).toString();

const green = () => ({
  file: abs(TEST), passed: ['main__test.py::test_one', 'main__test.py::test_two'], scope: 'file', test: null, failed: [], broken: null, seconds: 0.8,
});
const red = () => ({
  ...green(), passed: ['main__test.py::test_one'], seconds: 1.3,
  failed: [{ id: 'main__test.py::test_two', file: abs(TEST), line: 6, message: 'assert 1 == 2', output: 'E   assert 1 == 2' }],
});

const runs = () => log().filter(m => m.method === 'olifant/tests/run');
const testMarks = (rel: string) => vscode.languages.getDiagnostics(file(rel)).filter(d => d.source === 'olifant' && d.severity === vscode.DiagnosticSeverity.Error);
const resultsTabs = () => tabsUnder('/' + RESULTS_PATH);

// run executes a TDD command and waits for the notice it says (from the shown list's end)
async function said(command: string, want: (text: string) => boolean): Promise<string> {
  const a = await api();
  const from = a.shown.length;
  void vscode.commands.executeCommand(command);
  const s = await until(() => a.shown.slice(from).find(x => want(x.text)), `a notice after ${command}`);
  return s.text;
}

describe('the TDD loop (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(TEST, TEST_TEXT);
    await settle(MAIN, 'x = 1\n');
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(TEST, null);
  });

  afterEach(async () => {
    (await api()).setUi(undefined);
    for (const m of ['olifant/tests/run', 'olifant/tests/file', 'olifant/stub', 'olifant/conjure']) reply(m, null);
    for (const rel of [MAIN, TEST]) {
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(rel));
      if (d?.isDirty) await revert(d);
    }
  });

  it('here sends the cursor, file the scope, all the scope (spec §3)', async () => {
    await running();
    reply('olifant/tests/run', green());
    const ed = await open(file(TEST));
    ed.selection = new vscode.Selection(4, 2, 4, 2);
    const n = runs().length;
    await said('durandal.test.here', t => t.startsWith('all 2 passed'));
    await said('durandal.test.file', t => t.startsWith('all 2 passed'));
    await said('durandal.test.all', t => t.startsWith('all 2 passed'));
    const sent = runs().slice(n).map(m => m.params);
    assert.deepEqual(sent[0], { textDocument: { uri: uriOf(TEST) }, position: { line: 4, character: 2 } });
    assert.deepEqual(sent[1], { textDocument: { uri: uriOf(TEST) }, scope: 'file' });
    assert.deepEqual(sent[2], { textDocument: { uri: uriOf(TEST) }, scope: 'all' });
  });

  it('a red run: an error on the failing line, the results document opened beside, a warning', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    reply('olifant/tests/run', red());
    await open(file(MAIN));
    const text = await said('durandal.test.file', t => t.includes('failed'));
    assert.equal(text, '1 passed · 1 failed · 1.3 s');
    const a = await api();
    assert.equal(a.shown[a.shown.length - 1].level, 'warn');
    const ds = await until(() => testMarks(TEST).length > 0 ? testMarks(TEST) : undefined, 'the failure marked');
    assert.equal(ds[0].range.start.line, 5);
    assert.equal(ds[0].message, 'assert 1 == 2');
    await until(() => resultsTabs().length === 1, 'the results document opened');
    const doc = vscode.workspace.textDocuments.find(d => d.uri.path === '/' + RESULTS_PATH)!;
    assert.ok(doc.getText().includes('✗ test_two  (main__test.py:6)'));
    // the focus stayed on the module
    assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), uriOf(MAIN));
    // the ✗ row links to the failing line
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', doc.uri);
    assert.equal(links.length, 1);
    assert.equal(links[0].target?.fsPath, abs(TEST));
    assert.equal(links[0].target?.fragment, 'L6');
  });

  it('a red run again with the results open: the tab updates in place (Review Focus 5)', async () => {
    reply('olifant/tests/run', { ...red(), seconds: 2.1 });
    await open(file(MAIN));
    await said('durandal.test.file', t => t.includes('2.1 s'));
    assert.equal(resultsTabs().length, 1);
  });

  it('a green run: marks cleared, info, nothing opened', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    reply('olifant/tests/run', green());
    await open(file(MAIN));
    await said('durandal.test.file', t => t === 'all 2 passed · 0.8 s');
    const a = await api();
    assert.equal(a.shown[a.shown.length - 1].level, 'info');
    assert.equal(testMarks(TEST).length, 0);
    assert.equal(resultsTabs().length, 0);
    assert.equal(a.tdd.last()?.passed.length, 2);
  });

  it('broken: a file run marks line 0 of its file; an all run marks nothing', async () => {
    await open(file(MAIN));
    reply('olifant/tests/run', { ...green(), passed: [], broken: 'ImportError: x\n  more' });
    assert.equal(await said('durandal.test.file', t => t.startsWith('broken')), 'broken: ImportError: x');
    const ds = await until(() => testMarks(TEST).length > 0 ? testMarks(TEST) : undefined, 'the broken mark');
    assert.equal(ds[0].range.start.line, 0);
    reply('olifant/tests/run', { ...green(), passed: [], scope: 'all', broken: 'no test files in this project: nothing to run' });
    await said('durandal.test.all', t => t.startsWith('broken: no test files'));
    assert.equal(testMarks(TEST).length, 0);
  });

  it('from the results document, the last run runs again (Review Focus 4)', async () => {
    reply('olifant/tests/run', red());
    await open(file(MAIN));
    await said('durandal.test.file', t => t.includes('failed'));
    const doc = vscode.workspace.textDocuments.find(d => d.uri.path === '/' + RESULTS_PATH)!;
    await vscode.window.showTextDocument(doc);
    const n = runs().length;
    await said('durandal.test.here', t => t.includes('failed'));
    assert.deepEqual(runs().slice(n)[0].params, { textDocument: { uri: uriOf(MAIN) }, scope: 'file' });
  });

  it('with no file editor: one error, nothing sent (Review Focus 4)', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const n = runs().length;
    assert.equal(await said('durandal.test.here', () => true), 'open a file of an Olifant project first');
    assert.equal(runs().length, n);
  });

  it('a second run cancels the first: $/cancelRequest sent, nothing said for the first', async () => {
    const a = await running();
    await open(file(MAIN));
    reply('olifant/tests/run', { hold: true, title: 'testing' });
    const from = a.shown.length;
    const n = runs().length;
    void vscode.commands.executeCommand('durandal.test.file');
    await until(() => runs().length > n, 'the first run sent');
    const first = runs()[n].id;
    reply('olifant/tests/run', green());
    await said('durandal.test.file', t => t.startsWith('all 2 passed'));
    await until(() => log().some(m => m.method === '$/cancelRequest' && m.params.id === first), 'the first run cancelled');
    // one notice: the second run's summary; nothing for the first
    assert.deepEqual(a.shown.slice(from).map(s => s.text), ['all 2 passed · 0.8 s']);
  });

  it('a server error is said verbatim', async () => {
    await open(file(MAIN));
    reply('olifant/tests/run', { lsp_error: 'no test file for this module yet: main__test.py' });
    assert.equal(await said('durandal.test.file', () => true), 'no test file for this module yet: main__test.py');
  });

  it('a restart during a run: no notice, the results document keeps the last answer (Review Focus 3)', async () => {
    await open(file(MAIN));
    reply('olifant/tests/run', red());
    await said('durandal.test.file', t => t.includes('failed'));
    reply('olifant/tests/run', { hold: true, title: 'testing' });
    const a = await api();
    const n = runs().length;
    void vscode.commands.executeCommand('durandal.test.here');
    await until(() => runs().length > n, 'the run sent');
    const from = a.shown.length;
    // the held run's own clear wiped the marks; the earlier answer is what the document says
    await restart();
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text.includes('cancel')), []);
    assert.ok(vscode.workspace.textDocuments.find(d => d.uri.path === '/' + RESULTS_PATH)?.getText().includes('✗ test_two'));
  });

  it('jump: to the test file; to a test file not there yet, untitled at its path', async () => {
    await running();
    const ed = await open(file(MAIN));
    reply('olifant/tests/file', { file: abs(TEST), kind: 'test', exists: true });
    await vscode.commands.executeCommand('durandal.jump');
    await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uriOf(TEST), 'the test file active');
    assert.equal(vscode.window.activeTextEditor?.viewColumn, ed.viewColumn);
    await open(file(MAIN));
    reply('olifant/tests/file', { file: abs('one/missing__test.py'), kind: 'test', exists: false });
    const chord = process.platform === 'darwin' ? '⌘⌥D S' : '⌃⌥D S';
    assert.equal(await said('durandal.jump', t => t.startsWith('new test file')), `new test file: missing__test.py — stub a test with ${chord}`);
    const doc = vscode.window.activeTextEditor!.document;
    assert.equal(doc.uri.scheme, 'untitled');
    assert.equal(doc.uri.fsPath, abs('one/missing__test.py'));
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  it('jump: a refusal verbatim', async () => {
    await open(file(MAIN));
    reply('olifant/tests/file', { lsp_error: 'python has no [test] table' });
    assert.equal(await said('durandal.jump', () => true), 'python has no [test] table');
  });

  const stubAnswer = () => ({
    file: abs(TEST), line: 9, name: 'test_main_2',
    edits: { documentChanges: [{ textDocument: { uri: uriOf(TEST), version: null }, edits: [
      { range: { start: { line: 6, character: 0 }, end: { line: 6, character: 0 } }, newText: '\n\ndef test_main_2():\n    ...\n' },
    ] }] },
  });
  const mainEdit = (text: string) => ({ documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: text },
  ] }] });
  const landed = (o: Record<string, unknown> = {}) => ({
    file: abs(MAIN), unit: 'f', edits: mainEdit('x = 2'), summary: 'green', green: true, tests: green(), rounds: 1, rungs: ['local'], stopped: false, ...o,
  });
  const conjures = () => log().filter(m => m.method === 'olifant/conjure');

  it('stub: applied, saved, the test file opened on the name', async () => {
    await settle(TEST, TEST_TEXT);
    await running();
    await open(file(MAIN));
    reply('olifant/stub', stubAnswer());
    assert.equal(await said('durandal.stub', t => t.startsWith('stubbed')), 'stubbed test_main_2 · saved main__test.py');
    assert.ok(disk(TEST).endsWith('\n\n\ndef test_main_2():\n    ...\n'));
    const ed = vscode.window.activeTextEditor!;
    assert.equal(ed.document.uri.toString(), uriOf(TEST));
    assert.deepEqual([ed.selection.active.line, ed.selection.active.character], [8, 4]);
    await settle(TEST, TEST_TEXT);
  });

  it('stub: a refusal verbatim', async () => {
    await open(file(MAIN));
    reply('olifant/stub', { lsp_error: 'no function or class at line 1: put the cursor in one to stub its test' });
    assert.equal(await said('durandal.stub', () => true), 'no function or class at line 1: put the cursor in one to stub its test');
  });

  it('conjure lands: applied and saved, flashed, the cursor on it, info', async () => {
    await settle(MAIN, 'x = 1\n');
    const a = await running();
    await open(file(MAIN));
    reply('olifant/conjure', landed());
    const flashes = a.tdd.flashes.length;
    assert.equal(await said('durandal.conjure', t => t.startsWith('conjured')), 'conjured · green · saved');
    assert.equal(disk(MAIN), 'x = 2\n');
    assert.deepEqual(a.tdd.flashes.slice(flashes), [{ first: 0, last: 0 }]);
    assert.equal(testMarks(TEST).length, 0);
    await settle(MAIN, 'x = 1\n');
  });

  it('conjure red: a warning with rounds and rungs; the after-run marked', async () => {
    await open(file(MAIN));
    reply('olifant/conjure', landed({ green: false, summary: 'red: test_two · assert 1 == 2', tests: red(), rounds: 3, rungs: ['local', 'cloud'] }));
    const text = await said('durandal.conjure', t => t.startsWith('conjured'));
    assert.equal(text, 'conjured · red: test_two · assert 1 == 2 · 3 rounds · local → cloud · saved');
    const a = await api();
    assert.equal(a.shown[a.shown.length - 1].level, 'warn');
    await until(() => testMarks(TEST).length === 1, 'the after-run marked');
    await settle(MAIN, 'x = 1\n');
  });

  it('conjure without edits: nothing applied, the summary alone', async () => {
    await open(file(MAIN));
    reply('olifant/conjure', landed({ edits: null, summary: 'green: already passes' }));
    assert.equal(await said('durandal.conjure', t => t.startsWith('conjured')), 'conjured · green: already passes');
    assert.equal(disk(MAIN), 'x = 1\n');
  });

  it('a whole-line selection sends its last selected line (Review Focus 2)', async () => {
    await settle(MAIN, 'x = 1\ny = 2\nz = 3\n');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(0, 0, 2, 0);
    reply('olifant/conjure', landed({ edits: null }));
    const n = conjures().length;
    await said('durandal.conjure', t => t.startsWith('conjured'));
    assert.deepEqual(conjures()[n].params.selection, { start: 0, end: 1 });
    await settle(MAIN, 'x = 1\n');
  });

  it('paused: the warning; Stop sends the resume and nothing lands', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await open(file(MAIN));
    reply('olifant/conjure', { paused: { token: 't1', diagnosis: 'The model keeps failing test_two. Try a hint.' } });
    ui.onAsk = (_t, actions) => {
      assert.deepEqual(actions, ['Continue', 'Stop']);
      reply('olifant/conjure', landed({ edits: null, stopped: true }));
      return 'Stop';
    };
    const n = conjures().length;
    assert.equal(await said('durandal.conjure', t => t.startsWith('stopped')), 'stopped · nothing landed');
    assert.deepEqual(ui.asks, ['conjure paused: The model keeps failing test_two. — steering arrives in a later milestone']);
    assert.deepEqual(conjures()[n + 1].params.resume, { token: 't1', choice: 'stop' });
  });

  it('paused: Continue resumes and lands', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await settle(MAIN, 'x = 1\n');
    await open(file(MAIN));
    reply('olifant/conjure', { paused: { token: 't2', diagnosis: 'Stuck.' } });
    ui.onAsk = () => {
      reply('olifant/conjure', landed());
      return 'Continue';
    };
    const n = conjures().length;
    assert.equal(await said('durandal.conjure', t => t.startsWith('conjured')), 'conjured · green · saved');
    assert.deepEqual(conjures()[n + 1].params.resume, { token: 't2', choice: 'continue' });
    await settle(MAIN, 'x = 1\n');
  });

  it('conjure cancelled (the Cancel button): $/cancelRequest, nothing landed', async () => {
    const a = await running();
    await open(file(MAIN));
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 1 of 8 · asking local…'] });
    const n = conjures().length;
    const from = a.shown.length;
    void vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the conjure sent');
    a.tdd.cancel();
    await until(() => a.shown.slice(from).find(s => s.text === 'conjure cancelled · nothing landed'), 'the cancel said');
    assert.ok(log().some(m => m.method === '$/cancelRequest' && m.params.id === conjures()[n].id));
    assert.equal(disk(MAIN), 'x = 1\n');
  });

  it('a restart during a conjure: no error, no cancelled notice, nothing landed (Review Focus 3)', async () => {
    const a = await running();
    await open(file(MAIN));
    reply('olifant/conjure', { hold: true, title: 'conjuring' });
    const n = conjures().length;
    void vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the conjure sent');
    const from = a.shown.length;
    await restart();
    await new Promise<void>(r => setTimeout(r, 500));
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text.includes('cancel') || s.text.startsWith('conjured')), []);
    assert.equal(disk(MAIN), 'x = 1\n');
  });
});
