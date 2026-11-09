// review.lua's pure half: a do, an errand (a past do) and a reconcile's readings as the
// pause window's View. The rows carry what a choose needs; the key tables give the help;
// pickAtCursor is plan_review's pick. No vscode import. (src/generate/review.ts also has a
// reviewModel / ReviewModel: a different thing, the generate flow's review of a file.)
import type { DoReview, ReadingEntry, ReconcileReview, Review, ReviewListItem, ReviewOffer } from '../protocol';
import type { Line, Row, Span, SpanKind, View } from './viewModel';
import { plain } from './viewModel';
import { given, width, wrap } from './text';
import { conjureKeys, cutLine, helpLines, layout, rowLines, SCROLL_WORDS, type KeyHelp } from './model';

// A row of a review's offers pane: the server's key, and what a choose sends.
export interface ReviewRow { key: string; label: string; detail: string; choice: string; entry?: string; step?: number }

// The conjure table's entry holding KEY (pause.key in nvim): scroll, Tab and ? read the same
// in every source.
function shared(key: string): KeyHelp {
  const k = conjureKeys('').find(e => e.keys.includes(key));
  if (!k) throw new Error(`no conjure key ${key}`);
  return k;
}

export const DO_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'keep the change: the files stay, its plan lines land under the step' },
  { keys: ['r'], help: 'revert the change: the files restored as they were before the do, new files removed' },
  { keys: ['o'], help: 'reopen: keep the change and ask for more in the same thread' },
  { keys: ['t'], help: "run the step's tests now; their marks land in the plan" },
  { keys: ['p'], help: 'allow what was refused in future dos ([plans] do_tools in .olifant/config.toml)' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  shared('d'),
  { keys: ['q', 'Escape'], help: 'later: the window closes; the review stays, its lens on the step reopens it' },
  shared('?'),
];

export const ERRAND_KEYS: KeyHelp[] = [
  { keys: ['o'], help: 'reopen: ask for more in the same thread' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  shared('d'),
  { keys: ['q', 'Escape'], help: 'close' },
  shared('?'),
];

export const READING_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'apply the reading: tick the step, reopen it, write its note, or place the unit where it says' },
  { keys: ['r'], help: 'leave it: the step stays as it is (the reading is not offered again at this fingerprint)' },
  { keys: ['1-9'], help: 'place a unit in no step under that open step' },
  { keys: ['n'], help: 'a unit in no step as a new step' },
  { keys: ['i'], help: 'not work: ignore a unit in no step until it changes again' },
  { keys: ['[', ']'], help: 'previous / next reading; the diff follows' },
  shared('j'),
  shared('PageDown'),
  shared('Tab'),
  shared('d'),
  { keys: ['q', 'Escape'], help: 'later: the window closes; the readings stay, their lenses reopen them' },
  shared('?'),
];

// Why a key the review does not offer is not taken: a do's fixed letters (review.lua M.keys
// offer(choice, why)), a reading's (review.lua not_offered).
export const NOT_OFFERED: { do: Record<string, string>; reading: Record<string, string> } = {
  do: {
    a: 'nothing to keep',
    r: 'nothing to revert',
    o: 'this do has no thread to reopen',
    t: 'no tests to run',
    p: 'nothing was refused',
  },
  reading: {
    a: 'nothing to apply',
    r: 'a unit in no step is not left: i ignores it',
    i: 'only a unit in no step is ignored',
    n: 'only a unit in no step becomes a new step',
  },
};

// The words for KEY when no row of R carries it (review.lua offer's why, by_key's).
export function notOffered(r: Review, key: string): string {
  if (r.kind !== 'reconcile') return NOT_OFFERED.do[key] ?? 'not offered';
  if (entriesOf(r).length === 0) return 'nothing to review';
  return NOT_OFFERED.reading[key] ?? `no step ${key} to place it under`;
}

// A denial of a command over several lines (a heredoc): its first line, a count, and what
// follows the command ("tried `a <<EOF …` (42 lines) 2 times; not allowed.").
export function oneCommand(s: string): string {
  const m = /^([^\n]*)\n([\s\S]*)$/.exec(s);
  if (!m) return s;
  const n = s.split('\n').length;
  const tail = /`([^`\n]*)$/.exec(m[2])?.[1] ?? '';
  return `${m[1]} …\` (${n} lines)${tail}`;
}

// The footer while a choose is on its way.
export function busyWords(choice: string): string {
  const words: Record<string, string> = { keep: 'keeping…', revert: 'reverting…', test: "running the step's tests…", allow: 'allowing…' };
  return words[choice] ?? '…';
}

// The panel tab's title.
export function reviewTitle(r: Review): string {
  if (r.kind === 'reconcile') return `reconcile · ${entriesOf(r).length} to review`;
  if (r.kind === 'errand') return 'do · past';
  return doHead(r).join(' · ');
}

// A reading's index by its id; 0 when it is not there (or no id, or a do).
export function entryIndex(r: Review, entry: string | undefined): number {
  if (r.kind !== 'reconcile' || entry === undefined) return 0;
  const i = entriesOf(r).findIndex(e => e.id === entry);
  return i < 0 ? 0 : i;
}

// plan_review's pick (review.lua at_cursor): the review whose row is LINE; else a review
// with an entry on LINE (unless a do already sits on it); else the first; none: undefined.
export function pickAtCursor(reviews: ReviewListItem[], line: number): { id: string; entry?: string } | undefined {
  if (reviews.length === 0) return undefined;
  let pick = reviews[0];
  let entry: string | undefined;
  for (const r of reviews) {
    if (given(r.row) && r.row === line) { pick = r; entry = undefined; }
    for (const e of given(r.entries) ? r.entries : []) {
      if (given(e.row) && e.row === line && !(pick.kind === 'do' && pick.row === line)) { pick = r; entry = e.id; }
    }
  }
  return entry === undefined ? { id: pick.id } : { id: pick.id, entry };
}

function entriesOf(r: ReconcileReview): ReadingEntry[] {
  return given(r.entries) ? r.entries : [];
}

function filesOf(r: DoReview): DoReview['landing']['files'] {
  const landing = given(r.landing) ? r.landing : undefined;
  return landing && given(landing.files) ? landing.files : [];
}

// SELECTED clamped to N things: -1 when there are none, 0 when it is out of range.
function clamp(selected: number, n: number): number {
  if (n === 0) return -1;
  return Number.isInteger(selected) && selected >= 0 && selected < n ? selected : 0;
}

// The rows of R: a do's offers, or the selected reading's (digits carry the offer's step).
export function reviewRows(r: Review, selected: number): ReviewRow[] {
  const row = (o: ReviewOffer): ReviewRow => ({ key: o.key, label: given(o.label) ? o.label : o.choice, detail: given(o.detail) ? o.detail : '', choice: o.choice });
  if (r.kind !== 'reconcile') return (given(r.offers) ? r.offers : []).map(row);
  const es = entriesOf(r);
  const sel = clamp(selected, es.length);
  if (sel < 0) return [];
  const e = es[sel];
  return (given(e.offers) ? e.offers : []).map(o => {
    const out: ReviewRow = { ...row(o), entry: e.id };
    if (given(o.step)) out.step = o.step;
    return out;
  });
}

const rtrim = (s: string): string => s.replace(/\s+$/, '');

// One line from SPANS: empty spans dropped, cut to W cells (ending in … when cut), trailing
// spaces dropped (sheet.put).
function put(spans: Span[], w?: number): Line {
  let ss = spans.filter(x => x.text !== '');
  if (w !== undefined) ss = cutLine(ss, w);
  while (ss.length > 0) {
    const last = ss[ss.length - 1];
    const t = rtrim(last.text);
    if (t === last.text) break;
    if (t === '') ss = ss.slice(0, -1);
    else ss = [...ss.slice(0, -1), { ...last, text: t }];
  }
  return ss;
}

const span = (text: string, kind?: SpanKind): Span => (kind ? { text, kind } : { text });

// TEXT wrapped at W, each line in KIND from its first letter.
function wrapped(text: string, w: number, kind: SpanKind): Line[] {
  return wrap(text, w).map(l => {
    const lead = /^\s*/.exec(l)![0];
    return put([span(lead), span(l.slice(lead.length), kind)]);
  });
}

// The parts of a review's title head: `do`, `step N`, the unit.
function doHead(r: DoReview): string[] {
  const t = given(r.title) ? r.title : {};
  const head = ['do'];
  if (given(t.step)) head.push(`step ${t.step}`);
  if (given(t.unit)) head.push(String(t.unit));
  return head;
}

// The three titles of a do (review.lua titles): full; short without the model; bare without
// the seconds and the cost. The badge is the proposal's colour when answered, else red.
function doTitles(r: DoReview): Line[] {
  const t = given(r.title) ? r.title : {};
  const badge = given(t.badge) ? String(t.badge) : '◆ answered';
  const kind: SpanKind = badge.includes('answered') ? 'proposal' : 'red';
  const of = (model: boolean, secs: boolean): Line => {
    let f = '';
    if (model && given(t.model)) f += ` · ${t.model}`;
    if (secs && given(t.seconds)) f += ` · ${t.seconds} s`;
    if (secs && typeof t.cost === 'number') f += ` · $${t.cost.toFixed(2)}`;
    return put([span(doHead(r).join(' · ') + ' · ', 'title'), span(badge, kind), span(f, 'dim')]);
  };
  return [of(true, true), of(false, true), of(false, false)];
}

// The first of TITLES that fits W cells, else the last cut to fit (pause.lua edge).
function fit(titles: Line[], w: number): Line {
  for (const t of titles) if (width(plain(t)) <= w) return t;
  return put(titles[titles.length - 1], Math.max(w, 8));
}

// The footer: `[ ] files · <scroll> · d details · ? help · q later`, `Tab diff · ` first when
// narrow; wide, ` (the review stays)` after it when it fits (nvim's legend vs legend_short; the
// long form needs a wider pane than any text pane here, so it is nvim's for wider panes).
function legend(what: string, narrow: boolean, w: number): string {
  const parts = [...(narrow ? ['Tab diff'] : []), `[ ] ${what}`, SCROLL_WORDS, 'd details', '? help', 'q later'];
  const short = parts.join(' · ');
  const long = `${short} (the review stays)`;
  return !narrow && width(long) <= w ? long : short;
}

// A diff pane's title: TEXT, and ` · Tab back` when narrow.
function diffTitle(text: string, narrow: boolean): Line {
  return narrow ? [span(text, 'title'), span(' · ', 'title'), span('Tab', 'key'), span(' back', 'title')] : [span(text, 'title')];
}

// A diff's lines, its trailing blank lines dropped.
function diffLines(diff: string): Line[] {
  const ls = diff.split('\n');
  while (ls.length > 0 && ls[ls.length - 1] === '') ls.pop();
  return ls.map(l => [span(l)]);
}

interface Pane { title: Line; short: Line; lines: Line[]; entryAt: number[]; entries: number; selected: number; diff: { title: Line; lines: Line[] }; what: string; keys: KeyHelp[] }

// A do's or an errand's panes (review.lua situation) at W cells.
function doPane(r: DoReview, w: number, selected: number, narrow: boolean): Pane {
  const files = filesOf(r);
  const sel = clamp(selected, files.length);
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };

  if (given(r.summary)) {
    for (const l of wrapped(String(r.summary), w, 'strong')) push(l);
    push([]);
  }
  // a labelled paragraph: the label in its column, the text wrapped under itself, at most
  // 3 lines and a count of the rest (d details has them all)
  const labelled = (label: string, text: string, kind?: SpanKind): void => {
    let ls = wrap(text, Math.max(w - 8, 20));
    const more = ls.length - 3;
    if (more > 0) ls = ls.slice(0, 3);
    ls.forEach((l, i) => {
      const head = i === 0 ? label : '';
      push(put([span(head, 'section'), span(' '.repeat(8 - head.length)), span(l, kind)], w));
    });
    if (more > 0) push(put([span(' '.repeat(8)), span(`… ${more} more lines (d details)`, 'dim')], w));
  };
  if (given(r.step)) labelled('step', String(r.step));
  const said = given(r.said) ? r.said : [];
  if (said.length === 0) labelled('said', 'nothing in its grammar', 'dim');
  said.forEach((l, i) => labelled(i === 0 ? 'said' : '', String(l)));
  const tests = given(r.tests) ? r.tests : undefined;
  if (tests && tests.ran) {
    const failed = (given(tests.list) ? tests.list : []).filter(x => x.status === 'failed').map(x => String(x.test));
    const passed = Number(tests.passed) || 0;
    if (failed.length > 0) labelled('tests', `✗ ${failed.join(', ')} · ${passed} passed`, 'red');
    else labelled('tests', `● ${passed} passed`, 'green');
  } else {
    labelled('tests', "none ran (t runs the step's tests)", 'dim');
  }
  const denied = given(r.denied) ? (typeof r.denied === 'string' ? [r.denied] : r.denied) : [];
  denied.forEach((l, i) => labelled(i === 0 ? 'denied' : '', oneCommand(String(l)), i === 0 ? 'red' : undefined));
  push([]);

  // the files, the selected one marked: its diff is on the right
  if (files.length > 0) {
    const right = '[ ] file';
    push([span('files', 'section'), span(' '.repeat(Math.max(w - 5 - right.length, 1))), span('[ ]', 'key'), span(' file', 'dim')]);
    const sign: Record<string, string> = { modified: 'M', added: 'A', deleted: 'D' };
    files.forEach((f, i) => {
      push(put([span(i === sel ? '> ' : '  '), span(sign[f.status] ?? '?', f.status === 'deleted' ? 'red' : 'green'), span(` ${f.file}`)], w), i);
    });
  } else {
    push([span('no file changed', 'dim')]);
  }
  while (lines.length > 0 && lines[lines.length - 1].length === 0) { lines.pop(); entryAt.pop(); }

  const file = sel >= 0 ? files[sel] : undefined;
  const diff = file
    ? { title: diffTitle(`file ${sel + 1} of ${files.length} · ${file.file}`, narrow), lines: diffLines(given(file.diff) ? file.diff : '') }
    : { title: diffTitle('no change', narrow), lines: [[span('the do changed no file', 'dim')]] };
  const [full, short, bare] = doTitles(r);
  return {
    title: fit([full, short, bare], w), short: fit([bare], w), lines, entryAt, entries: files.length, selected: sel, diff,
    what: 'files', keys: r.kind === 'errand' ? ERRAND_KEYS : DO_KEYS,
  };
}

// A reconcile's panes (review.lua readings_situation) at W cells.
function readingsPane(r: ReconcileReview, w: number, selected: number, narrow: boolean): Pane {
  const es = entriesOf(r);
  const sel = clamp(selected, es.length);
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };
  const head = `reconcile · ${es.length} to review`;
  if (given(r.summary)) {
    for (const l of wrapped(String(r.summary), w, 'strong')) push(l);
    push([]);
  }
  const right = '[ ] reading';
  push([span('readings', 'section'), span(' '.repeat(Math.max(w - 8 - right.length, 1))), span('[ ]', 'key'), span(' reading', 'dim')]);
  es.forEach((e, i) => push(put([span(i === sel ? '> ' : '  '), span(given(e.summary) ? e.summary : e.kind)], w), i));
  if (es.length === 0) push([span('nothing left to review', 'dim')]);

  const entry = sel >= 0 ? es[sel] : undefined;
  const title = entry
    ? diffTitle(`reading ${sel + 1} of ${es.length} · ${given(entry.summary) ? entry.summary : entry.kind}`, narrow)
    : diffTitle('nothing to review', narrow);
  const landing = entry && given(entry.landing) ? entry.landing : undefined;
  let dl = diffLines(landing && given(landing.diff) ? landing.diff : '');
  if (dl.length === 0) dl = [[span('no change to the plan', 'dim')]];
  const t = put([span(head, 'title')]);
  return { title: fit([t], w), short: fit([t], w), lines, entryAt, entries: es.length, selected: sel, diff: { title, lines: dl }, what: 'readings', keys: READING_KEYS };
}

// The whole View of review R for a panel COLS cells wide, entry SELECTED (a file of a do, a
// reading of a reconcile; 0-based); BUSY the choice whose answer is on its way.
export function reviewView(r: Review, o: { cols: number; selected: number; flipped: boolean; help: boolean; busy?: string }): View {
  const geo = layout(o.cols);
  const w = geo.text;
  const p = r.kind === 'reconcile' ? readingsPane(r, w, o.selected, geo.narrow) : doPane(r, w, o.selected, geo.narrow);
  const rs = reviewRows(r, p.selected);
  const laid = rowLines(rs, w);
  const rows: Row[] = rs.map((x, i) => ({
    key: x.key, label: x.label, detail: x.detail, pressable: true,
    lines: laid.lines.slice(laid.starts[i], i + 1 < laid.starts.length ? laid.starts[i + 1] : laid.lines.length),
  }));
  const view: View = {
    state: o.busy !== undefined ? 'busy' : 'review',
    tab: reviewTitle(r),
    title: p.title, short: p.short, lines: p.lines, entryAt: p.entryAt, entries: p.entries, selected: p.selected,
    rows, diff: { ...p.diff, title: cutLine(p.diff.title, Math.max(geo.right - 4, 8)) },
    legend: o.busy !== undefined ? busyWords(o.busy) : legend(p.what, geo.narrow, w),
    narrow: geo.narrow, flipped: geo.narrow && o.flipped, width: w,
  };
  if (o.help) view.help = helpLines(geo.narrow ? w : geo.right - 4, p.keys);
  return view;
}
