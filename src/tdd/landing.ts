import type { ConjureLanded } from '../protocol';

// landing: the words and spans of a conjure's or a stub's landing (durandal.nvim conjure.lua
// :117-207, stub.lua). Spec §4.

// savedWord: what a landing saved (write_landed, conjure.lua :117-128)
export function savedWord(saved: number, unsaved: number): string {
  if (unsaved === 0) return saved > 1 ? `${saved} files saved` : 'saved';
  if (saved === 0) return unsaved > 1 ? `${unsaved} files unsaved` : 'unsaved';
  return `${saved} saved, ${unsaved} unsaved`;
}

export interface Notice { level: 'info' | 'warn'; text: string }

// conjureNotice: the landing's one line (conjure.lua :188-206); written is savedWord's, or
// undefined when nothing was edited. The level is the outcome: red warns.
export function conjureNotice(a: ConjureLanded, written: string | undefined): Notice {
  const level = a.green === false ? 'warn' : 'info';
  const summary = String(a.summary);
  if (a.stopped) {
    if (written === undefined) return { level: 'info', text: 'stopped · nothing landed' };
    return { level, text: `${summary} · ${written} · undo reverts it` };
  }
  let text = `conjured · ${summary}`;
  const rungs = Array.isArray(a.rungs) ? a.rungs : [];
  // a steered landing names its round itself
  if (!summary.includes(' in round ') && ((Number(a.rounds) || 0) > 1 || rungs.length > 1)) {
    text += ` · ${a.rounds} rounds · ${rungs.join(' → ')}`;
  }
  if (written !== undefined) text += ` · ${written}`;
  return { level, text };
}

// firstSentence: the first non-blank line, up to its first sentence end
export function firstSentence(s: string): string {
  const line = (s ?? '').split('\n').map(l => l.trim()).find(l => l !== '') ?? '';
  const m = /^(.*?[.!?])(\s|$)/.exec(line);
  return m ? m[1] : line;
}

// pausedNotice: M4's word for a paused conjure (spec §4, ruling 3)
export function pausedNotice(diagnosis: string): string {
  return `conjure paused: ${firstSentence(diagnosis)} — steering arrives in a later milestone`;
}

// changedSpan: the lines of after that differ from before (0-based, inclusive): from the first
// differing line to the last; a pure deletion flashes the line where it was
export function changedSpan(before: string[], after: string[]): { first: number; last: number } | undefined {
  if (after.length === 0) return undefined;
  let top = 0;
  while (top < before.length && top < after.length && before[top] === after[top]) top++;
  if (top === before.length && top === after.length) return undefined;
  let bottom = 0;
  while (bottom < before.length - top && bottom < after.length - top
    && before[before.length - 1 - bottom] === after[after.length - 1 - bottom]) bottom++;
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
