import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { FakeUi } from '../fakeUi';
import { reviewFixture } from '../pauseFixtures';
import { api, docOf, file, log, open, reply, restart, revert, running, settle, sleep, until } from './helpers';

// The loop over the fake server (M6 spec §5, §8 fake.16): the reconcile and its triggers, idle,
// the lens commands, errands, the claim-pass actions, stopped. plans_spec.lua's loop tests.
const PLAN = 'one/plans/l.md';
const HIDDEN = 'one/plans/h.md';
const OTHER = 'one/elsewhere.py';
const LINES = ['# Steps', '- [ ] s @src/a.py:Foo', '  - test_it ✓', '- other'];
const TEXT = LINES.join('\n') + '\n';
const uriOf = (rel: string) => file(rel).toString();
const sent = (method: string) => log().filter(m => m.method === method);
// every reconcile sent; reconciles: those of PLAN (plans left open by the suites before count too)
const allReconciles = () => sent('olifant/plans/reconcile');
const reconciles = () => allReconciles().filter(m => m.params.textDocument.uri === uriOf(PLAN));
const idles = () => sent('olifant/plans/idle');
const REPLIES = [
  'olifant/plans/reconcile', 'olifant/plans/review', 'olifant/plans/errand', 'olifant/plans/errands',
  'textDocument/codeAction', 'codeAction/resolve', 'workspace/executeCommand', 'textDocument/foldingRange', 'textDocument/codeLens',
];
const said = (from: number) => api().then(a => a.shown.slice(from).map(s => s.text));
// saveOther: OTHER edited and saved, a save elsewhere (it reconciles only the shown plans)
async function saveOther(): Promise<void> {
  const other = await vscode.workspace.openTextDocument(file(OTHER));
  const e = new vscode.WorkspaceEdit();
  e.insert(other.uri, new vscode.Position(0, 0), '#\n');
  await vscode.workspace.applyEdit(e);
  await other.save();
}
const auto = (mode: 'auto' | 'key' | undefined) =>
  vscode.workspace.getConfiguration('durandal.plans').update('reconcile', mode, vscode.ConfigurationTarget.Global);

// at: the plan open and active, the cursor on ROW, durandal.isPlan known
async function at(row: number, rel = PLAN): Promise<vscode.TextEditor> {
  const a = await running();
  const ed = await open(file(rel));
  const p = new vscode.Position(row, 0);
  ed.selection = new vscode.Selection(p, p);
  await until(() => a.isPlan(), 'durandal.isPlan');
  return ed;
}

// quiet: the entry debounce and any save timer over, nothing in the air; the reconciles sent so far
async function quiet(): Promise<number> {
  const a = await api();
  await sleep(1100);
  await until(() => !a.planReconcile.inFlight(uriOf(PLAN)) && !a.planReconcile.saving(), 'the loop quiet');
  return reconciles().length;
}

describe('the loop (fake server)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await settle(PLAN, TEXT);
    await settle(HIDDEN, TEXT);
    await settle(OTHER, 'x = 1\n');
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, null);
    await settle(HIDDEN, null);
    await settle(OTHER, null);
  });

  afterEach(async () => {
    const a = await api();
    a.setUi(undefined);
    for (const m of REPLIES) reply(m, null);
    await auto(undefined);
    for (const rel of [PLAN, HIDDEN, OTHER]) {
      const d = docOf(rel);
      if (d?.isDirty) await revert(d);
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await settle(PLAN, TEXT);
  });

  it('entering a plan reconciles once, unforced; not on a quick re-entry; again a second later (plans_spec :1060)', async () => {
    const n = await quiet();
    await at(1);
    await until(() => reconciles().length === n + 1, 'the entry reconcile');
    assert.deepEqual(reconciles().at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, forced: false });
    await open(file(OTHER));
    await at(1);
    await sleep(300);
    assert.equal(reconciles().length, n + 1);
    await sleep(1000);
    await open(file(OTHER));
    await at(1);
    await until(() => reconciles().length === n + 2, 'a later entry reconciles');
  });

  it('p c is forced: says what landed and waits, opens the review, writes no facts from the answer (plans_spec :949)', async () => {
    const a = await running();
    await at(1);
    const n = await quiet();
    const from = a.shown.length;
    reply('olifant/plans/review', reviewFixture('reconcile'));
    reply('olifant/plans/reconcile', {
      id: 'R1', baseline: 'abc', facts: [{ row: 1, text: '- [x] written?' }], blocks: [{ after: 0, lines: [{ text: 'ghost' }] }],
      changed: 0, more: 0, seconds: 0.1, rungs: [], landed: 1, readings: 2,
    });
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'the forced reconcile');
    assert.deepEqual(reconciles().at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, forced: true });
    await until(async () => (await said(from)).includes('reconcile: 1 facts · 2 to review'), 'the notice');
    await until(() => sent('olifant/plans/review').some(m => m.params.id === 'reconcile'), 'the review asked');
    await until(() => a.pause.source() === 'reconcile', 'the review window on the readings');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('an automatic reconcile never opens the review; the same answer again says nothing (plans_spec :970, :1130)', async () => {
    const a = await running();
    await at(1);
    const n = await quiet();
    const reviews = sent('olifant/plans/review').length;
    const from = a.shown.length;
    // 3 to review: not the count the p c test's answer said (2), which an equal one would not say again
    reply('olifant/plans/reconcile', { id: 'R1', landed: 0, readings: 3 });
    await saveOther();
    await until(() => reconciles().length === n + 1, 'a save elsewhere reconciles');
    await until(async () => (await said(from)).includes('reconcile: 0 facts · 3 to review'), 'the notice');
    await saveOther();
    await until(() => reconciles().length === n + 2, 'again');
    await sleep(300);
    assert.equal((await said(from)).filter(t => t.startsWith('reconcile:')).length, 1);
    assert.equal(sent('olifant/plans/review').length, reviews);
  });

  for (const label of ['Olifant: reconcile', 'Olifant: journal']) {
    it(`the server's own "${label}" edit during the reconcile sends no second one (plans_spec :980, :994)`, async () => {
      const a = await running();
      await at(1);
      const n = await quiet();
      const from = a.shown.length;
      reply('olifant/plans/reconcile', {
        notify: [{ method: 'workspace/applyEdit', request: true, params: { label, edit: { documentChanges: [{
          textDocument: { uri: '$uri', version: '$version' },
          edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '- landed\n' }],
        }] } } }],
        after: 0.5, id: 'R1', landed: 1, readings: 0,
      });
      await vscode.commands.executeCommand('durandal.plan.reconcile');
      await until(() => docOf(PLAN)!.lineAt(1).text === '- landed' || undefined, 'the server\'s edit');
      await until(async () => (await said(from)).includes('reconcile: 1 facts · 0 to review'), 'the notice');
      await sleep(600);
      assert.equal(reconciles().length, n + 1);
    });
  }

  it('the plan moved while the reconcile ran: one fresh unforced reconcile after it (plans_spec :1103)', async () => {
    await running();
    const ed = await at(1);
    const n = await quiet();
    reply('olifant/plans/reconcile', { delay: 1, value: { id: 'R1', landed: 0, readings: 0 } });
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'the reconcile');
    await ed.edit(e => e.insert(new vscode.Position(0, 0), 'x'));
    await until(() => reconciles().length === n + 2, 'the rerun', 5_000);
    assert.equal(reconciles().at(-1)!.params.forced, false);
    await sleep(1500);
    assert.equal(reconciles().length, n + 2);
  });

  it('starts while one runs are remembered as one, and a forced one stays forced (plans_spec :1073)', async () => {
    await running();
    await at(1);
    const n = await quiet();
    reply('olifant/plans/reconcile', { delay: 1, value: { id: 'R1', landed: 0, readings: 0 } });
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'the first');
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await sleep(200);
    assert.equal(reconciles().length, n + 1);
    await until(() => reconciles().length === n + 2, 'the remembered one', 5_000);
    assert.equal(reconciles().at(-1)!.params.forced, true);
    await sleep(1500);
    assert.equal(reconciles().length, n + 2);
  });

  it('an automatic reconcile\'s repeated error is said once; a forced one always (plans_spec :1173)', async () => {
    const a = await running();
    await at(1);
    const n = await quiet();
    const from = a.shown.length;
    reply('olifant/plans/reconcile', { lsp_error: 'no project here' });
    await saveOther();
    await until(() => reconciles().length === n + 1, 'one');
    await until(() => !a.planReconcile.inFlight(uriOf(PLAN)), 'answered');
    await saveOther();
    await until(() => reconciles().length === n + 2, 'two');
    await until(() => !a.planReconcile.inFlight(uriOf(PLAN)), 'answered');
    await sleep(200);
    assert.equal((await said(from)).filter(t => t === 'no project here').length, 1);
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(async () => (await said(from)).filter(t => t === 'no project here').length === 2, 'forced says it');
  });

  it('a landing reconciles every open plan, shown or not (plans_spec :1192)', async () => {
    const a = await running();
    await at(1);
    await vscode.workspace.openTextDocument(file(HIDDEN));
    await quiet();
    const n = allReconciles().length;
    a.landed.fire('stub');
    await until(() => {
      const uris = allReconciles().slice(n).map(m => m.params.textDocument.uri);
      return (uris.includes(uriOf(PLAN)) && uris.includes(uriOf(HIDDEN))) || undefined;
    }, 'both plans');
  });

  it('saves elsewhere in a burst: one reconcile of the shown plan a second after the last; none for a hidden plan or the plan\'s own save (plans_spec :243)', async () => {
    const a = await running();
    const ed = await at(1);
    await vscode.workspace.openTextDocument(file(HIDDEN));
    await quiet();
    // the whole log: a hidden plan's reconcile would count
    const n = allReconciles().length;
    for (let i = 0; i < 3; i++) {
      await saveOther();
      await sleep(200);
    }
    assert.ok(a.planReconcile.saving());
    assert.equal(allReconciles().length, n);
    await until(() => allReconciles().length === n + 1, 'one reconcile', 3_000);
    assert.equal(allReconciles().at(-1)!.params.textDocument.uri, uriOf(PLAN));
    await sleep(1200);
    assert.equal(allReconciles().length, n + 1);
    // the plan's own save
    await ed.edit(e => e.insert(new vscode.Position(0, 0), 'x'));
    await ed.document.save();
    await sleep(1300);
    assert.equal(allReconciles().length, n + 1);
  });

  it('reconcile "key": nothing automatic; p c still reconciles (plans_spec :1208, :265)', async () => {
    const a = await running();
    await auto('key');
    const n = await quiet();
    await at(1);
    a.landed.fire('test');
    await saveOther();
    await sleep(1500);
    assert.equal(reconciles().length, n);
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'p c');
  });

  it('Plan: Cancel stops the reconcile: $/cancelRequest, "cancelled", nothing more said', async () => {
    const a = await running();
    await at(1);
    const n = await quiet();
    reply('olifant/plans/reconcile', { hold: true, title: 'reconciling' });
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1 && a.planReconcile.inFlight(uriOf(PLAN)), 'held');
    const id = reconciles().at(-1)!.id;
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.cancel');
    await until(() => sent('$/cancelRequest').some(m => m.params.id === id), 'the cancel sent');
    assert.deepEqual(await said(from), ['cancelled']);
    await sleep(500);
    assert.deepEqual(await said(from), ['cancelled']);
    assert.ok(!a.planReconcile.inFlight(uriOf(PLAN)));
  });

  it('the plan closed while its forced reconcile runs: nothing said, the review does not open, nothing runs again', async () => {
    const a = await running();
    const ed = await at(1);
    const n = await quiet();
    const reviews = sent('olifant/plans/review').length;
    reply('olifant/plans/review', reviewFixture('reconcile'));
    reply('olifant/plans/reconcile', { delay: 1, value: { id: 'R1', landed: 1, readings: 1 } });
    const from = a.shown.length;
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'sent');
    // VS Code closes and reopens a document whose language changes
    await vscode.languages.setTextDocumentLanguage(ed.document, 'plaintext');
    await sleep(1500);
    assert.deepEqual((await said(from)).filter(t => t.startsWith('reconcile:')), []);
    assert.equal(sent('olifant/plans/review').length, reviews);
    assert.equal(reconciles().length, n + 1);
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
  });

  it('the server stopped with a reconcile held and one remembered: nothing said, the remembered never runs, the restart reconciles the active plan', async () => {
    const a = await running();
    await at(1);
    const n = await quiet();
    reply('olifant/plans/reconcile', { hold: true, title: 'reconciling' });
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    await until(() => reconciles().length === n + 1, 'held');
    await vscode.commands.executeCommand('durandal.plan.reconcile');
    const from = a.shown.length;
    reply('olifant/plans/reconcile', { id: 'R2', landed: 0, readings: 0 });
    await restart();
    // the started hook: the active plan reconciles at once (the entry debounce went with the stop)
    await until(() => reconciles().length === n + 2, 'the reconcile after the restart', 10_000);
    assert.equal(reconciles().at(-1)!.params.forced, false);
    await sleep(1500);
    assert.equal(reconciles().length, n + 2);
    assert.deepEqual((await said(from)).filter(t => !t.startsWith('Durandal')), []);
  });

  it('typing in a plan: no idle while it goes on; one a second after it stops (plans_spec :1316-1364)', async () => {
    await running();
    const ed = await at(1);
    await quiet();
    const n = idles().length;
    for (let i = 0; i < 5; i++) {
      await ed.edit(e => e.insert(new vscode.Position(0, 0), 'x'));
      await sleep(300);
    }
    assert.equal(idles().length, n);
    await until(() => idles().length === n + 1, 'one idle', 3_000);
    assert.deepEqual(idles().at(-1)!.params, { textDocument: { uri: uriOf(PLAN) } });
    await sleep(1500);
    assert.equal(idles().length, n + 1);
  });

  it('idle goes out in "key" mode too; never for another file; never after the plan closed', async () => {
    await running();
    await auto('key');
    const ed = await at(1);
    // the previous test's revert armed an idle for PLAN; let it land before the baseline (F4)
    await sleep(1100);
    const n = idles().length;
    await ed.edit(e => e.insert(new vscode.Position(0, 0), 'x'));
    await until(() => idles().length === n + 1, 'idle in key mode', 3_000);
    const other = await open(file(OTHER));
    await other.edit(e => e.insert(new vscode.Position(0, 0), '#'));
    await sleep(1500);
    assert.equal(idles().length, n + 1);
    const plan = await at(1);
    await plan.edit(e => e.insert(new vscode.Position(0, 0), 'x'));
    // VS Code closes and reopens a document whose language changes
    await vscode.languages.setTextDocumentLanguage(plan.document, 'plaintext');
    await sleep(1500);
    assert.equal(idles().length, n + 1);
    await vscode.languages.setTextDocumentLanguage(docOf(PLAN)!, 'markdown');
  });

  const JOURNAL = [...LINES, '  - 25 Oct 21:31 · do (sonnet) · answered: x'];

  it('p o on a journal line opens the do behind it, read-only (plans_spec :346)', async () => {
    const a = await running();
    await settle(PLAN, JOURNAL.join('\n') + '\n');
    reply('olifant/plans/errand', reviewFixture('errand'));
    await at(4);
    await vscode.commands.executeCommand('durandal.plan.errand');
    await until(() => sent('olifant/plans/errand').length > 0, 'the errand asked');
    assert.deepEqual(sent('olifant/plans/errand').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, row: 4 });
    await until(() => a.pause.source() === 'errand', 'the past do in the window');
  });

  it('p o off a journal line, or with nothing behind it, says there is no record', async () => {
    await running();
    await settle(PLAN, JOURNAL.join('\n') + '\n');
    await at(1);
    const asked = sent('olifant/plans/errand').length;
    const from = (await api()).shown.length;
    await vscode.commands.executeCommand('durandal.plan.errand');
    assert.deepEqual(await said(from), ['plans: no record behind this line']);
    assert.equal(sent('olifant/plans/errand').length, asked);
    // a journal line the server finds nothing behind: null
    reply('olifant/plans/errand', null);
    await at(4);
    await vscode.commands.executeCommand('durandal.plan.errand');
    assert.deepEqual(await said(from), ['plans: no record behind this line', 'plans: no record behind this line']);
  });

  it('the past-do lens: none says so; one opens by id; several are picked from (review.lua :512-531)', async () => {
    const a = await running();
    await at(1);
    const ui = new FakeUi();
    a.setUi(ui);
    const from = a.shown.length;
    reply('olifant/plans/errands', { errands: [] });
    await vscode.commands.executeCommand('olifant.plans.errand', uriOf(PLAN), 1);
    assert.deepEqual(sent('olifant/plans/errands').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, row: 1 });
    assert.deepEqual(await said(from), ['plans: no past do here']);
    reply('olifant/plans/errand', reviewFixture('errand'));
    reply('olifant/plans/errands', { errands: [{ id: 'E1', at: '2026-10-25T21:31:00Z', status: 'answered', choice: 'kept', words: 'done', model: 'sonnet' }] });
    await vscode.commands.executeCommand('olifant.plans.errand', uriOf(PLAN), 1);
    assert.deepEqual(sent('olifant/plans/errand').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'E1' });
    await until(() => a.pause.source() === 'errand', 'opened');
    reply('olifant/plans/errands', { errands: [
      { id: 'E2', at: '2026-10-26T08:00:00Z', status: 'blocked', choice: null, words: 'blocked' },
      { id: 'E1', at: '2026-10-25T21:31:00Z', status: 'answered', choice: 'kept', words: 'done' },
    ] });
    ui.onPick = o => o.items[1].value;
    await vscode.commands.executeCommand('olifant.plans.errand', uriOf(PLAN), 1);
    assert.equal(ui.picks.at(-1)!.title, 'past dos');
    assert.deepEqual(ui.picks.at(-1)!.items.map(i => i.label),
      ['2026-10-26 08:00 · blocked · nil · blocked', '2026-10-25 21:31 · answered · kept · done']);
    assert.deepEqual(sent('olifant/plans/errand').at(-1)!.params, { textDocument: { uri: uriOf(PLAN) }, id: 'E1' });
  });

  it('the excerpt lens opens and closes the excerpt\'s fold at its opening fence (plans_spec :211)', async () => {
    const a = await running();
    const EXCERPT = ['# Steps', '- [ ] s @src/a.py:Foo', '  ```python @src/a.py:Foo', '  x = 1', '  ```', '- other'];
    await settle(PLAN, EXCERPT.join('\n') + '\n');
    reply('textDocument/foldingRange', [{ startLine: 2, endLine: 4, kind: 'region' }]);
    const ed = await at(0);
    const uri = ed.document.uri.toString();
    await until(() => a.planView.reading(uri)?.folds?.version === ed.document.version || undefined, 'the folds');
    const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
    // closed on entry (foldDone)
    await until(() => (a.planView.entered(uri) && !shown(3)) || undefined, 'entered, the excerpt folded');
    await vscode.commands.executeCommand('olifant.plans.excerpt', uriOf(PLAN), 2, 4, true, '@src/a.py:Foo');
    await until(() => shown(3) || undefined, 'opened');
    await vscode.commands.executeCommand('olifant.plans.excerpt', uriOf(PLAN), 2, 4, true, '@src/a.py:Foo');
    await until(() => !shown(3) || undefined, 'closed again');
  });

  // menu: the chord-a menu on ROW of the plan, picking the item whose label starts with LABEL
  async function menu(row: number, label: string): Promise<FakeUi> {
    const a = await running();
    const ui = new FakeUi();
    ui.onPick = o => o.items.find(i => i.label.startsWith(label))?.value;
    a.setUi(ui);
    await at(row);
    await vscode.commands.executeCommand('durandal.actions');
    return ui;
  }
  const lineEdit = (row: number, text: string) => ({ changes: { [uriOf(PLAN)]: [{
    range: { start: { line: row, character: 0 }, end: { line: row, character: LINES[row].length } }, newText: text,
  }] } });

  it('the claim pass\'s Check this runs on the server (workspace/executeCommand); the menu lists every plan action', async () => {
    reply('textDocument/codeAction', [
      { title: 'Check this (sonnet, ~$0.10)', kind: '', command: { title: 'Check this (sonnet, ~$0.10)', command: 'olifant.checkSentence', arguments: [uriOf(PLAN), 'other'] } },
      { title: 'New step below', kind: 'source', edit: lineEdit(3, '- other\n- [ ] ') },
    ]);
    const resolves = sent('codeAction/resolve').length;
    const ui = await menu(3, 'Check this');
    await until(() => sent('workspace/executeCommand').some(m => m.params.command === 'olifant.checkSentence'), 'the check sent');
    assert.deepEqual(sent('workspace/executeCommand').at(-1)!.params, { command: 'olifant.checkSentence', arguments: [uriOf(PLAN), 'other'] });
    assert.deepEqual(ui.picks[0].items.map(i => i.label), ['Check this (sonnet, ~$0.10)', 'New step below']);
    assert.equal(sent('codeAction/resolve').length, resolves);
    assert.deepEqual(ui.log.filter(l => l.startsWith('error')), []);
  });

  it('a claim-pass command the server refuses is said as an error, and nothing is resolved', async () => {
    reply('workspace/executeCommand', { lsp_error: 'that sentence has no check yet' });
    reply('textDocument/codeAction', [
      { title: 'Show why', kind: '', command: { title: 'Show why', command: 'olifant.showWhy', arguments: [uriOf(PLAN), 'other'] } },
    ]);
    const resolves = sent('codeAction/resolve').length;
    const ui = await menu(3, 'Show why');
    await until(() => ui.log.includes('error that sentence has no check yet') || undefined, 'the refusal said');
    assert.equal(sent('codeAction/resolve').length, resolves);
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });

  it('in a plan, an action\'s own edit applies (Re-fingerprint this claim, a quickfix); the plan stays unsaved', async () => {
    reply('textDocument/codeAction', [{ title: 'Re-fingerprint this claim', kind: 'quickfix', edit: lineEdit(2, '  - test_it ✓ abc1234') }]);
    await menu(2, 'Fix: Re-fingerprint');
    await until(() => docOf(PLAN)!.lineAt(2).text === '  - test_it ✓ abc1234' || undefined, 'the edit applied');
    assert.ok(docOf(PLAN)!.isDirty);
  });

  it('in a plan, a source action resolves to its edit (Mark done)', async () => {
    reply('textDocument/codeAction', [{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: 'plans/l.md', line: 1, version: 1 } }]);
    reply('codeAction/resolve', { title: 'Mark done', kind: 'source', edit: lineEdit(1, '- [x] s @src/a.py:Foo') });
    await menu(1, 'Mark done');
    await until(() => docOf(PLAN)!.lineAt(1).text === '- [x] s @src/a.py:Foo' || undefined, 'resolved and applied');
    assert.equal(sent('codeAction/resolve').at(-1)!.params.title, 'Mark done');
  });

  it('in a plan, a resolve with no edit says so', async () => {
    reply('textDocument/codeAction', [{ title: 'Mark done', kind: 'source', data: { kind: 'toggle', path: 'plans/l.md', line: 1, version: 1 } }]);
    reply('codeAction/resolve', { title: 'Mark done', kind: 'source' });
    const ui = await menu(1, 'Mark done');
    await until(() => ui.log.includes('error the server sent no edit') || undefined, 'said');
    assert.equal(docOf(PLAN)!.getText(), TEXT);
  });
});
