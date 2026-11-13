// The blocks of an errand's answer (durandal.nvim ghosts.lua and plans.lua landed): where each
// goes, what it writes, and the plan's lines once the facts and the blocks are in. No vscode
// import. Rows are 0-based rows of the lines given.
import type { Block } from '../protocol';
import { applyLineEdits, TextEdit0 } from './facts';

export type Verb = 'ask' | 'validate' | 'do';

// Placed: a block at its row: its lines (fingerprints stamped) go under ROW, or replace it.
// index: the block's place in the answer (its outcome names it).
export interface Placed { index: number; row: number; replace: boolean; lines: string[] }

const HEADING = /^#+\s/;

// sectionRange: the rows of the section holding ROW: from its heading (at or above) to the row
// before the next heading; the whole plan when there is none (plans.lua section_range)
export function sectionRange(lines: readonly string[], row: number): { start: number; end: number } {
  let start = 0;
  let end = lines.length - 1;
  for (let i = Math.min(row, lines.length - 1); i >= 0; i--) {
    if (HEADING.test(lines[i])) {
      start = i;
      break;
    }
  }
  for (let i = row + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  return { start, end: Math.max(end, start) };
}

// findRow: the first row in START..END whose text is TEXT (both trimmed), else the first that
// starts with it, else (TEXT longer than 8) the first that holds it (ghosts.lua find)
export function findRow(lines: readonly string[], start: number, end: number, text: string): number | undefined {
  const rows = lines.slice(start, end + 1);
  const want = text.trim();
  let i = rows.findIndex(l => l.trim() === want);
  if (i < 0 && want !== '') i = rows.findIndex(l => l.trim().startsWith(want));
  if (i < 0 && want.length > 8) i = rows.findIndex(l => l.includes(want));
  return i < 0 ? undefined : start + i;
}

// locate: findRow, else the section's last row (ghosts.lua locate)
export const locate = (lines: readonly string[], start: number, end: number, text: string): number =>
  findRow(lines, start, end, text) ?? end;

const ANCHOR = /@([A-Za-z0-9_.\-/]+):([A-Za-z0-9_.]+)/g;

// anchorEnd: the column just past the line's last @path:Unit (its raw match, a unit's trailing
// dots kept); one preceded by a word character is no anchor (plans.lua anchor_on)
export function anchorEnd(line: string): number | undefined {
  let end: number | undefined;
  let from = 0;
  for (;;) {
    ANCHOR.lastIndex = from;
    const m = ANCHOR.exec(line);
    if (!m) return end;
    if (m.index > 0 && /[A-Za-z0-9_]/.test(line[m.index - 1])) {
      from = m.index + 1;
      continue;
    }
    end = m.index + m[0].length;
    from = end;
  }
}

const NOT_FINGERPRINTED = ['- test: ', '- also @', '- ? ', '- [ ] ', '- [x] '];

// fingerprintable: a claim or evidence line (a "- " line of none of the other kinds)
export function fingerprintable(line: string): boolean {
  const body = line.replace(/^\s*/, '');
  return body.startsWith('- ') && !NOT_FINGERPRINTED.some(p => body.startsWith(p));
}

// stamp: " ✓ FP" after a fingerprintable line's last anchor, replacing a stamp there (ghosts.lua stamp)
export function stamp(line: string, fp: string | null | undefined): string {
  if (typeof fp !== 'string' || !fingerprintable(line)) return line;
  const e = anchorEnd(line);
  if (e === undefined) return line;
  const rest = line.slice(e).replace(/^ ✓ [0-9A-Fa-f]{7}/, '');
  return `${line.slice(0, e)} ✓ ${fp}${rest}`;
}

// replaces: a block replaces its row when it says so, or when a do's block opens with a step
// (the server never says so: plans.lua landed infers it)
export function replaces(verb: Verb, block: Block): boolean {
  if (block.replace === true) return true;
  const first = Array.isArray(block.lines) ? block.lines[0]?.text : undefined;
  return verb === 'do' && typeof first === 'string' && first.trim().startsWith('- [');
}

// placeBlocks: the answer's blocks at their rows in LINES (the plan now, its facts written). A
// block with after_text goes under the line it names in the section of TRACKED (the request
// row where it is now), else under that section's last row; one after the request row goes
// under TRACKED; any other under its after. Rows are clamped to the plan. Blocks that are not
// objects are skipped; lines that are not a list, or a line without text, write nothing.
export function placeBlocks(lines: readonly string[], blocks: unknown, verb: Verb, requestRow: number, tracked: number): Placed[] {
  if (!Array.isArray(blocks)) return [];
  const last = Math.max(lines.length - 1, 0);
  const out: Placed[] = [];
  blocks.forEach((b: unknown, index) => {
    if (typeof b !== 'object' || b === null) return;
    const block = b as Block;
    let row: number;
    if (typeof block.after_text === 'string') {
      const s = sectionRange(lines, tracked);
      row = locate(lines, s.start, s.end, block.after_text);
    } else if (block.after === requestRow || typeof block.after !== 'number') {
      row = tracked;
    } else {
      row = block.after;
    }
    const given = Array.isArray(block.lines) ? block.lines : [];
    const texts = given.filter(l => typeof l === 'object' && l !== null && typeof l.text === 'string');
    out.push({ index, row: Math.max(0, Math.min(row, last)), replace: replaces(verb, block), lines: texts.map(l => stamp(l.text, l.fp)) });
  });
  return out;
}

// throughEdits: where row ROW is once EDITS (factEdits') are applied; a row an edit replaces is
// that edit's first row
export function throughEdits(edits: readonly TextEdit0[], row: number): number {
  const inside = edits.find(e => e.start <= row && row < e.end);
  const at = inside ? inside.start : row;
  let r = at;
  for (const e of edits) if (e.end <= at) r += e.lines.length - (e.end - e.start);
  return r;
}

// landing: LINES with FACTS (factEdits') and then the PLACED blocks written (their rows are rows
// of the plan with the facts in), durandal.nvim's way: from the last block to the first, each
// under its row or over it, and the rows of the other blocks below it moved by what went in;
// so blocks under one row keep the answer's order. rows: each block's row in the result.
export function landing(lines: readonly string[], facts: readonly TextEdit0[], placed: readonly Placed[]): { lines: string[]; rows: number[] } {
  const out = applyLineEdits(lines, facts);
  const rows = placed.map(p => p.row);
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    const r = rows[i];
    if (p.lines.length === 0) continue;
    if (p.replace) out.splice(r, 1, ...p.lines);
    else out.splice(r + 1, 0, ...p.lines);
    const added = p.replace ? p.lines.length - 1 : p.lines.length;
    for (let j = 0; j < rows.length; j++) if (j !== i && rows[j] > r) rows[j] += added;
  }
  return { lines: out, rows };
}
