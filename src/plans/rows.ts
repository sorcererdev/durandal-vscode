import { shiftLine } from '../tdd/memory';

// rows: a plan row followed through the document's edits, as durandal.nvim's extmarks follow
// theirs (a running verb's row, a waiting block's row). No vscode import.

// LineChange: one content change: its range's rows (from startLine at startChar to endLine)
// replaced by text holding newLines line breaks.
export interface LineChange { startLine: number; startChar: number; endLine: number; newLines: number }

// shiftRow: ROW after C, M4's shiftLine (1-based) over a 0-based row. Above the change: the same. Below it: moved by the lines it added or
// took. On its first row: the same, unless the change is an insert at column 0 of that row (a
// line typed before the row pushes it down). Inside it: the change's first row.
export const shiftRow = (row: number, c: LineChange): number =>
  shiftLine(row + 1, c.startLine, c.startChar, c.endLine, c.newLines) - 1;

// shiftRows: ROW after CS, in their order (VS Code orders one event's changes so that applying
// them one after another is right)
export const shiftRows = (row: number, cs: readonly LineChange[]): number => cs.reduce(shiftRow, row);
