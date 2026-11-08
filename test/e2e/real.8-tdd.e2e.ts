import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { api, file, open, restart, revert, running, until, ws } from './helpers';

const DIR = 'py/src/bistro/booking/commands/';
const MODULE = `${DIR}create_booking.py`;
const TEST = `${DIR}create_booking__test.py`;
const ASSERTION = 'assert isinstance(result, SlotTaken)';

// run executes a command and waits (up to ms) for a notice matching want
async function said(command: string, want: RegExp, ms = 120_000): Promise<string> {
  const a = await api();
  const from = a.shown.length;
  void vscode.commands.executeCommand(command);
  const s = await until(() => a.shown.slice(from).find(x => want.test(x.text) || x.level === 'error'), `${want} after ${command}`, ms);
  assert.match(s.text, want);
  return s.text;
}

const errorsOn = (rel: string) => vscode.languages.getDiagnostics(file(rel)).filter(d => d.source === 'olifant' && d.severity === vscode.DiagnosticSeverity.Error);
const lineOf = (doc: vscode.TextDocument, text: string) => doc.getText().split('\n').findIndex(l => l.includes(text));

// handleSpan is the first line of the `handle` method and the last line of its body
function handleSpan(doc: vscode.TextDocument): { def: number; last: number } {
  const lines = doc.getText().split('\n');
  const def = lines.findIndex(l => l.includes('    def handle('));
  assert.ok(def >= 0, 'the method handle');
  let last = def;
  for (let i = def + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    if (lines[i].startsWith('        ')) last = i;
    else break;
  }
  return { def, last };
}

// breakAssertion flips the assertion in the open test file, unsaved: the editor's text is what runs
async function breakAssertion(): Promise<{ ed: vscode.TextEditor; row: number }> {
  const ed = await open(file(TEST));
  const row = lineOf(ed.document, ASSERTION);
  assert.ok(row >= 0, 'the assertion to break');
  await ed.edit(b => b.replace(ed.document.lineAt(row).range, '    assert not isinstance(result, SlotTaken)'));
  return { ed, row };
}

describe('the TDD loop against olifant lsp (python-htmx)', () => {
  before(() => vscode.commands.executeCommand('workbench.action.closeAllGroups'));

  afterEach(async () => {
    (await running()).setUi(undefined);
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
    execFileSync('git', ['clean', '-fdq'], { cwd: join(ws(), 'py') });
    // every open sandbox document back to the disk (a stub saved the test file; the watcher is slow)
    const py = join(ws(), 'py');
    for (const d of vscode.workspace.textDocuments.filter(x => x.uri.scheme === 'file' && x.uri.fsPath.startsWith(py))) await revert(d);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('a module\'s tests pass; a broken assertion fails, marked on its line in the test file', async () => {
    await running();
    await open(file(MODULE));
    await said('durandal.test.here', /^all \d+ passed/);
    const { row } = await breakAssertion();
    await open(file(MODULE));
    await said('durandal.test.here', /1 failed/);
    const ds = await until(() => (errorsOn(TEST).length > 0 ? errorsOn(TEST) : undefined), 'the failure marked');
    assert.equal(ds.length, 1);
    assert.equal(ds[0].range.start.line, row);
    const results = vscode.workspace.textDocuments.find(d => d.uri.path === '/tests/results.txt');
    assert.ok(results?.getText().includes('✗ test_a_booked_slot_is_taken'));
  });

  it('the test under the cursor runs alone; test file runs the whole file', async () => {
    await running();
    const { ed, row } = await breakAssertion();
    ed.selection = new vscode.Selection(row, 4, row, 4);
    await said('durandal.test.here', /^0 passed · 1 failed/);
    const text = await said('durandal.test.file', /^\d+ passed · 1 failed/);
    assert.doesNotMatch(text, /^0 passed/);
  });

  it('jump: module → test file → module; a module with no test file → an untitled one', async () => {
    await running();
    await open(file(MODULE));
    await vscode.commands.executeCommand('durandal.jump');
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === file(TEST).fsPath, 'the test file');
    await vscode.commands.executeCommand('durandal.jump');
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === file(MODULE).fsPath, 'the module');
    const lone = `${DIR}zz_lone.py`;
    writeFileSync(join(ws(), lone), 'def lone() -> int:\n    return 1\n');
    await open(file(lone));
    await said('durandal.jump', /^new test file: .*zz_lone__test\.py/, 30_000);
    assert.equal(vscode.window.activeTextEditor?.document.uri.scheme, 'untitled');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  it('stubs a test for the method under the cursor: the test file opens on its name', async () => {
    await running();
    const ed = await open(file(MODULE));
    const { def } = handleSpan(ed.document);
    ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
    await said('durandal.stub', /^stubbed test_handle/, 60_000);
    // the notice comes from the edit's landing; the test file opens just after it
    const t = await until(() => (vscode.window.activeTextEditor?.document.uri.fsPath === file(TEST).fsPath ? vscode.window.activeTextEditor : undefined), 'the test file opened');
    await until(() => t.document.lineAt(t.selection.active.line).text === 'def test_handle() -> None:', 'the cursor on the new test');
    const at = t.selection.active.line;
    assert.equal(t.document.lineAt(at).text, 'def test_handle() -> None:');
    assert.equal(t.document.lineAt(at + 1).text, '    ...');
  });

  it('mutates the method under the cursor: killed counts said; survivors marked within it', async () => {
    const a = await running();
    a.setUi(new FakeUi());
    const ed = await open(file(MODULE));
    const { def, last } = handleSpan(ed.document);
    ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
    await said('durandal.mutate', /\d+\/\d+ killed/, 300_000);
    for (const d of vscode.languages.getDiagnostics(file(MODULE)).filter(x => x.source === 'olifant' && x.severity === vscode.DiagnosticSeverity.Warning)) {
      assert.ok(d.range.start.line >= def && d.range.start.line <= last, `a survivor inside handle: line ${d.range.start.line + 1}`);
    }
  });

  // a real model's conjure: local only (CI has no model), as durandal.nvim's e2e
  it('conjures a stubbed method\'s body from its red tests', async function () {
    const model = process.env.DURANDAL_E2E_MODEL;
    if (!model) return this.skip();
    this.timeout(600_000);
    await vscode.workspace.getConfiguration('durandal').update('model', model, vscode.ConfigurationTarget.Global);
    try {
      await restart();
      const ed = await open(file(MODULE));
      const { def, last } = handleSpan(ed.document);
      const lastLen = ed.document.lineAt(last).text.length;
      await ed.edit(b => b.replace(new vscode.Range(def + 1, 0, last, lastLen), '        raise NotImplementedError("later")'));
      ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
      await said('durandal.test.here', /failed/);
      await open(file(MODULE));
      ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
      await said('durandal.conjure', /^conjured · green/, 300_000);
      assert.ok(!vscode.window.activeTextEditor!.document.getText().includes('NotImplementedError'));
    } finally {
      await vscode.workspace.getConfiguration('durandal').update('model', undefined, vscode.ConfigurationTarget.Global);
      await restart();
    }
  });
});
