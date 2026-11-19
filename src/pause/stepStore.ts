import type { WorkspaceEdit } from 'vscode-languageserver-protocol';
import type { Shown, StepChoice } from '../protocol';
import { took } from './stepModel';

// The held step (spec §3.6): one shown step a document, kept until it is answered, a new
// conjure replaces it, or the server stops. Nothing watches the document: a conjure compares
// the version it was shown at and the cursor with the step's lines. No vscode import.

// Lines: 0-based, inclusive
export interface Lines { first: number; last: number }
// busy: the answer in the air for this step (a, r or h), kept here and not on the window so a
// closed and reopened window still shows it and still refuses a second answer
export interface HeldStep {
  uri: string; shown: Shown; position: { line: number; character: number }; version: number; lines: Lines | undefined;
  busy?: StepChoice;
}

// stepLines: the lines the step's edits change in the document at URI (its documentChanges'
// text edits and its changes'), compared by SAME (the server can spell a uri differently from
// VS Code); for a step that took none, the line it was asked at; else none (durandal.nvim
// step.lua lines_in).
export function stepLines(uri: string, shown: Shown, position: { line: number }, same: (a: string, b: string) => boolean = (a, b) => a === b): Lines | undefined {
  let first: number | undefined;
  let last: number | undefined;
  const take = (es: readonly { range: { start: { line: number }; end: { line: number } } }[] | undefined) => {
    for (const e of es ?? []) {
      first = first === undefined ? e.range.start.line : Math.min(first, e.range.start.line);
      last = last === undefined ? e.range.end.line : Math.max(last, e.range.end.line);
    }
  };
  const edits: WorkspaceEdit | null = shown.edits ?? null;
  for (const c of edits?.documentChanges ?? []) if ('textDocument' in c && same(c.textDocument.uri, uri)) take(c.edits);
  for (const [u, es] of Object.entries(edits?.changes ?? {})) if (same(u, uri)) take(es);
  if (first !== undefined && last !== undefined) return { first, last: Math.max(last, first) };
  return took(shown) ? undefined : { first: position.line, last: position.line };
}

// reopens: a conjure at LINE of the document at VERSION, without a selection, shows the held
// step again instead of asking (spec §3.6)
export function reopens(h: HeldStep, version: number, line: number, selection: boolean): boolean {
  return !selection && h.version === version && h.lines !== undefined && line >= h.lines.first && line <= h.lines.last;
}

export class StepStore {
  private readonly held = new Map<string, HeldStep>();
  set(h: HeldStep): void { this.held.set(h.uri, h); }
  get(uri: string): HeldStep | undefined { return this.held.get(uri); }
  drop(uri: string): void { this.held.delete(uri); }
  dropAll(): void { this.held.clear(); }
}
