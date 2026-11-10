import * as vscode from 'vscode';
import type { Say } from '../server';
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
  entered(uri: string): boolean;
}

export interface LayerDeps { docs: PlanDocs; options: PlansOptions; say: Say }

const empty = (): Drawn => ({ glyphs: [], verdicts: [], conclusions: [] });

// PlanLayer owns the plans reading layer (M6 spec §3): the readings the taps fill, the events
// that repaint, what each document shows. Later tasks add the repaint on a reading's change and
// the glyphs (Task 5), the verdict margin (Task 6), folds and conclusions (Task 7), the Enter
// rule and the excerpt guard (Task 8).
export class PlanLayer implements ReadingHooks {
  readonly readings = new Readings();
  private opts: PlansOptions;
  private readonly drawnBy = new Map<string, Drawn>();

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
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc.uri.toString())));
  }

  // the plans settings changed: the plan check is asked again
  options(o: PlansOptions): void {
    this.opts = o;
    this.d.docs.clear();
  }

  // the server stopped: nothing it said stands (spec §5.7)
  stopped(): void {
    this.readings.clear();
  }

  api(): PlanViewApi {
    return {
      reading: uri => this.readings.get(uri),
      drawn: uri => this.drawnBy.get(uri) ?? empty(),
      entered: () => false,
    };
  }

  private closed(uri: string): void {
    this.readings.drop(uri);
    this.d.docs.forget(uri);
    this.drawnBy.delete(uri);
  }
}
