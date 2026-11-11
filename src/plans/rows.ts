// rows: a plan row followed through the document's edits, as durandal.nvim's extmarks follow
// theirs (a running verb's row, a waiting block's row). No vscode import.

// LineChange: one content change: its range's rows (from startLine at startChar to endLine)
// replaced by text holding newLines line breaks.
export interface LineChange { startLine: number; startChar: number; endLine: number; newLines: number }

// shiftRow: ROW after C, as a right-gravity extmark at the row's column 0 follows it. Above the
// change (row < startLine, or on startLine with startChar > 0): the same. Below it (row >
// endLine): moved by the lines the change added or took. Its column 0 inside the replaced
// range (startLine < row <= endLine, or row === startLine with startChar 0): startLine +
// newLines, i.e. after the text that replaced it (a line typed before the row pushes it down).
export function shiftRow(row: number, c: LineChange): number {
  if (row > c.endLine) return row + c.newLines - (c.endLine - c.startLine);
  if (row > c.startLine || (row === c.startLine && c.startChar === 0)) return c.startLine + c.newLines;
  return row;
}

// shiftRows: ROW after CS, in their order (VS Code orders one event's changes so that applying
// them one after another is right)
export const shiftRows = (row: number, cs: readonly LineChange[]): number => cs.reduce(shiftRow, row);
