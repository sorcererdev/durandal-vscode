// The inline item of a ghost, a plan's or a suggestion's (M7 spec §2): the whole line replaced
// by itself and the ghost's lines, so VS Code draws only what is added, as ghost text under the
// line at any cursor column. No vscode import (inline.ts's asInline and serve wrap it).

export const GHOST_INSERTED = 'durandal.suggest.ghostInserted';

// VS Code's ghost-text diff gives up past this many characters (M7 plan checks §1)
export const MAX_ITEM = 5000;

export interface GhostItem { line: number; end: number; insertText: string; command: { title: string; command: string; arguments: unknown[] } }

// Served: one ask the middleware answered for a ghost line: the item's text handed VS Code, or
// undefined when it refused one (deviation 4) (the e2e tests read them)
export interface Served { uri: string; line: number; insertText: string | undefined; args: unknown }

// the asks a ServedLog keeps
export const SERVED_KEEP = 50;

// ServedLog: the last SERVED_KEEP asks, and how many there have been. A test takes count before
// it acts and reads since(count) after, so the cap never hides what came after it.
export class ServedLog {
  private readonly kept: Served[] = [];
  private n = 0;

  get count(): number { return this.n; }

  record(s: Served): void {
    this.kept.push(s);
    this.n++;
    if (this.kept.length > SERVED_KEEP) this.kept.shift();
  }

  // since: the asks recorded after the count FROM (those still kept)
  since(from: number): Served[] {
    return this.kept.slice(Math.max(0, this.kept.length - (this.n - from)));
  }
}

// ghostItem: LINE (its text LINETEXT) becomes INSERTTEXT, with COMMAND(ARG) run on a full
// commit. undefined where VS Code would draw nothing or the wrong thing: nothing added, the
// line not kept as it is (VS Code draws no deletion, and draws a subsequence replace as
// scattered insertions), or past MAX_ITEM. The marker, the hover and the keys still work then.
export function ghostItem(line: number, lineText: string, insertText: string | undefined, command: string, arg: unknown): GhostItem | undefined {
  if (insertText === undefined || insertText === lineText || !insertText.startsWith(lineText) || insertText.length > MAX_ITEM) return undefined;
  return { line, end: lineText.length, insertText, command: { title: 'Ghost', command, arguments: [arg] } };
}

// suggestionText: a suggestion ghost's text: the line, then its lines under it
export const suggestionText = (lineText: string, lines: readonly string[]): string | undefined =>
  lines.length === 0 ? undefined : [lineText, ...lines].join('\n');
