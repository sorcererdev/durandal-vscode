import * as os from 'node:os';
import * as vscode from 'vscode';
import {
  CloseAction, CodeActionResolveRequest, DidChangeWorkspaceFoldersNotification, ErrorAction, ExecuteCommandRequest,
  InlineCompletionRequest, LanguageClient, LanguageClientOptions, NotificationType, RequestParam, RequestType, ServerOptions,
} from 'vscode-languageclient/node';
import { applyServerEdit } from './applyEdit';
import { checkBinary, Gate, ServerState, STOPPED } from './health';
import type { ProgressValue } from './pause/progress';
import { planTaps, type ReadingHooks } from './plans/taps';
import { DoctorResult, InlineItem, Olifant, ReviewReady, SERVER_COMMANDS, Suggestion } from './protocol';
import { realRoot } from './root';
import { initOptions, settingsFrom } from './settings';

export type Say = (level: 'info' | 'warn' | 'error', text: string, ...actions: string[]) => Thenable<string | undefined>;

export const NOT_RUNNING = 'olifant lsp is not running here (Durandal: Show Health)';

// The command a lightbulb action resolved by the server runs: its edit through applyServerEdit
// (arguments: the action's title, the server's WorkspaceEdit). Registered by actions/command.ts.
export const APPLY_RESOLVED = 'durandal.applyResolvedEdit';

// ClientHooks are what other parts of the extension put into the client's middleware.
export interface ClientHooks {
  // ⚡ hints (spec §6): off draws none; on, shown hears the lines drawn (for the action log);
  // none on hiddenLine, where a suggestion's ⚡ stands instead (M3 spec §2)
  hints?: { enabled(): boolean; shown(uri: string, lines: number[]): void; hiddenLine(uri: string): number | undefined };
  // ghost text and snippets (M3 spec §3.1/3.2): the inline item gated and given the fill
  // command (the middleware asks the server itself: the library drops olifant's data and
  // ghost; an answer after token's cancellation is dropped); the completion list's snippets
  // given the same command; resolved bodies stashed
  suggest?: {
    inline(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken, fetch: () => Promise<InlineItem[]>): Promise<vscode.InlineCompletionItem[]>;
    completions(document: vscode.TextDocument, items: vscode.CompletionItem[]): void;
    resolved(item: vscode.CompletionItem, resolved: vscode.CompletionItem): void;
  };
  // plan ghost blocks (M7 spec §3.2): the cursor row's ghost as an inline item; undefined when
  // the row has no ghost (the suggestions' path then runs)
  planGhost?: { item(document: vscode.TextDocument, position: vscode.Position): vscode.InlineCompletionItem[] | undefined };
  // olifant/suggestion: what follows the last edit, pushed (M3 spec §3.3)
  suggestion?(s: Suggestion): void;
  // the server's work-done progress, every begin, report and end the library shows (M5 spec
  // §3.6): the pause window claims a resume's
  progress?(token: string | number, v: ProgressValue): void;
  // olifant/plans/review/ready: a do's review is waiting (sent before the do's own answer)
  reviewReady?(p: ReviewReady): void;
  // the server stopped (a stop, a restart, or its client closed): nothing it said stands
  stopped?(): void;
  // plans (M6 spec §3.2): the server's tokens, folds and lenses of a plan, copied as they pass
  reading?: ReadingHooks;
  // a server edit (workspace/applyEdit) applied: its label and files (the reconcile hears its own)
  applied?(label: string | undefined, uris: vscode.Uri[]): void;
  // a client started running, its folders sent (nvim's LspAttach: an active plan reconciles)
  started?(): void;
}

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
  // gen is the current start's generation: stop() bumps it, and a start of an older one
  // gives up (and disposes any client it made). disposed settles once every client stop()
  // took away is disposed: a new client waits for it (the old one holds olifant.doctor).
  private gen = 0;
  private disposed: Promise<unknown> = Promise.resolve();
  private known = new Set<string>();
  private sent = new Set<string>();

  constructor(private readonly output: vscode.LogOutputChannel, private readonly say: Say, private readonly hooks: ClientHooks = {}) {}

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
    lc.sendNotification(DidChangeWorkspaceFoldersNotification.type, {
      event: { added: added.map(r => ({ uri: vscode.Uri.file(r).toString(), name: r })), removed: [] },
    }).catch((err: Error) => this.output.error(`olifant lsp: sending workspace folders failed: ${err.message}`));
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
    if (!this.starting) this.starting = this.doStart(this.gen);
    return this.starting;
  }

  private async doStart(gen: number): Promise<boolean> {
    // the disposals before this start (not a later stop's, which waits on this start)
    const prior = this.disposed;
    const gate = await this.checkGate();
    await prior;
    if (gen !== this.gen) return false;
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
    const hooks = this.hooks;
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file' }],
      initializationOptions: initOptions(settings, process.platform),
      outputChannel: this.output,
      // a failed initialize is reported by the start failure below, not by the library
      initializationFailedHandler: () => false,
      middleware: {
        // the plan reading layer's taps: answers pass through untouched (M6 spec §3.2)
        ...planTaps(() => hooks.reading, () => made.lc?.initializeResult?.capabilities.semanticTokensProvider?.legend,
          m => this.output.warn(m)),
        workspace: {
          // the server's edits take durandal.nvim's path, not the library's (no refactor preview)
          handleApplyEdit: params => made.lc
            ? applyServerEdit(made.lc, params, text => void this.say('info', text), undefined, (label, uris) => hooks.applied?.(label, uris))
            : { applied: false, failureReason: NOT_RUNNING },
        },
        // a code action picked from the lightbulb (Ctrl+.): resolved here so the server's edit
        // keeps its versions, then applied durandal.nvim's way (refused if stale, files saved,
        // no refactor preview) by APPLY_RESOLVED instead of by VS Code (spec §4)
        resolveCodeAction: async (item, token, next) => {
          const lc = made.lc;
          if (!lc) return next(item, token);
          const raw = await lc.sendRequest(CodeActionResolveRequest.type, await lc.code2ProtocolConverter.asCodeAction(item, token), token);
          const out = await lc.protocol2CodeConverter.asCodeAction(raw, token);
          if (!out || !raw?.edit) return out ?? item;
          out.edit = undefined;
          out.command = { title: raw.title, command: APPLY_RESOLVED, arguments: [raw.title, raw.edit] };
          return out;
        },
        provideInlayHints: async (document, viewPort, token, next) => {
          const h = hooks.hints;
          if (h && !h.enabled()) return [];
          const uri = document.uri.toString();
          const hidden = h?.hiddenLine(uri);
          const hints = ((await next(document, viewPort, token)) ?? []).filter(x => x.position.line !== hidden);
          h?.shown(uri, hints.map(x => x.position.line));
          return hints;
        },
        provideInlineCompletionItems: async (document, position, context, token, next) => {
          const ghost = hooks.planGhost?.item(document, position);
          if (ghost) return ghost;
          const s = hooks.suggest;
          const lc = made.lc;
          if (!s || !lc) return next(document, position, context, token);
          return s.inline(document, position, context, token, async () => {
            const r = await lc.sendRequest(InlineCompletionRequest.type,
              lc.code2ProtocolConverter.asInlineCompletionParams(document, position, context), token);
            if (!r) return [];
            return (Array.isArray(r) ? r : r.items) as unknown as InlineItem[];
          });
        },
        provideCompletionItem: async (document, position, context, token, next) => {
          const r = await next(document, position, context, token);
          if (r && hooks.suggest) hooks.suggest.completions(document, Array.isArray(r) ? r : r.items);
          return r;
        },
        // the resolved item is a new one: it keeps the fill command completions gave the item,
        // and a snippet's filled body is stashed for that command (VS Code would insert it)
        resolveCompletionItem: async (item, token, next) => {
          const r = await next(item, token);
          if (r && !r.command && item.command) r.command = item.command;
          if (r && hooks.suggest) hooks.suggest.resolved(item, r);
          return r;
        },
        // seen, then shown by the library as before (its status-bar progress)
        handleWorkDoneProgress: (token, params, next) => {
          // a hook that throws must not strand the library's own progress
          try {
            hooks.progress?.(token, params);
          } finally {
            next(token, params);
          }
        },
      },
      errorHandler: {
        error: err => {
          this.output.error(`olifant lsp: connection error: ${err.message}`);
          return { action: ErrorAction.Continue, handled: true };
        },
        closed: () => {
          // only the current client's close is a failure: stop() takes it away before disposing
          if (this.lc === made.lc && this.st === 'running') {
            this.st = 'stopped';
            this.hooks.stopped?.();
            this.reportOnce(STOPPED, 'Show Health', 'Restart Server');
          }
          return { action: CloseAction.DoNotRestart, handled: true };
        },
      },
    };
    const lc = new OlifantClient('durandal', 'Durandal (olifant lsp)', serverOptions, clientOptions);
    made.lc = lc;
    lc.onNotification(Olifant.suggestion.method, (p: Suggestion) => hooks.suggestion?.(p));
    lc.onNotification(Olifant.plansReviewReady.method, (p: ReviewReady) => hooks.reviewReady?.(p));
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
      if (gen === this.gen) this.reportOnce(`olifant lsp failed to start: ${message}`, 'Show Health', 'Restart Server');
      return false;
    }
    lc.quiet = false;
    if (gen !== this.gen) {
      // stopped while starting: stop() disposed it already, or will; make sure
      await lc.dispose().catch(() => undefined);
      return false;
    }
    this.st = 'running';
    this.sent.clear();
    await this.sendFolders();
    if (gen === this.gen) this.hooks.started?.();
    return true;
  }

  // stop disposes the client (its features, and the olifant.doctor command it registered).
  // Safe to call while a start is under way, and concurrently with other stops and restarts.
  async stop(): Promise<void> {
    this.gen++;
    const lc = this.lc;
    const starting = this.starting;
    this.lc = undefined;
    this.starting = undefined;
    this.st = 'not started';
    this.hooks.stopped?.();
    this.disposed = Promise.all([
      this.disposed,
      lc?.dispose().catch(() => undefined),
      starting?.catch(() => false),
    ]);
    await this.disposed;
  }

  // restart forgets the gate and the reported failure, and starts again.
  async restart(): Promise<void> {
    await this.stop();
    this.gate = undefined;
    this.reported = false;
    await this.start();
  }

  // request and notify send by the type's method name: the library checks a type object's
  // parameter structure by identity, so a type made by another copy of the protocol module
  // (the e2e tests', outside this bundle) would be refused. Every Olifant type is `auto`.
  async request<P, R>(type: RequestType<P, R, void>, params: RequestParam<P>, token?: vscode.CancellationToken): Promise<R> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    return token ? lc.sendRequest<R>(type.method, params, token) : lc.sendRequest<R>(type.method, params);
  }

  async notify<P>(type: NotificationType<P>, params: RequestParam<P>): Promise<void> {
    const lc = this.client();
    if (!lc) throw new Error(NOT_RUNNING);
    await lc.sendNotification(type.method, params);
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
