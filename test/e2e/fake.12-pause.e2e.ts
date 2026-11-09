import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { ConjurePaused } from '../../src/protocol';
import { plain } from '../../src/pause/viewModel';
import { FakeUi } from '../fakeUi';
import { wrapped } from '../pauseFixtures';
import { api, file, log, open, reply, revert, running, settle, tabsUnder, until, ws } from './helpers';

// The pause window over the fake server (M5 spec §3, §4, §8): the fixtures' paused answers,
// the resumes they send, the keys, the drops. The fake answers each method with one reply, so a
// flow sets the next reply before the key that sends it.
const MAIN = 'one/main.py';
// a second file, for one run at a time across documents
const OTHER = 'one/other.py';
const MAIN_TEXT = Array.from({ length: 30 }, (_, i) => `line_${i + 1} = ${i + 1}`).join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const abs = (rel: string) => join(ws(), rel);
const conjures = () => log().filter(m => m.method === 'olifant/conjure');
const resumes = () => conjures().map(m => m.params.resume).filter(Boolean);

// a fixture whose unit is lines 3-5 of main.py (1-based), as the server would send for it
function paused(name: 'plain' | 'wired' | 'steps' | 'check' = 'plain'): ConjurePaused {
  const w = wrapped(name);
  w.paused.lines = { first: 3, last: 5 };
  w.paused.file = abs(MAIN);
  return w;
}
const mainEdit = (text: string) => ({ documentChanges: [{ textDocument: { uri: uriOf(MAIN), version: null }, edits: [
  { range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } }, newText: text },
] }] });
const tests = () => ({ file: abs('one/main__test.py'), passed: [], scope: 'file', test: null, failed: [], broken: null, seconds: 0.1 });
const landed = (o: Record<string, unknown> = {}) => ({
  file: abs(MAIN), unit: 'f', edits: mainEdit('line_3 = 33'), summary: 'kept round 3 · red: not_found', green: false,
  tests: tests(), rounds: 3, rungs: ['local'], stopped: true, ...o,
});

// conjureAt: a conjure from line (0-based) of main.py (or rel), answered with reply; waits for the panel
async function conjureAt(line: number, answer: unknown, rel = MAIN): Promise<void> {
  const a = await api();
  const ed = await open(file(rel));
  ed.selection = new vscode.Selection(line, 0, line, 0);
  reply('olifant/conjure', answer);
  const n = conjures().length;
  await vscode.commands.executeCommand('durandal.conjure');
  await until(() => conjures().length > n, 'the conjure sent');
  await until(() => a.pause.view(), 'the pause window');
  // the previous run's running view can still be up: wait for this pause to be held
  await until(() => a.pause.stored(uriOf(rel)), 'the pause held');
}

// pressed: a key, then the resume it sent
async function pressed(key: string): Promise<Record<string, unknown>> {
  const a = await api();
  const n = resumes().length;
  await a.pause.press(key);
  await until(() => resumes().length > n, `the resume for ${key}`);
  return resumes()[n];
}

describe('the pause window (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(MAIN, MAIN_TEXT);
    await settle(OTHER, MAIN_TEXT);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(MAIN, 'x = 1\n');
    await settle(OTHER, null);
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    if (a.pause.view()) await a.pause.press('q');
    // q keeps the pause; an edit drops it, else the next test's conjure reopens it
    for (const rel of [MAIN, OTHER]) {
      if (!a.pause.stored(uriOf(rel))) continue;
      const ed = await open(file(rel));
      await ed.edit(b => b.insert(new vscode.Position(0, 0), '#'));
      await until(() => !a.pause.stored(uriOf(rel)), 'the held pause dropped');
    }
    reply('olifant/conjure', null);
    for (const rel of [MAIN, OTHER]) {
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(rel));
      if (d?.isDirty) await revert(d);
      await settle(rel, MAIN_TEXT);
    }
    // other.py's editor narrows the panel: closed, so the next test lays out at full width
    const others = vscode.window.tabGroups.all.flatMap(g => g.tabs)
      .filter(t => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uriOf(OTHER));
    if (others.length > 0) await vscode.window.tabGroups.close(others);
  });

  it('a paused answer opens the window beside the file, holds the pause, places one reminder', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    assert.equal(a.pause.source(), 'conjure');
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    assert.ok(plain(a.pause.view()!.title).startsWith('conjure · CancelBooking.handle · ● paused'));
    assert.ok(a.shown.slice(from).some(s => s.text === `conjure paused · ${wrapped('plain').paused.why}`));
    const panelTab = await until(() => vscode.window.tabGroups.all.flatMap(g => g.tabs).find(t => t.input instanceof vscode.TabInputWebview), 'the webview tab');
    assert.notEqual(panelTab.group.viewColumn, vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uriOf(MAIN))?.viewColumn);
  });

  it('a keeps the selected round: stop, land, arg; the landing applies and closes the window', async () => {
    const a = await running();
    await conjureAt(3, paused());
    reply('olifant/conjure', landed());
    const r = await pressed('a');
    assert.deepEqual(r, { token: 'conjure-1', choice: 'stop', land: true, arg: '3' });
    await until(() => !a.pause.view(), 'the window closed');
    await until(() => vscode.workspace.textDocuments.find(x => x.uri.toString() === uriOf(MAIN))?.lineAt(2).text === 'line_3 = 33', 'the keep landed');
    assert.ok(!a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 0);
  });

  it('0 then a keeps the wire alone; s stops; t re-conjures the test; c continues', async () => {
    const a = await running();
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    await conjureAt(3, paused('wired'));
    await a.pause.press('0');
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('a'), { token: wrapped('wired').paused.token, choice: 'stop', land: true, arg: '0' });
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('s'), { token: 'conjure-1', choice: 'stop', land: false });
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    const t = await pressed('t');
    assert.equal(t.choice, 'reconjure');
    assert.equal(t.arg, wrapped('plain').paused.offers.find(o => o.choice === 'reconjure')!.arg);
    await conjureAt(3, paused());
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('c'), { token: 'conjure-1', choice: 'continue' });
  });

  it('h asks the sentence and sends it as the hint; an empty sentence sends nothing', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await conjureAt(3, paused());
    const n = resumes().length;
    void a.pause.press('h');
    await until(() => ui.texts.length === 1, 'the hint asked');
    assert.equal(ui.texts[0].title, 'hint');
    ui.texts[0].finish('   ');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n);
    assert.ok(a.pause.stored(uriOf(MAIN)));
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    void a.pause.press('h');
    await until(() => ui.texts.length === 2, 'the hint asked again');
    ui.texts[1].finish('use the repository');
    await until(() => resumes().length > n, 'the hinted resume');
    assert.deepEqual(resumes()[n], { token: 'conjure-1', choice: 'continue', hint: 'use the repository' });
  });

  it('[ ] and digits move the selection; the a row follows it', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const last = a.pause.view()!.selected;
    await a.pause.press('[');
    assert.equal(a.pause.view()!.selected, last - 1);
    await a.pause.press(']');
    assert.equal(a.pause.view()!.selected, last);
    await a.pause.press(']');
    assert.ok(a.pause.notices().at(-1) === ']: the last entry');
    await a.pause.press('1');
    assert.ok(a.pause.view()!.rows.some(r => r.key === 'a' && r.label === 'keep round 1'));
    await a.pause.press('7');
    assert.equal(a.pause.notices().at(-1), '7: no entry 7');
  });

  it('a click on a row answers as its key; a click on an entry selects it', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.receive({ type: 'select', entry: 0 });
    assert.equal(a.pause.view()!.selected, 0);
    const i = a.pause.view()!.rows.findIndex(r => r.key === 's');
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    const n = resumes().length;
    await a.pause.receive({ type: 'press', row: i });
    await until(() => resumes().length > n, 'the clicked resume');
    assert.deepEqual(resumes()[n], { token: 'conjure-1', choice: 'stop', land: false });
  });

  it('every key of the table does something or says why (spec §4.4)', async () => {
    const a = await running();
    await conjureAt(3, paused());
    // keys that send a resume or close are checked elsewhere; here the rest leave the window up
    // (the plain fixture offers c h t T s and a keep: those send; Tab flips silently when the
    // page reported a narrow panel)
    const silent = ['[', ']', '2', 'j', 'k', 'PageUp', 'PageDown', 'Tab'];
    for (const k of ['C', 'w', 'W', 'p', 'P', 'r', 'x', 'Tab', '[', ']', '2', 'j', 'k', 'PageUp', 'PageDown', 'b']) {
      const before = a.pause.notices().length;
      await a.pause.press(k);
      assert.ok(a.pause.view(), `${k} keeps the window`);
      assert.ok(a.pause.notices().length > before || silent.includes(k), `${k} says why`);
    }
    assert.ok(a.pause.notices().includes('x: nothing is running'));
    assert.ok(a.pause.notices().includes('r: no proposal to reject'));
    assert.ok(a.pause.notices().includes('C: no stronger model to climb to'));
    assert.ok(a.pause.notices().includes('b: nothing to do here'));
    await a.pause.press('?');
    assert.ok(a.pause.view()!.help && a.pause.view()!.help!.length > 3);
    await a.pause.press('j');
    assert.equal(a.pause.view()!.help, undefined);
  });

  it('q keeps the pause; a conjure inside the unit reopens it with no request', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.press('[');
    const sel = a.pause.view()!.selected;
    await a.pause.press('q');
    assert.equal(a.pause.view(), undefined);
    assert.ok(a.pause.stored(uriOf(MAIN)));
    assert.equal(a.pause.reminders(uriOf(MAIN)), 1);
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.view(), 'the window again');
    assert.equal(conjures().length, n);
    assert.equal(a.pause.view()!.selected, sel);
  });

  it('an edit of the file drops the pause, its reminder and the window', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    const ed = await open(file(MAIN));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# '));
    await until(() => !a.pause.stored(uriOf(MAIN)), 'the pause dropped');
    assert.equal(a.pause.reminders(uriOf(MAIN)), 0);
    assert.equal(a.pause.view(), undefined);
    assert.ok(a.shown.slice(from).some(s => s.text === 'conjure: the file changed, the pause is gone'));
  });

  it('a conjure elsewhere forgets the pause and sends a fresh request', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    await a.pause.press('q');
    reply('olifant/conjure', landed({ edits: null, stopped: false, summary: 'green: already passes', green: true }));
    const n = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(20, 0, 20, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => conjures().length > n, 'the fresh conjure');
    assert.equal(conjures()[n].params.resume, undefined);
    assert.ok(a.shown.slice(from).some(s => s.text === 'the earlier pause is forgotten'));
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a refused resume closes the window with the sentence and holds no pause', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    reply('olifant/conjure', { lsp_error: 'this paused conjure is gone (it expired, was resumed, or its file changed): conjure again' });
    await a.pause.press('c');
    await until(() => !a.pause.view(), 'the window closed');
    assert.ok(a.shown.slice(from).some(s => s.level === 'error' && s.text.startsWith('this paused conjure is gone')));
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('a second press during the run says so and sends nothing; x cancels: nothing landed, no pause', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 4 of 9 · asking local…'] });
    const n = resumes().length;
    // both presses together, as a double tap
    await Promise.all([a.pause.press('c'), a.pause.press('c')]);
    await until(() => resumes().length > n, 'the resume');
    assert.equal(a.pause.view()!.state, 'running');
    assert.ok(a.pause.notices().includes('c: a run is going on · x cancels it'));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n + 1);
    const id = conjures().at(-1)!.id;
    // hidden, a conjure in the unit's file brings the running view back and sends nothing
    await a.pause.press('q');
    assert.equal(a.pause.view(), undefined);
    const c = conjures().length;
    const ed = await open(file(MAIN));
    ed.selection = new vscode.Selection(4, 0, 4, 0);
    await vscode.commands.executeCommand('durandal.conjure');
    await until(() => a.pause.view(), 'the running view again');
    assert.equal(a.pause.view()!.state, 'running');
    assert.equal(conjures().length, c);
    await a.pause.press('x');
    await until(() => a.shown.slice(from).some(s => s.text === 'conjure cancelled · nothing landed'), 'the cancel said');
    assert.ok(log().some(m => m.method === '$/cancelRequest' && m.params.id === id));
    assert.equal(a.pause.view(), undefined);
    assert.ok(!a.pause.stored(uriOf(MAIN)));
  });

  it('one run at a time: a pause in another file waits for it; x cancels the run wherever it is', async () => {
    const a = await running();
    const from = a.shown.length;
    await conjureAt(3, paused());
    reply('olifant/conjure', { hold: true, title: 'conjuring', progress: ['round 4 of 9 · asking local…'] });
    const n = resumes().length;
    await a.pause.press('c');
    await until(() => resumes().length > n, 'the resume in main.py');
    const id = conjures().at(-1)!.id;
    await a.pause.press('q');
    // the run in main.py goes on; a conjure in other.py pauses
    const other = paused();
    other.paused.token = 'conjure-7';
    other.paused.file = abs(OTHER);
    await conjureAt(3, other, OTHER);
    assert.ok(a.pause.stored(uriOf(OTHER)));
    await a.pause.press('c');
    assert.equal(a.pause.notices().at(-1), 'c: a run is going on · x cancels it');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n + 1);
    // x from other.py's window cancels main.py's run; other.py's pause, reminder and window stay
    await a.pause.press('x');
    await until(() => a.shown.slice(from).some(s => s.text === 'conjure cancelled · nothing landed'), 'the cancel said');
    assert.ok(log().some(m => m.method === '$/cancelRequest' && m.params.id === id));
    assert.ok(a.pause.stored(uriOf(OTHER)));
    assert.equal(a.pause.reminders(uriOf(OTHER)), 1);
    assert.equal(a.pause.view()!.state, 'paused');
    reply('olifant/conjure', landed({ file: abs(OTHER), edits: null, summary: 'nothing landed' }));
    assert.deepEqual(await pressed('s'), { token: 'conjure-7', choice: 'stop', land: false });
  });

  it('an edit while the hint is asked drops the pause; the sentence then sends nothing', async () => {
    const a = await running();
    const ui = new FakeUi();
    a.setUi(ui);
    await conjureAt(3, paused());
    const n = resumes().length;
    void a.pause.press('h');
    await until(() => ui.texts.length === 1, 'the hint asked');
    const ed = await open(file(MAIN));
    await ed.edit(b => b.insert(new vscode.Position(0, 0), '# '));
    await until(() => !a.pause.stored(uriOf(MAIN)), 'the pause dropped');
    ui.texts[0].finish('use the repository');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(resumes().length, n);
  });

  it('a run that pauses again redraws the window in place', async () => {
    const a = await running();
    await conjureAt(3, paused());
    const next = paused('wired');
    next.paused.token = 'conjure-2';
    reply('olifant/conjure', next);
    await a.pause.press('c');
    // the press took the pause before its request went
    assert.ok(!a.pause.stored(uriOf(MAIN)));
    await until(() => a.pause.stored(uriOf(MAIN)), 'the next pause');
    assert.ok(plain(a.pause.view()!.title).includes('● paused'));
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(t => t.input instanceof vscode.TabInputWebview);
    assert.equal(tabs.length, 1);
    reply('olifant/conjure', landed({ edits: null, summary: 'nothing landed' }));
    assert.equal((await pressed('s')).token, 'conjure-2');
  });

  it('d opens the details as a markdown document beside the window; the window stays', async () => {
    const a = await running();
    await conjureAt(3, paused());
    await a.pause.press('d');
    const tab = await until(() => tabsUnder('/details/').find(t => t.input instanceof vscode.TabInputText), 'the details tab');
    const doc = await vscode.workspace.openTextDocument((tab.input as vscode.TabInputText).uri);
    assert.equal(doc.languageId, 'markdown');
    assert.ok(doc.getText().includes('## situation'));
    assert.ok(a.pause.view());
    await vscode.window.tabGroups.close(tab);
  });
});
