import * as vscode from 'vscode';
import { Olifant } from '../protocol';
import type { Server } from '../server';
import { Idle } from './idle';
import type { PlanDocs } from './planDocs';

const openDoc = (uri: string) => vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);

// PlanIdle: olifant/plans/idle a second after a plan's last change, in either reconcile mode:
// idle is the claim pass's triage, not the reconcile (M6 spec §5.3). VS Code has no insert
// mode, so every change re-arms (nvim waits for normal mode).
export class PlanIdle {
  private readonly idle: Idle;

  constructor(private readonly d: { server: Server; planDocs: PlanDocs }) {
    this.idle = new Idle(
      { set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as NodeJS.Timeout) },
      uri => this.send(uri),
      uri => openDoc(uri)?.version,
    );
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => void this.changed(e)),
      vscode.workspace.onDidCloseTextDocument(doc => this.idle.forget(doc.uri.toString())),
      { dispose: () => this.idle.clear() },
    );
  }

  // the version is read once the plan check answers, so a later change's arm is never undone by
  // an earlier one resolving after it
  private async changed(e: vscode.TextDocumentChangeEvent): Promise<void> {
    if (e.contentChanges.length === 0 || !(await this.d.planDocs.is(e.document))) return;
    if (e.document.isClosed) return;
    this.idle.changed(e.document.uri.toString(), e.document.version);
  }

  private send(uri: string): void {
    if (!this.d.server.client()) return;
    this.d.server.notify(Olifant.plansIdle, { textDocument: { uri } }).catch(() => undefined);
  }

  // the server stopped: the timers go
  stopped(): void { this.idle.clear(); }
}
