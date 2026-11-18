// The review window's shared layout: rows, help, cutting and the panel's geometry (durandal.nvim
// pause.lua's pure half, ported). Lines are laid out in display cells at the width the page
// reports; highlight groups become span kinds. No vscode import: unit-tested with node --test.
import { cut, pad, width, wrap } from './text';
import type { Line, Span, SpanKind } from './viewModel';

export interface KeyHelp { keys: string[]; help: string }

const rep = (n: number): string => ' '.repeat(Math.max(n, 0));

// ---------------------------------------------------------------------------------------
// lines and their colours as data (pause.lua sheet :136-201)

type Chunk = [string, SpanKind?];
type Mark = [number, number, SpanKind];
interface Raw { text: string; marks: Mark[] }

const rtrim = (s: string): string => s.replace(/[ \t\n\v\f\r]+$/, '');

// RAW as spans: the marked stretches with their kind, the rest plain (a later mark wins).
function spansOf(r: Raw): Line {
  if (r.text === '') return [];
  const kinds: (SpanKind | undefined)[] = new Array(r.text.length).fill(undefined);
  for (const [a, b, k] of r.marks) for (let i = a; i < b; i++) kinds[i] = k;
  const out: Span[] = [];
  let start = 0;
  for (let i = 1; i <= r.text.length; i++) {
    if (i === r.text.length || kinds[i] !== kinds[start]) {
      const span: Span = { text: r.text.slice(start, i) };
      if (kinds[start]) span.kind = kinds[start];
      out.push(span);
      start = i;
    }
  }
  return out;
}

class Sheet {
  rows: Raw[] = [];
  // one line from CHUNKS, cut to W (when given), its trailing spaces dropped; its index
  put(chunks: Chunk[], w?: number): number {
    let text = '';
    const spans: Mark[] = [];
    for (const [t, k] of chunks) {
      if (k && t !== '') spans.push([text.length, text.length + t.length, k]);
      text += t;
    }
    if (w !== undefined) text = cut(text, w);
    text = rtrim(text);
    const marks: Mark[] = [];
    for (const [a, b, k] of spans) {
      const e = Math.min(b, text.length);
      if (a < e) marks.push([a, e, k]);
    }
    this.rows.push({ text, marks });
    return this.rows.length - 1;
  }
  mark(n: number, a: number, b: number, k: SpanKind): void {
    const e = Math.min(b, this.rows[n].text.length);
    if (a < e) this.rows[n].marks.push([a, e, k]);
  }
  lines(): Line[] { return this.rows.map(spansOf); }
}

// ---------------------------------------------------------------------------------------
// the offers' lines (pause.lua row_lines :497-558)

// The label column at 70 cells and wider: a label up to 26 cells, then two.
const LABEL = 28;

// ROWS as the offers pane's lines at WIDTH (§7.5): at 70 cells and wider three columns (the
// key, the label in its column, the detail wrapped under itself; a label too long for its
// column has the line to itself); narrower, `label — detail` wrapped under the label. A
// detail takes at most three lines, the third cut with … only when even that is not
// enough. starts[i]: the line row i starts on.
export function rowLines(rs: { key?: string; label: string; detail: string }[], w: number): { lines: Line[]; starts: number[] } {
  const s = new Sheet();
  const starts: number[] = [];
  const columns = w >= 70;
  const three = (ls: string[], cw: number): string[] => (ls.length > 3 ? [ls[0], ls[1], cut(ls.slice(2).join(' '), cw)] : ls);
  for (const r of rs) {
    const key = r.key ?? ' ';
    const detail = r.detail ?? '';
    starts.push(s.rows.length);
    if (columns) {
      const dw = w - 3 - LABEL;
      const ds = detail !== '' ? three(wrap(detail, dw), dw) : [];
      const lead = width(r.label) <= LABEL - 2;
      const rowLine = (label: string, d: string | undefined): void => {
        const dt = d === undefined ? undefined : rtrim(d);
        let text: string;
        if (label !== '' && dt !== undefined) text = `${key}  ${pad(label, LABEL)}${dt}`;
        else if (label !== '') text = `${key}  ${label}`;
        else text = rep(3 + LABEL) + (dt ?? '');
        const n = s.put([[text]]);
        if (label !== '' && r.key) s.mark(n, 0, r.key.length, 'key');
        if (dt) s.mark(n, s.rows[n].text.length - dt.length, s.rows[n].text.length, 'dim');
      };
      if (lead) {
        rowLine(r.label, ds[0]);
        for (let i = 1; i < ds.length; i++) rowLine('', ds[i]);
      } else {
        rowLine(cut(r.label, w - 3), undefined);
        for (const d of ds) rowLine('', d);
      }
    } else {
      const text = r.label + (detail !== '' ? ` — ${detail}` : '');
      const wl = three(wrap(text, w - 3), w - 3);
      let dimmed = false;
      wl.forEach((l, i) => {
        const n = s.put([[(i === 0 ? `${key}  ` : '   ') + l]]);
        if (i === 0 && r.key) s.mark(n, 0, r.key.length, 'key');
        const line = s.rows[n].text;
        if (dimmed) {
          s.mark(n, 3, line.length, 'dim');
        } else {
          const dash = line.indexOf(' — ');
          if (dash >= 0) {
            s.mark(n, dash + 1, line.length, 'dim');
            dimmed = true;
          }
        }
      });
    }
  }
  return { lines: s.lines(), starts };
}

const lineText = (l: Line): string => l.map(s => s.text).join('');

// LINE cut to W display cells, ending in … when cut.
export function cutLine(l: Line, w: number): Line {
  const full = lineText(l);
  if (width(full) <= w) return l;
  const keep = cut(full, w).length - 1;
  const out: Span[] = [];
  let used = 0;
  for (const s of l) {
    if (used >= keep) break;
    const part = s.text.slice(0, keep - used);
    out.push(s.kind ? { text: part, kind: s.kind } : { text: part });
    used += part.length;
  }
  if (out.length === 0) out.push({ text: '' });
  out[out.length - 1].text += '…';
  return out;
}

// layout: the panel's geometry from its width in cells (pause.lua geometry :922-934). right is
// the diff pane's width: the whole panel when narrow (one pane at a time).
export function layout(cols: number): { narrow: boolean; text: number; right: number } {
  const w = Math.min(cols - 4, 150);
  const narrow = cols < 110;
  const left = narrow ? w : Math.max(60, Math.floor(w * 0.52));
  return { narrow, text: left - 4, right: narrow ? w : w - left };
}

// The scroll keys of both legends: j k a line, PgDn PgUp a page.
export const SCROLL_WORDS = 'j k PgDn PgUp scroll';

// The keys every source of the window shares, as its help names them: the review's tables and
// the step's read them from here (reviewModel.ts shared()), so none depends on another's table.
export const SHARED_KEYS = {
  j: { keys: ['j', 'k'], help: 'scroll the diff: a line' },
  PageDown: { keys: ['PageDown', 'PageUp'], help: 'scroll the diff: a page' },
  Tab: { keys: ['Tab'], help: 'narrow: flip the situation and the diff' },
  d: { keys: ['d'], help: 'details, in a document beside this one' },
  '?': { keys: ['?'], help: 'this help; any key closes it' },
} satisfies Record<string, KeyHelp>;

// A key as the help shows it.
const SHOWN: Record<string, string> = { Escape: 'Esc', PageDown: 'PgDn', PageUp: 'PgUp' };
const keyText = (keys: string[]): string => keys.map(k => SHOWN[k] ?? k).join(' ');

// The help (?): every key on a line of its own, its words after it, wrapped at W under the words.
export function helpLines(w: number, keys: KeyHelp[]): Line[] {
  const s = new Sheet();
  s.put([['keys', 'section']]);
  for (const k of keys) {
    const tok = keyText(k.keys);
    wrap(k.help, w - 12).forEach((l, i) => {
      if (i === 0) s.put([['  '], [tok, 'key'], [rep(Math.max(10 - width(tok), 1)) + l]]);
      else s.put([[rep(12) + l]]);
    });
  }
  return s.lines();
}
