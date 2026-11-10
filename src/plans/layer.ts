import * as vscode from 'vscode';
import type { Say } from '../server';
import { PaintInput, PlanDecorations } from './decorate';
import { FoldEntry } from './folds';
import { collapsedStarts, foldLabel } from './foldText';
import { conceals } from './glyphs';
import type { Legend, TokenEdit } from './legend';
import type { PlanDocs } from './planDocs';
import { DiagLike, Severity, worstPerLine } from './verdicts';
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

// warn: a failure the layer catches, written to the output channel as a warning
export interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say; warn: (m: string) => void }

const empty = (): Drawn => ({ glyphs: [], verdicts: [], conclusions: [] });

// PlanLayer owns the plans reading layer (M6 spec §3): the readings the taps fill, the events
// that repaint, what each document shows: a reading's change, a selection, the visible editors
// and the options repaint, from the reading alone (no request). It draws the glyphs, the
// verdict margin and the collapsed folds' conclusions, and closes a plan's folds on entry; a
// later task adds the Enter rule and the excerpt guard (Task 8).
export class PlanLayer implements ReadingHooks {
  readonly readings = new Readings((uri, part) => {
    this.changed(uri);
    // folds that come after a give-up, or after the server attached, enter the active plan
    const active = vscode.window.activeTextEditor;
    if (part === 'folds' && active?.document.uri.toString() === uri) void this.entry.enter(active);
  });
  private opts: PlansOptions;
  private readonly drawnBy = new Map<string, Drawn>();
  private readonly deco = new PlanDecorations();
  // known: the documents the plan check said are plans (the margin draws on these)
  private readonly known = new Set<string>();
  // recheck: the latest options() re-check; an older one that resolves later is dropped
  private recheck = 0;
  private readonly entry = new FoldEntry({ reading: uri => this.readings.get(uri), foldDone: () => this.opts.foldDone, isPlan: doc => this.isPlan(doc) });

  constructor(private readonly d: LayerDeps) {
    this.opts = d.options;
  }

  isPlan(doc: vscode.TextDocument): Promise<boolean> {
    return this.d.docs.is(doc).then(yes => {
      this.know(doc, yes);
      return yes;
    });
  }
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
      vscode.window.onDidChangeTextEditorVisibleRanges(e => this.repaint(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) void this.entry.enter(ed); }),
      vscode.languages.onDidChangeDiagnostics(e => {
        for (const uri of e.uris) if (this.known.has(uri.toString())) this.changed(uri.toString());
      }),
    );
    const active = vscode.window.activeTextEditor;
    if (active) void this.entry.enter(active);
  }

  // the plans settings changed: the plan check is asked again, and every editor shows the new options
  options(o: PlansOptions): void {
    this.opts = o;
    this.d.docs.clear();
    // the plan check is asked again, with the new folder, of every visible document
    const docs = new Set(vscode.window.visibleTextEditors.map(e => e.document));
    const gen = ++this.recheck;
    void Promise.all([...docs].map(async doc => ({ doc, yes: await this.d.docs.is(doc) })))
      .then(answers => {
        if (gen !== this.recheck) return;
        for (const { doc, yes } of answers) this.know(doc, yes);
        this.repaintAll();
      })
      .catch((err: unknown) => this.d.warn(`plans: the plan check after a settings change failed: ${err instanceof Error ? err.message : String(err)}`));
    this.repaintAll();
  }

  // know: the plan check's answer for DOC; a document that closed meanwhile stays forgotten
  private know(doc: vscode.TextDocument, yes: boolean): void {
    const uri = doc.uri.toString();
    if (yes && !doc.isClosed) this.known.add(uri);
    else this.known.delete(uri);
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
      entered: uri => this.entry.entered(uri),
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
    if (!r && !this.drawnBy.has(uri) && !this.known.has(uri)) return;
    const drawn = this.drawnBy.get(uri) ?? empty();
    const input: PaintInput = {};
    const lineAt = (l: number) => (l < doc.lineCount ? doc.lineAt(l).text : undefined);
    const cursor = new Set(ed.selections.map(s => s.active.line));
    const c = this.opts.conceal ? conceals(r?.tokens, doc.version, lineAt, this.opts.glyphs, cursor) : [];
    if (c) {
      input.conceals = c;
      drawn.glyphs = c.map(x => ({ line: x.line, start: x.start, end: x.end, text: x.glyph }));
    }
    if (this.known.has(uri)) {
      const margin = worstPerLine(vscode.languages.getDiagnostics(doc.uri).map(diagLike), this.opts.glyphs);
      input.margin = margin;
      drawn.verdicts = margin.map(m => ({ line: m.line, kind: m.kind, text: m.text }));
    } else if (drawn.verdicts.length > 0) {
      // no longer a plan (closed, or the folder changed): the margin clears
      input.margin = [];
      drawn.verdicts = [];
    }
    const t = r?.tokens;
    const f = r?.folds;
    if (!f || !t) {
      input.conclusions = [];
      drawn.conclusions = [];
    } else if (f.version === doc.version && t.version === doc.version) {
      // the collapsed folds the viewport shows, each with its conclusion (spec §3.6)
      const visible = ed.visibleRanges.map(v => ({ start: v.start.line, end: v.end.line }));
      // an empty last row shown alone (after a fold) is an empty range, which visibleRanges
      // leaves out (1.145.2): a fold up to the row before it runs to the document's end
      const last = doc.lineCount - 1;
      const rows = last > 0 && doc.lineAt(last).text === '' ? last : doc.lineCount;
      const cs = collapsedStarts(f.ranges, visible, rows).map(x => ({ line: x.start, text: foldLabel(t.toks, lineAt, x.start, x.end) }));
      input.conclusions = cs;
      drawn.conclusions = cs;
    }
    this.deco.paint(ed, input);
    this.drawnBy.set(uri, drawn);
  }

  private closed(uri: string): void {
    this.readings.drop(uri);
    this.d.docs.forget(uri);
    // its editors (a language change keeps them open) show nothing of the plan any more
    this.known.delete(uri);
    this.entry.forget(uri);
    this.changed(uri);
    this.drawnBy.delete(uri);
  }
}

// diagLike: a VS Code diagnostic as the margin rule reads it (a code may be an object)
function diagLike(d: vscode.Diagnostic): DiagLike {
  const code = d.code === undefined ? undefined : typeof d.code === 'object' ? String(d.code.value) : String(d.code);
  return { line: d.range.start.line, source: d.source, code, severity: d.severity as Severity };
}
