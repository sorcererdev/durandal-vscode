import * as vscode from 'vscode';
import type { Say } from '../server';
import { PaintInput, PlanDecorations } from './decorate';
import { conceals } from './glyphs';
import type { Legend, TokenEdit } from './legend';
import type { PlanDocs } from './planDocs';
import { Fold, Lens, PlanReading, Readings } from './reading';
import type { PlansOptions } from './settings';
import type { ReadingHooks } from './taps';

// Drawn: what the layer last painted for a document (VS Code cannot be asked; the e2e reads it).
export interface Drawn {
  glyphs: { line: number; start: number; end: number; text: string }[];
  verdicts: { line: number; kind: string; text: string }[];
  conclusions: { line: number; text: string }[];
}

export interface PlanViewApi {
  reading(uri: string): PlanReading | undefined;
  drawn(uri: string): Drawn;
  // hidden: the ranges conceal hides in the editors of URI as last set, whatever the layer forgot
  hidden(uri: string): number;
  entered(uri: string): boolean;
}

export interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say }

const empty = (): Drawn => ({ glyphs: [], verdicts: [], conclusions: [] });

// PlanLayer owns the plans reading layer (M6 spec §3): the readings the taps fill, the events
// that repaint, what each document shows: a reading's change, a selection, the visible editors
// and the options repaint, from the reading alone (no request). The glyphs are Task 5's; later
// tasks add the verdict margin (Task 6), folds and conclusions (Task 7), the Enter rule and the
// excerpt guard (Task 8).
export class PlanLayer implements ReadingHooks {
  readonly readings = new Readings(uri => this.changed(uri));
  private opts: PlansOptions;
  private readonly drawnBy = new Map<string, Drawn>();
  private readonly deco = new PlanDecorations();

  constructor(private readonly d: LayerDeps) {
    this.opts = d.options;
  }

  isPlan(doc: vscode.TextDocument): Promise<boolean> { return this.d.docs.is(doc); }
  tokens(uri: string, version: number, data: ArrayLike<number>, resultId: string | undefined, legend: Legend): void {
    this.readings.tokens(uri, version, data, legend, resultId);
  }
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], resultId: string | undefined, legend: Legend): void {
    this.readings.tokenEdits(uri, version, previousResultId, edits, legend, resultId);
  }
  folds(uri: string, version: number, ranges: Fold[]): void { this.readings.folds(uri, version, ranges); }
  lenses(uri: string, version: number, items: Lens[]): void { this.readings.lenses(uri, version, items); }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.deco,
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())),
      vscode.window.onDidChangeTextEditorSelection(e => this.repaint(e.textEditor)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.repaintAll()),
    );
  }

  // the plans settings changed: the plan check is asked again, and every editor shows the new options
  options(o: PlansOptions): void {
    this.opts = o;
    this.d.docs.clear();
    this.repaintAll();
  }

  // the server stopped: nothing it said stands (spec §5.7), and nothing it said stays drawn
  stopped(): void {
    this.readings.clear();
    this.repaintAll();
  }

  api(): PlanViewApi {
    return {
      reading: uri => this.readings.get(uri),
      drawn: uri => this.drawnBy.get(uri) ?? empty(),
      hidden: uri => this.deco.hidden(uri),
      entered: () => false,
    };
  }

  // changed: URI's reading changed; the visible editors showing it repaint
  private changed(uri: string): void {
    for (const ed of vscode.window.visibleTextEditors) if (ed.document.uri.toString() === uri) this.repaint(ed);
  }

  private repaintAll(): void {
    for (const ed of vscode.window.visibleTextEditors) this.repaint(ed);
  }

  // repaint: what EDITOR shows, from its document's reading and the options; no request
  protected repaint(ed: vscode.TextEditor): void {
    const doc = ed.document;
    const uri = doc.uri.toString();
    const r = this.readings.get(uri);
    if (!r && !this.drawnBy.has(uri)) return;
    const drawn = this.drawnBy.get(uri) ?? empty();
    const input: PaintInput = {};
    const lineAt = (l: number) => (l < doc.lineCount ? doc.lineAt(l).text : undefined);
    const cursor = new Set(ed.selections.map(s => s.active.line));
    const c = this.opts.conceal ? conceals(r?.tokens, doc.version, lineAt, this.opts.glyphs, cursor) : [];
    if (c) {
      input.conceals = c;
      drawn.glyphs = c.map(x => ({ line: x.line, start: x.start, end: x.end, text: x.glyph }));
    }
    this.deco.paint(ed, input);
    this.drawnBy.set(uri, drawn);
  }

  private closed(uri: string): void {
    this.readings.drop(uri);
    this.d.docs.forget(uri);
    // its editors (a language change keeps them open) show nothing of the plan any more
    this.changed(uri);
    this.drawnBy.delete(uri);
  }
}
