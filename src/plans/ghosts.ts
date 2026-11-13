// Ghost blocks (M7 spec §2, §3.1; durandal.nvim ghosts.lua): an answer's blocks held under their
// plan rows until p y / p n, or a native commit, decides them. Rows follow the document's edits
// as nvim's extmarks do (rows.ts). No vscode import.
import { landing, Placed, Verb } from './blocks';
import { LineChange, shiftRows } from './rows';

// Ghost: one block of an answer: key (unique, names it in a native commit), its answer's id and
// verb, index (its place in the answer: its outcome names it), its row now, whether it replaces
// the row, its lines (fingerprints stamped by placeBlocks)
export interface Ghost { key: number; id: string | undefined; verb: Verb; index: number; row: number; replace: boolean; lines: string[] }

export class Ghosts {
  // per document, in the order they came: blocks under one row keep their answers' order
  private readonly m = new Map<string, Ghost[]>();
  private next = 0;

  add(uri: string, verb: Verb, id: string | undefined, placed: readonly Placed[]): void {
    const list = this.m.get(uri) ?? [];
    for (const p of placed) list.push({ key: ++this.next, id, verb, index: p.index, row: p.row, replace: p.replace, lines: [...p.lines] });
    if (list.length > 0) this.m.set(uri, list);
  }

  // at: the blocks under ROW, in the order they came
  at(uri: string, row: number): Ghost[] {
    return (this.m.get(uri) ?? []).filter(g => g.row === row);
  }

  // rows: the rows with a ghost, top to bottom
  rows(uri: string): number[] {
    return [...new Set((this.m.get(uri) ?? []).map(g => g.row))].sort((a, b) => a - b);
  }

  // has: whether any block named by KEYS is still here
  has(uri: string, keys: readonly number[]): boolean {
    return (this.m.get(uri) ?? []).some(g => keys.includes(g.key));
  }

  // takeKeys: the blocks named by KEYS that are still here, removed
  takeKeys(uri: string, keys: readonly number[]): Ghost[] {
    return this.remove(uri, g => keys.includes(g.key));
  }

  // shift: the rows after one change event's changes; true when URI has ghosts
  shift(uri: string, cs: readonly LineChange[]): boolean {
    const list = this.m.get(uri);
    if (!list) return false;
    for (const g of list) g.row = shiftRows(g.row, cs);
    return true;
  }

  drop(uri: string): void { this.m.delete(uri); }

  clear(): void { this.m.clear(); }

  private remove(uri: string, f: (g: Ghost) => boolean): Ghost[] {
    const list = this.m.get(uri) ?? [];
    const out = list.filter(f);
    const rest = list.filter(g => !f(g));
    if (rest.length > 0) this.m.set(uri, rest);
    else this.m.delete(uri);
    return out;
  }
}

// rowLines: ROWTEXT once BLOCKS (all under one row) are written: each goes under the row or
// over it, in their order (M6b's landing on the row alone)
export function rowLines(rowText: string, blocks: readonly Ghost[]): string[] {
  return landing([rowText], [], blocks.map(b => ({ index: b.index, row: 0, replace: b.replace, lines: b.lines }))).lines;
}

export const lineCount = (blocks: readonly Ghost[]): number => blocks.reduce((k, b) => k + b.lines.length, 0);

// markerText: the end of a ghost row (nvim's "ai" sign)
export const markerText = (n: number): string => `ai · +${n} ${n === 1 ? 'line' : 'lines'}`;

// hoverText: the row's proposal, its blocks' lines in order, as a fenced markdown block; the
// fence is longer than any run of backticks in the lines
export function hoverText(blocks: readonly Ghost[]): string {
  const lines = blocks.flatMap(b => b.lines);
  const runs = lines.flatMap(l => [...l.matchAll(/`+/g)].map(m => m[0].length));
  const fence = '`'.repeat(Math.max(2, ...runs) + 1);
  return `${fence}markdown\n${lines.join('\n')}\n${fence}`;
}
