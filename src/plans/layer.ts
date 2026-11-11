import * as vscode from 'vscode';
import type { Say } from '../server';
import { PaintInput, PlanDecorations } from './decorate';
import { FoldEntry } from './folds';
import { collapsedStarts, foldLabel } from './foldText';
import { conceals } from './glyphs';
import type { Legend, TokenEdit } from './legend';
import type { PlanDocs } from './planDocs';
import { DiagLike, Mark, Severity, worstPerLine } from './verdicts';
import { Excerpt, excerptAt, Fold, Lens, liveExcerpts, PlanReading, Readings, typedInto } from './reading';
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
  // margins: how many times the margin was set on an editor of URI (it is set only when it changes)
  margins(uri: string): number;
}

// warn: a failure the layer catches, written to the output channel as a warning
export interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say; warn: (m: string) => void }

// the excerpt guard's words (nvim plans.lua typed)
export const TYPED_IN_EXCERPT = 'excerpt: live and read-only, the next reconcile replaces what you type here';

const empty = (): Drawn => ({ glyphs: [], verdicts: [], conclusions: [] });

// PlanLayer owns the plans reading layer (M6 spec §3): the readings the taps fill, the events
// that repaint, what each document shows: a reading's change, a selection, the visible editors
// and the options repaint, from the reading alone (no request). It draws the glyphs, the
// verdict margin and the collapsed folds' conclusions, closes a plan's folds on entry, and
// warns once per live excerpt typed into (the Enter rule lives in enterRule.ts).
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
  // warned: per document, the live excerpts the guard has warned for
  private readonly warned = new Map<string, Set<string>>();
  // The margin is set on an editor only when it changes (the diagnostics, the options, the plan
  // check), never on a mere repaint: VS Code moves the decorations it holds with the text, while
  // getDiagnostics keeps the rows the server sent until it sends more. marginGen: per document,
  // the change it last had (from one counter, so a number is never reused); marginAll: the last
  // options change; marginAt: per editor, the change its margin was set at.
  private marginSeq = 0;
  private marginAll = 0;
  private readonly marginGen = new Map<string, number>();
  private readonly marginAt = new WeakMap<vscode.TextEditor, number>();
  private readonly marginCount = new Map<string, number>();
  // marginSeen: per document, the marks the margin was last set from
  private readonly marginSeen = new Map<string, string>();
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
      vscode.workspace.onDidChangeTextDocument(e => this.typed(e)),
      vscode.window.onDidChangeTextEditorSelection(e => this.repaint(e.textEditor)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.repaintAll()),
      vscode.window.onDidChangeTextEditorVisibleRanges(e => this.repaint(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) void this.entry.enter(ed); }),
      vscode.languages.onDidChangeDiagnostics(e => {
        for (const uri of e.uris) {
          const u = uri.toString();
          if (!this.known.has(u)) continue;
          // another source's change (markdown's link check writes on every edit) leaves the
          // margin as set: only a change in what it would draw sets it again
          if (JSON.stringify(this.marks(uri)) === this.marginSeen.get(u)) continue;
          this.marginChanged(u);
          this.changed(u);
        }
      }),
    );
    const active = vscode.window.activeTextEditor;
    if (active) void this.entry.enter(active);
  }

  // the plans settings changed: the plan check is asked again, and every editor shows the new options
  options(o: PlansOptions): void {
    this.opts = o;
    this.marginAll = ++this.marginSeq;
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
    if (yes && !doc.isClosed) {
      if (!this.known.has(uri)) this.marginChanged(uri);
      this.known.add(uri);
    } else this.known.delete(uri);
  }

  private marginChanged(uri: string): void { this.marginGen.set(uri, ++this.marginSeq); }

  // marks: the verdict margin of URI from its diagnostics as VS Code holds them now
  private marks(uri: vscode.Uri): Mark[] {
    return worstPerLine(vscode.languages.getDiagnostics(uri).map(diagLike), this.opts.glyphs);
  }

  // the server stopped: nothing it said stands (spec §5.7), and nothing it said stays drawn
  stopped(): void {
    this.readings.clear();
    this.warned.clear();
    this.repaintAll();
  }

  api(): PlanViewApi {
    return {
      reading: uri => this.readings.get(uri),
      drawn: uri => this.drawnBy.get(uri) ?? empty(),
      hidden: uri => this.deco.hidden(uri),
      entered: uri => this.entry.entered(uri),
      margins: uri => this.marginCount.get(uri) ?? 0,
    };
  }

  // collapsedAt: the server fold starting at ROW that ED shows collapsed (folds read at its version)
  collapsedAt(ed: vscode.TextEditor, row: number): Fold | undefined {
    const doc = ed.document;
    const f = this.readings.get(doc.uri.toString())?.folds;
    if (!f || f.version !== doc.version) return undefined;
    const visible = ed.visibleRanges.map(v => ({ start: v.start.line, end: v.end.line }));
    const lastRowEmpty = doc.lineAt(doc.lineCount - 1).text === '';
    return collapsedStarts(f.ranges, visible, doc.lineCount, lastRowEmpty).find(x => x.start === row);
  }

  // foldStartsAt: a server fold starts at ROW (folds read at ED's version)
  foldStartsAt(ed: vscode.TextEditor, row: number): boolean {
    const f = this.readings.get(ed.document.uri.toString())?.folds;
    return !!f && f.version === ed.document.version && f.ranges.some(x => x.start === row && x.end > x.start);
  }

  // excerptAt: the excerpt holding ROW, by the lenses read at ED's version
  excerptAt(ed: vscode.TextEditor, row: number): Excerpt | undefined {
    const l = this.readings.get(ed.document.uri.toString())?.lenses;
    return l && l.version === ed.document.version ? excerptAt(l.items, row) : undefined;
  }

  // typed: a change inside a live excerpt warns once per excerpt per document (spec §3.7). The
  // lenses must be the ones the document had just before this change.
  private typed(e: vscode.TextDocumentChangeEvent): void {
    const uri = e.document.uri.toString();
    const l = this.readings.get(uri)?.lenses;
    if (!l || l.version !== e.document.version - 1 || e.contentChanges.length === 0) return;
    const keys = typedInto(liveExcerpts(l.items), e.contentChanges.map(c => ({ start: c.range.start.line, end: c.range.end.line })));
    let w = this.warned.get(uri);
    for (const k of keys) {
      if (!w) {
        w = new Set();
        this.warned.set(uri, w);
      }
      if (w.has(k)) continue;
      w.add(k);
      void this.d.say('warn', TYPED_IN_EXCERPT);
    }
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
    const gen = Math.max(this.marginGen.get(uri) ?? 0, this.marginAll);
    if (this.known.has(uri)) {
      if (this.marginAt.get(ed) !== gen) {
        const margin = this.marks(doc.uri);
        input.margin = margin;
        this.marginSeen.set(uri, JSON.stringify(margin));
        drawn.verdicts = margin.map(m => ({ line: m.line, kind: m.kind, text: m.text }));
        this.marginAt.set(ed, gen);
      }
    } else if (this.marginAt.has(ed) || drawn.verdicts.length > 0) {
      // no longer a plan (closed, or the folder changed): the margin clears
      input.margin = [];
      drawn.verdicts = [];
      this.marginAt.delete(ed);
    }
    if (input.margin) this.marginCount.set(uri, (this.marginCount.get(uri) ?? 0) + 1);
    const t = r?.tokens;
    const f = r?.folds;
    if (!f || !t) {
      input.conclusions = [];
      drawn.conclusions = [];
    } else if (f.version === doc.version && t.version === doc.version) {
      // the collapsed folds the viewport shows, each with its conclusion (spec §3.6)
      const visible = ed.visibleRanges.map(v => ({ start: v.start.line, end: v.end.line }));
      const lastRowEmpty = doc.lineAt(doc.lineCount - 1).text === '';
      const cs = collapsedStarts(f.ranges, visible, doc.lineCount, lastRowEmpty).map(x => ({ line: x.start, text: foldLabel(t.toks, lineAt, x.start, x.end) }));
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
    this.warned.delete(uri);
    this.changed(uri);
    this.drawnBy.delete(uri);
    this.marginGen.delete(uri);
    this.marginCount.delete(uri);
    this.marginSeen.delete(uri);
  }
}

// diagLike: a VS Code diagnostic as the margin rule reads it (a code may be an object)
function diagLike(d: vscode.Diagnostic): DiagLike {
  const code = d.code === undefined ? undefined : typeof d.code === 'object' ? String(d.code.value) : String(d.code);
  return { line: d.range.start.line, source: d.source, code, severity: d.severity as Severity };
}
