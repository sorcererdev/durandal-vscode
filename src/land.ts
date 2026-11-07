import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import { applyServerEdit } from './applyEdit';
import { ReviewFile, reviewModel } from './generate/review';
import { firstStale, landedMessage, NOTHING_TO_CHANGE, seenText, staleMessage } from './generate/stale';
import type { Plan, PlanSnippet } from './protocol';
import { NOT_RUNNING, Say, Server } from './server';
import type { ReviewAnswer, Ui } from './uiTypes';
import { tabsUnder, VirtualDocs } from './virtualDocs';

// textOf is a file's text as an apply would meet it (seenText): a dirty document's, else the
// disk's, without a leading BOM (VS Code's document text has none).
async function textOf(path: string): Promise<string | null> {
  const doc = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && d.uri.fsPath === path);
  let disk: string | null;
  try {
    disk = (await fs.readFile(path, 'utf8')).replace(/^\uFEFF/, '');
  } catch {
    disk = null;
  }
  return seenText(doc && { dirty: doc.isDirty, text: doc.getText() }, disk);
}

// Plans is a plan landing in VS Code (durandal.nvim apply.lua and preview.lua): the stale
// check against every file's planned before, then the server's own edit through
// applyServerEdit (versions, annotations, saves, one notice); a snippet put in its line; the
// review window with a diff per file.
export class Plans {
  private count = 0;

  constructor(private readonly d: { server: Server; docs: VirtualDocs; say: Say }) {}

  // land applies plan (its paths relative to root): undefined when it landed or there was
  // nothing to change, else why nothing was applied.
  async land(root: string, plan: Plan, edit: WorkspaceEdit | undefined, name: string): Promise<string | undefined> {
    const conflicts = plan.conflicts ?? [];
    if (conflicts.length > 0) return conflicts.map(c => c.message).join('; ');
    const files = plan.files ?? [];
    if (files.length === 0) {
      void this.d.say('info', NOTHING_TO_CHANGE);
      return undefined;
    }
    const stale = await firstStale(files, rel => textOf(join(root, rel)));
    if (stale) return staleMessage(stale);
    const lc = this.d.server.client();
    if (!lc) return NOT_RUNNING;
    if (!edit) return 'the server sent no edit';
    const r = await applyServerEdit(lc, { label: name, edit }, text => void this.d.say('info', text),
      (_saved, unsaved) => landedMessage(name, files.length, unsaved));
    return r.applied ? undefined : (r.failureReason ?? 'VS Code did not apply the edit');
  }

  // snippet puts s.body in place of its line (1-based; past the end: at the end), tab stops live.
  async snippet(root: string, s: PlanSnippet): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, s.file)));
    const ed = await vscode.window.showTextDocument(doc);
    const i = s.line - 1;
    const where = i >= 0 && i < doc.lineCount ? doc.lineAt(i).range : doc.lineAt(doc.lineCount - 1).range.end;
    return ed.insertSnippet(new vscode.SnippetString(s.body), where);
  }

  // review is the review window: notes and files in a quick pick, the active file's diff
  // beside; Apply lands the plan (landed runs when it did); a parse warning jumps to its line.
  async review(ui: Ui, root: string, plan: Plan, edit: WorkspaceEdit | undefined, o: { title: string; landed(): void }): Promise<void> {
    const m = reviewModel(plan);
    if (m.files.length === 0 && m.canApply) {
      void this.d.say('info', NOTHING_TO_CHANGE);
      return;
    }
    const n = ++this.count;
    let a: ReviewAnswer;
    try {
      a = await ui.review(m, { title: o.title, onActive: f => this.showFile(n, f) });
    } finally {
      await this.closeFiles(n);
    }
    if (a.kind === 'jump') {
      const p = new vscode.Position(Math.max(a.line - 1, 0), 0);
      await vscode.window.showTextDocument(vscode.Uri.file(join(root, a.path)), { selection: new vscode.Range(p, p) });
      return;
    }
    if (a.kind !== 'apply' || !m.canApply) return;
    const err = await this.land(root, plan, edit, o.title);
    if (err) ui.error(err);
    else o.landed();
  }

  private showFile(n: number, f: ReviewFile): void {
    const before = this.d.docs.set(`plan/${n}/before/${f.path}`, f.before);
    const after = this.d.docs.set(`plan/${n}/after/${f.path}`, f.after);
    void vscode.commands.executeCommand('vscode.diff', before, after, `${f.mark} ${f.path} (plan)`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true });
  }

  // closeFiles closes review n's diff tabs and frees their texts.
  private async closeFiles(n: number): Promise<void> {
    const tabs = tabsUnder(`/plan/${n}/`);
    if (tabs.length > 0) await Promise.resolve(vscode.window.tabGroups.close(tabs)).catch(() => false);
    this.d.docs.forget(`plan/${n}/`);
  }
}
