import * as assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DidChangeWatchedFilesNotification, FileChangeType } from 'vscode-languageserver-protocol';
import { Olifant } from '../../src/protocol';
import { lineTokens } from '../../src/plans/reading';
import { FakeUi } from '../fakeUi';
import { api, file, open, revert, running, until, ws } from './helpers';

// The plans reading layer against olifant lsp at .olifant-ref (python-htmx): the six-modifier
// legend arrives and decodes, a ticked step and an excerpt fold and close on entry. A frozen
// excerpt (" · done"), so no reconcile rewrites it.
const PLAN = 'py/plans/m6a.md';
const LOOP = 'py/plans/m6c.md';
const LOOP_TEXT = '- CreateBooking @src/bistro/booking/commands/create_booking.py:CreateBooking checks the party size.\n';
const TEXT = [
  '- [x] book a table',                                                          // 0
  '  - 25 Oct 21:31 · did it',                                                   // 1
  '- [ ] show the code',                                                         // 2
  '  ```python @src/bistro/booking/commands/create_booking.py:CreateBooking · done', // 3
  '  ```',                                                                       // 4
  '',
].join('\n');

describe('the plans reading layer against olifant lsp (python-htmx)', () => {
  before(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllGroups');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', true, vscode.ConfigurationTarget.Global);
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.workspace.getConfiguration('editor').update('semanticHighlighting.enabled', undefined, vscode.ConfigurationTarget.Global);
    const path = join(ws(), PLAN);
    rmSync(path, { force: true });
    // tell the server, as the language client would: it keeps its file listing until it hears of a change
    await (await api()).server.notify(DidChangeWatchedFilesNotification.type,
      { changes: [{ uri: vscode.Uri.file(path).toString(), type: FileChangeType.Deleted }] });
    const loop = join(ws(), LOOP);
    rmSync(loop, { force: true });
    await (await api()).server.notify(DidChangeWatchedFilesNotification.type,
      { changes: [{ uri: vscode.Uri.file(loop).toString(), type: FileChangeType.Deleted }] });
  });

  it('the legend has six modifiers; the plan\'s tokens decode; a ticked step and an excerpt fold, closed on entry', async () => {
    const a = await running();
    const legend = a.server.client()!.initializeResult!.capabilities.semanticTokensProvider!.legend;
    assert.deepEqual(legend.tokenModifiers, ['done', 'stale', 'notFound', 'checked', 'wrong', 'resolved']);
    mkdirSync(join(ws(), 'py/plans'), { recursive: true });
    writeFileSync(join(ws(), PLAN), TEXT);
    const ed = await open(file(PLAN));
    const uri = ed.document.uri.toString();
    await until(() => a.planView.reading(uri)?.tokens?.version === ed.document.version || undefined, 'the tokens', 60_000);
    const row0 = lineTokens(a.planView.reading(uri)!.tokens!.toks, 0).map(t => t.type);
    assert.ok(row0.includes('planMarker') && row0.includes('planStepDone'), row0.join(' '));
    await until(() => a.planView.reading(uri)?.folds?.version === ed.document.version || undefined, 'the folds', 60_000);
    const folds = a.planView.reading(uri)!.folds!.ranges.map(f => `${f.start}-${f.end}`).sort();
    assert.ok(folds.includes('0-1') && folds.includes('3-4'), folds.join(' '));
    await until(() => a.planView.entered(uri), 'entered', 30_000);
    const shown = (row: number) => ed.visibleRanges.some(r => r.start.line <= row && row <= r.end.line);
    await until(() => (!shown(1) && !shown(4)) || undefined, 'rows 1 and 4 folded');
    assert.ok(shown(0) && shown(2) && shown(3));
  });

  const STEPS = 'py/plans/m6b.md';
  const STEPS_TEXT = ['# Booking', '', '- [ ] book a table @src/bistro/booking/commands/create_booking.py:CreateBooking', ''].join('\n');

  it('files lists the step\'s file; new step adds one under it; toggle ticks the step through resolve', async () => {
    const a = await running();
    writeFileSync(join(ws(), STEPS), STEPS_TEXT);
    try {
      const ed = await open(file(STEPS));
      await until(() => a.isPlan(), 'durandal.isPlan');
      const ui = new FakeUi();
      a.setUi(ui);
      await vscode.commands.executeCommand('durandal.plan.files');
      assert.ok(ui.picks[0]?.items.some(i => (i.detail ?? '').includes('create_booking.py')), JSON.stringify(ui.picks[0]?.items));
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.newStep');
      await until(() => ed.document.lineAt(3).text.startsWith('- [ ] ') || undefined, 'a new step under the row', 30_000);
      await revert(ed.document);
      await vscode.window.showTextDocument(ed.document);
      ed.selection = new vscode.Selection(2, 0, 2, 0);
      await vscode.commands.executeCommand('durandal.plan.toggle');
      await until(() => ed.document.lineAt(2).text.startsWith('- [x] book a table') || undefined, 'the step ticked', 30_000);
    } finally {
      a.setUi(undefined);
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(STEPS).toString());
      if (d?.isDirty) await revert(d);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const path = join(ws(), STEPS);
      rmSync(path, { force: true });
      await a.server.notify(DidChangeWatchedFilesNotification.type,
        { changes: [{ uri: vscode.Uri.file(path).toString(), type: FileChangeType.Deleted }] });
    }
  });

  it('a forced reconcile answers its counts; p c says nothing wrong', async () => {
    const a = await running();
    mkdirSync(join(ws(), 'py/plans'), { recursive: true });
    writeFileSync(join(ws(), LOOP), LOOP_TEXT);
    try {
      const ed = await open(file(LOOP));
      await until(() => a.isPlan(), 'durandal.isPlan');
      const uri = ed.document.uri.toString();
      const r = await a.server.request(Olifant.plansReconcile, { textDocument: { uri }, forced: true });
      assert.equal(typeof r?.landed, 'number', JSON.stringify(r));
      assert.equal(typeof r?.readings, 'number', JSON.stringify(r));
      const from = a.shown.length;
      await vscode.commands.executeCommand('durandal.plan.reconcile');
      await until(() => !a.planReconcile.inFlight(uri), 'answered', 60_000);
      assert.deepEqual(a.shown.slice(from).filter(s => s.level === 'error'), []);
    } finally {
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(LOOP).toString());
      if (d?.isDirty) await revert(d);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      rmSync(join(ws(), LOOP), { force: true });
    }
  });

  it('Check this from the chord-a menu checks the claim; its verdict reaches the margin (recorded check)', async () => {
    const a = await running();
    mkdirSync(join(ws(), 'py/plans'), { recursive: true });
    writeFileSync(join(ws(), LOOP), LOOP_TEXT);
    const ui = new FakeUi();
    ui.onPick = o => o.items.find(i => i.label.startsWith('Check this'))?.value;
    try {
      const ed = await open(file(LOOP));
      await until(() => a.isPlan(), 'durandal.isPlan');
      const uri = ed.document.uri.toString();
      ed.selection = new vscode.Selection(0, 4, 0, 4);
      a.setUi(ui);
      await vscode.commands.executeCommand('durandal.actions');
      assert.ok(ui.picks[0]?.items.some(i => /^Check this \(.+, ~\$[0-9.]+\)$/.test(i.label)), JSON.stringify(ui.picks[0]?.items.map(i => i.label)));
      try {
        await until(() => a.planView.drawn(uri).verdicts.some(v => v.line === 0 && v.text === '✗') || undefined, 'the wrong verdict in the margin', 60_000);
      } catch (e) {
        // olifant writes each key it asked the check_answers hook for beside the file: match ours to it
        const asked = join(ws(), 'checks.json.asked');
        throw new Error(`${(e as Error).message}; asked: ${existsSync(asked) ? readFileSync(asked, 'utf8') : '(none)'}`);
      }
      // the hover footer names this editor's keys (olifant reads keys.definition and keys.plan_keep)
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', ed.document.uri, new vscode.Position(0, 4));
      const md = hovers.flatMap(h => h.contents).map(c => (typeof c === 'string' ? c : c.value)).join('\n');
      assert.ok(md.includes('F12: the code · Keep this verdict: Ctrl+Alt+D P K'), md);
      assert.deepEqual(ui.log.filter(l => l.startsWith('error')), []);
    } finally {
      a.setUi(undefined);
      const d = vscode.workspace.textDocuments.find(x => x.uri.toString() === file(LOOP).toString());
      if (d?.isDirty) await revert(d);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      rmSync(join(ws(), LOOP), { force: true });
    }
  });
});
