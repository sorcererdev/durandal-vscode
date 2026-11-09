import * as vscode from 'vscode';

// Reminders: the end-of-line note on a paused unit's last line (spec §3.3; nvim pause.remind's
// virtual line), in the lens colour, as the ⚡ hints. One per document; no key is bound for it.
export class Reminders {
  private readonly type = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1.5em' },
  });
  private readonly shown = new Map<string, { line: number; text: string }>();

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.type, vscode.window.onDidChangeVisibleTextEditors(eds => {
      for (const ed of eds) this.paint(ed);
    }));
  }

  show(uri: string, line: number, text: string): void {
    this.shown.set(uri, { line, text });
    for (const ed of vscode.window.visibleTextEditors) this.paint(ed);
  }

  clear(uri: string): void {
    this.shown.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === uri) ed.setDecorations(this.type, []);
    }
  }

  count(uri: string): number { return this.shown.has(uri) ? 1 : 0; }

  private paint(ed: vscode.TextEditor): void {
    const r = this.shown.get(ed.document.uri.toString());
    if (!r || r.line >= ed.document.lineCount) return;
    const end = ed.document.lineAt(r.line).range.end;
    ed.setDecorations(this.type, [{ range: new vscode.Range(end, end), renderOptions: { after: { contentText: r.text } } }]);
  }
}
