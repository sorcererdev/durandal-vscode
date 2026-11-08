import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import { ConjureLanded, ConjureParams, ConjurePaused, Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { Ui } from '../uiTypes';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { settle } from './flights';
import { changedSpan, conjureNotice, pausedNotice, savedWord, selectionLines } from './landing';
import type { Tests } from './tests';

export interface ConjureDeps {
  server: Server; say: Say; ui: () => Ui; flights: TddFlights; tests: Tests;
  // each landing's flashed span (Api.tdd.flashes, for the e2e tests)
  flashes: { first: number; last: number }[];
}

// Conjure: a body (or the selected lines) filled until its tests pass (durandal.nvim conjure.lua,
// spec §4). A landing applies the accepted edit, flashes the changed lines, marks the after-run
// and says one line. A pause, until M5's window, is a warning with Continue and Stop.
export class Conjure {
  private readonly landed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });

  constructor(private readonly d: ConjureDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.landed, vscode.commands.registerCommand('durandal.conjure', () => this.run()));
  }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    const params: ConjureParams = { textDocument: { uri: h.uri }, position: h.position };
    const sel = selectionLines(h.editor.selection.start, h.editor.selection.end);
    if (sel) params.selection = sel;
    await this.ask(params);
  }

  // ask sends a conjure (or a resume), then lands its answer or shows its pause
  private async ask(params: ConjureParams): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const f = this.d.flights.start('conjure');
    const o = await withCancel('Durandal: conjuring…', f,
      () => settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method));
    if (o.kind === 'cancelled') {
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', 'conjure cancelled · nothing landed');
      return;
    }
    if (o.kind === 'error') {
      void this.d.say('error', o.message);
      return;
    }
    // the one branch point is the answer's shape (conjure.lua :175): {paused: {…}} or a landing.
    // ConjureLanded is open (an index signature), so `in` does not narrow: read it through the cast.
    const p = (o.value as ConjurePaused).paused;
    if (p && typeof p === 'object') {
      await this.paused(params, p);
      return;
    }
    await this.land(params, o.value as ConjureLanded);
  }

  // paused: Continue resumes (it may pause again), Stop lands nothing; dismissed, the server's
  // token expires (spec §4, ruling 3)
  private async paused(params: ConjureParams, p: ConjurePaused['paused']): Promise<void> {
    const pick = await this.d.ui().ask('warn', pausedNotice(String(p.diagnosis ?? '')), ['Continue', 'Stop']);
    if (pick !== 'Continue' && pick !== 'Stop') return;
    await this.ask({
      textDocument: params.textDocument, position: params.position,
      resume: { token: String(p.token), choice: pick === 'Continue' ? 'continue' : 'stop' },
    });
  }

  private async land(params: ConjureParams, a: ConjureLanded): Promise<void> {
    let written: string | undefined;
    if (a.edits) {
      const lc = this.d.server.client();
      if (!lc) {
        void this.d.say('error', NOT_RUNNING);
        return;
      }
      const doc = vscode.workspace.textDocuments.find(x => x.uri.toString() === params.textDocument.uri);
      const before = doc?.getText().split('\n');
      let counts = { saved: 0, unsaved: 0 };
      const done = await applyServerEdit(lc, { label: 'conjure', edit: a.edits }, () => undefined, (saved, unsaved, kept) => {
        counts = { saved: saved.length, unsaved: unsaved.length + kept.length };
        return undefined;
      });
      if (!done.applied) {
        void this.d.say('error', done.failureReason ?? 'VS Code did not apply the conjure');
        return;
      }
      written = savedWord(counts.saved, counts.unsaved);
      if (doc && before) this.flash(doc, before);
    }
    // the after-run, as a run marks it; the results refreshed if open, not opened
    if (a.tests && typeof a.tests === 'object' && !(a.stopped && !a.edits)) this.d.tests.show(a.tests, false);
    const n = conjureNotice(a, written);
    void this.d.say(n.level, n.text);
  }

  // flash: the changed lines for half a second; the cursor to the first, when its editor is active
  private flash(doc: vscode.TextDocument, before: string[]): void {
    const span = changedSpan(before, doc.getText().split('\n'));
    if (!span) return;
    this.d.flashes.push(span);
    const range = new vscode.Range(span.first, 0, span.last, 0);
    const eds = vscode.window.visibleTextEditors.filter(e => e.document === doc);
    for (const e of eds) e.setDecorations(this.landed, [range]);
    setTimeout(() => { for (const e of eds) e.setDecorations(this.landed, []); }, 500);
    const active = vscode.window.activeTextEditor;
    if (active?.document !== doc) return;
    const at = new vscode.Position(span.first, doc.lineAt(span.first).firstNonWhitespaceCharacterIndex);
    active.selection = new vscode.Selection(at, at);
    active.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
