import type { Line, Row, View } from '../src/pause/viewModel';

// render: the page's whole markup from the extension's View (spec §4.3, plan decision 2). Pure
// and DOM-free, so the root tsconfig compiles it for render.test.ts and the page bundles it.
// The model has already laid every line out in cells; this only maps span kinds to classes and
// names what can be clicked. No style attribute ever (the CSP allows no inline style).

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ENTITY[c]);

// lineHtml: a line's spans; kind k → class k-<k>; a key is a <kbd> badge (rows, titles, help)
export function lineHtml(l: Line): string {
  return l.map(s => {
    if (s.text === '') return '';
    const t = esc(s.text);
    if (!s.kind) return t;
    return s.kind === 'key' ? `<kbd class="k-key">${t}</kbd>` : `<span class="k-${s.kind}">${t}</span>`;
  }).join('');
}

// block: one line as an element; an empty line holds a space so it keeps its height under pre
const block = (tag: 'div' | 'span', cls: string, l: Line, attrs = ''): string =>
  `<${tag} class="${cls}"${attrs}>${lineHtml(l) || ' '}</${tag}>`;

function situation(v: View): string {
  const title = block('div', 'line title', v.narrow ? v.short : v.title);
  const lines = v.lines.map((l, i) => {
    const e = v.entryAt[i] ?? -1;
    if (e < 0) return block('div', 'line', l);
    return block('div', `line entry${e === v.selected ? ' selected' : ''}`, l, ` data-entry="${e}"`);
  });
  return `<section id="sit">${title}${lines.join('')}</section>`;
}

function row(r: Row, i: number): string {
  const key = r.key ? ` data-key="${esc(r.key)}"` : '';
  const off = r.pressable ? '' : ' disabled';
  const lines = r.lines.map(l => block('span', 'line', l)).join('');
  return `<button type="button" class="row" data-row="${i}"${key}${off}>${lines}</button>`;
}

// offers: the rows (the reason above them for a proposal), or the running status line alone
function offers(v: View): string {
  if (v.status) return `<section id="off">${block('div', 'line status', v.status)}</section>`;
  const reason = v.reason ? block('div', 'line reason', v.reason) : '';
  return `<section id="off">${reason}${v.rows.map(row).join('')}</section>`;
}

// diff: the selected entry's diff, or the key table while ? is on
function diff(v: View): string {
  if (v.help) return `<section id="diff" class="help">${v.help.map(l => block('div', 'line', l)).join('')}</section>`;
  const lines = v.diff.lines.map(l => block('div', 'line', l)).join('');
  return `<section id="diff">${block('div', 'line title', v.diff.title)}${lines}</section>`;
}

const footer = (v: View, notice: string | undefined): string =>
  notice ? `<footer id="foot" class="line notice">${esc(notice)}</footer>` : `<footer id="foot" class="line">${esc(v.legend)}</footer>`;

// html: the inner HTML of the page's #root
export function html(view: View, notice?: string): string {
  const cls = view.narrow ? ` class="narrow${view.flipped ? ' flipped' : ''}"` : '';
  return `<main${cls} data-state="${view.state}">${situation(view)}${offers(view)}${diff(view)}${footer(view, notice)}</main>`;
}
