import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Api } from '../../src/extension';
import { plain } from '../../src/pause/viewModel';
import { FakeUi } from '../fakeUi';
import { api, cleanTold, file, open, revert, running, until, ws } from './helpers';

const DIR = 'py/src/bistro/booking/commands/';
const MODULE = `${DIR}create_booking.py`;
const TEST = `${DIR}create_booking__test.py`;
const ASSERTION = 'assert isinstance(result, SlotTaken)';

// said executes a command and waits (up to ms) for a notice matching want
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
    const a = await running();
    a.setUi(undefined);
    if (a.pause.view()) await a.pause.press('q');
    execFileSync('git', ['checkout', '--', '.'], { cwd: join(ws(), 'py') });
    await cleanTold(a, join(ws(), 'py'));
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
    // the results document opens beside after the notice (show does not wait for VS Code to
    // open it): waited for, as fake.11 waits for its tab (run 43638780607: not open yet)
    await until(() => vscode.workspace.textDocuments.find(d => d.uri.path === '/tests/results.txt')
      ?.getText().includes('✗ test_a_booked_slot_is_taken'), 'the failure in the results document');
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

  // a recorded step (olifant's step_replies: the file's text is every writer's reply), so CI
  // runs it; run.ts points DURANDAL_STEP_REPLIES at the file
  const STEPS = process.env.DURANDAL_STEP_REPLIES;
  const conjureHere = async (a: Api): Promise<void> => {
    const ed = await open(file(MODULE));
    const { def } = handleSpan(ed.document);
    ed.selection = new vscode.Selection(def + 1, 8, def + 1, 8);
    void vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || a.shown.find(s => s.level === 'error') || undefined, 'the step window', 120_000);
    assert.equal(a.pause.source(), 'step', JSON.stringify(a.shown.slice(-3)));
  };

  it('conjure shows a recorded step with its goal; a lands it', async () => {
    const a = await running();
    assert.ok(STEPS, 'run.ts sets DURANDAL_STEP_REPLIES');
    const module = readFileSync(join(ws(), MODULE), 'utf8');
    writeFileSync(STEPS!, `<goal>mark the module</goal>\n<file path="src/bistro/booking/commands/create_booking.py">\n${module}# conjured\n</file>\n`);
    await conjureHere(a);
    assert.ok(plain(a.pause.view()!.title).includes('mark the module'), plain(a.pause.view()!.title));
    const from = a.shown.length;
    await a.pause.press('a');
    const s = await until(() => a.shown.slice(from).find(x => x.text.startsWith('conjured') || x.level === 'error'), 'the landing said', 60_000);
    assert.equal(s.text, 'conjured · mark the module · saved');
    assert.ok(readFileSync(join(ws(), MODULE), 'utf8').endsWith('# conjured\n'));
  });

  it('a recorded step that took none opens the no-step window; a is refused', async () => {
    const a = await running();
    writeFileSync(STEPS!, '<goal>nothing</goal>\n');
    await conjureHere(a);
    // the title is cut at a narrow panel's width
    await a.pause.receive({ type: 'size', cols: 200 });
    assert.equal(plain(a.pause.view()!.title), 'conjure · no step · the writer saw nothing to do');
    await a.pause.press('a');
    assert.equal(a.pause.notices().at(-1), 'a: no step to accept: h asks the harder writer, d shows the reply');
  });
});
