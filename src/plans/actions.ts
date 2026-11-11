import * as vscode from 'vscode';
import type { CodeAction, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { Lsp } from '../protocol';
import type { Say, Server } from '../server';
import { toggleFoldAt } from './folds';
import { asked, RunningHere, runningHere } from './here';
import type { PlanLayer } from './layer';
import type { PlanDocs } from './planDocs';
import { applyPlanEdit } from './serverEdit';
import { excerptNext, newStepNext, Next, sources, toggleNext } from './sourceActions';

export interface ActionsDeps {
  server: Server; say: Say; planDocs: PlanDocs;
  layer: Pick<PlanLayer, 'collapsedAt' | 'foldStartsAt' | 'excerptAt'>;
}

// PlanActions: new step, excerpt and toggle (M6 spec §4.4). Each asks the server for the row's
// code actions with only: [source] itself (source actions never reach the lightbulb) and applies
// the server's edit through applyServerEdit, so a stale one is refused as every server edit is.
export class PlanActions {
  constructor(private readonly d: ActionsDeps) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('durandal.plan.newStep', () => this.newStep()),
      vscode.commands.registerCommand('durandal.plan.excerpt', () => this.excerpt()),
      vscode.commands.registerCommand('durandal.plan.toggle', () => this.toggle()),
    );
  }

  async newStep(): Promise<void> {
    const h = await runningHere(this.d);
    const xs = h && await this.sources(h);
    if (!h || !xs) return;
    const n = newStepNext(xs);
    if (n.kind !== 'apply') return this.next(h, n);
    if (!(await this.apply(n.action))) return;
    // the new step's line, the cursor at its end (nvim: row + 2, 1-based, then startinsert!)
    const ed = h.editor;
    const row = Math.min(h.row + 1, ed.document.lineCount - 1);
    const end = ed.document.lineAt(row).range.end;
    ed.selection = new vscode.Selection(end, end);
    ed.revealRange(new vscode.Range(end, end));
  }

  async excerpt(): Promise<void> {
    const h = await runningHere(this.d);
    if (!h) return;
    // inside an excerpt, or on a collapsed fold: the fold opens or closes, nothing is asked
    const x = this.d.layer.excerptAt(h.editor, h.row);
    if (x && this.d.layer.foldStartsAt(h.editor, x.open)) {
      await toggleFoldAt(x.open, !!this.d.layer.collapsedAt(h.editor, x.open));
      return;
    }
    if (this.d.layer.collapsedAt(h.editor, h.row)) {
      await toggleFoldAt(h.row, true);
      return;
    }
    const xs = await this.sources(h);
    if (xs) await this.next(h, excerptNext(xs));
  }

  async toggle(): Promise<void> {
    const h = await runningHere(this.d);
    const xs = h && await this.sources(h);
    if (h && xs) await this.next(h, toggleNext(xs));
  }

  private async sources(h: RunningHere): Promise<CodeAction[] | undefined> {
    const at = { line: h.row, character: 0 };
    const a = await asked(this.d, h, () => this.d.server.request(Lsp.codeAction, {
      textDocument: { uri: h.uri }, range: { start: at, end: at }, context: { only: ['source'], diagnostics: [] },
    }));
    return a && sources(a.r);
  }

  private async next(h: RunningHere, n: Next): Promise<void> {
    switch (n.kind) {
      case 'say':
        void this.d.say(n.level, n.text);
        return;
      case 'fold':
        if (this.d.layer.foldStartsAt(h.editor, n.row)) await toggleFoldAt(n.row, !!this.d.layer.collapsedAt(h.editor, n.row));
        else void this.d.say('info', n.reason);
        return;
      case 'apply':
        await this.apply(n.action);
        return;
      case 'resolve': {
        // a failure (a plan that moved since: "the plan changed since; ask again") is said
        const a = await asked(this.d, h, () => this.d.server.request(Lsp.codeActionResolve, n.action));
        if (!a) return;
        const r: CodeAction | null = a.r;
        if (r?.edit) await this.apply(r);
        else void this.d.say('info', n.none);
      }
    }
  }

  // apply: the action's edit, as every server edit lands (refused whole if stale)
  private apply(a: CodeAction): Promise<boolean> {
    return applyPlanEdit(this.d, a.title, a.edit as WorkspaceEdit);
  }
}
