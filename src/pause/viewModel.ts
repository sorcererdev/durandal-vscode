// viewModel: what the extension and the pause page share (spec §2, §4.2). No imports: the
// webview bundle (webview/tsconfig.json) compiles this file too. The extension lays out every
// pane in display cells at the width the page reports (plan decision 2); the page only paints.

// Span kinds are a closed list; the page maps kind k to class `k-<k>`. Words and glyphs carry the
// meaning, colour never does alone.
export type SpanKind =
  | 'strong' | 'dim' | 'red' | 'green' | 'check' | 'place' | 'key' | 'running' | 'title'
  | 'paused' | 'proposal' | 'section' | 'spinner';
export interface Span { text: string; kind?: SpanKind }
export type Line = Span[];

export type ViewState = 'paused' | 'proposal' | 'running' | 'review' | 'busy';

// Row: an offers row; lines are its rendered columns at the view's width (pause.lua row_lines)
export interface Row { key?: string; label: string; detail: string; pressable: boolean; lines: Line[] }

export interface View {
  state: ViewState;
  // the panel tab's words (spec §4.1: conjure · <unit>, do · step N · <unit>, reconcile · N to
  // review, do · past); the page shows title (narrow: short) as its first line
  tab: string;
  title: Line;
  short: Line;
  // the situation pane at `width` cells; entryAt[i] is the entry lines[i] shows, -1 for none
  lines: Line[];
  entryAt: number[];
  entries: number;
  selected: number;
  rows: Row[];
  // a proposal's one-line reason above the rows
  reason?: Line;
  // running: the one status line that stands instead of the rows
  status?: Line;
  diff: { title: Line; lines: Line[] };
  legend: string;
  // while ? is on: the key table, in the diff pane
  help?: Line[];
  narrow: boolean;
  // narrow only: the diff pane is the one in view
  flipped: boolean;
  width: number;
}

// extension → page
export type ToPage =
  | { type: 'view'; view: View; flash?: 'row' | 'entry' }
  | { type: 'notice'; text: string };

// page → extension
export type FromPage =
  | { type: 'ready' }
  | { type: 'size'; cols: number }
  | { type: 'key'; key: string }
  | { type: 'press'; row: number }
  | { type: 'select'; entry: number };

// PAGE_KEYS: the keys the page reports, by KeyboardEvent.key; the page lets every other key
// through (spec §4.2)
export const PAGE_KEYS: readonly string[] = [
  'a', 'b', 'c', 'd', 'h', 'i', 'j', 'k', 'n', 'o', 'p', 'q', 'r', 's', 't', 'w', 'x',
  'C', 'P', 'T', 'W', '[', ']', '?',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'Tab', 'Escape', 'PageUp', 'PageDown',
];

// plain: a line's text
export const plain = (l: Line): string => l.map(s => s.text).join('');
