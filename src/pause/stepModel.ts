// The conjure step's View (durandal.nvim step.lua's situation, ported; spec §3.4): a shown step
// laid out in display cells at the panel's width. The window's fourth source, beside the do,
// the errand and the reconcile. No vscode import.
import type { Shown, StepChoice } from '../protocol';
import { cutLine, helpLines, layout, SHARED_KEYS, type KeyHelp } from './model';
import { diffLines, diffTitle, fit, put, span } from './reviewModel';
import { given } from './text';
import type { Line, SpanKind, View } from './viewModel';

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

// took: whether the writer took a step; only an explicit false is none
export const took = (s: Shown): boolean => s.took !== false;
export const stepFiles = (s: Shown): { file: string; diff: string }[] => list(s.diffs);

export const STEP_BUSY = 'the last answer is still on its way';
export const NO_HARDER = 'no harder writer: name one with [conjure] harder';
export const NO_STEP = 'no step to accept: h asks the harder writer, d shows the reply';
export const STEP_BUSY_WORDS: Record<StepChoice, string> = { accept: 'landing…', reject: 'rejecting…', harder: 'asking the harder writer…' };

// The step's keys as its help names them (step.lua M.keys).
export const STEP_KEYS: KeyHelp[] = [
  { keys: ['a'], help: 'accept: the step lands, one undo step per file' },
  { keys: ['r'], help: 'reject: nothing lands' },
  { keys: ['h'], help: 'harder: the same step again from [conjure] harder, replacing this one' },
  { keys: ['[', ']'], help: 'previous / next file; the diff follows' },
  SHARED_KEYS.j,
  SHARED_KEYS.PageDown,
  SHARED_KEYS.Tab,
  { keys: ['d'], help: "details: the situation the writer read and its reply, beside the window" },
  { keys: ['q', 'Escape'], help: 'later: the window closes; the step stays, a conjure on its lines reopens it' },
  SHARED_KEYS['?'],
];

// stepRefusal: why CHOICE is not sent for S (BUSY: an answer is on its way), or undefined
export function stepRefusal(s: Shown, choice: StepChoice, busy: boolean): string | undefined {
  if (busy) return STEP_BUSY;
  if (choice === 'harder' && s.harder !== true) return NO_HARDER;
  if (choice === 'accept' && !took(s)) return NO_STEP;
  return undefined;
}

// The footer: `Tab diff` first when narrow; a only when the writer took a step, h only with a
// harder writer (step.lua's legend parts).
export function stepLegend(s: Shown, narrow: boolean): string {
  const parts: string[] = [];
  if (narrow) parts.push('Tab diff');
  if (took(s)) parts.push('a accept');
  parts.push('r reject');
  if (s.harder === true) parts.push('h harder');
  parts.push('[ ] files', 'd details', '? help', 'q later');
  return parts.join(' · ');
}

// How the tests moved, in words, and their colour: red when any newly fails, dim when only
// still red (or no change, or no tests), green otherwise.
function testsWords(s: Shown): { text: string; kind: SpanKind } {
  const t = given(s.tests) ? s.tests : { passing: [], failing: [], stillRed: [], noTests: false };
  if (t.noTests === true) return { text: 'no tests', kind: 'dim' };
  const passing = list(t.passing).length;
  const failing = list(t.failing).length;
  const red = list(t.stillRed).length;
  const parts: string[] = [];
  if (passing > 0) parts.push(`+${passing} passing`);
  if (failing > 0) parts.push(`-${failing} newly failing`);
  if (red > 0) parts.push(`${red} still red`);
  if (parts.length === 0) return { text: 'no change in the tests', kind: 'dim' };
  return { text: parts.join(' · '), kind: failing > 0 ? 'red' : red > 0 ? 'dim' : 'green' };
}

// The titles: full `conjure · <unit> · <goal>`, short `conjure · <goal>`; a step that took
// none: `conjure · no step · <goal>` (goal nothing: the writer saw nothing to do).
function titles(s: Shown): { full: Line; short: Line } {
  let goal = given(s.goal) ? String(s.goal) : '(no goal stated)';
  if (!took(s)) {
    if (goal === 'nothing') goal = 'the writer saw nothing to do';
    const t = put([span('conjure · no step · ', 'title'), span(goal, 'proposal')]);
    return { full: t, short: t };
  }
  const unit = given(s.unit) ? ` · ${s.unit}` : '';
  return {
    full: put([span(`conjure${unit} · `, 'title'), span(goal, 'proposal')]),
    short: put([span('conjure · ', 'title'), span(goal, 'proposal')]),
  };
}

// stepView: the whole View of S for a panel COLS cells wide, file SELECTED (0-based; out of
// range: the first), BUSY the answer on its way.
export function stepView(s: Shown, o: { cols: number; selected: number; flipped: boolean; help: boolean; busy?: StepChoice }): View {
  const geo = layout(o.cols);
  const w = geo.text;
  const files = stepFiles(s);
  const sel = o.selected >= 0 && o.selected < files.length ? o.selected : files.length > 0 ? 0 : -1;
  const lines: Line[] = [];
  const entryAt: number[] = [];
  const push = (l: Line, entry = -1): void => { lines.push(l); entryAt.push(entry); };

  const facts = [given(s.writer) ? String(s.writer) : 'the writer'];
  if (typeof s.seconds === 'number') facts.push(`${s.seconds.toFixed(1)} s`);
  if (typeof s.cost === 'number') facts.push(`$${s.cost.toFixed(3)}`);
  push(put([span(facts.join(' · '), 'dim')], w));
  const t = testsWords(s);
  push(put([span('tests   ', 'section'), span(t.text, t.kind)], w));
  const dropped = list(s.dropped);
  if (dropped.length > 0) push(put([span(`dropped: ${dropped.map(String).join(', ')}`, 'red')], w));
  if (!took(s)) {
    const next = s.harder === true ? 'h asks the harder writer, d shows its reply' : 'd shows its reply';
    push(put([span(`the writer took no step: ${next}`, 'strong')], w));
  }
  push([]);

  // the files, each with whether it parses, the selected one marked: its diff is on the right
  const ok = new Map(list(s.parses).map(p => [String(p.file), p.ok]));
  if (files.length > 0) {
    const right = '[ ] file';
    push([span('files', 'section'), span(' '.repeat(Math.max(w - 5 - right.length, 1))), span('[ ]', 'key'), span(' file', 'dim')]);
    files.forEach((f, i) => {
      const bad = ok.get(String(f.file)) === false;
      push(put([span(i === sel ? '> ' : '  '), span(bad ? '✗ ' : '✓ ', bad ? 'red' : 'green'), span(String(f.file))], w), i);
    });
  } else if (took(s)) {
    push([span('the step changes no file', 'dim')]);
  }
  while (lines.length > 0 && lines[lines.length - 1].length === 0) { lines.pop(); entryAt.pop(); }

  const file = sel >= 0 ? files[sel] : undefined;
  const diff = file
    ? { title: diffTitle(`file ${sel + 1} of ${files.length} · ${file.file}`, geo.narrow), lines: diffLines(given(file.diff) ? String(file.diff) : '') }
    : { title: diffTitle('no change', geo.narrow), lines: [[span('the step changes no file', 'dim')]] };
  const tt = titles(s);
  const view: View = {
    state: o.busy !== undefined ? 'busy' : 'review',
    tab: `conjure${given(s.unit) ? ` · ${s.unit}` : ''}`,
    title: fit([tt.full, tt.short], w),
    short: fit([tt.short], w),
    lines, entryAt, entries: files.length, selected: sel,
    rows: [],
    diff: { title: cutLine(diff.title, Math.max(geo.right - 4, 8)), lines: diff.lines },
    legend: o.busy !== undefined ? STEP_BUSY_WORDS[o.busy] : stepLegend(s, geo.narrow),
    narrow: geo.narrow, flipped: geo.narrow && o.flipped, width: w,
  };
  if (o.help) view.help = helpLines(geo.narrow ? w : geo.right - 4, STEP_KEYS);
  return view;
}
