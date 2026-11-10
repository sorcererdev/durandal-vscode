import * as vscode from 'vscode';
import type { Conceal } from './glyphs';

// PaintInput: what an editor on a plan shows. An absent field leaves that layer as drawn (its
// reading is stale); an empty one clears it. The verdict margin (Task 6) and the fold
// conclusions (Task 7) join it.
export interface PaintInput { conceals?: Conceal[] }

// PlanDecorations: the plans reading layer's decoration types (spec §3.3); per editor, as VS
// Code's decorations are. The hide is CSS the editor writes verbatim into the inline class
// (text-decoration:none; display: none;), checked in the 1.145.2 bundle: the hidden text
// takes no width. A glyph is injected text at the hidden range's start.
export class PlanDecorations implements vscode.Disposable {
  private readonly hide = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none' });
  private readonly glyph = vscode.window.createTextEditorDecorationType({});

  paint(ed: vscode.TextEditor, input: PaintInput): void {
    if (input.conceals) {
      ed.setDecorations(this.hide, input.conceals.map(c => new vscode.Range(c.line, c.start, c.line, c.end)));
      ed.setDecorations(this.glyph, input.conceals.filter(c => c.glyph !== '').map(c => ({
        range: new vscode.Range(c.line, c.start, c.line, c.start),
        renderOptions: { before: { contentText: c.glyph } },
      })));
    }
  }

  dispose(): void {
    this.hide.dispose();
    this.glyph.dispose();
  }
}
