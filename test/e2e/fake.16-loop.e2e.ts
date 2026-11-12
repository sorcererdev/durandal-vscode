import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
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
});
