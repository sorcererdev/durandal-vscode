import { PAGE_KEYS, type FromPage, type ToPage, type View } from '../src/pause/viewModel';
import { html } from './render';

// The page script (spec §4.2, §4.3). It renders the View the extension sends and names what was
// pressed; it decides nothing about keys. It owns three things only: the diff pane's scroll
// (kept while the diff is unchanged; j k PageUp PageDown scroll it), the 150 ms flash and the
// 1.5 s footer notice. Its width in cells is measured on a hidden 100-cell span in the editor
// font (plan decision 5). No inline style anywhere: classes only (the CSP allows none).

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = acquireVsCodeApi();
const post = (m: FromPage): void => api.postMessage(m);

const REPORTED = new Set(PAGE_KEYS);
const SCROLL = new Set(['j', 'k', 'PageUp', 'PageDown']);
const FLASH_MS = 150;
const NOTICE_MS = 1500;
const RESIZE_MS = 100;

const root = document.getElementById('root') as HTMLElement;
const measure = document.getElementById('measure') as HTMLElement;
const byId = (id: string): HTMLElement | null => document.getElementById(id);

let view: View | undefined;
let notice: string | undefined;
let noticeTimer: number | undefined;
let lastRow: number | undefined; // the row last clicked: a 'row' flash marks it
let lastKey: string | undefined; // else the row whose key was last reported
let flipped: boolean | undefined; // narrow only: the pane last scrolled into view

// the diff pane's content: the scroll stays while it is unchanged
const diffKey = (v: View): string => JSON.stringify(v.help ?? v.diff);

// scroller: what j k PageUp PageDown move: the diff pane, or the whole stack when narrow
const scroller = (): HTMLElement | null => (view?.narrow ? root.querySelector('main') : byId('diff'));

function render(next: View, flash?: 'row' | 'entry'): void {
  const sitTop = byId('sit')?.scrollTop ?? 0;
  const scrollTop = scroller()?.scrollTop ?? 0;
  const same = view !== undefined && view.narrow === next.narrow && diffKey(view) === diffKey(next);
  view = next;
  root.innerHTML = html(next, notice);
  const sit = byId('sit');
  if (sit) sit.scrollTop = sitTop;
  const s = scroller();
  if (s) s.scrollTop = same ? scrollTop : 0;
  if (next.narrow && next.flipped !== flipped) (next.flipped ? byId('diff') : byId('sit'))?.scrollIntoView({ block: 'start' });
  flipped = next.narrow ? next.flipped : undefined;
  if (flash) flashOn(flash);
}

function flashed(what: 'row' | 'entry'): HTMLElement[] {
  if (what === 'entry') return Array.from(root.querySelectorAll<HTMLElement>('.entry.selected'));
  const el = lastRow !== undefined
    ? root.querySelector<HTMLElement>(`[data-row="${lastRow}"]`)
    : lastKey !== undefined ? root.querySelector<HTMLElement>(`[data-key="${CSS.escape(lastKey)}"]`) : null;
  return el ? [el] : [];
}

function flashOn(what: 'row' | 'entry'): void {
  const els = flashed(what);
  for (const e of els) e.classList.add('flash');
  window.setTimeout(() => { for (const e of els) e.classList.remove('flash'); }, FLASH_MS);
}

function showNotice(text: string): void {
  notice = text;
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = undefined;
    noticeTimer = undefined;
    if (view) render(view);
  }, NOTICE_MS);
  if (view) render(view);
}

window.addEventListener('message', (e: MessageEvent<ToPage>) => {
  const m = e.data;
  if (m.type === 'view') render(m.view, m.flash);
  else if (m.type === 'notice') showNotice(m.text);
});

// one line is the measure's height (it is inline-block, so its height is the line height)
const lineHeight = (): number => measure.getBoundingClientRect().height || 16;

function scrollFor(key: string): void {
  const s = scroller();
  if (!s) return;
  const line = lineHeight();
  const page = Math.max(line, s.clientHeight - line);
  const by = key === 'j' ? line : key === 'k' ? -line : key === 'PageDown' ? page : -page;
  s.scrollBy({ top: by });
}

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // VS Code's chords and shortcuts pass through
  if (!REPORTED.has(e.key)) return;
  e.preventDefault();
  if (SCROLL.has(e.key)) scrollFor(e.key);
  else if (e.repeat) return; // a held letter answers once
  lastKey = e.key;
  lastRow = undefined;
  post({ type: 'key', key: e.key });
});

root.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null;
  const row = t?.closest<HTMLButtonElement>('[data-row]');
  if (row) {
    if (row.disabled) return;
    lastRow = Number(row.dataset.row);
    lastKey = undefined;
    post({ type: 'press', row: lastRow });
    return;
  }
  const entry = t?.closest<HTMLElement>('[data-entry]');
  if (entry) post({ type: 'select', entry: Number(entry.dataset.entry) });
});

// the panel's width in cells of the editor font; posted only when it changes
let cols = 0;
function sendSize(): void {
  const cell = measure.getBoundingClientRect().width / 100;
  if (cell <= 0) return;
  const c = Math.floor(document.documentElement.clientWidth / cell);
  if (c <= 0 || c === cols) return;
  cols = c;
  post({ type: 'size', cols: c });
}

let resizeTimer: number | undefined;
new ResizeObserver(() => {
  if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(sendSize, RESIZE_MS);
}).observe(document.documentElement);

sendSize();
post({ type: 'ready' });
