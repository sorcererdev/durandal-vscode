import type * as vscode from 'vscode';
import type { Middleware } from 'vscode-languageclient/node';
import type { Legend, TokenEdit } from './legend';
import type { Fold, Lens } from './reading';

// The middleware taps (spec §3.2, approach A): each hook calls next, returns its answer to the
// library untouched, and for a plan copies it into the reading model with the document version
// it was asked at. The plan check is asynchronous and runs after the answer is returned: no
// latency is added, and a tap's failure never reaches the library.
export interface ReadingHooks {
  isPlan(doc: vscode.TextDocument): Promise<boolean>;
  tokens(uri: string, version: number, data: ArrayLike<number>, resultId: string | undefined, legend: Legend): void;
  tokenEdits(uri: string, version: number, previousResultId: string, edits: readonly TokenEdit[], resultId: string | undefined, legend: Legend): void;
  folds(uri: string, version: number, ranges: Fold[]): void;
  lenses(uri: string, version: number, items: Lens[]): void;
}

export type PlanTaps = Pick<Middleware, 'provideDocumentSemanticTokens' | 'provideDocumentSemanticTokensEdits' | 'provideFoldingRanges' | 'provideCodeLenses'>;

export function planTaps(hooks: () => ReadingHooks | undefined, legend: () => Legend | undefined, warn: (m: string) => void): PlanTaps {
  // record: an answer that lands after its document closed is dropped (the layer forgot it)
  const record = (doc: vscode.TextDocument, what: string, f: (h: ReadingHooks) => void) => {
    const h = hooks();
    if (!h) return;
    h.isPlan(doc).then(yes => { if (yes && !doc.isClosed) f(h); })
      .catch((err: unknown) => warn(`plans: reading the ${what} of ${doc.uri.toString()} failed: ${err instanceof Error ? err.message : String(err)}`));
  };
  return {
    provideDocumentSemanticTokens: async (document, token, next) => {
      const version = document.version;
      const r = await next(document, token);
      const l = legend();
      if (r && l) record(document, 'tokens', h => h.tokens(document.uri.toString(), version, r.data, r.resultId, l));
      return r;
    },
    provideDocumentSemanticTokensEdits: async (document, previousResultId, token, next) => {
      const version = document.version;
      const r = await next(document, previousResultId, token);
      const l = legend();
      if (r && l) {
        record(document, 'tokens', h => ('edits' in r
          ? h.tokenEdits(document.uri.toString(), version, previousResultId, r.edits, r.resultId, l)
          : h.tokens(document.uri.toString(), version, r.data, r.resultId, l)));
      }
      return r;
    },
    provideFoldingRanges: async (document, context, token, next) => {
      const version = document.version;
      const r = await next(document, context, token);
      if (r) record(document, 'folds', h => h.folds(document.uri.toString(), version, r.map(f => ({ start: f.start, end: f.end }))));
      return r;
    },
    provideCodeLenses: async (document, token, next) => {
      const version = document.version;
      const r = await next(document, token);
      if (r) {
        record(document, 'lenses', h => h.lenses(document.uri.toString(), version,
          r.map(l => ({ line: l.range.start.line, command: l.command?.command ?? '', args: l.command?.arguments ?? [] }))));
      }
      return r;
    },
  };
}
