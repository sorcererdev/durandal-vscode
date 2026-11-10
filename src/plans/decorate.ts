import * as vscode from 'vscode';
import type { Conceal } from './glyphs';
import { colourOf, Mark, MarkColour } from './verdicts';

// PaintInput: what an editor on a plan shows. An absent field leaves that layer as drawn (its
// reading is stale); an empty one clears it. The verdict margin (Task 6) and the fold
// conclusions (Task 7) join it.
export interface PaintInput { conceals?: Conceal[]; margin?: Mark[] }

const marginType = (colour: string) => vscode.window.createTextEditorDecorationType({
  before: { color: new vscode.ThemeColor(colour), margin: '0 0.6ch 0 0' },
});

// PlanDecorations: the plans reading layer's decoration types (spec §3.3); per editor, as VS
// Code's decorations are. The hide is CSS the editor writes verbatim into the inline class
// (text-decoration:none; display: none;), checked in the 1.145.2 bundle: the hidden text
// takes no width. A glyph is injected text at the hidden range's start.
export class PlanDecorations implements vscode.Disposable {
  private readonly hide = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none' });
  private readonly glyph = vscode.window.createTextEditorDecorationType({});
  // the verdict margin: a mark before column 0, in its colour (spec §3.4); a claim-wrong is a
  // Warning, whose wavy underline VS Code draws itself
  private readonly margin: Record<MarkColour, vscode.TextEditorDecorationType> = {
    warning: marginType('editorWarning.foreground'),
    error: marginType('editorError.foreground'),
    passed: marginType('testing.iconPassed'),
    hint: marginType('editorHint.foreground'),
  };
  // hides: per document, the hidden ranges last set on an editor of it (VS Code cannot be asked; the e2e reads it)
  private readonly hides = new Map<string, number>();

  hidden(uri: string): number { return this.hides.get(uri) ?? 0; }

  paint(ed: vscode.TextEditor, input: PaintInput): void {
    if (input.conceals) {
      ed.setDecorations(this.hide, input.conceals.map(c => new vscode.Range(c.line, c.start, c.line, c.end)));
      const uri = ed.document.uri.toString();
      if (input.conceals.length > 0) this.hides.set(uri, input.conceals.length);
      else this.hides.delete(uri);
      ed.setDecorations(this.glyph, input.conceals.filter(c => c.glyph !== '').map(c => ({
        range: new vscode.Range(c.line, c.start, c.line, c.start),
        renderOptions: { before: { contentText: c.glyph } },
      })));
    }
    if (input.margin) {
      for (const [colour, type] of Object.entries(this.margin) as [MarkColour, vscode.TextEditorDecorationType][]) {
        ed.setDecorations(type, input.margin.filter(m => m.text !== '' && colourOf(m.kind) === colour && m.line < ed.document.lineCount).map(m => ({
          range: new vscode.Range(m.line, 0, m.line, 0),
          renderOptions: { before: { contentText: m.text } },
        })));
      }
    }
  }

  dispose(): void {
    for (const t of Object.values(this.margin)) t.dispose();
    this.hide.dispose();
    this.glyph.dispose();
  }
}
