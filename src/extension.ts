import * as os from 'node:os';
import * as vscode from 'vscode';
import { ActionLog, logDir } from './actionLog';
import { Actions } from './actions/command';
import { registerNotYet } from './commands';
import { registerMigration } from './migrationCommand';
import { errorMessage } from './errors';
import { Generate } from './generate/command';
import { DoctorSection, report } from './health';
import { Hints } from './hints';
import { Plans } from './land';
import { PauseController, SourceKind } from './pause/controller';
import { PausePanel } from './pause/panel';
import { Reminders } from './pause/reminder';
import { Reviews } from './pause/review';
import type { FromPage, View } from './pause/viewModel';
import { EnterRule } from './plans/enterRule';
import { PlanLayer, PlanViewApi } from './plans/layer';
import { onPlansOptions, readPlansOptions } from './plans/options';
import { PlanDocs } from './plans/planDocs';
import { trackIsPlan } from './plans/trackIsPlan';
import { discover, trackProjects } from './projects';
import { quickInputUi } from './quickInput';
import { findRoot } from './root';
import type { MutateSurvivor, TestsRunResult } from './protocol';
import { ClientHooks, Say, Server } from './server';
import { newFlights } from './tdd/common';
import { Conjure } from './tdd/conjure';
import { Jump } from './tdd/jump';
import { Marks } from './tdd/marks';
import { Mutate } from './tdd/mutate';
import { Stub } from './tdd/stub';
import { Survivors } from './tdd/survivors';
import { Tests } from './tdd/tests';
import type { Ui } from './uiTypes';
import { Suggest } from './suggest/editor';
import { VirtualDocs } from './virtualDocs';

export interface TddApi {
  last(): TestsRunResult | undefined;
  cancel(): void;
  flashes: { first: number; last: number }[];
  survivors(uri: string): MutateSurvivor[];
}

// the pause window (M5): its view and source, a key or page message played as if sent, a
// document's pause and reminder, the footer notices said (the e2e tests read them)
export interface PauseApi {
  view(): View | undefined;
  source(): SourceKind | undefined;
  press(key: string): Promise<void>;
  receive(m: FromPage): Promise<void>;
  stored(uri: string): boolean;
  reminders(uri: string): number;
  notices(): string[];
  // a review opened as the lens opens it
  open(uri: string, id: string, entry?: string): Promise<void>;
}

export interface Api {
  server: Server;
  health(): Promise<string[]>;
  // every notification the extension showed, in order (the e2e tests read it)
  shown: { level: string; text: string }[];
  inProject(): boolean;
  // the e2e suites answer the quick inputs with a fake; undefined puts VS Code's back
  setUi(ui: Ui | undefined): void;
  // the UI the commands use now
  ui(): Ui;
  plans: Plans;
  // ghost text and snippets: the controller's state and the fills (the e2e tests read them)
  suggest: Suggest;
  // the TDD loop (M4): the last run's answer, a Cancel click on every request in the air, the
  // conjure flashes, a document's survivors (the e2e tests read them)
  tdd: TddApi;
  // the pause window (M5)
  pause: PauseApi;
  // the active editor shows a plan (durandal.isPlan)
  isPlan(): boolean;
  // the plans reading layer (M6a): a plan's reading, what it shows, whether it was entered
  planView: PlanViewApi;
}

let server: Server | undefined;

export function activate(context: vscode.ExtensionContext): Api {
  const output = vscode.window.createOutputChannel('Durandal', { log: true });
  context.subscriptions.push(output);
  const shown: Api['shown'] = [];
  const say: Say = (level, text, ...actions) => {
    shown.push({ level, text });
    output.appendLine(`${level}: ${text}`);
    if (level === 'info') return vscode.window.showInformationMessage(text, ...actions);
    if (level === 'warn') return vscode.window.showWarningMessage(text, ...actions);
    return vscode.window.showErrorMessage(text, ...actions);
  };
  const hooks: ClientHooks = {};
  const s = new Server(output, say, hooks);
  server = s;
  const docs = new VirtualDocs();
  docs.register(context);
  const realUi = quickInputUi(say);
  let testUi: Ui | undefined;
  const ui = (): Ui => testUi ?? realUi;
  const plans = new Plans({ server: s, docs, say });
  const log = new ActionLog({
    dir: () => logDir(process.env, os.homedir()),
    enabled: () => vscode.workspace.getConfiguration('durandal').get<boolean>('actionLog', true),
    warn: m => output.warn(m),
  });
  const hints = new Hints({ server: s, log });
  hints.register(context);
  hooks.hints = hints;
  // before Suggest, which asks it whether the cursor's file is in a project
  const projects = trackProjects(context, s);
  const suggest = new Suggest({ server: s, log, say, warn: m => output.warn(m), hints, inProject: () => projects.inProject(), plans, ui });
  suggest.register(context);
  hooks.suggest = suggest.inline;
  hooks.suggestion = p => suggest.pushed(p);
  const generate = new Generate({ server: s, docs, plans, log, state: context.workspaceState, ui });
  generate.register(context);
  new Actions({ server: s, plans, generate, log, ui, say, recognition: suggest.recognitions }).register(context);
  registerMigration(context, { server: s, docs, ui });

  // the TDD loop (M4 spec §2); a server stop cancels its requests (spec §6)
  const flights = newFlights();
  const marks = new Marks();
  marks.register(context);
  const stub = new Stub({ server: s, say });
  stub.register(context);
  const survivors = new Survivors({ server: s, say, ui, marks, stub });
  survivors.register(context);
  const mutate = new Mutate({ server: s, say, marks, flights, survivors });
  mutate.register(context);
  const tests = new Tests({ server: s, docs, say, marks, flights, recheck: uri => void mutate.recheck(uri) });
  tests.register(context);
  new Jump({ server: s, say }).register(context);
  const flashes: { first: number; last: number }[] = [];
  const conjure = new Conjure({ server: s, say, ui, flights, tests, flashes });
  conjure.register(context);
  // the pause window (M5 spec §2): the panel knows nothing of conjure; the controller decides
  const reminders = new Reminders();
  reminders.register(context);
  // the panel needs the controller and the controller the panel: the holder breaks the cycle
  const hold: { c?: PauseController } = {};
  const panel = new PausePanel({
    extensionUri: context.extensionUri,
    receive: m => void hold.c?.receive(m),
    closed: () => hold.c?.closed(),
  });
  context.subscriptions.push({ dispose: () => panel.close() });
  const ctl = new PauseController({ server: s, say, ui, docs, panel, reminders, conjure, platform: process.platform });
  hold.c = ctl;
  ctl.register(context);
  conjure.setSink(ctl);
  // the reviews (M5b spec §5): the push after a do, the lens, the chord p r
  const reviews = new Reviews({ server: s, say, controller: ctl });
  reviews.register(context);
  hooks.reviewReady = p => reviews.ready(p);
  // plans (M6): durandal.plans.*, the one plan check, durandal.isPlan, the reading layer
  let plansOptions = readPlansOptions();
  const planDocs = new PlanDocs(() => plansOptions.dir);
  const layer = new PlanLayer({ docs: planDocs, options: plansOptions, say, warn: m => output.warn(m) });
  layer.register(context);
  hooks.reading = layer;
  // the Enter rule follows durandal.isPlan (spec §3.5)
  const enterRule = new EnterRule();
  context.subscriptions.push(enterRule);
  const plansTracked = trackIsPlan(context, planDocs, yes => enterRule.set(yes));
  onPlansOptions(context, o => {
    plansOptions = o;
    layer.options(o);
    plansTracked.refresh();
  });
  const pause: PauseApi = {
    view: () => ctl.view(),
    source: () => ctl.source(),
    press: k => ctl.press(k),
    receive: m => ctl.receive(m),
    stored: uri => !!ctl.store.get(uri),
    reminders: uri => reminders.count(uri),
    notices: () => ctl.notices(),
    open: (uri, id, entry) => reviews.open(uri, id, entry),
  };
  const tdd: TddApi = {
    last: () => tests.last,
    cancel: () => flights.cancelAll('user'),
    flashes,
    survivors: uri => marks.memory.survivors(uri),
  };
  hooks.stopped = () => {
    suggest.controller.stopped();
    flights.cancelAll('stopped');
    ctl.stopped();
    layer.stopped();
  };
  hooks.progress = (token, v) => ctl.progress(token, v);

  // health: the binary, the server, the projects, and olifant doctor for the active file's project
  const health = async (): Promise<string[]> => {
    const gate = await s.checkGate();
    const doc = vscode.window.activeTextEditor?.document;
    const root = doc && doc.uri.scheme === 'file' ? await findRoot(doc.uri.fsPath) : undefined;
    let doctor: DoctorSection | undefined;
    if (doc && root && s.client()) {
      try {
        doctor = { root, result: await s.doctor(doc.uri) };
      } catch (err) {
        doctor = { root, error: errorMessage(err) };
      }
    }
    return report(gate, s.state(), s.roots(), doctor);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('durandal.showHealth', async () => {
      const lines = await health();
      output.appendLine(`--- Durandal health ${new Date().toISOString()}`);
      for (const line of lines) output.appendLine(line);
      output.show(true);
    }),
    vscode.commands.registerCommand('durandal.restartServer', () => s.restart()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (['path', 'debounceMs', 'model', 'fills'].some(k => e.affectsConfiguration(`durandal.${k}`))) {
        void say('info', 'Durandal: run Durandal: Restart Server to apply the new setting');
      }
    }),
  );
  registerNotYet(context, say);
  void (async () => {
    for (const r of await discover()) await s.addRoot(r);
    if (s.roots().length > 0) await s.start();
  })();
  return { server: s, health, shown, inProject: projects.inProject, setUi: u => { testUi = u; }, ui, plans, suggest, tdd, pause, isPlan: plansTracked.isPlan, planView: layer.api() };
}

export async function deactivate(): Promise<void> {
  await server?.stop();
}
