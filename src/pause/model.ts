// The conjure pause's view model: durandal.nvim pause.lua's pure half, ported. A paused
// payload becomes a View laid out in display cells at the width the page reports, so the
// texts, widths, key letters and paging are nvim's. Highlight groups become span kinds.
// No vscode import: unit-tested with node --test.
import type { Paused, PausedFailed, PausedFile, PausedRound, PausedStep, PausedTest } from '../protocol';
import { cut, given, pad, width, wrap } from './text';
import type { Line, Row, Span, SpanKind, View } from './viewModel';

// ---------------------------------------------------------------------------------------
// entries, rows and keys (pause.lua :304-495)

export type EntryKind = 'wire' | 'round' | 'step' | 'proposal' | 'refused';
export interface PauseEntry { kind: EntryKind; n?: number; label: string; body: string; text: string; round?: PausedRound; step?: PausedStep }
// PauseRow: an offers row with what a resume needs
export interface PauseRow { key?: string; label: string; detail: string; choice: string; arg?: string; land?: boolean; hint?: boolean; pressable: boolean }
export interface Running { label: string; message?: string; seconds: number; round?: number; accepted: boolean }
export interface KeyHelp { keys: string[]; help: string }

const rep = (n: number): string => ' '.repeat(Math.max(n, 0));
const str = (v: unknown, otherwise = ''): string => (given(v) ? String(v) : otherwise);
// Lua's tonumber: a number, or a numeric string; else undefined
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
// a test id's last part: what follows the last `:`
const lastPart = (id: unknown): string => {
  const s = String(id);
  return /([^:]+)$/.exec(s)?.[1] ?? s;
};

// Where a wire's files wrote, as the rounds list says it (`__init__, command()`).
function wirePlaces(files: PausedFile[]): string[] {
  const places: string[] = [];
  for (const f of files) {
    for (const l of str(f.diff).split('\n')) {
      const name = /^\+\s*def\s+(\w+)\s*\(/.exec(l)?.[1];
      if (name) {
        const place = name === '__init__' ? name : `${name}()`;
        if (!places.includes(place)) places.push(place);
      }
    }
  }
  return places;
}

// What the wire did to each file, as the diff pane's title says it.
function wireFileWords(w: { param?: unknown; files?: PausedFile[] | null }): string {
  const param = str(w.param, '?');
  const out: string[] = [];
  for (const f of list(w.files)) {
    const did: string[] = [];
    for (const l of str(f.diff).split('\n')) {
      if (/^\+\s*from\s/.test(l) || /^\+\s*import\s/.test(l)) {
        if (!did.includes('+import')) did.push('+import');
      }
      const name = /^\+\s*def\s+(\w+)\s*\(/.exec(l)?.[1];
      if (name) {
        const words = name === '__init__' ? `+${param} in __init__` : `${name} takes ${param}`;
        if (!did.includes(words)) did.push(words);
      }
    }
    const file = basename(str(f.file, '?'));
    out.push(did.length > 0 ? `${file} (${did.join(', ')})` : file);
  }
  return out.join(', ');
}

// How many adapters a port's change touches beside the port.
function adaptersWords(n: number): string {
  if (n < 1) return '';
  return `, ${n}${n === 1 ? ' adapter' : ' adapters'}`;
}

// A step's kind column and body (§7.3).
function stepColumns(st: { kind?: unknown; text?: unknown; files?: unknown[] | null }): [string, string] {
  const text = str(st.text);
  const kind = given(st.kind) ? String(st.kind) : undefined;
  if (kind === 'test') {
    const m = /^test fixed: (\S+) \((.+)\)$/.exec(text);
    if (m) return ['test fixed', `${m[1]} → ${m[2]}`];
    return ['test fixed', text.replace(/^test fixed:\s*/, '')];
  }
  if (kind === 'port') {
    const m = /^port method: (\w+)\.(\w+)/.exec(text);
    const files = list(st.files).length;
    if (m) return ['port method', `${m[2]} → ${m[1]}${adaptersWords(files - 1)}`];
    return ['port method', text.replace(/^port method:\s*/, '')];
  }
  if (kind === 'hint') return ['hint', text.replace(/^hint:\s*/, '')];
  return [kind ?? 'step', text.replace(/^[^:]+:\s*/, '')];
}

// A test's short name as the engine writes it (`not_found` for
// test_cancel_booking_not_found when the paused file is cancel_booking.py, or .rs, …).
export function shortName(p: Paused, id: string): string {
  const name = lastPart(id);
  const stem = /([^/]+)\.[A-Za-z0-9]+$/.exec(str(p.file))?.[1];
  if (stem && name.startsWith(`test_${stem}_`)) return name.slice(`test_${stem}_`.length);
  return name.replace(/^test_/, '');
}

// The entries of the rounds list: the wire (0), each round, each accepted step after the
// round it follows, a proposal; in order.
export function entries(p: Paused): PauseEntry[] {
  const out: PauseEntry[] = [];
  const steps = list(p.steps).filter(st => typeof st === 'object' && st !== null && st.kind !== 'wire');
  const stepsAfter = (n: number): void => {
    for (const st of steps) {
      if (num(st.after) === n) {
        const [label, body] = stepColumns(st);
        out.push({ kind: 'step', step: st, text: str(st.text), label, body });
      }
    }
  };
  const w = list(p.wired)[0];
  if (typeof w === 'object' && w !== null) {
    const places = wirePlaces(list(w.files));
    const body = `${str(w.param, '?')}: ${str(w.port, '?')}${places.length > 0 ? ` → ${places.join(', ')}` : ''}`;
    out.push({ kind: 'wire', n: 0, text: `wire  ${body}`, label: 'wire', body });
  }
  stepsAfter(0);
  for (const r of list(p.rounds)) {
    const n = num(r.round);
    const text = str(r.line);
    const e: PauseEntry = { kind: 'round', round: r, text, label: str(r.verdict), body: text };
    if (n !== undefined) e.n = n;
    out.push(e);
    if (n !== undefined) stepsAfter(n);
  }
  const pr = given(p.proposal) && typeof p.proposal === 'object' ? p.proposal : undefined;
  if (pr) {
    const m = /^([^.]+)\.(.+)$/.exec(String(pr.test));
    const isPort = pr.kind === 'port' && m !== null;
    const what = isPort && m ? `add ${m[2]} to ${m[1]}` : `fix the test: ${shortName(p, pr.test)}`;
    if (given(pr.refused)) {
      // the reason may be a checker's message of several lines: the entry is one line
      const why = String(pr.refused).replace(/\s*\n\s*/g, ' ');
      out.push({ kind: 'refused', text: `proposal for ${shortName(p, pr.test)}, refused: ${why}`, label: 'refused', body: `${what} · ${why}` });
    } else {
      const files = list(pr.files).length;
      const body = isPort ? what + (files > 1 ? ` → port${adaptersWords(files - 1)}` : '') : what;
      out.push({ kind: 'proposal', text: isPort ? `proposal: ${what}` : `proposal for ${shortName(p, pr.test)}`, label: 'proposal', body });
    }
  }
  return out;
}

// The entry shown by default: a proposal waiting, else the last round, else the first.
export function defaultSelected(es: PauseEntry[]): number {
  const p = es.findIndex(e => e.kind === 'proposal' || e.kind === 'refused');
  if (p >= 0) return p;
  for (let i = es.length - 1; i >= 0; i--) if (es[i].kind === 'round') return i;
  return es.length > 0 ? 0 : -1;
}

// The keyed rows with ENTRY selected (design §4, §6): the server's offers in its order, each
// on its key; the keep row follows the selection; a proposal shown is its two rows.
export function rows(p: Paused, entry: PauseEntry | undefined, narrow: boolean): PauseRow[] {
  const out: PauseRow[] = [];
  const counts: Record<string, number> = {};
  type Offer = { choice?: unknown; label?: unknown; detail?: unknown; arg?: unknown; land?: unknown; hint?: unknown };
  const keyed = (o: Offer, key: string | undefined): void => {
    const row: PauseRow = {
      label: given(o.label) ? String(o.label) : given(o.choice) ? String(o.choice) : '?',
      detail: str(o.detail), choice: str(o.choice), pressable: key !== undefined,
    };
    if (key !== undefined) row.key = key;
    if (given(o.arg)) row.arg = String(o.arg);
    if (typeof o.land === 'boolean') row.land = o.land;
    if (given(o.hint)) row.hint = Boolean(o.hint);
    out.push(row);
  };
  const nth = (kind: string, keys: string[]): string | undefined => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return keys[counts[kind] - 1];
  };
  let keep: Offer | undefined;
  for (const raw of list(p.offers) as unknown[]) {
    const o: Offer = typeof raw === 'string' ? { label: raw, choice: raw } : (raw as Offer);
    const choice = given(o.choice) ? String(o.choice) : undefined;
    if (choice === 'proposal') continue; // the refused proposal is an entry, not a row
    else if (choice === 'continue') keyed(o, given(o.hint) && o.hint !== false ? 'h' : 'c');
    else if (choice === 'climb') keyed(o, 'C');
    else if (choice === 'wire') keyed(o, nth('wire', ['w', 'W']));
    else if (choice === 'reconjure') keyed(o, nth('reconjure', ['t', 'T']));
    else if (choice === 'port') keyed(o, nth('port', ['p', 'P']));
    else if (choice === 'stop' && o.land === true) keep = o;
    else if (choice === 'stop') keyed(o, 's');
    else if (choice === 'accept') keyed(o, 'a');
    else if (choice === 'reject') keyed(o, 'r');
    else keyed(o, undefined);
  }
  if (entry && entry.kind === 'refused') {
    keyed({ label: 'accept it anyway', detail: 'the test lands with the conjure as it was written; the rounds go on over it', choice: 'accept' }, 'a');
  } else if (keep && entry && entry.kind === 'wire') {
    keyed({ label: 'keep nothing but the wire', detail: "lands the wire's files alone, your body stands", choice: 'stop', land: true, arg: '0' }, 'a');
  } else if (keep && entry && entry.kind === 'round' && entry.round && given(entry.round.diff)) {
    const n = String(entry.n ?? '?');
    keyed({ label: `keep round ${n}`, detail: keep.detail, choice: 'stop', land: true, arg: n }, 'a');
  }
  if (narrow) for (const r of out) r.detail = r.detail.replaceAll('the diff on the right', 'the diff (Tab shows it)');
  return out;
}

// Why key K has no row (pause.lua no_row :1033-1044); noRow adds the proposal rule.
export const NO_ROW: Record<string, string> = {
  c: 'no more rounds to run', h: 'no more rounds to run', C: 'no stronger model to climb to',
  w: 'no port to wire', W: 'no second port to wire', t: 'no test to fix', T: 'no second test to fix',
  p: 'no port method to add', P: 'no second port method to add', s: 'nothing to stop',
  a: 'nothing to keep on this entry', r: 'no proposal to reject',
};
export function noRow(rs: PauseRow[], key: string): string {
  const answering = rs.length === 2 && rs.some(r => r.choice === 'accept' && r.key === 'a');
  if (answering && key !== 'a' && key !== 'r') return 'answer the proposal first: a accepts, r rejects';
  return NO_ROW[key] ?? 'nothing to do here';
}

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
  blank(): number { return this.put([]); }
  mark(n: number, a: number, b: number, k: SpanKind): void {
    const e = Math.min(b, this.rows[n].text.length);
    if (a < e) this.rows[n].marks.push([a, e, k]);
  }
  // TEXT wrapped at W (continued lines start with CONT), each line in KIND from its first letter
  wrapped(text: string, w: number, cont = '', kind?: SpanKind): void {
    for (const l of wrap(text, w, cont)) {
      const n = this.put([[l]]);
      if (kind) {
        const t = this.rows[n].text;
        this.mark(n, /^[ \t\n\v\f\r]*/.exec(t)![0].length, t.length, kind);
      }
    }
  }
  // line N dimmed from FROM to its end, `(d details)`'s d in the key colour
  dim(n: number, from: number): void {
    const l = this.rows[n].text;
    const at = l.indexOf('(d details)', from);
    if (at >= 0) {
      this.mark(n, from, at + 1, 'dim');
      this.mark(n, at + 1, at + 2, 'key');
      this.mark(n, at + 2, l.length, 'dim');
    } else {
      this.mark(n, from, l.length, 'dim');
    }
  }
  // OTHER's lines (at most MAX) after this sheet's
  append(other: Sheet, max?: number): void {
    other.rows.forEach((r, i) => { if (max === undefined || i < max) this.rows.push({ text: r.text, marks: [...r.marks] }); });
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

// Chunks with their neighbours of one kind joined, the empty ones dropped.
function joined(chunks: Chunk[]): Line {
  const out: Span[] = [];
  for (const [t, k] of chunks) {
    if (t === '') continue;
    const last = out[out.length - 1];
    if (last && last.kind === k) last.text += t;
    else out.push(k ? { text: t, kind: k } : { text: t });
  }
  return out;
}

const lineText = (l: Line): string => l.map(s => s.text).join('');

// LINE cut to W display cells, ending in … when cut.
function cutLine(l: Line, w: number): Line {
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

// ---------------------------------------------------------------------------------------
// the situation pane (pause.lua situation :590-789)

// The spinner's glyph: the page turns it (kind 'spinner').
const SPIN = '⠋';
const VERDICT: Record<string, SpanKind> = { red: 'red', green: 'green' };

// layout: the panel's geometry from its width in cells (pause.lua geometry :922-934). right is
// the diff pane's width: the whole panel when narrow (one pane at a time).
export function layout(cols: number): { narrow: boolean; text: number; right: number } {
  const w = Math.min(cols - 4, 150);
  const narrow = cols < 110;
  const left = narrow ? w : Math.max(60, Math.floor(w * 0.52));
  return { narrow, text: left - 4, right: narrow ? w : w - left };
}

// A test's last failure in the rounds.
function failureOf(p: Paused, id: string): PausedFailed | undefined {
  const rs = list(p.rounds);
  for (let i = rs.length - 1; i >= 0; i--) {
    for (const f of list(rs[i].failed)) if (f.test === id) return f;
  }
  return undefined;
}

// The lines under one involved test's status line, at most 6 (then `… (d details)`): got in
// red, expected in green, their labels dimmed.
function testLines(p: Paused, t: PausedTest, w: number): Sheet {
  const s = new Sheet();
  const labelled = (label: string, value: string, kind: SpanKind, tail?: string): void => {
    const head = `    ${label.padEnd(10)}`;
    const text = head + value + (tail ?? '');
    if (width(text) <= w) {
      s.put([['    '], [label, 'dim'], [rep(10 - label.length)], [value, kind], [tail ?? '', 'dim']]);
      return;
    }
    wrap(text, w, '      ').forEach((l, i) => {
      const n = s.put([[l]]);
      const len = s.rows[n].text.length;
      if (i === 0) {
        s.mark(n, 4, 4 + label.length, 'dim');
        s.mark(n, head.length, len, kind);
      } else {
        s.mark(n, 6, len, kind);
      }
    });
  };
  const plainLine = (text: string): void => {
    if (width(text) <= w) s.put([[text]]);
    else s.wrapped(text, w, '      ');
  };
  if (given(t.assertion)) plainLine(`    ${t.assertion}`);
  if (t.status === 'failing') {
    const f = failureOf(p, t.test);
    if (f) {
      const message = str(f.message);
      const first = message.split('\n')[0];
      if (given(f.got) && given(f.expected)) {
        labelled('got', String(f.got), 'red');
        labelled('expected', String(f.expected), 'green');
      } else if (!first.startsWith('assert')) {
        labelled('error', given(f.summary) ? String(f.summary) : first, 'red', given(f.at) ? ` · line ${f.at}` : undefined);
      } else {
        for (const l of message.split('\n')) plainLine(`    ${l}`);
      }
    }
  }
  if (given(t.note)) s.wrapped(`    ${t.note}`, w, '    ');
  if (s.rows.length > 6) {
    const out = new Sheet();
    out.append(s, 6);
    out.dim(out.put([['    … (d details)']]), 4);
    return out;
  }
  return s;
}

interface Titles { full: Line; short: Line; bare: Line }

// The title: the unit, the state's badge (§3.5), then the facts dimmed; the short one drops
// the model, the bare one the seconds too.
function titles(p: Paused, entry: PauseEntry | undefined, narrow: boolean, running: Running | undefined): Titles {
  const t = given(p.title) ? p.title : {};
  const head = ['conjure'];
  if (given(t.unit)) head.push(String(t.unit));
  const round = given(t.round) ? t.round : given(p.round) ? p.round : undefined;
  const of = given(t.of) ? ` of ${t.of}` : '';
  let badge: Chunk[];
  let after: string;
  if (running) {
    badge = [[SPIN, 'spinner'], [' running', 'running']];
    after = running.round !== undefined ? ` · round ${running.round}${of}` : round !== undefined ? ` after round ${round}${of}` : '';
  } else if (entry && entry.kind === 'proposal') {
    badge = [['◆ proposal', 'proposal']];
    after = round !== undefined ? ` after round ${round}${of}` : '';
  } else {
    badge = [['● paused', 'paused']];
    after = round !== undefined ? ` after round ${round}${of}` : '';
  }
  const rung = given(t.rung) ? t.rung : given(p.rung) ? p.rung : undefined;
  const seconds = given(t.seconds) ? (num(t.seconds) ?? 0) + (running ? running.seconds : 0) : undefined;
  const facts = (model: boolean, secs: boolean): string => {
    let f = after;
    if (rung !== undefined) f += ` · ${rung}${model && given(t.model) ? ` (${t.model})` : ''}`;
    if (secs && seconds !== undefined) f += ` · ${seconds} s`;
    return f;
  };
  const titleOf = (model: boolean, secs: boolean): Line =>
    joined([[`${head.join(' · ')} · `, 'title'], ...badge, [facts(model, secs), 'dim']]);
  return { full: titleOf(!narrow, true), short: titleOf(false, true), bare: titleOf(false, false) };
}

// The situation's lines at W cells: the outcome, the diagnosis, the rounds list (nine entries
// around SEL, the rest paged), the tests or the check's refusal. entryAt[i]: the entry line i
// shows, -1 none.
function situationLines(p: Paused, w: number, es: PauseEntry[], sel: number, running: Running | undefined): { lines: Line[]; entryAt: number[] } {
  const s = new Sheet();
  const at = new Map<number, number>();

  // what the person's last choice came to (a refused re-conjure), first
  if (given(p.outcome)) {
    s.wrapped(String(p.outcome), w);
    s.blank();
  }
  // why it stopped: the cause's sentence on its own and bold, the rest after a blank line
  const diagnosis = p.diagnosis;
  const sentences = Array.isArray(diagnosis) && diagnosis.length > 0 ? diagnosis : given(p.why) ? [p.why] : [];
  if (sentences.length > 0) {
    s.wrapped(String(sentences[0]), w, '', 'strong');
    if (sentences.length > 1) {
      s.blank();
      s.wrapped(sentences.slice(1).join(' '), w);
    }
    s.blank();
  }

  // the rounds list: nine entries around the selection, verdict first (§5)
  const failure = given(p.failure) ? p.failure : undefined;
  if (es.length > 0) {
    const jump = es[0].kind === 'wire' ? '0-9' : '1-9';
    const right = `[ ] page · ${jump} jump`;
    s.put([['rounds', 'section'], [rep(Math.max(w - 6 - width(right), 1))], ['[ ]', 'key'], [' page · ', 'dim'], [jump, 'key'], [' jump', 'dim']]);
    const from = Math.max(0, Math.min(sel - 4, es.length - 9));
    const to = Math.min(es.length - 1, from + 8);
    let numw = 1;
    for (let i = from; i <= to; i++) { const n = es[i].n; if (n !== undefined) numw = Math.max(numw, String(n).length); }
    if (running?.round !== undefined) numw = Math.max(numw, String(running.round).length);
    // one entry: the mark, its number (or glyph), its kind column, its body cut at its end,
    // what failed it on the right at 70 cells and wider
    const row = (mark: string, n: string, nKind: SpanKind, label: string, labelKind: SpanKind, body: string, bodyKind?: SpanKind, what?: string, whatKind?: SpanKind): number => {
      const lead = `${mark} ${rep(numw - width(n))}`;
      const kind = label + rep(Math.max(12 - width(label), 0) + 1);
      const used = width(`${lead}${n}  ${kind}`);
      const tail = what && what !== '' && w >= 70 ? what : undefined;
      const room = Math.max(w - used - (tail ? 2 + width(tail) : 0), 8);
      const b = cut(body, room);
      const chunks: Chunk[] = [[lead], [n, nKind], ['  '], [label, labelKind], [kind.slice(label.length)], [b, bodyKind]];
      if (tail) {
        chunks.push([rep(Math.max(w - used - width(b) - width(tail), 2))]);
        chunks.push([tail, whatKind]);
      }
      return s.put(chunks, w);
    };
    if (from > 0) s.put([[`  … ${from} earlier (`, 'dim'], ['[', 'key'], [' pages)', 'dim']]);
    for (let i = from; i <= to; i++) {
      const e = es[i];
      const mark = i === sel ? '>' : ' ';
      let n: number;
      if (e.kind === 'round' && e.round) {
        const r = e.round;
        const failingNames = list(r.failing);
        // a round the check refused before its tests ran: the check's name, in the wall's colour
        const checked = failingNames.length === 0 && given(r.check);
        const tool = failure && failure.kind === 'check' ? failure.tool : (failure as { tool?: unknown } | undefined)?.tool;
        const what = checked ? (given(p.checker) ? String(p.checker) : given(tool) ? String(tool) : 'check') : failingNames.join(', ');
        n = row(mark, e.n !== undefined ? String(e.n) : '?', e.n !== undefined && e.n <= 9 ? 'key' : 'dim', e.label, VERDICT[e.label] ?? 'dim', e.body, undefined,
          what, checked ? 'check' : undefined);
      } else if (e.kind === 'wire') {
        n = row(mark, '0', 'key', 'wire', 'strong', e.body);
      } else if (e.kind === 'step') {
        n = row(mark, '✓', 'green', e.label, 'strong', e.body);
      } else if (e.kind === 'refused') {
        n = row(mark, '✗', 'red', 'refused', 'red', e.body);
      } else if (running?.accepted && given(p.proposal)) {
        // accepted: in force for the round going on, a step as the next pause will say it
        const pr = p.proposal;
        const [label, b] = stepColumns({ kind: pr.kind === 'port' ? 'port' : 'test', text: given(pr.step) ? pr.step : e.body, files: pr.files });
        n = row(mark, '✓', 'green', label, 'strong', b);
      } else {
        n = row(mark, '◆', 'proposal', 'proposal', 'strong', e.body);
      }
      at.set(n, i);
    }
    if (to < es.length - 1) s.put([[`  … ${es.length - 1 - to} later (`, 'dim'], [']', 'key'], [' pages)', 'dim']]);
    // a run going on: its round, the spinner turning, what it is doing
    if (running?.round !== undefined) {
      const message = (running.message ?? 'starting…').replace(/^round \d+ of \d+ · /, '').replace(/^round \d+ · /, '');
      row(' ', String(running.round), running.round <= 9 ? 'key' : 'dim', SPIN, 'spinner', message, 'running');
    }
    s.blank();
  }

  const tests = list(p.tests);
  if (failure && failure.kind === 'check') {
    // the latest round's real failure: the check that refused its body before the tests ran
    const tool = str(failure.tool, 'the check');
    s.put([['failing', 'red'], [`  round ${str(failure.round, '?')} · `], [tool, 'check'], [' refused it before the tests ran']], w);
    const problems = list(failure.problems);
    for (let i = 0; i < problems.length; i++) {
      if (i >= 3) {
        s.dim(s.put([[`    … ${problems.length - 3} more (d details)`]]), 4);
        break;
      }
      const pr = problems[i];
      const where = basename(str(pr.file, '?')) + (given(pr.line) ? `:${pr.line}` : '');
      const indent = 4 + width(where) + 2;
      wrap(str(pr.message), Math.max(w - indent, 20)).forEach((l, j) => {
        if (j === 0) s.put([['    '], [where, 'place'], [`  ${l}`]], w);
        else s.put([[rep(indent) + l]], w);
      });
    }
    s.blank();
    // the tests did not run in that round: one dimmed line, their last state
    if (tests.length > 0) {
      let last = 0;
      for (const r of list(p.rounds)) {
        if (list(r.failed).length + list(r.passed).length > 0) last = num(r.round) ?? last;
      }
      const states = tests.map(x => `${shortName(p, x.test)} ${x.status}`);
      const text = `not run in round ${str(failure.round, '?')} · ${last === 0 ? 'before round 1' : `in round ${last}`}: ${states.join(', ')} (d details)`;
      // `(d details)` stays on one line (U+E000 holds its space through the wrap)
      wrap(text.replaceAll('(d details)', '(d\uE000details)'), w - 9).forEach((l, j) => {
        const n = s.put([[(j === 0 ? 'tests    ' : rep(9)) + l.replaceAll('\uE000', ' ')]]);
        if (j === 0) s.mark(n, 0, 5, 'section');
        s.dim(n, 9);
      });
    }
  } else {
    // the tests involved, failing first (at most 3), then passing
    const failing = tests.filter(x => x.status === 'failing');
    const passing = tests.filter(x => x.status !== 'failing');
    const show = (x: PausedTest): void => {
      const n = num(x.flipped);
      let flipped: string;
      if (n !== undefined) {
        const was = x.status === 'failing' ? 'passed' : 'failed';
        flipped = n === 0 ? `${was} before round 1` : `${was} in round ${n}`;
      } else {
        flipped = x.status === 'failing' ? 'failed before round 1' : '';
      }
      const room = Math.max(Math.min(40, w - 7 - 2 - 1 - width(flipped)), 8);
      const status = String(x.status);
      s.put([[status, x.status === 'failing' ? 'red' : 'green'], [`${rep(7 - status.length)}  ${pad(cut(lastPart(x.test), room), room)} `], [flipped, 'dim']], w);
      s.append(testLines(p, x, w));
      s.blank();
    };
    for (let i = 0; i < failing.length; i++) {
      if (i >= 3) {
        s.dim(s.put([[`  … and ${failing.length - 3} more (d details)`]]), 2);
        s.blank();
        break;
      }
      show(failing[i]);
    }
    for (const x of passing) show(x);
  }
  while (s.rows.length > 0 && s.rows[s.rows.length - 1].text === '') s.rows.pop();
  return { lines: s.lines(), entryAt: s.rows.map((_, i) => at.get(i) ?? -1) };
}

// ---------------------------------------------------------------------------------------
// the diff pane, the reason, the legend and the help (pause.lua :563-583, :791-875, :1095-1156)

// Every file keeping round R lands, as one diff; the landing when the round carries none.
function roundDiff(p: Paused, r: PausedRound | undefined): string {
  const parts: string[] = [];
  for (const f of list(r?.files)) {
    const d = str(f.diff);
    if (d !== '') parts.push(d.replace(/\n$/, ''));
  }
  if (parts.length === 0 && r && given(r.diff) && r.diff !== '') parts.push(String(r.diff).replace(/\n$/, ''));
  if (parts.length === 0) {
    const landing = p.landing;
    if (given(landing) && typeof landing === 'object' && given(landing.diff)) parts.push(String(landing.diff).replace(/\n$/, ''));
  }
  return parts.join('\n');
}

// The file names a diff touches, in order, as their last path part.
function diffFiles(diff: string): string[] {
  const names: string[] = [];
  for (const l of diff.split('\n')) {
    const f = /^--- a\/(.+)$/.exec(l)?.[1] ?? /^\+\+\+ b\/(.+)$/.exec(l)?.[1];
    if (f) {
      const name = basename(f);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

// The diff pane's title as spans: its keys (`a keeps this`, `a accept`, `r reject`, `Tab
// back`) in the key colour, `proposal` in the proposal's.
function titleSpans(title: string): Line {
  const out: Chunk[] = [];
  title.split(' · ').forEach((part, i) => {
    if (i > 0) out.push([' · ', 'title']);
    const m = /^([ar]) (.+)$/.exec(part);
    if (part === 'proposal') out.push([part, 'proposal']);
    else if (m) out.push([m[1], 'key'], [` ${m[2]}`, 'title']);
    else if (part === 'Tab back') out.push(['Tab', 'key'], [' back', 'title']);
    else out.push([part, 'title']);
  });
  return joined(out);
}

// What the selected entry would land: its title and lines, its own notes first, dimmed (a
// refusal red).
function diffPane(p: Paused, es: PauseEntry[], entry: PauseEntry | undefined, narrow: boolean): { title: string; lines: Line[] } {
  const lines: Line[] = [];
  const note = (text: string, kind: SpanKind = 'dim'): void => {
    for (const l of text.split('\n')) lines.push(l === '' ? [] : [{ text: l, kind }]);
  };
  const push = (text: unknown): void => {
    const ls = str(text).split('\n');
    while (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
    for (const l of ls) lines.push(l === '' ? [] : [{ text: l }]);
  };
  const back = narrow ? ' · Tab back' : '';
  let title: string;
  if (!entry) {
    title = 'nothing to show yet';
    note('nothing to show yet');
  } else if (entry.kind === 'wire') {
    const w = list(p.wired)[0];
    title = `before round 1 · the wire · ${wireFileWords(w)}${back}`;
    for (const f of list(w.files)) push(f.diff);
  } else if (entry.kind === 'step' && entry.step) {
    const after = num(entry.step.after) ?? 0;
    title = `${after === 0 ? 'before round 1' : `after round ${after}`} · ${entry.text}${back}`;
    for (const f of list(entry.step.files)) push(f.diff);
    if (lines.length === 0) note('(no file: it goes to the model with every round from here on)');
  } else if (entry.kind === 'round' && entry.round) {
    const d = roundDiff(p, entry.round);
    const files = diffFiles(d);
    title = `round ${entry.n ?? '?'}${given(entry.round.diff) ? ' · a keeps this' : ''}${files.length > 0 ? ` · ${files.join(', ')}` : ''}${back}`;
    // the same body as another round: said first
    let same = /^\(the same as round (\d+)\)$/.exec(entry.text)?.[1];
    if (!same) {
      const other = es.find(e => e.kind === 'round' && e.text === `(the same as round ${entry.n})`);
      if (other) same = String(other.n);
    }
    if (same) note(`(the same body as round ${same}: the diff is the same)`);
    if (d === '') note('(none: the body is your text)');
    push(d);
  } else {
    const pr = p.proposal!;
    const method = /^[^.]+\.(.+)$/.exec(String(pr.test))?.[1];
    const port = /^([^.]+)\./.exec(String(pr.test))?.[1];
    const label = pr.kind === 'port' ? `add ${method} to ${port}` : `fix the test: ${shortName(p, pr.test)}`;
    if (entry.kind === 'refused') {
      title = `proposal · ${label}, refused · a accept anyway${back}`;
      // a reason of several lines is that many lines
      note(`refused: ${pr.refused}`, 'red');
      lines.push([]);
    } else {
      title = `proposal · ${label} · a accept · r reject${back}`;
    }
    push(pr.diff);
  }
  return { title, lines };
}

// A proposal shown: what it changes, in one line, above its two rows.
function reasonOf(p: Paused, entry: PauseEntry | undefined): string | undefined {
  if (!entry || entry.kind !== 'proposal' || !given(p.proposal)) return undefined;
  const pr = p.proposal;
  const ls = str(pr.diff).split('\n');
  for (const l of ls) {
    if (/^\+[^+]/.test(l) && !/^\+\s*from\s/.test(l) && !/^\+\s*import\s/.test(l)) {
      const who = pr.kind === 'port' ? (/^([^.]+)\./.exec(String(pr.test))?.[1] ?? String(pr.test)) : shortName(p, pr.test);
      // the signature, not a Protocol's stub body
      return `${who} now: ${l.slice(1).trim().replace(/\s*:\s*\.\.\.$/, '').replace(/:$/, '')}`;
    }
  }
  return undefined;
}

const PAUSE_STAYS = ' (the pause stays)';

// legend: the footer for a state (pause.lua :860-869, the running one :1266-1267). The scroll
// keys are the page's: j k a line, PgDn PgUp a page.
export function conjureLegend(o: { narrow: boolean; proposal: boolean; running: boolean; wire: boolean }): string {
  if (o.running) return 'x cancel · q hide (it goes on) · ? help';
  const parts: string[] = [];
  if (o.narrow) parts.push('Tab diff');
  parts.push('[ ] rounds');
  if (o.narrow || !o.proposal) parts.push(`${o.wire ? '0-9' : '1-9'} jump`);
  parts.push('j k PgDn PgUp scroll', 'd details', '? help', 'q close');
  const short = parts.join(' · ');
  return o.narrow ? short : short + PAUSE_STAYS;
}

// The one table of keys (pause.lua M.keys :1095-1126), as the page names them; CHORD is the
// reopen chord's label (`Cmd+Alt+D C`).
export function conjureKeys(chord: string): KeyHelp[] {
  return [
    { keys: ['c'], help: 'continue: more rounds with this model' },
    { keys: ['h'], help: 'continue with a hint: your sentence goes to the model' },
    { keys: ['C'], help: 'climb to the stronger model' },
    { keys: ['w', 'W'], help: 'wire the first / second port candidate' },
    { keys: ['t', 'T'], help: 'fix the first / second test, then the rounds go on' },
    { keys: ['p', 'P'], help: "add the method a port lacks (the first / second; the pack's port-method), then the rounds go on" },
    { keys: ['s'], help: 'stop: nothing lands, not the wire either' },
    { keys: ['a'], help: 'accept the diff on the right: keep it, or the proposal' },
    { keys: ['r'], help: 'reject the proposal' },
    { keys: ['[', ']'], help: 'previous / next entry; the diff follows' },
    { keys: ['0-9'], help: 'jump to an entry (0 is the wire)' },
    { keys: ['j', 'k'], help: 'scroll the diff: a line' },
    { keys: ['PageDown', 'PageUp'], help: 'scroll the diff: a page' },
    { keys: ['Tab'], help: 'narrow: flip the situation and the diff' },
    { keys: ['d'], help: 'details, in a document beside this one' },
    { keys: ['x'], help: 'cancel a run (nothing lands)' },
    { keys: ['q', 'Escape'], help: `close; the pause stays, ${chord} reopens it` },
    { keys: ['?'], help: 'this help; any key closes it' },
  ];
}

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

// The running status line that replaces the rows (pause.lua offer_lines :969-984): the
// seconds and the way out always show; the message is cut first.
function statusLine(r: Running, w: number): Line {
  let message = r.message ?? 'starting…';
  if (message.startsWith(`${r.label} · `)) message = message.slice(`${r.label} · `.length);
  message = message.replace(/^round \d+ of \d+ · /, '');
  const secs = Math.floor(r.seconds);
  const tail = ` · ${secs} s · x cancels`;
  const head = `▶ ${r.label} — `;
  const s = new Sheet();
  s.put([['▶', 'running'], [' '], [r.label, 'strong'], [' — '], [cut(message, Math.max(w - width(head + tail), 8))],
    [` · ${secs} s · `, 'dim'], ['x', 'key'], [' cancels', 'dim']]);
  return s.lines()[0];
}

// conjureView: the whole View for a paused payload at COLS cells, entry SELECTED (0-based; out
// of range: the default), a run going on, the narrow pane flipped, the help shown.
export function conjureView(p: Paused, o: { cols: number; selected: number; running?: Running; flipped: boolean; help: boolean; chord: string }): View {
  const g = layout(o.cols);
  const running = o.running;
  const es = entries(p);
  const sel = o.selected >= 0 && o.selected < es.length ? o.selected : defaultSelected(es);
  const entry = sel >= 0 ? es[sel] : undefined;
  const t = titles(p, entry, g.narrow, running);
  // the title fits the pane: the model goes first, then the seconds, then it is cut
  let title = t.bare;
  for (const c of [t.full, t.short]) if (width(lineText(c)) <= g.text) { title = c; break; }
  const sit = situationLines(p, g.text, es, sel, running);
  const d = diffPane(p, es, entry, g.narrow);
  const proposal = entry?.kind === 'proposal';
  // the legend whole when it fits the pane, else without its tail (the page wraps it)
  let legend = conjureLegend({ narrow: g.narrow, proposal, running: running !== undefined, wire: es[0]?.kind === 'wire' });
  if (!running && width(legend) > g.text) legend = legend.slice(0, -PAUSE_STAYS.length);
  const view: View = {
    state: running ? 'running' : proposal ? 'proposal' : 'paused',
    tab: `conjure${given(p.title?.unit) ? ` · ${p.title?.unit}` : ''}`,
    title: cutLine(title, Math.max(g.text, 8)),
    short: t.short,
    lines: sit.lines,
    entryAt: sit.entryAt,
    entries: es.length,
    selected: sel,
    rows: [],
    diff: {
      title: o.help ? joined([['keys', 'section'], [' · any key closes this', 'title']]) : cutLine(titleSpans(d.title), Math.max(g.right - 4, 8)),
      lines: d.lines,
    },
    legend,
    narrow: g.narrow,
    flipped: g.narrow && o.flipped,
    width: g.text,
  };
  if (running) {
    view.status = statusLine(running, g.text);
  } else {
    const rs = rows(p, entry, g.narrow);
    const rl = rowLines(rs, g.text);
    view.rows = rs.map((r, i): Row => {
      const row: Row = { label: r.label, detail: r.detail, pressable: r.pressable, lines: rl.lines.slice(rl.starts[i], rl.starts[i + 1] ?? rl.lines.length) };
      if (r.key !== undefined) row.key = r.key;
      return row;
    });
    const reason = reasonOf(p, entry);
    if (reason !== undefined) view.reason = [{ text: cut(reason, g.text), kind: 'strong' }];
  }
  if (o.help) view.help = helpLines(g.right - 4, conjureKeys(o.chord));
  return view;
}
