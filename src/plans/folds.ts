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
const MAX_TRIES = 5;

// rowsOf: an editor's visible rows, to tell whether a fold changed it
const rowsOf = (e: vscode.TextEditor) => e.visibleRanges.map(r => `${r.start.line}-${r.end.line}`).join(',');

// FoldEntry: close on entry (spec §3.6; nvim close_on_entry). Per document: the first time a
// plan's editor is active with the server's folds for its version, its targets fold. VS Code's
// folding model takes the ranges a moment after the provider answers, so the targets the
// viewport still shows open fold again, up to 5 tries within 8 s. The fold is asked for with
// levels 1, which folds the region at each row or leaves it, never a collapsed region's parent
// (as the plain editor.fold does; checked in the 1.145.2 bundle). editor.fold acts on the focused
// code editor, which can differ from the active one: a fold that changes nothing here but
// changes another visible editor stops the tries at once. Folds that form later start open
// (VS Code's default). Leaving the editor before the first fold, or no folds in 8 s, leaves
// the document not entered: the next activation, or the next folds, try again. A document is
// entered once its first fold is asked for and did not land in another editor (or it has
// nothing to fold); a fold that landed elsewhere leaves it not entered.
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
      for (let tries = 0; targets.length > 0 && tries < MAX_TRIES && Date.now() < deadline; tries++) {
        if (vscode.window.activeTextEditor !== editor || doc.isClosed) return;
        const before = rowsOf(editor);
        const others = vscode.window.visibleTextEditors.filter(e => e !== editor).map(e => [e, rowsOf(e)] as const);
        // levels 1: the region at each row folds, or stays as it is; never its parent
        await vscode.commands.executeCommand('editor.fold', { levels: 1, selectionLines: targets });
        if (doc.isClosed) return;
        const after = rowsOf(editor);
        await sleep(100);
        if (doc.isClosed) return;
        // no progress here and a change in another editor: the fold went to the focused editor,
        // which is not this one; folding again would only change that one more. The document
        // stays not entered: the next activation tries again (spec §3.6 fallback)
        if (after === before && rowsOf(editor) === before && others.some(([e, r]) => rowsOf(e) !== r)) return;
        this.done.add(uri);
        targets = stillOpen(targets, editor.visibleRanges.map(r => ({ start: r.start.line, end: r.end.line })));
      }
    } finally {
      this.busy.delete(uri);
    }
  }
}

// toggleFoldAt: the fold at ROW of the focused editor opens when COLLAPSED, else closes; levels 1
// touches only the region at the row (nvim toggle_fold). The cursor stays.
export async function toggleFoldAt(row: number, collapsed: boolean): Promise<void> {
  await vscode.commands.executeCommand(collapsed ? 'editor.unfold' : 'editor.fold', { levels: 1, selectionLines: [row] });
}
