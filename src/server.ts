import * as os from 'node:os';
import * as vscode from 'vscode';
import {
  CloseAction, DidChangeWorkspaceFoldersNotification, ErrorAction, ExecuteCommandRequest,
  LanguageClient, LanguageClientOptions, NotificationType, RequestParam, RequestType, ServerOptions,
} from 'vscode-languageclient/node';
import { applyServerEdit } from './applyEdit';
import { checkBinary, Gate, ServerState, STOPPED } from './health';
import { DoctorResult, SERVER_COMMANDS } from './protocol';
import { realRoot } from './root';
import { initOptions, settingsFrom } from './settings';

export type Say = (level: 'info' | 'warn' | 'error', text: string, ...actions: string[]) => Thenable<string | undefined>;

export const NOT_RUNNING = 'olifant lsp is not running here (Durandal: Show Health)';

// OlifantClient keeps the library's forced notifications out of a start: the extension reports
// a failed start itself, once. They still reach the output channel.
class OlifantClient extends LanguageClient {
  quiet = true;
  override error(message: string, data?: unknown, showNotification: boolean | 'force' = true): void {
    super.error(message, data, this.quiet ? false : showNotification);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(what)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// Server is the window's one olifant lsp (durandal.nvim's one client per session). Every
// Olifant project the window holds is one of its workspace folders: VS Code's folders go in
// initialize; the projects found under them, and those of files opened from elsewhere, follow
// with workspace/didChangeWorkspaceFolders.
export class Server {
  private lc: OlifantClient | undefined;
  private starting: Promise<boolean> | undefined;
  private st: ServerState = 'not started';
  private gate: Gate | undefined;
  private reported = false;
  private stopping = false;
  private known = new Set<string>();
  private sent = new Set<string>();

  constructor(private readonly output: vscode.LogOutputChannel, private readonly say: Say) {}

  state(): ServerState { return this.st; }
  roots(): string[] { return [...this.known]; }
  client(): LanguageClient | undefined { return this.st === 'running' ? this.lc : undefined; }

  async checkGate(): Promise<Gate> {
    if (!this.gate) {
      const setting = vscode.workspace.getConfiguration('durandal').get<string>('path', 'olifant');
      this.gate = await checkBinary(setting, process.env, os.homedir());
    }
    return this.gate;
  }

  // addRoot records a project (by real path); a running server hears of it at once.
  async addRoot(root: string): Promise<void> {
    this.known.add(await realRoot(root));
    if (this.st === 'running') await this.sendFolders();
  }

  // sendFolders tells the server of the projects it has not heard of: neither sent since it
  // started nor one of VS Code's own folders (sent in initialize). All compared by real path.
  private async sendFolders(): Promise<void> {
    const lc = this.lc;
    if (!lc) return;
    const vsFolders = new Set(await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).filter(f => f.uri.scheme === 'file').map(f => realRoot(f.uri.fsPath))));
    if (this.lc !== lc) return;
    const added = [...this.known].filter(r => !this.sent.has(r) && !vsFolders.has(r));
    for (const r of added) this.sent.add(r);
    if (added.length === 0) return;
    void lc.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
      event: { added: added.map(r => ({ uri: vscode.Uri.file(r).toString(), name: r })), removed: [] },
    });
  }

  // reportOnce is the one error notification per failure until the next restart.
  private reportOnce(text: string, ...actions: string[]): void {
    if (this.reported) return;
    this.reported = true;
    void this.say('error', text, ...actions).then(pick => {
      if (pick === 'Show Health') void vscode.commands.executeCommand('durandal.showHealth');
      if (pick === 'Restart Server') void vscode.commands.executeCommand('durandal.restartServer');
      if (pick === 'Open Settings') void vscode.commands.executeCommand('workbench.action.openSettings', 'durandal.path');
    });
  }

  // start starts the server once; false when the binary failed its check or the start failed.
  start(): Promise<boolean> {
    if (!this.starting) this.starting = this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<boolean> {
    const gate = await this.checkGate();
    if (!gate.ok || !gate.path) {
      this.st = 'failed';
      this.reportOnce(gate.problem ?? 'olifant: the binary failed its check', 'Open Settings', 'Show Health');
      return false;
    }
    this.st = 'starting';
    const config = vscode.workspace.getConfiguration('durandal');
    const settings = settingsFrom((k, fallback) => config.get(k, fallback));
    const serverOptions: ServerOptions = { command: gate.path, args: ['lsp'], options: { env: { ...process.env } } };
    // made.lc is set before start(); the server sends no workspace/applyEdit before that.
    const made: { lc?: OlifantClient } = {};
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file' }],
      initializationOptions: initOptions(settings, process.platform),
      outputChannel: this.output,
      // a failed initialize is reported by the start failure below, not by the library
      initializationFailedHandler: () => false,
      middleware: {
        workspace: {
          // the server's edits take durandal.nvim's path, not the library's (no refactor preview)
          handleApplyEdit: params => made.lc
            ? applyServerEdit(made.lc, params, text => void this.say('info', text))
            : { applied: false, failureReason: NOT_RUNNING },
        },
      },
      errorHandler: {
        error: err => {
          this.output.error(`olifant lsp: connection error: ${err.message}`);
          return { action: ErrorAction.Continue, handled: true };
        },
        closed: () => {
          if (!this.stopping && this.st === 'running') {
            this.st = 'stopped';
            this.reportOnce(STOPPED, 'Show Health', 'Restart Server');
          }
          return { action: CloseAction.DoNotRestart, handled: true };
        },
      },
    };
    const lc = new OlifantClient('durandal', 'Durandal (olifant lsp)', serverOptions, clientOptions);
    made.lc = lc;
    this.lc = lc;
    try {
      await lc.start();
    } catch (err) {
      lc.quiet = false;
      const message = err instanceof Error ? err.message : String(err);
      this.output.error(`olifant lsp failed to start: ${message}`);
      if (this.lc === lc) {
        this.lc = undefined;
        this.st = 'failed';
      }
      if (!this.stopping) this.reportOnce(`olifant lsp failed to start: ${message}`, 'Show Health', 'Restart Server');
      return false;
    }
    lc.quiet = false;
    this.st = 'running';
    this.sent.clear();
    await this.sendFolders();
    return true;
  }

  // stop disposes the client (its features, and the olifant.doctor command it registered).
  async stop(): Promise<void> {
    const lc = this.lc;
    const starting = this.starting;
    this.lc = undefined;
    this.starting = undefined;
    if (lc) {
      this.stopping = true;
      try {
        await starting;
        await lc.dispose().catch(() => undefined);
      } finally {
        this.stopping = false;
      }
    }
    this.st = 'not started';
  }

  // restart forgets the gate and the reported failure, and starts again.
  async restart(): Promise<void> {
    await this.stop();
    this.gate = undefined;
    this.reported = false;
    await this.start();
  }

  async request<P, R>(type: RequestType<P, R, void>, params: RequestParam<P>, token?: vscode.CancellationToken): Promise<R> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    return token ? lc.sendRequest(type, params, token) : lc.sendRequest(type, params);
  }

  async notify<P>(type: NotificationType<P>, params: RequestParam<P>): Promise<void> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    await lc.sendNotification(type, params);
  }

  // doctor is olifant doctor for the project of uri (the server never runs tests for it).
  async doctor(uri: vscode.Uri): Promise<DoctorResult> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    const r = await withTimeout(
      lc.sendRequest(ExecuteCommandRequest.type, { command: SERVER_COMMANDS.doctor, arguments: [uri.toString()] }),
      15_000, 'olifant doctor took longer than 15 s');
    return r as DoctorResult;
  }
}
