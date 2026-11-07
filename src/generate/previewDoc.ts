import { join } from 'node:path';
import * as vscode from 'vscode';
import type { PreviewResult } from '../protocol';
import { tabsUnder, VirtualDocs } from '../virtualDocs';
import type { PreviewSink } from './flow';
import { NOTHING, previewView } from './preview';

// PreviewDoc is a flow's live preview (durandal.nvim's preview pane), beside the form without
// taking focus: a changed main file as a diff of the file against its previewed text (titled
// with every file's counts), a new one as its text alone, an error or nothing-to-change as
// text. Each answer replaces the text in place and moves to the first differing line; another
// main file replaces the tab. dispose closes its tabs.
export class PreviewDoc implements PreviewSink {
  private readonly prefix: string;
  private shown: string | undefined;
  private target: vscode.Uri | undefined;
  private line = 0;
  private disposed = false;
  private readonly sub: vscode.Disposable;

  constructor(private readonly docs: VirtualDocs, n: number, private readonly root: string) {
    this.prefix = `preview/${n}/`;
    // the provider's change reloads the document after set: move to the line once it is in
    this.sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (this.target && e.document.uri.toString() === this.target.toString()) this.reveal();
    });
  }

  show(r: PreviewResult): void {
    if (this.disposed) return;
    const v = previewView(r);
    if (v.kind === 'error') return this.open('text', 'Preview', v.lines.join('\n'), 0);
    if (v.kind === 'nothing') return this.open('text', 'Preview', NOTHING, 0);
    this.open(v.kind, v.path, v.text, v.line, v.title);
  }

  private open(kind: 'text' | 'new' | 'changed', path: string, text: string, line: number, title = ''): void {
    const right = this.docs.set(this.prefix + path, text);
    this.target = right;
    this.line = line;
    const key = `${kind}:${path}`;
    if (this.shown === key) {
      this.reveal();
      return;
    }
    this.closeTabs();
    this.shown = key;
    const opts: vscode.TextDocumentShowOptions = { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: false };
    const done = () => (this.disposed ? this.closeTabs() : this.reveal());
    if (kind !== 'changed') {
      vscode.window.showTextDocument(right, opts).then(done, () => undefined);
      return;
    }
    const left = vscode.Uri.file(join(this.root, path));
    const label = `${title} (preview)`;
    // spec §12: if VS Code refuses the real file on the left, a snapshot of it stands in
    Promise.resolve(vscode.commands.executeCommand('vscode.diff', left, right, label, opts)).then(done, async () => {
      const before = await vscode.workspace.openTextDocument(left).then(d => d.getText(), () => '');
      const snap = this.docs.set(`${this.prefix}before/${path}`, before);
      await vscode.commands.executeCommand('vscode.diff', snap, right, label, opts);
      done();
    });
  }

  private reveal(): void {
    const ed = this.target && vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === this.target!.toString());
    if (!ed) return;
    const p = new vscode.Position(Math.min(this.line, Math.max(ed.document.lineCount - 1, 0)), 0);
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private closeTabs(): void {
    const tabs = tabsUnder('/' + this.prefix);
    if (tabs.length > 0) void vscode.window.tabGroups.close(tabs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sub.dispose();
    this.closeTabs();
    this.docs.forget(this.prefix);
  }
}
