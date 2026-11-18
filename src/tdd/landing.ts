import { differingRows } from '../plans/facts';

// landing: the words and spans of a conjure's or a stub's landing (durandal.nvim conjure.lua
// :117-207, stub.lua). Spec §4.

// savedWord: what a landing saved (write_landed, conjure.lua :117-128)
export function savedWord(saved: number, unsaved: number): string {
  if (unsaved === 0) return saved > 1 ? `${saved} files saved` : 'saved';
  if (saved === 0) return unsaved > 1 ? `${unsaved} files unsaved` : 'unsaved';
  return `${saved} saved, ${unsaved} unsaved`;
}

// stepLanded: a landed step's one line (durandal.nvim conjure.lua answered): its goal, or the
// step, and what was written (savedWord's, or nothing changed). Always info.
export function stepLanded(goal: string | null | undefined, written: string): string {
  return `conjured · ${typeof goal === 'string' && goal !== '' ? goal : 'the step'} · ${written}`;
}

// changedSpan: the lines of after that differ from before (0-based, inclusive): from the first
// differing line to the last; a pure deletion flashes the line where it was
export function changedSpan(before: string[], after: string[]): { first: number; last: number } | undefined {
  if (after.length === 0) return undefined;
  const d = differingRows(before, after);
  if (!d) return undefined;
  const { top, bottom } = d;
  const last = after.length - 1 - bottom;
  if (last < top) {
    const at = Math.min(top, after.length - 1);
    return { first: at, last: at };
  }
  return { first: top, last };
}

export interface Pos { line: number; character: number }

// selectionLines: a non-empty selection's lines, 0-based inclusive (conjure's `selection`); one
// ending at the start of a later line (a whole-line selection) stops on the line before
export function selectionLines(start: Pos, end: Pos): { start: number; end: number } | undefined {
  if (start.line === end.line && start.character === end.character) return undefined;
  const last = end.line > start.line && end.character === 0 ? end.line - 1 : end.line;
  return { start: start.line, end: last };
}

// cursorColumn: where a stubbed test's name stands on its line (column 0 when it does not)
export const cursorColumn = (text: string, name: string): number => Math.max(0, text.indexOf(name));

// stubWord: the stub's one notice (applyServerEdit's word): the files saved, then those left
// unsaved (a failed save, or unsaved edits from before)
export function stubWord(name: string, saved: string[], unsaved: string[], kept: string[]): string {
  let text = `stubbed ${name}`;
  if (saved.length > 0) text += ` · saved ${saved.join(', ')}`;
  const left = [...unsaved, ...kept];
  if (left.length > 0) text += ` · unsaved ${left.join(', ')}`;
  return text;
}
