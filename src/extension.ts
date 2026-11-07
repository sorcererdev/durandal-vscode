import * as vscode from 'vscode';
import { registerNotYet } from './commands';
import { errorMessage } from './errors';
import { DoctorSection, report } from './health';
import { Plans } from './land';
import { discover, trackProjects } from './projects';
import { quickInputUi } from './quickInput';
import { findRoot } from './root';
import { Say, Server } from './server';
import type { Ui } from './uiTypes';
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
  const s = new Server(output, say);
  server = s;
  const docs = new VirtualDocs();
  docs.register(context);
  const realUi = quickInputUi(say);
  let testUi: Ui | undefined;
  const ui = (): Ui => testUi ?? realUi;
  const plans = new Plans({ server: s, docs, say });

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
  return { server: s, health, shown, inProject: projects.inProject, setUi: u => { testUi = u; }, ui, plans };
}

export async function deactivate(): Promise<void> {
  await server?.stop();
}
