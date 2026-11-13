import * as vscode from 'vscode';

// RowMark: a text at the end of a row, with its hover (markdown) if any
export interface RowMark { row: number; text: string; hover?: string }

// RowMarks: one decoration's marks at the ends of a plan's rows, in every visible editor on it,
// and what was drawn (the e2e tests read it). MARKSOF gives a plan's marks, top to bottom; a
// mark past the document's end is not drawn.
export class RowMarks implements vscode.Disposable {
  private readonly drawn = new Map<string, RowMark[]>();
  private readonly type: vscode.TextEditorDecorationType;

  constructor(after: vscode.ThemableDecorationAttachmentRenderOptions, private readonly marksOf: (uri: string) => RowMark[]) {
    this.type = vscode.window.createTextEditorDecorationType({ after });
  }

  // drawnOn: the marks drawn on URI's visible editors now, top to bottom
  drawnOn(uri: string): RowMark[] { return [...(this.drawn.get(uri) ?? [])]; }

  paint(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.paintEditor(ed);
  }

  paintAll(): void {
    this.drawn.clear();
    for (const ed of vscode.window.visibleTextEditors) this.paintEditor(ed);
  }

  forget(uri: string): void { this.drawn.delete(uri); }

  private paintEditor(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const marks = this.marksOf(uri).filter(m => m.row < doc.lineCount);
    ed.setDecorations(this.type, marks.map(m => {
      const end = doc.lineAt(m.row).range.end;
      return {
        range: new vscode.Range(end, end),
        ...(m.hover !== undefined ? { hoverMessage: new vscode.MarkdownString(m.hover) } : {}),
        renderOptions: { after: { contentText: m.text } },
      };
    }));
    if (marks.length > 0) this.drawn.set(uri, marks);
  }

  dispose(): void { this.type.dispose(); }
}
