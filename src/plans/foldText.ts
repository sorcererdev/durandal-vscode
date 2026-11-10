// Folds' pure rules (spec §3.6; nvim foldtext, entry_targets): the label a collapsed fold shows
// at its line's end, the rows closed on entry, which folds the viewport shows collapsed. VS
// Code has no fold-text API: the line's own text stays visible, so nvim's leading glyph and
// text are not repeated. No vscode import.
import type { Tok } from './legend';
import { Fold, lineTokens, tokText } from './reading';

// Span: an inclusive range of rows (editor.visibleRanges, as rows).
export interface Span { start: number; end: number }

const indentOf = (s: string) => s.length - s.trimStart().length;

export function foldLabel(toks: readonly Tok[], lineAt: (row: number) => string | undefined, start: number, end: number, width = 80): string {
  const suffix = ` ▸ ${end - start}`;
  const row = lineTokens(toks, start);
  let head = '';
  if (row.some(t => t.type === 'planQuestion')) {
    const child = lineAt(start + 1);
    if (child !== undefined) {
      const want = indentOf(child);
      for (let r = end; r > start; r--) {
        const text = lineAt(r);
        if (text === undefined || text.trim() === '' || indentOf(text) !== want) continue;
        const claim = lineTokens(toks, r).find(t => t.type === 'planClaim');
        if (claim) {
          head = ` — ${tokText(claim, text)}`;
          break;
        }
      }
    }
  } else if (row.some(t => t.type === 'planStepDone')) {
    const text = lineAt(start) ?? '';
    const parts = ['planAnchorUnit', 'planVerdict']
      .map(type => row.find(t => t.type === type))
      .filter((t): t is Tok => t !== undefined)
      .map(t => tokText(t, text));
    if (parts.length > 0) head = `  ${parts.join(' ')}`;
  }
  if (head.length + suffix.length > width) head = `${head.slice(0, Math.max(0, width - suffix.length - 1))}…`;
  return head + suffix;
}

// entryTargets: the starts closed when a plan is first shown, latest first (an inner fold
// before its parent). foldDone false: excerpts only (a start row opening a fence).
export function entryTargets(folds: readonly Fold[], lineAt: (row: number) => string | undefined, foldDone: boolean): number[] {
  const starts = new Set<number>();
  for (const f of folds) {
    if (f.end <= f.start) continue;
    if (!foldDone && !/^\s*```/.test(lineAt(f.start) ?? '')) continue;
    starts.add(f.start);
  }
  return [...starts].sort((a, b) => b - a);
}

const shown = (row: number, visible: readonly Span[]) => visible.some(v => v.start <= row && row <= v.end);

// collapsedStarts: folds whose start is shown and whose next row is not, and below which
// something is shown (else the next row may only be below the viewport), or which run to the
// document's end.
export function collapsedStarts(folds: readonly Fold[], visible: readonly Span[], lineCount: number): Fold[] {
  const seen = new Set<number>();
  const out: Fold[] = [];
  for (const f of folds) {
    if (f.end <= f.start || seen.has(f.start)) continue;
    if (!shown(f.start, visible) || shown(f.start + 1, visible)) continue;
    if (!visible.some(v => v.start > f.start) && f.end < lineCount - 1) continue;
    seen.add(f.start);
    out.push({ start: f.start, end: f.end });
  }
  return out;
}

// stillOpen: TARGETS the viewport shows open (the row and the next both shown). A target the
// viewport cannot tell about is not in it: folding it again could fold its parent.
export function stillOpen(targets: readonly number[], visible: readonly Span[]): number[] {
  return targets.filter(t => shown(t, visible) && shown(t + 1, visible));
}
