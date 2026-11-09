// text: display-cell text for the pause window (durandal.nvim pause.lua :11-61). Every width is
// in cells (nvim_strwidth): East Asian wide and emoji-presentation characters take two, marks
// and joiners none. The models lay their panes out with these (plan decision 2).
export { plain } from './viewModel';

// given: the server's null is nothing (pause.lua given); null and missing are the same
export function given<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

// ZERO: marks, zero-width space to right-to-left mark (U+200B-U+200F), variation selectors
const ZERO = /[\p{Mn}\p{Me}​-‏︀-️]/u;
// WIDE: emoji presentation, Hangul Jamo, CJK radicals to symbols, kana to compatibility,
// CJK extension A and ideographs, Yi, Hangul syllables, compatibility ideographs and forms,
// full-width forms, supplementary ideographs
const WIDE = new RegExp(
  '[\\p{Emoji_Presentation}\\u1100-\\u115F\\u2E80-\\u303E\\u3041-\\u33FF\\u3400-\\u4DBF\\u4E00-\\u9FFF' +
  '\\uA000-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFF60\\uFFE0-\\uFFE6' +
  '\\u{20000}-\\u{3FFFD}]', 'u');

function cell(ch: string): number {
  if (ZERO.test(ch)) return 0;
  return WIDE.test(ch) ? 2 : 1;
}

export function width(s: string): number {
  let n = 0;
  for (const ch of s) n += cell(ch);
  return n;
}

// head: the longest start of s that fits w cells
function head(s: string, w: number): string {
  let out = '';
  let n = 0;
  for (const ch of s) {
    const c = cell(ch);
    if (n + c > w) break;
    out += ch;
    n += c;
  }
  return out;
}

// cut: s in w cells, ending in … when it was cut (pause.lua cut)
export function cut(s: string, w: number): string {
  if (width(s) <= w) return s;
  return head(s, Math.max(w - 1, 0)) + '…';
}

// pad: s with spaces to w cells; a longer s stays whole (pause.lua pad)
export function pad(s: string, w: number): string {
  return s + ' '.repeat(Math.max(w - width(s), 0));
}

// wrap: text in lines of at most w cells, broken at spaces and inside a word too long for a
// line; continued lines start with cont; each of text's own lines keeps its leading spaces
// (pause.lua M.wrap :19-44)
export function wrap(text: string, w: number, cont = ''): string[] {
  const limit = Math.max(w, width(cont) + 10);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = /^\s*/.exec(para)![0];
    let fresh = true;
    for (const word of para.split(/\s+/).filter(x => x !== '')) {
      const joined = fresh ? line + word : `${line} ${word}`;
      if (!fresh && width(joined) > limit) {
        out.push(line);
        line = cont + word;
      } else {
        line = joined;
      }
      fresh = false;
      while (width(line) > limit) {
        const h = head(line, limit);
        out.push(h);
        line = cont + line.slice(h.length);
      }
    }
    out.push(line);
  }
  return out;
}

// shortTest: a test id's short name, what follows the last `::` (pause.lua short)
export function shortTest(id: string): string {
  const m = /([^:]+)$/.exec(String(id));
  return m ? m[1] : String(id);
}
