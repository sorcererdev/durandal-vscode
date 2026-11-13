// A choose answer's facts as edits of a plan's lines (durandal.nvim plans.apply_facts, and
// the server's applyFactsText for a range). Rows are 0-based rows of LINES as they are; `to`
// is inclusive. No vscode import: the review's facts and the plan verbs' landings use it.
import type { Fact } from '../protocol';

// Replace lines [start, end) with LINES (0-based, the document's lines before any edit).
export interface TextEdit0 { start: number; end: number; lines: string[] }

const isReplace = (f: Fact): f is { row: number; text: string } =>
  typeof (f as { row?: unknown }).row === 'number' && typeof (f as { text?: unknown }).text === 'string';
const isInsert = (f: Fact): f is { after: number; lines: string[] } =>
  typeof (f as { after?: unknown }).after === 'number' && Array.isArray((f as { lines?: unknown }).lines);
const isRange = (f: Fact): f is { from: number; to: number; lines: string[] } =>
  typeof (f as { from?: unknown }).from === 'number' && typeof (f as { to?: unknown }).to === 'number' && Array.isArray((f as { lines?: unknown }).lines);

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// FACTS over LINES as edits, bottom-up (by start, descending; at one start the replace before
// the insert), none overlapping, each in the coordinates of LINES: applied one by one in this
// order, or all at once as one workspace edit, they give the same text.
// - {row, text}: line ROW becomes TEXT; out of range, or no change: dropped; the last for a
//   row wins.
// - {from, to, lines}: rows FROM..TO (inclusive, clamped to the document) become LINES; one
//   overlapping an earlier range, or changing nothing: dropped. A {row} inside it is dropped.
// - {after, lines}: LINES go below row AFTER (clamped: -1 is the top, past the end the
//   bottom); below a range's row, below the range. Several at one place keep the engine's
//   order. No lines: dropped.
export function factEdits(lines: string[], facts: Fact[]): TextEdit0[] {
  const n = lines.length;
  const ranges: { start: number; end: number; lines: string[] }[] = [];
  for (const f of facts) {
    if (!isRange(f)) continue;
    const start = Math.max(f.from, 0);
    const end = Math.min(f.to, n - 1) + 1;
    if (start >= end) continue;
    if (ranges.some(r => start < r.end && r.start < end)) continue;
    ranges.push({ start, end, lines: [...f.lines] });
  }
  const inRange = (row: number) => ranges.find(r => r.start <= row && row < r.end);

  const replaced = new Map<number, string>();
  for (const f of facts) {
    if (isRange(f) || !isReplace(f)) continue;
    if (f.row < 0 || f.row >= n || inRange(f.row)) continue;
    replaced.set(f.row, f.text);
  }

  const inserts: { at: number; after: number; i: number; lines: string[] }[] = [];
  facts.forEach((f, i) => {
    if (isRange(f) || isReplace(f) || !isInsert(f) || f.lines.length === 0) return;
    const r = inRange(f.after);
    const at = r ? r.end : Math.max(0, Math.min(f.after + 1, n));
    inserts.push({ at, after: f.after, i, lines: [...f.lines] });
  });
  inserts.sort((a, b) => a.at - b.at || a.after - b.after || a.i - b.i);

  const edits: TextEdit0[] = [];
  for (const r of ranges) if (!same(lines.slice(r.start, r.end), r.lines)) edits.push(r);
  for (const [row, text] of replaced) if (lines[row] !== text) edits.push({ start: row, end: row + 1, lines: [text] });
  for (const x of inserts) {
    const last = edits[edits.length - 1];
    if (last && last.start === x.at && last.end === x.at) last.lines.push(...x.lines);
    else edits.push({ start: x.at, end: x.at, lines: x.lines });
  }
  // bottom up; at one start the replace (end > start) goes before the insert
  return edits.sort((a, b) => b.start - a.start || b.end - a.end);
}

// applyLineEdits: LINES with EDITS applied in their order (factEdits' order: bottom-up, so each
// edit's rows are still those of LINES when it is applied).
export function applyLineEdits(lines: readonly string[], edits: readonly TextEdit0[]): string[] {
  const out = [...lines];
  for (const e of edits) out.splice(e.start, e.end - e.start, ...e.lines);
  return out;
}

// differingRows: how many rows BEFORE and AFTER share at the top (top) and, past those, at the
// bottom (bottom); undefined when they are equal. The one trim loop span and changedSpan share.
export function differingRows(before: readonly string[], after: readonly string[]): { top: number; bottom: number } | undefined {
  let top = 0;
  while (top < before.length && top < after.length && before[top] === after[top]) top++;
  if (top === before.length && top === after.length) return undefined;
  let bottom = 0;
  while (bottom < before.length - top && bottom < after.length - top
    && before[before.length - 1 - bottom] === after[after.length - 1 - bottom]) bottom++;
  return { top, bottom };
}

// span: the one edit, in rows of BEFORE, that turns BEFORE into AFTER: from the first row that
// differs to the last; undefined when they are equal.
export function span(before: readonly string[], after: readonly string[]): TextEdit0 | undefined {
  const d = differingRows(before, after);
  if (!d) return undefined;
  return { start: d.top, end: before.length - d.bottom, lines: after.slice(d.top, after.length - d.bottom) };
}

// hunks: the edits, in rows of BEFORE, that turn BEFORE into AFTER: one per run of rows that
// differ, top to bottom, none touching (a line diff over the longest common subsequence of
// rows); [] when they are equal. Each hunk alone moves the rows it does not touch only by the
// lines it adds or takes, as nvim's per-fact writes do. Past MAX_CELLS the differing middle is
// one edit (span's).
const MAX_CELLS = 1_000_000;
export function hunks(before: readonly string[], after: readonly string[]): TextEdit0[] {
  const d = differingRows(before, after);
  if (!d) return [];
  const a = before.slice(d.top, before.length - d.bottom);
  const b = after.slice(d.top, after.length - d.bottom);
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || n * m > MAX_CELLS) return [{ start: d.top, end: d.top + n, lines: b }];
  // L[i * w + j]: the length of the longest common subsequence of a[i..] and b[j..]
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const out: TextEdit0[] = [];
  let cur: TextEdit0 | undefined;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      cur = undefined;
      i++;
      j++;
      continue;
    }
    if (!cur) {
      cur = { start: d.top + i, end: d.top + i, lines: [] };
      out.push(cur);
    }
    if (j < m && (i === n || L[i * w + j + 1] >= L[(i + 1) * w + j])) cur.lines.push(b[j++]);
    else cur.end = d.top + ++i;
  }
  return out;
}
