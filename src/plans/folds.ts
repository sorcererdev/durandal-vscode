import * as vscode from 'vscode';
import { entryTargets, stillOpen } from './foldText';
import type { Fold, PlanReading } from './reading';

export interface EntryDeps {
  reading(uri: string): PlanReading | undefined;
  foldDone(): boolean;
  isPlan(doc: vscode.TextDocument): Promise<boolean>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const WAIT_MS = 8_000;
const POLL_MS = 50;

// FoldEntry: close on entry (spec §3.6; nvim close_on_entry). Per document: the first time a
// plan's editor is active with the server's folds for its version, its targets fold. VS Code's
// folding model takes the ranges a moment after the provider answers, so the targets the
// viewport still shows open fold again until none is or 8 s pass. Only a target shown open is
// folded again: editor.fold on a collapsed region folds its parent. Folds that form later start
// open (VS Code's default). Leaving the editor before the first fold, or no folds in 8 s, leaves
// the document not entered: the next activation, or the next folds, try again. A document is
// entered once its first fold is asked for (or it has nothing to fold).
export class FoldEntry {
  private readonly done = new Set<string>();
  private readonly busy = new Set<string>();

  constructor(private readonly d: EntryDeps) {}

  entered(uri: string): boolean { return this.done.has(uri); }
  forget(uri: string): void { this.done.delete(uri); }

  async enter(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const uri = doc.uri.toString();
    if (this.done.has(uri) || this.busy.has(uri)) return;
    this.busy.add(uri);
    try {
      if (!(await this.d.isPlan(doc))) return;
      const deadline = Date.now() + WAIT_MS;
      let folds: Fold[] | undefined;
      while (Date.now() < deadline) {
        if (vscode.window.activeTextEditor !== editor || doc.isClosed) return;
        const f = this.d.reading(uri)?.folds;
        if (f && f.version === doc.version) {
          folds = f.ranges;
          break;
        }
        await sleep(POLL_MS);
      }
      if (!folds) return;
      const lineAt = (r: number) => (r < doc.lineCount ? doc.lineAt(r).text : undefined);
      let targets = entryTargets(folds, lineAt, this.d.foldDone());
      if (targets.length === 0) this.done.add(uri);
      while (targets.length > 0 && Date.now() < deadline) {
        if (vscode.window.activeTextEditor !== editor || doc.isClosed) return;
        await vscode.commands.executeCommand('editor.fold', { selectionLines: targets });
        this.done.add(uri);
        await sleep(100);
        targets = stillOpen(targets, editor.visibleRanges.map(r => ({ start: r.start.line, end: r.end.line })));
      }
    } finally {
      this.busy.delete(uri);
    }
  }
}
