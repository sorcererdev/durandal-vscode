import type { MutateResult, MutateSurvivor, Survivor } from '../protocol';

// memory: a mutate's survivors per document (durandal.nvim's durandal_mutate marks,
// mutate.lua). An answer replaces those inside its unit's lines and other units' stay. The
// picker, waive and the re-mutate after a green run read them (spec §5). Lines 1-based, as the
// server's; edits move them as nvim's extmarks move (Review Focus 1).

export const markText = (s: MutateSurvivor): string => `${s.from} → ${s.to} survives${s.dim ? ' (likely equivalent)' : ''}`;

type Lines = { first: number; last: number };
const inside = (line: number, l: Lines) => line >= l.first && line <= l.last;

export class SurvivorMemory {
  private readonly docs = new Map<string, MutateSurvivor[]>();

  survivors(uri: string): MutateSurvivor[] {
    return [...(this.docs.get(uri) ?? [])];
  }

  within(uri: string, lines: Lines): MutateSurvivor[] {
    return this.survivors(uri).filter(s => inside(s.line, lines));
  }

  replace(uri: string, a: MutateResult): void {
    const kept = this.survivors(uri).filter(s => !inside(s.line, a.lines));
    this.set(uri, [...kept, ...a.survivors.map(s => ({ ...s }))]);
  }

  // remove: a waived survivor, the first with its line, from and to
  remove(uri: string, s: Survivor): boolean {
    const all = this.survivors(uri);
    const i = all.findIndex(x => x.line === s.line && x.from === s.from && x.to === s.to);
    if (i < 0) return false;
    all.splice(i, 1);
    this.set(uri, all);
    return true;
  }

  forget(uri: string): void {
    this.docs.delete(uri);
  }

  // shift: an edit replaced the text from (startLine, startCol) to line endLine (all 0-based,
  // as a contentChange's range) with text holding `inserted` newlines. Survivors below the edit
  // move by the difference; those on a line it swallowed (after startLine, up to endLine)
  // collapse to its start, as an nvim extmark inside a deleted range does. A survivor sits at
  // column 0 of its line, so an edit that starts at column 0 of that line and adds lines pushes
  // it down too; one that starts after column 0 does not. Returns whether any survivor moved.
  shift(uri: string, startLine: number, startCol: number, endLine: number, inserted: number): boolean {
    const all = this.docs.get(uri);
    if (!all) return false;
    let moved = false;
    for (const s of all) {
      const line = shiftLine(s.line, startLine, startCol, endLine, inserted);
      if (s.line !== line) {
        s.line = line;
        moved = true;
      }
    }
    return moved;
  }

  private set(uri: string, ss: MutateSurvivor[]): void {
    if (ss.length === 0) this.docs.delete(uri);
    else this.docs.set(uri, ss);
  }
}

// shiftLine: where a 1-based line at column 0 goes after an edit (SurvivorMemory.shift's rule;
// the open picker's unit lines follow edits by it too)
export function shiftLine(line: number, startLine: number, startCol: number, endLine: number, inserted: number): number {
  const delta = inserted - (endLine - startLine);
  const row = line - 1;
  if (row > endLine) return line + delta;
  if (row > startLine) return startLine + 1;
  if (row === startLine && startCol === 0 && delta > 0) return line + delta;
  return line;
}

// killedBetween: the marks of before that after no longer holds (mutate.lua :107-116)
export function killedBetween(before: MutateSurvivor[], after: MutateSurvivor[]): string[] {
  const key = (s: MutateSurvivor) => `${s.line}\0${markText(s)}`;
  const now = new Set(after.map(key));
  return before.filter(s => !now.has(key(s))).map(s => `${s.from} → ${s.to} on line ${s.line}`);
}

// nextMarked: the first marked line that no unit mutated again holds (mutate.lua :86-97)
export function nextMarked(survivors: MutateSurvivor[], done: Lines[]): number | undefined {
  const open = survivors.map(s => s.line).filter(l => !done.some(d => inside(l, d)));
  return open.length === 0 ? undefined : Math.min(...open);
}

// plainSurvivor: the survivor olifant/stub and olifant/waive take
export const plainSurvivor = (s: MutateSurvivor): Survivor => ({ line: s.line, operator: s.operator, from: s.from, to: s.to, mutated: s.mutated });

export interface Row { label: string; description?: string; detail: string; value: MutateSurvivor }

// rowsOf: the picker's rows (survivors.lua M.rows): the server's order, the dim ones last
export function rowsOf(ss: MutateSurvivor[]): Row[] {
  return [...ss.filter(s => !s.dim), ...ss.filter(s => s.dim)].map(s => ({
    label: `line ${s.line}  ${s.operator}  ${s.from} → ${s.to}`,
    description: s.dim ? 'likely equivalent' : undefined,
    detail: s.mutated.trim() || `${s.from} → ${s.to}`,
    value: s,
  }));
}
