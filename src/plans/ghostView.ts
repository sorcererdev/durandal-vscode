import * as vscode from 'vscode';
import { Ghost, Ghosts, hoverText, lineCount, markerText } from './ghosts';

// GhostView draws the ghost rows (M7 spec §3.2): each one ends in `ai · +N lines`, in VS Code's
// ghost-text colour, and its hover shows the row's proposal, so every ghost can be read without
// moving the cursor (nvim's "ai" sign and virtual lines).
export class GhostView implements vscode.Disposable {
  // drawn: the markers on each plan's visible editors, top to bottom (the e2e tests read them)
  private readonly drawn = new Map<string, { row: number; text: string }[]>();
  private readonly marker = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), margin: '0 0 0 1.5em' },
  });

  constructor(protected readonly d: { ghosts: Ghosts }) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this, vscode.window.onDidChangeVisibleTextEditors(() => this.paintAll()));
  }

  // rows: URI's ghost rows, top to bottom: the row, its blocks in answer order, its marker text
  rows(uri: string): { row: number; blocks: Ghost[]; marker: string }[] {
    return this.d.ghosts.rows(uri).map(row => {
      const blocks = this.d.ghosts.at(uri, row);
      return { row, blocks, marker: markerText(lineCount(blocks)) };
    });
  }

  markers(uri: string): { row: number; text: string }[] { return [...(this.drawn.get(uri) ?? [])]; }

  // paint: the markers of URI's ghost rows, in every editor on it
  paint(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  paintAll(): void {
    this.drawn.clear();
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  forget(uri: string): void { this.drawn.delete(uri); }

  // paintEditor: a row whose blocks have no lines gets no marker (there is nothing to show as
  // `+0 lines`); its chords still decide it
  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const marks = this.rows(doc.uri.toString()).filter(r => r.row < doc.lineCount && lineCount(r.blocks) > 0);
    ed.setDecorations(this.marker, marks.map(m => {
      const end = doc.lineAt(m.row).range.end;
      return {
        range: new vscode.Range(end, end),
        hoverMessage: new vscode.MarkdownString(hoverText(m.blocks)),
        renderOptions: { after: { contentText: m.marker } },
      };
    }));
    if (marks.length > 0) this.drawn.set(doc.uri.toString(), marks.map(m => ({ row: m.row, text: m.marker })));
  }

  dispose(): void { this.marker.dispose(); }
}
