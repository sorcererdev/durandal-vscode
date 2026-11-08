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
import { discover, trackProjects } from './projects';
import { quickInputUi } from './quickInput';
import { findRoot } from './root';
import { ClientHooks, Say, Server } from './server';
import type { Ui } from './uiTypes';
import { Suggest } from './suggest/editor';
import { VirtualDocs } from './virtualDocs';

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
  const suggest = new Suggest({ server: s, log, say });
  suggest.register(context);
  hooks.suggest = suggest.inline;
  const generate = new Generate({ server: s, docs, plans, log, state: context.workspaceState, ui });
  generate.register(context);
  new Actions({ server: s, plans, generate, log, ui, say }).register(context);
  registerMigration(context, { server: s, docs, ui });

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
  const projects = trackProjects(context, s);
  void (async () => {
    for (const r of await discover()) await s.addRoot(r);
    if (s.roots().length > 0) await s.start();
  })();
  return { server: s, health, shown, inProject: projects.inProject, setUi: u => { testUi = u; }, ui, plans, suggest };
}

export async function deactivate(): Promise<void> {
  await server?.stop();
}
