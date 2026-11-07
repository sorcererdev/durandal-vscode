import type { Hole, Plan } from '../protocol';

// review: a plan as the review window shows it, ported from durandal.nvim preview.lua's
// model: notes (unparseable code first, as it explains what follows; then holes, other
// warnings, conflicts) and the files with both sides for vscode.diff. Pure.

export interface ReviewNote { text: string; jump?: { path: string; line: number } }
export interface ReviewFile { path: string; mark: '+' | '~'; before: string; after: string }
export interface ReviewModel { notes: ReviewNote[]; files: ReviewFile[]; canApply: boolean }

const PARSE = /^(.*?):(\d+) does not parse/;

export function holeNote(h: Hole): string {
  if (h.status === 'filled') return `${h.name} filled by ${h.model ?? ''}: ${(h.fill ?? '').replace(/\n[\s\S]*/, ' …')}`;
  if (h.status === 'skipped') return `${h.name} left as a placeholder (--no-fill)`;
  return `${h.name} left as a placeholder: ${h.why ?? ''}`;
}

export function reviewModel(plan: Plan): ReviewModel {
  const notes: ReviewNote[] = [];
  const warnings = plan.warnings ?? [];
  for (const w of warnings) {
    const m = PARSE.exec(w);
    if (m) notes.push({ text: `⚠ ${w}`, jump: { path: m[1], line: Number(m[2]) } });
  }
  for (const h of plan.holes ?? []) notes.push({ text: holeNote(h) });
  for (const w of warnings) if (!PARSE.test(w)) notes.push({ text: `⚠ ${w}` });
  for (const c of plan.conflicts ?? []) notes.push({ text: `✗ ${c.message}` });
  const files = (plan.files ?? []).map((f): ReviewFile => ({ path: f.path, mark: f.before === null ? '+' : '~', before: f.before ?? '', after: f.after }));
  return { notes, files, canApply: (plan.conflicts ?? []).length === 0 };
}
