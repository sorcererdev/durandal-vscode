import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { RESULTS_PATH } from '../../src/tdd/results';
import { api, file, log, open, reply, restart, revert, running, settle, tabsUnder, until, ws } from './helpers';

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
    for (const m of ['olifant/tests/run', 'olifant/tests/file']) reply(m, null);
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
});
