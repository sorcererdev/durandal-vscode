import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Shown } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { stepAnswer } from '../stepFixtures';
import { api, disk, file, log, open, pageQuiet, reply, restart, revert, running, settle, tabsUnder, until, windowGone, windowTab, ws } from './helpers';

// The step window over the fake server (spec §3.3-§3.6, §4): a shown step, its keys, its
// answers, the held step. The fake answers each method with one reply, so a flow sets the next
// reply before the key that sends it.
const MAIN = 'one/main.py';
const MAIN_TEXT = Array.from({ length: 30 }, (_, i) => `line_${i + 1} = ${i + 1}`).join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const abs = (rel: string) => join(ws(), rel);
const conjures = () => log().filter(m => m.method === 'olifant/conjure');
const resumes = () => conjures().map(m => m.params.resume).filter(Boolean);
// line 3 (0-based 2) of main.py, as the step changes it
const mainEdit = (text: string) => ({ documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
  { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, newText: text },
] }] });
const DIFF = '--- a/one/main.py\n+++ b/one/main.py\n@@ -3 +3 @@\n-line_3 = 3\n+line_3 = 33\n';

// step: the took fixture placed on main.py's line 3, as the server would send it there
function step(o: Partial<Shown> = {}): { shown: Shown } {
  const w = stepAnswer('took');
  w.shown = {
    ...w.shown, file: abs(MAIN), unit: 'line_3', edits: mainEdit('line_3 = 33'),
    diffs: [{ file: MAIN, diff: DIFF }, { file: 'one/main__test.py', diff: '--- a/one/main__test.py\n+++ b/one/main__test.py\n@@ -0,0 +1 @@\n+x = 1\n' }],
    parses: [{ file: MAIN, ok: true }], ...o,
  };
  return w;
}
const landed = (edits: unknown = mainEdit('line_3 = 33')) => ({ landed: { file: abs(MAIN), edits } });

// conjureAt: a conjure from LINE (0-based) of main.py answered with ANSWER; waits for the window
async function conjureAt(line: number, answer: unknown): Promise<void> {
  const a = await api();
  const ed = await open(file(MAIN));
  ed.selection = new vscode.Selection(line, 0, line, 0);
  reply('olifant/conjure', answer);
  const n = conjures().length;
  await vscode.commands.executeCommand('durandal.conjure');
  await until(() => conjures().length > n, 'the conjure sent');
  await until(() => a.pause.source() === 'step' || undefined, 'the step window');
  await until(windowTab, 'the window in the workbench');
}

// pressed: a key that sends an answer, and the resume it sent
async function pressed(key: string): Promise<Record<string, unknown>> {
  const a = await api();
  const n = resumes().length;
  await a.pause.press(key);
  await until(() => resumes().length > n, `the resume for ${key}`);
  return resumes()[n];
}

describe('the step window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(MAIN, MAIN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(MAIN, 'x = 1\n');
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    await windowGone();
    reply('olifant/conjure', null);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN));
    if (d?.isDirty) await revert(d);
    // a new version: a step still held is not reopened by the next test's conjure
    await settle(MAIN, MAIN_TEXT + '#\n');
    await settle(MAIN, MAIN_TEXT);
  });

  it('a shown step opens the window beside the file: the title, the facts, the tests, the files, the diff', async () => {
    const a = await running();
    const sizes = a.pause.sizes();
    await conjureAt(2, step());
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    await a.pause.receive({ type: 'size', cols: 200 });
    const v = a.pause.view()!;
    assert.equal(a.pause.source(), 'step');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    assert.equal(plain(v.title), 'conjure · line_3 · fill f');
    assert.equal(plain(v.lines[0]), 'claude-haiku-5-5 · 4.2 s · $0.001');
    assert.ok(v.lines.map(plain).includes('tests   +1 passing'));
    assert.ok(v.lines.map(plain).includes(`> ✓ ${MAIN}`));
    assert.equal(plain(v.diff.title), `file 1 of 2 · ${MAIN}`);
    assert.ok(v.diff.lines.map(plain).includes('+line_3 = 33'));
    assert.deepEqual(conjures().at(-1)!.params, { textDocument: { uri: uriOf(MAIN) }, position: { line: 2, character: 0 } });
    const panelTab = await until(() => vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input instanceof vscode.TabInputWebview), 'the webview tab');
    assert.notEqual(panelTab.group.viewColumn, vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uriOf(MAIN))?.viewColumn);
  });

  it('a lands the step as one undo step and says so; the window closes, the step is forgotten', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', landed());
    const from = a.shown.length;
    const fired = a.landed.fired.length;
    assert.deepEqual(await pressed('a'), { token: 'step-1', choice: 'accept' });
    await until(() => a.shown.slice(from).find(s => s.text.startsWith('conjured')), 'the landing said');
    assert.equal(a.shown.slice(from).find(s => s.text.startsWith('conjured'))!.text, 'conjured · fill f · saved');
    assert.equal(a.landed.fired.slice(fired).at(-1), 'conjure');
    assert.equal(disk(MAIN).split('\n')[2], 'line_3 = 33');
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    // the answer reused the opening conjure's document and position
    assert.deepEqual(conjures().at(-1)!.params.position, { line: 2, character: 0 });
    const ed = await open(file(MAIN));
    await vscode.commands.executeCommand('undo');
    assert.equal(ed.document.lineAt(2).text, 'line_3 = 3');
  });

  it('an accepted step that writes a new file creates it', async () => {
    const a = await running();
    await conjureAt(2, step());
    const created = file('one/new_test.py').toString();
    reply('olifant/conjure', landed({ documentChanges: [
      { kind: 'create', uri: created },
      { textDocument: { uri: created, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'def test_new():\n    pass\n' }] },
    ] }));
    const from = a.shown.length;
    await a.pause.press('a');
    await until(() => a.shown.slice(from).find(s => s.text.startsWith('conjured')), 'the landing said');
    assert.equal(disk('one/new_test.py'), 'def test_new():\n    pass\n');
    await settle('one/new_test.py', null);
  });

  it('an accept into a file with unsaved edits from before keeps it unsaved (Review Focus 4)', async () => {
    const a = await running();
    const ed = await open(file(MAIN));
    await ed.edit(b => b.insert(new vscode.Position(29, 0), '# typed\n'));
    await conjureAt(2, step());
    reply('olifant/conjure', landed());
    const from = a.shown.length;
    await a.pause.press('a');
    const s = await until(() => a.shown.slice(from).find(x => x.text.startsWith('conjured')), 'the landing said');
    assert.equal(s.text, 'conjured · fill f · unsaved');
    assert.ok(ed.document.isDirty);
  });

  it('r rejects: nothing lands, the step is forgotten', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { rejected: true });
    const from = a.shown.length;
    assert.deepEqual(await pressed('r'), { token: 'step-1', choice: 'reject' });
    await until(() => a.shown.slice(from).find(s => s.text === 'step rejected · nothing landed'), 'the rejection said');
    assert.equal(disk(MAIN), MAIN_TEXT);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(a.pause.view(), undefined);
  });

  it('h asks the harder writer; its step replaces the one shown, in place, its first file selected', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press(']');
    reply('olifant/conjure', step({ token: 'step-2', goal: 'fill f harder', writer: 'claude-sonnet-5-5' }));
    assert.deepEqual(await pressed('h'), { token: 'step-1', choice: 'harder' });
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the harder step held');
    const v = a.pause.view()!;
    assert.ok(plain(v.title).endsWith('fill f harder'), plain(v.title));
    assert.equal(v.selected, 0);
  });

  it('a failed h keeps the step and its token and says why in the footer', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { lsp_error: 'claude is not installed' });
    await a.pause.press('h');
    assert.equal(a.pause.notices().at(-1), 'h: claude is not installed');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    assert.equal(a.pause.source(), 'step');
  });

  it('h with no harder writer says so and sends nothing', async () => {
    const a = await running();
    await conjureAt(2, step({ harder: false }));
    const n = conjures().length;
    await a.pause.press('h');
    assert.equal(a.pause.notices().at(-1), 'h: no harder writer: name one with [conjure] harder');
    assert.equal(conjures().length, n);
  });

  it('a step that took none opens with its notice; a is refused and sends nothing', async () => {
    const a = await running();
    const w = stepAnswer('nostep');
    w.shown.file = abs(MAIN);
    const sizes = a.pause.sizes();
    await conjureAt(2, w);
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    // the no-step line is 68 cells: a narrow panel would cut it
    await a.pause.receive({ type: 'size', cols: 200 });
    const v = a.pause.view()!;
    assert.equal(plain(v.title), 'conjure · no step · the writer saw nothing to do');
    assert.ok(v.lines.map(plain).includes('the writer took no step: h asks the harder writer, d shows its reply'));
    assert.ok(!v.legend.includes('a accept'));
    const n = conjures().length;
    await a.pause.press('a');
    assert.equal(a.pause.notices().at(-1), 'a: no step to accept: h asks the harder writer, d shows the reply');
    assert.equal(conjures().length, n);
  });

  it('q keeps the step; a conjure on its lines with the file unchanged reopens it with no request; after an edit it asks again', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('q');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || undefined, 'the window again');
    assert.equal(conjures().length, n);
    await a.pause.press('q');
    await ed.edit(b => b.insert(new vscode.Position(20, 0), '# moved\n'));
    // closing the window gives the focus back to the file (the README says so)
    await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uriOf(MAIN) || undefined, 'the editor focused again after q');
    reply('olifant/conjure', step({ token: 'step-2' }));
    ed.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'a new conjure');
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the new step held');
  });

  it('a conjure off the step\'s lines, or over a selection, asks afresh and sends the selection', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('q');
    const n = conjures().length;
    const ed = await open(file(MAIN));
    reply('olifant/conjure', step({ token: 'step-2' }));
    ed.selection = new vscode.Selection(2, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the selection conjure');
    assert.deepEqual(conjures().at(-1)!.params.selection, { start: 2, end: 3 });
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the new step held');
  });

  it('busy: a second a, r or h while the first answer is out says so and sends nothing (Review Focus 5)', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { delay: 1.5, ...landed() });
    const n = resumes().length;
    const first = a.pause.press('a');
    await until(() => resumes().length > n, 'the accept sent');
    for (const k of ['a', 'r', 'h']) {
      await a.pause.press(k);
      assert.equal(a.pause.notices().at(-1), `${k}: the last answer is still on its way`);
    }
    await first;
    assert.equal(resumes().length, n + 1);
  });

  it('an accept the engine refuses (the file moved) closes the window, says why, forgets the step', async () => {
    const a = await running();
    await conjureAt(2, step());
    const why = 'the file changed since the step was shown; your text stands (one/main.py): conjure again';
    reply('olifant/conjure', { lsp_error: why });
    const from = a.shown.length;
    await a.pause.press('a');
    await until(() => a.shown.slice(from).find(s => s.text === why), 'the refusal said');
    assert.equal(a.shown.slice(from).find(s => s.text === why)!.level, 'error');
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
  });

  it('h in the air, q, a conjure on the step\'s lines: the window reopens busy, a is refused, one resume is sent', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { delay: 2, ...step({ token: 'step-2', goal: 'fill f harder' }) });
    const n = resumes().length;
    const total = conjures().length;
    const first = a.pause.press('h');
    await until(() => resumes().length > n, 'the harder ask sent');
    await a.pause.press('q');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || undefined, 'the window again');
    assert.equal(a.pause.view()!.state, 'busy');
    await a.pause.press('a');
    assert.equal(a.pause.notices().at(-1), 'a: the last answer is still on its way');
    await first;
    assert.equal(resumes().length, n + 1);
    assert.equal(conjures().length, total + 1);
  });

  it('h in the air, q, a conjure off the step\'s lines or over a selection says the last answer is still on its way and sends nothing; busy clears after', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { delay: 2, ...step({ token: 'step-2', goal: 'fill f harder' }) });
    const n = resumes().length;
    const first = a.pause.press('h');
    await until(() => resumes().length > n, 'the harder ask sent');
    await a.pause.press('q');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uriOf(MAIN) || undefined, 'the editor focused again after q');
    const total = conjures().length;
    const ed = vscode.window.activeTextEditor!;
    const from = a.shown.length;
    ed.selection = new vscode.Selection(10, 0, 10, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    ed.selection = new vscode.Selection(2, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    assert.deepEqual(a.shown.slice(from).map(s => [s.level, s.text]), [
      ['info', 'the last answer is still on its way'], ['info', 'the last answer is still on its way'],
    ]);
    assert.equal(conjures().length, total);
    await first;
    await until(() => a.pause.held(uriOf(MAIN)) === 'step-2' || undefined, 'the harder step held');
    await a.pause.press('q');
    ed.selection = new vscode.Selection(10, 0, 10, 0);
    reply('olifant/conjure', step({ token: 'step-3' }));
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > total, 'a conjure after the answer settled');
  });

  it('a step whose edit uri is spelled differently is held with its lines; c on them reopens it', async () => {
    const a = await running();
    const spelled = uriOf(MAIN).replace('/one/', '/one%2F');
    const w = step();
    w.shown.edits = JSON.parse(JSON.stringify(mainEdit('line_3 = 33')).replace(uriOf(MAIN), spelled));
    await conjureAt(2, w);
    await a.pause.press('q');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    assert.equal(a.pause.held(uriOf(MAIN)), 'step-1');
    await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uriOf(MAIN) || undefined, 'the editor focused again after q');
    const n = conjures().length;
    vscode.window.activeTextEditor!.selection = new vscode.Selection(2, 4, 2, 4);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.source() === 'step' || undefined, 'the window again');
    assert.equal(conjures().length, n);
  });

  it('a landed answer for a moved document lands nothing and does not leave the window busy', async () => {
    const a = await running();
    await conjureAt(2, step());
    const stale = { documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: 9999 }, edits: [
      { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, newText: 'line_3 = 33' },
    ] }] };
    reply('olifant/conjure', landed(stale));
    const from = a.shown.length;
    await pressed('a');
    await until(() => a.pause.view() === undefined || undefined, 'the window closed');
    assert.deepEqual(a.shown.slice(from).map(s => [s.level, s.text]), [['error', 'main.py changed since']]);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(disk(MAIN), MAIN_TEXT);
    const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN));
    assert.equal(d?.getText(), MAIN_TEXT);
    assert.notEqual(a.pause.view()?.state, 'busy');
  });

  it('d opens the situation and the reply beside the window; the window stays', async () => {
    const a = await running();
    await conjureAt(2, step());
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/step-1').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## the situation the writer read'));
    assert.ok(doc.getText().includes('## the writer\'s reply'));
    assert.ok(a.pause.view());
    await vscode.window.tabGroups.close(tab);
  });

  it('every key of the table does something or says why', async () => {
    const a = await running();
    await conjureAt(2, step());
    // a, r and h send (checked above); q closes. The rest leave the window up; these are silent
    const silent = [']', 'j', 'k', 'PageUp', 'PageDown', 'Tab'];
    for (const k of ['[', ']', 'j', 'k', 'PageUp', 'PageDown', 'Tab', 'b', 'x', 'c']) {
      const before = a.pause.notices().length;
      await a.pause.press(k);
      assert.ok(a.pause.view(), `${k} keeps the window`);
      assert.ok(a.pause.notices().length > before || silent.includes(k), `${k} says why`);
    }
    assert.ok(a.pause.notices().includes('[: the first file'));
    assert.ok(a.pause.notices().includes('b: nothing to do here'));
    assert.ok(a.pause.notices().includes('x: nothing to do here'));
    await a.pause.press('?');
    assert.ok(a.pause.view()!.help && a.pause.view()!.help!.length > 3);
    await a.pause.press('j');
    assert.equal(a.pause.view()!.help, undefined);
  });

  it('a narrow panel: Tab diff first, Tab flips, a wide one shows both', async () => {
    const a = await running();
    const sizes = a.pause.sizes();
    await conjureAt(2, step());
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    await a.pause.receive({ type: 'size', cols: 90 });
    let v = a.pause.view()!;
    assert.ok(v.narrow);
    assert.ok(v.legend.startsWith('Tab diff'), v.legend);
    assert.ok(plain(v.diff.title).endsWith(' · Tab back'), plain(v.diff.title));
    await a.pause.press('Tab');
    assert.ok(a.pause.view()!.flipped);
    await a.pause.receive({ type: 'size', cols: 160 });
    v = a.pause.view()!;
    assert.ok(!v.narrow);
    await a.pause.press('Tab');
    assert.equal(a.pause.notices().at(-1), 'Tab: both panes are shown');
  });

  it('a click on a file selects it', async () => {
    const a = await running();
    const sizes = a.pause.sizes();
    await conjureAt(2, step());
    await until(() => a.pause.sizes() > sizes, 'the page\'s size report');
    await pageQuiet(a);
    await a.pause.receive({ type: 'size', cols: 200 });
    await a.pause.receive({ type: 'select', entry: 1 });
    assert.equal(a.pause.view()!.selected, 1);
    assert.equal(plain(a.pause.view()!.diff.title), 'file 2 of 2 · one/main__test.py');
  });

  it('a restart while an answer is out: the window closes, nothing lands, nothing is said but info (Review Focus 3)', async () => {
    const a = await running();
    await conjureAt(2, step());
    reply('olifant/conjure', { hold: true, title: 'conjuring' });
    const n = resumes().length;
    void a.pause.press('a');
    await until(() => resumes().length > n, 'the accept sent');
    const from = a.shown.length;
    await restart();
    await until(() => a.server.state() === 'running' || undefined, 'running again', 60_000);
    await new Promise<void>(r => setTimeout(r, 500));
    assert.equal(a.pause.view(), undefined);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(disk(MAIN), MAIN_TEXT);
    assert.deepEqual(a.shown.slice(from).filter(s => s.level !== 'info' || s.text.startsWith('conjured')), []);
  });

  it('a server restart drops the held step and closes the window, silently', async () => {
    const a = await running();
    await conjureAt(2, step());
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.restartServer');
    await until(() => a.server.state() === 'running' || undefined, 'running again', 60_000);
    assert.equal(a.pause.held(uriOf(MAIN)), undefined);
    assert.equal(a.pause.view(), undefined);
    assert.deepEqual(a.shown.slice(from).filter(s => s.text.includes('step')), []);
  });
});
