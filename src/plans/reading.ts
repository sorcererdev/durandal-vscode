// The reading model (spec §3.2): per plan document, what the server last answered for its
// tokens, folds and lenses, each with the document version it was computed for. Every reader
// checks that version. No vscode import.
import { CLIENT_COMMANDS } from '../protocol';
import { applyEdits, decode, Legend, Tok, TokenEdit } from './legend';

export interface Fold { start: number; end: number }
// Lens: a code lens's row and its resolved command (olifant.plans.excerpt carries
// [uri, open, close, live, anchor]).
export interface Lens { line: number; command: string; args: unknown[] }

export interface PlanReading {
  tokens?: { version: number; resultId?: string; data: number[]; toks: Tok[] };
  folds?: { version: number; ranges: Fold[] };
  lenses?: { version: number; items: Lens[] };
}

export type Part = 'tokens' | 'folds' | 'lenses';

export class Readings {
  private readonly m = new Map<string, PlanReading>();

  constructor(private readonly changed: (uri: string, part: Part) => void = () => undefined) {}

  get(uri: string): PlanReading | undefined { return this.m.get(uri); }
  uris(): string[] { return [...this.m.keys()]; }

  private of(uri: string): PlanReading {
    let r = this.m.get(uri);
    if (!r) {
      r = {};
      this.m.set(uri, r);
    }
    return r;
  }

  tokens(uri: string, version: number, data: ArrayLike<number>, legend: Legend, resultId?: string): void {
    const d = Array.from(data);
    this.of(uri).tokens = { version, resultId, data: d, toks: decode(d, legend) };
    this.changed(uri, 'tokens');
  }

  // tokenEdits: an Edits answer applies to the reading it names; false when the reading held is
  // another one. The tokens held then stay at their own version (what is drawn stays, spec §3.2)
  // but lose their resultId, so no later edits apply to them; the next full answer replaces them.
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], legend: Legend, resultId?: string): boolean {
    const r = this.of(uri);
    if (!r.tokens || r.tokens.resultId !== previousResultId) {
      if (r.tokens) r.tokens = { ...r.tokens, resultId: undefined };
      return false;
    }
    const d = applyEdits(r.tokens.data, edits);
    r.tokens = { version, resultId, data: d, toks: decode(d, legend) };
    this.changed(uri, 'tokens');
    return true;
  }

  folds(uri: string, version: number, ranges: Fold[]): void {
    this.of(uri).folds = { version, ranges: ranges.map(f => ({ start: f.start, end: f.end })) };
    this.changed(uri, 'folds');
  }

  lenses(uri: string, version: number, items: Lens[]): void {
    this.of(uri).lenses = { version, items };
    this.changed(uri, 'lenses');
  }

  drop(uri: string): void { this.m.delete(uri); }
  clear(): void { this.m.clear(); }
}

// lineTokens: row LINE's tokens, by column (durandal.nvim plans.line_tokens).
export function lineTokens(toks: readonly Tok[], line: number): Tok[] {
  return toks.filter(t => t.line === line).sort((a, b) => a.start - b.start);
}

export const tokText = (tok: Tok, lineText: string): string => lineText.slice(tok.start, tok.start + tok.length);

// LiveExcerpt: a live excerpt's fence rows and the key the typed guard warns once for.
export interface LiveExcerpt { open: number; close: number; key: string }

export function liveExcerpts(lenses: readonly Lens[]): LiveExcerpt[] {
  const out: LiveExcerpt[] = [];
  for (const l of lenses) {
    if (l.command !== CLIENT_COMMANDS.planExcerpt) continue;
    const [, open, close, live, anchor] = l.args;
    if (typeof open !== 'number' || typeof close !== 'number' || live !== true) continue;
    out.push({ open, close, key: typeof anchor === 'string' ? anchor : String(open) });
  }
  return out;
}
