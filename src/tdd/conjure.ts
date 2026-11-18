import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from '../applyEdit';
import type { Landed } from '../landed';
import { STEP_BUSY } from '../pause/stepModel';
import { HeldStep, reopens, stepLines, StepStore } from '../pause/stepStore';
import { ConjureParams, ConjureResult, Olifant, Shown, StepChoice } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { here, NO_FILE, TddFlights, withCancel } from './common';
import { Outcome, settle } from './flights';
import { changedSpan, savedWord, selectionLines, stepLanded } from './landing';
import type { Tests } from './tests';

export interface ConjureDeps {
  server: Server; say: Say; flights: TddFlights; tests: Tests;
  // each landing's flashed span (Api.tdd.flashes, for the e2e tests)
  flashes: { first: number; last: number }[];
  landed: Landed;
  // the held steps, one a document (spec §3.6); the window reads them too
  steps: StepStore;
}

// StepWindow: where a shown step is drawn (the review window's step source, controller.ts)
export interface StepWindow {
  // the held step of URI shown: opened, or drawn again in place with its first file selected
  showStep(uri: string): void;
  // URI's step is over (landed, rejected, gone): the window closes if it shows it
  closeStep(uri: string): void;
}

export const NO_ANSWER = 'conjure: an answer olifant does not give';
const CANCELLED = 'conjure cancelled · nothing landed';
// an answer's errors after which the server holds no step: the window closes with them; any
// other failed h keeps the step and says why in the footer (spec §3.5)
const GONE = ['this step is gone', 'the file changed since the step was shown'];
const docOf = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
// the server can spell a uri differently from VS Code (%3A, [, ])
const sameUri = (a: string, b: string) => vscode.Uri.parse(a).toString() === vscode.Uri.parse(b).toString();

// Conjure: one step at the cursor (or the selected lines), shown for review (durandal.nvim
// conjure.lua, spec §3.3). The answer is a shown step, held and drawn by the window; a landed
// step applies its edits, flashes the changed lines, marks the step's after-run and says one
// line; a rejected one is said. The window's a, r and h come back through answer().
export class Conjure {
  private readonly flashed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });
  private window: StepWindow | undefined;

  constructor(private readonly d: ConjureDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.flashed, vscode.commands.registerCommand('durandal.conjure', () => this.run()));
  }

  setWindow(w: StepWindow): void { this.window = w; }

  async run(): Promise<void> {
    const h = here();
    if (!h) {
      void this.d.say('error', NO_FILE);
      return;
    }
    const sel = selectionLines(h.editor.selection.start, h.editor.selection.end);
    // the held step again when the document is as it was shown and the cursor is on its
    // lines; otherwise it is forgotten (the server drops its own on a new conjure)
    const held = this.d.steps.get(h.uri);
    if (held) {
      if (reopens(held, h.editor.document.version, h.position.line, sel !== undefined)) {
        this.window?.showStep(h.uri);
        return;
      }
      this.forget(h.uri);
    }
    const params: ConjureParams = { textDocument: { uri: h.uri }, position: h.position };
    if (sel) params.selection = sel;
    if (!this.d.server.client()) {
      void this.d.say('error', NOT_RUNNING);
      return;
    }
    const f = this.d.flights.start('conjure');
    const o = await withCancel('Durandal: conjuring…', f, () => settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method));
    if (o.kind === 'cancelled') {
      if (o.why === 'user' || o.why === 'server') void this.d.say('info', CANCELLED);
      return;
    }
    // the opening call's refusal leaves nothing to forget: said as the server says it
    if (o.kind === 'error') {
      void this.d.say('error', o.message);
      return;
    }
    await this.answered(params, o.value, undefined);
  }

  // answer: the held step of URI answered with CHOICE (the window's a, r, h). Undefined when it
  // is done with (shown again, landed, rejected, or gone, each drawn or said); a sentence when
  // the step stays and the footer should say why (a failed h, or an answer already in the air).
  // The step is busy from the moment the request is sent until its answer is handled, whatever
  // the outcome; the window reads that from the held step.
  answer(uri: string, choice: StepChoice): Promise<string | undefined> {
    const held = this.d.steps.get(uri);
    if (!held) return Promise.resolve('nothing to do here');
    if (held.busy !== undefined) return Promise.resolve(STEP_BUSY);
    if (!this.d.server.client()) return Promise.resolve(NOT_RUNNING);
    const params: ConjureParams = { textDocument: { uri }, position: held.position, resume: { token: held.shown.token, choice } };
    const f = this.d.flights.start('conjure');
    held.busy = choice;
    const sent = settle(f, this.d.server.request(Olifant.conjure, params, f.token), Olifant.conjure.method);
    return this.resumed(uri, params, choice, held, sent).finally(() => { held.busy = undefined; });
  }

  // resumed: an answer's outcome. A held step that is no longer the one held (a stop dropped it,
  // or a new conjure replaced it) has had its window closed already: only a landing still
  // applies (the server took it), and nothing is forgotten, so the newer step stays.
  private async resumed(uri: string, params: ConjureParams, choice: StepChoice, held: HeldStep, sent: Promise<Outcome<ConjureResult>>): Promise<string | undefined> {
    const o = await sent;
    const current = this.d.steps.get(uri) === held;
    if (!current) {
      const r = o.kind === 'answer' ? o.value as { landed?: unknown } : undefined;
      if (r && r.landed !== null && typeof r.landed === 'object') {
        await this.land(uri, (r.landed as { edits?: WorkspaceEdit | null }).edits ?? null, held);
      }
      return undefined;
    }
    if (o.kind === 'cancelled') {
      // a Cancel click or the server's own cancel forgets the step and says so; a stop or a
      // restart dropped every step and closed the window, so it is the stale case above
      if (o.why === 'user' || o.why === 'server') {
        this.forget(uri);
        void this.d.say('info', CANCELLED);
      }
      return undefined;
    }
    if (o.kind === 'error') {
      if (choice === 'harder' && !GONE.some(g => o.message.startsWith(g))) return o.message;
      this.forget(uri);
      void this.d.say('error', o.message);
      return undefined;
    }
    await this.answered(params, o.value, held);
    return undefined;
  }

  // answered: the one branch point is the answer's shape (conjure.lua answered)
  private async answered(params: ConjureParams, v: ConjureResult, held: HeldStep | undefined): Promise<void> {
    const uri = params.textDocument.uri;
    const r = v as { shown?: unknown; landed?: unknown; rejected?: unknown };
    if (r.shown !== null && typeof r.shown === 'object') {
      const shown = r.shown as Shown;
      const version = docOf(uri)?.version ?? 0;
      this.d.steps.set({ uri, shown, position: params.position, version, lines: stepLines(uri, shown, params.position, sameUri) });
      this.window?.showStep(uri);
      return;
    }
    this.forget(uri);
    if (r.rejected === true) {
      void this.d.say('info', 'step rejected · nothing landed');
      return;
    }
    if (r.landed === null || typeof r.landed !== 'object') {
      void this.d.say('error', NO_ANSWER);
      return;
    }
    await this.land(uri, (r.landed as { edits?: WorkspaceEdit | null }).edits ?? null, held);
  }

  // land: the step's edits (one undo step a file, refused whole if a document moved), the
  // flash, the after-run marked, landed fired, one line said
  private async land(uri: string, edits: WorkspaceEdit | null, held: HeldStep | undefined): Promise<void> {
    let written = 'nothing changed';
    if (edits) {
      const lc = this.d.server.client();
      if (!lc) {
        void this.d.say('error', NOT_RUNNING);
        return;
      }
      const doc = docOf(uri);
      const before = doc?.getText().split('\n');
      let counts = { saved: 0, unsaved: 0 };
      const done = await applyServerEdit(lc, { label: 'conjure', edit: edits }, () => undefined, (saved, unsaved, kept) => {
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
    const after = held?.shown.after;
    if (after !== null && after !== undefined && typeof after === 'object') this.d.tests.show(after, false);
    this.d.landed.fire('conjure');
    void this.d.say('info', stepLanded(held?.shown.goal, written));
  }

  private forget(uri: string): void {
    this.d.steps.drop(uri);
    this.window?.closeStep(uri);
  }

  // flash: the changed lines for half a second; the cursor to the first, when its editor is active
  private flash(doc: vscode.TextDocument, before: string[]): void {
    const span = changedSpan(before, doc.getText().split('\n'));
    if (!span) return;
    this.d.flashes.push(span);
    const range = new vscode.Range(span.first, 0, span.last, 0);
    const eds = vscode.window.visibleTextEditors.filter(e => e.document === doc);
    for (const e of eds) e.setDecorations(this.flashed, [range]);
    setTimeout(() => { for (const e of eds) e.setDecorations(this.flashed, []); }, 500);
    const active = vscode.window.activeTextEditor;
    if (active?.document !== doc) return;
    const at = new vscode.Position(span.first, doc.lineAt(span.first).firstNonWhitespaceCharacterIndex);
    active.selection = new vscode.Selection(at, at);
    active.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}
