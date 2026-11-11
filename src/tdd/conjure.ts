import * as vscode from 'vscode';
import { applyServerEdit } from '../applyEdit';
import type { Landed } from '../landed';
import { ConjureLanded, ConjureParams, ConjureResult, Olifant, Paused } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import type { Ui } from '../uiTypes';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { Flight, Outcome, settle } from './flights';
import { changedSpan, conjureNotice, savedWord, selectionLines } from './landing';
import type { Tests } from './tests';

export interface ConjureDeps {
  server: Server; say: Say; ui: () => Ui; flights: TddFlights; tests: Tests;
  // each landing's flashed span (Api.tdd.flashes, for the e2e tests)
  flashes: { first: number; last: number }[];
  landed: Landed;
}

// PauseSink: where a pause goes (the pause controller, M5 spec §3)
export interface PauseSink {
  // a pause answered, to an opening conjure or a resume (params: the request, its position the
  // original; hooks: the resume's, undefined for an opening conjure)
  shown(params: ConjureParams, p: Paused, hooks?: ResumeHooks): void;
  // a resume ended without a pause (a landing, an error, a cancel): hooks name which one
  ended(hooks: ResumeHooks): void;
  // a conjure is about to go from line of uri: true when it reopened the held pause instead
  atRun(uri: string, line: number, selection: boolean): boolean;
}

// ResumeHooks: a resume's flight, for the window's x; the object is the resume's identity, handed
// back to the sink with its answer
export interface ResumeHooks { started(f: Flight<vscode.CancellationToken>): void }

// Conjure: a body (or the selected lines) filled until its tests pass (durandal.nvim conjure.lua,
// M4 spec §4). A landing applies the accepted edit, flashes the changed lines, marks the
// after-run and says one line. A pause goes to the sink (M5 spec §3); a resume comes back
// through resume() so its landing is this one.
export class Conjure {
  private readonly landed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });
  private sink: PauseSink | undefined;

  constructor(private readonly d: ConjureDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.landed, vscode.commands.registerCommand('durandal.conjure', () => this.run()));
  }

  setSink(s: PauseSink): void { this.sink = s; }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    const sel = selectionLines(h.editor.selection.start, h.editor.selection.end);
    // a conjure inside a held pause's unit reopens it; anywhere else it forgets it (spec §3.4 rule 4)
    if (this.sink?.atRun(h.uri, h.position.line, !!sel)) return;
    const params: ConjureParams = { textDocument: { uri: h.uri }, position: h.position };
    if (sel) params.selection = sel;
    await this.ask(params);
  }

  // resume: a pause's answer; the window is its progress (no notification), x cancels the flight
  async resume(params: ConjureParams, hooks: ResumeHooks): Promise<void> {
    await this.ask(params, hooks);
  }

  // ask sends a conjure (or a resume), then lands its answer or hands on its pause
  private async ask(params: ConjureParams, hooks?: ResumeHooks): Promise<void> {
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      if (hooks) this.sink?.ended(hooks);
      return;
    }
    const f = this.d.flights.start('conjure');
    const send = () => settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method);
    let o: Outcome<ConjureResult>;
    if (hooks) {
      hooks.started(f);
      o = await send();
    } else {
      o = await withCancel('Durandal: conjuring…', f, send);
    }
    if (o.kind === 'cancelled') {
      if (hooks) this.sink?.ended(hooks);
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', 'conjure cancelled · nothing landed');
      return;
    }
    if (o.kind === 'error') {
      if (hooks) this.sink?.ended(hooks);
      void this.d.say('error', o.message);
      return;
    }
    // the one branch point is the answer's shape (conjure.lua :175): {paused: {…}} or a landing.
    // ConjureLanded is open (an index signature), so `in` does not narrow: read it through the cast.
    const p = (o.value as { paused?: unknown }).paused;
    if (p && typeof p === 'object') {
      this.sink?.shown(params, p as Paused, hooks);
      return;
    }
    if (hooks) this.sink?.ended(hooks);
    await this.land(params, o.value as ConjureLanded);
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
    // stopped with no edits: nothing landed (conjure.lua :190-205)
    if (!(a.stopped && !a.edits)) this.d.landed.fire('conjure');
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
