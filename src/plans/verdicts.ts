// The verdict margin's rule (spec §3.4; nvim place_claim_signs): one mark per line from the
// olifant diagnostics, the worst wins. No vscode import.
import type { Glyphs } from './glyphs';

// VS Code's DiagnosticSeverity numbers: Error 0, Warning 1, Information 2, Hint 3.
export type Severity = 0 | 1 | 2 | 3;
export interface DiagLike { line: number; source?: string; code?: string; severity: Severity }
export type MarkKind = 'wrong' | 'unsure' | 'checking' | 'queued' | 'right' | 'E' | 'W' | 'I' | 'H';
export interface Mark { line: number; kind: MarkKind; text: string }

type Verdict = 'wrong' | 'unsure' | 'checking' | 'queued' | 'right';
const VERDICTS = new Map<string, { kind: Verdict; rank: number }>([
  ['claim-wrong', { kind: 'wrong', rank: 5 }],
  ['claim-unsure', { kind: 'unsure', rank: 4 }],
  ['claim-checking', { kind: 'checking', rank: 3 }],
  ['claim-queued', { kind: 'queued', rank: 2 }],
  ['claim-right', { kind: 'right', rank: 1 }],
]);
const SOURCES = new Set(['olifant-plan', 'olifant']);
const LETTERS = ['E', 'W', 'I', 'H'] as const;

export function worstPerLine(diags: readonly DiagLike[], glyphs: Glyphs): Mark[] {
  const best = new Map<number, { rank: number; mark: Mark }>();
  for (const d of diags) {
    if (d.source === undefined || !SOURCES.has(d.source)) continue;
    const v = d.code === undefined ? undefined : VERDICTS.get(d.code);
    // a verdict ranks above every severity (nvim: rank + 10)
    const rank = v ? v.rank + 10 : 4 - d.severity;
    const mark: Mark = v ? { line: d.line, kind: v.kind, text: glyphs[v.kind] } : { line: d.line, kind: LETTERS[d.severity], text: LETTERS[d.severity] };
    const cur = best.get(d.line);
    if (!cur || rank > cur.rank) best.set(d.line, { rank, mark });
  }
  return [...best.values()].map(b => b.mark).sort((a, b) => a.line - b.line);
}

export type MarkColour = 'warning' | 'error' | 'passed' | 'hint';

export function colourOf(kind: MarkKind): MarkColour {
  if (kind === 'wrong' || kind === 'W') return 'warning';
  if (kind === 'E') return 'error';
  if (kind === 'right') return 'passed';
  return 'hint';
}
