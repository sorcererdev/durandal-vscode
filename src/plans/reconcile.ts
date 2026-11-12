import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import type { Landed } from '../landed';
import { Olifant } from '../protocol';
import { NOT_RUNNING, Say, Server } from '../server';
import { planHere } from './here';
import type { PlanDocs } from './planDocs';
import { Answer, Scheduler } from './scheduler';
import type { PlansOptions } from './settings';
import { NO_PLAN } from './words';

export interface ReconcileDeps {
  server: Server; say: Say; planDocs: PlanDocs; options: () => PlansOptions; landed: Landed;
  // the reconcile's readings in the review window (M5b's Reviews.open(uri, 'reconcile'))
  review(uri: string): Promise<void>;
  now?: () => number;
}

export interface PlanReconcileApi {
  // a reconcile of the plan is in the air
  inFlight(uri: string): boolean;
  // a save elsewhere is waiting its second
  saving(): boolean;
}

// the server's own edits during a reconcile (lsp.lua :44-51)
const OWN = new Set(['Olifant: reconcile', 'Olifant: journal']);
// a save elsewhere reconciles the shown plans this long after the last one (plans.lua :310-322)
const SAVED_MS = 1000;

const keyOf = (uri: string) => vscode.Uri.parse(uri).toString();
const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === keyOf(uri));

// Flight: a reconcile in the air; gone: its answer is not wanted (cancelled, plan closed, stopped)
interface Flight { cts: vscode.CancellationTokenSource; gone: boolean }

// PlanReconcile: the scheduler's shell (M6 spec §5.2). p c forces one (its readings open the
// review); in auto mode entering a plan, anything landing, and a save elsewhere reconcile too.
export class PlanReconcile {
  private readonly sched: Scheduler;
  private readonly flights = new Map<string, Flight>();
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly d: ReconcileDeps) {
    this.sched = new Scheduler(d.now ?? Date.now);
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      // not awaited: the command returns at once, the reconcile goes on (a held one, a second p c)
      vscode.commands.registerCommand('durandal.plan.reconcile', () => { void this.forced(); }),
      vscode.window.onDidChangeActiveTextEditor(ed => void this.entered(ed)),
      this.d.landed.event(() => void this.landedElsewhere()),
      vscode.workspace.onDidSaveTextDocument(doc => void this.saved(doc)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      { dispose: () => clearTimeout(this.saveTimer) },
    );
  }

  api(): PlanReconcileApi {
    return { inFlight: uri => this.sched.inFlight(keyOf(uri)), saving: () => this.saveTimer !== undefined };
  }

  private auto(): boolean { return this.d.options().reconcile === 'auto'; }

  // forced: p c on the active plan
  async forced(): Promise<void> {
    const h = await planHere(this.d.planDocs);
    if (!h) {
      void this.d.say('error', NO_PLAN);
      return;
    }
    await this.run(h.uri, true);
  }

  // entered: a plan became the active editor, or a client started with one active (nvim BufEnter,
  // LspAttach); not again within a second of the last start
  async entered(ed: vscode.TextEditor | undefined = vscode.window.activeTextEditor): Promise<void> {
    if (!ed || !this.auto() || !(await this.d.planDocs.is(ed.document))) return;
    const uri = ed.document.uri.toString();
    if (this.sched.recent(uri)) return;
    await this.run(uri, false);
  }

  // landedElsewhere: something landed; every open plan reconciles, shown or not
  private async landedElsewhere(): Promise<void> {
    if (!this.auto()) return;
    for (const doc of [...vscode.workspace.textDocuments]) {
      if (await this.d.planDocs.is(doc)) void this.run(doc.uri.toString(), false);
    }
  }

  // saved: a file that is not a plan was saved; a second after the last such save, the plans
  // shown in an editor reconcile (the engine reads files as saved; a hidden plan waits)
  private async saved(doc: vscode.TextDocument): Promise<void> {
    if (!this.auto() || await this.d.planDocs.is(doc)) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      if (!this.auto()) return;
      void this.shown();
    }, SAVED_MS);
  }

  private async shown(): Promise<void> {
    const seen = new Set<string>();
    for (const ed of vscode.window.visibleTextEditors) {
      const uri = ed.document.uri.toString();
      if (seen.has(uri)) continue;
      seen.add(uri);
      if (await this.d.planDocs.is(ed.document)) void this.run(uri, false);
    }
  }

  // run: reconcile the plan URI (FORCED: p c); one at a time per plan, the rest remembered
  async run(uri: string, forced: boolean): Promise<void> {
    const doc = openDoc(uri);
    if (!doc) return;
    const key = doc.uri.toString();
    const go = this.sched.start(key, forced, !!this.d.server.client(), doc.version);
    if (go === 'notRunning') void this.d.say('error', NOT_RUNNING);
    if (go !== 'send') return;
    const f: Flight = { cts: new vscode.CancellationTokenSource(), gone: false };
    this.flights.set(key, f);
    let a: Answer;
    try {
      a = { result: await this.d.server.request(Olifant.plansReconcile, { textDocument: { uri: key }, forced }, f.cts.token) };
    } catch (err) {
      a = { error: { code: (err as { code?: number } | undefined)?.code, message: errorMessage(err) } };
    } finally {
      f.cts.dispose();
      if (this.flights.get(key) === f) this.flights.delete(key);
    }
    if (f.gone) return;
    const now = openDoc(key);
    if (!now) {
      this.sched.forget(key);
      return;
    }
    const o = this.sched.answer(key, a, now.version);
    if (o.say) void this.d.say(o.say.level, o.say.text);
    if (o.open) void this.d.review(key);
    if (o.again !== undefined) void this.run(key, o.again);
  }

  // applied: a server edit applied; the reconcile's own (and the journal's) moves its plan's
  // version on, so it does not count as the plan moving
  applied(label: string | undefined, uris: vscode.Uri[]): void {
    if (!label || !OWN.has(label)) return;
    for (const u of uris) {
      const doc = openDoc(u.toString());
      if (doc) this.sched.ownEdit(doc.uri.toString(), doc.version);
    }
  }

  // cancel: the reconcile in the air on URI, and the one remembered (Plan: Cancel); true if one was
  cancel(uri: string): boolean {
    const key = keyOf(uri);
    const f = this.flights.get(key);
    this.sched.cancel(key);
    if (!f) return false;
    f.gone = true;
    f.cts.cancel();
    this.flights.delete(key);
    return true;
  }

  // a closed plan's reconcile says nothing; its state goes
  private closed(uri: string): void {
    const f = this.flights.get(uri);
    if (f) {
      f.gone = true;
      this.flights.delete(uri);
    }
    this.sched.forget(uri);
  }

  // the server stopped: nothing it said stands (spec §5.7)
  stopped(): void {
    for (const f of this.flights.values()) f.gone = true;
    this.flights.clear();
    this.sched.clear();
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
  }
}
