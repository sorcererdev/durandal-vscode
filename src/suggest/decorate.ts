import * as vscode from 'vscode';
import { decorationText } from './recognition';
import type { Shown } from './types';

// Decorations: the end-of-line ⚡ of a ghost block, a follow-up or a recognition (M3 spec
// §2), in VS Code's ghost-text colour; one per document. drawn is the text each document
// shows (VS Code cannot be asked; the e2e tests read it).
export class Decorations {
  private readonly type = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), margin: '0 0 0 1.5em' },
  });
  readonly drawn = new Map<string, string>();

  show(st: Shown): void {
    const text = decorationText(st);
    this.drawn.set(st.uri, text);
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() !== st.uri || st.line >= ed.document.lineCount) continue;
      const end = ed.document.lineAt(st.line).range.end;
      ed.setDecorations(this.type, [{ range: new vscode.Range(end, end), renderOptions: { after: { contentText: text } } }]);
    }
  }

  hide(uri: string): void {
    this.drawn.delete(uri);
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === uri) ed.setDecorations(this.type, []);
    }
  }

  dispose(): void { this.type.dispose(); }
}
