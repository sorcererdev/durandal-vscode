// The plan glyphs (spec §3.3, §3.4; durandal.nvim plans.lua:17-19). No vscode import.
import type { Tok } from './legend';

export const GLYPH_NAMES = ['todo', 'done', 'question', 'test', 'also', 'dash', 'path', 'hex', 'queued', 'checking', 'right', 'wrong', 'unsure'] as const;
export type GlyphName = typeof GLYPH_NAMES[number];
export type Glyphs = Record<GlyphName, string>;

// The markers' glyphs (an empty one hides its text and shows nothing), then the verdict margin's.
export const DEFAULT_GLYPHS: Glyphs = {
  todo: '☐', done: '☑', question: '?', test: '·', also: '+', dash: '', path: '', hex: '',
  queued: '○', checking: '…', right: '✓', wrong: '✗', unsure: '?',
};

// Conceal: hide columns [start, end) of LINE and show GLYPH in their place ('' hides only).
export interface Conceal { line: number; start: number; end: number; glyph: string }

// concealOf (nvim conceal_of): markers by their trimmed text, anchor paths and fingerprints.
// A non-empty glyph on a marker whose last character is a space stops one column early, so the
// glyph keeps the space before the text. A token running past its line gives nothing.
export function concealOf(tok: Tok, lineText: string, glyphs: Glyphs): Conceal | undefined {
  if (tok.start + tok.length > lineText.length) return undefined;
  let name: GlyphName;
  if (tok.type === 'planAnchorPath') name = 'path';
  else if (tok.type === 'planFingerprint') name = 'hex';
  else if (tok.type === 'planMarker') {
    const t = lineText.slice(tok.start, tok.start + tok.length).trim();
    name = t === '- [ ]' ? 'todo'
      : t === '- [x]' || t === '- [X]' ? 'done'
        : t === '- ?' ? 'question'
          : t === '- test:' ? 'test'
            : t === '- also' ? 'also'
              : 'dash';
  } else return undefined;
  const glyph = glyphs[name];
  let end = tok.start + tok.length;
  if (glyph !== '' && tok.type === 'planMarker' && lineText[end - 1] === ' ') end -= 1;
  return { line: tok.line, start: tok.start, end, glyph };
}

// conceals: the marks for a document at VERSION. The tokens' own version must match: tokens
// lag an edit by one request, and old columns must not be drawn onto new text (undefined:
// leave what is drawn). SKIP holds the cursor lines, which show raw text (nvim concealcursor="").
export function conceals(tokens: { version: number; toks: readonly Tok[] } | undefined, version: number,
  lineAt: (line: number) => string | undefined, glyphs: Glyphs, skip: ReadonlySet<number>): Conceal[] | undefined {
  if (!tokens) return [];
  if (tokens.version !== version) return undefined;
  const out: Conceal[] = [];
  for (const t of tokens.toks) {
    if (skip.has(t.line)) continue;
    const text = lineAt(t.line);
    if (text === undefined) continue;
    const c = concealOf(t, text, glyphs);
    if (c) out.push(c);
  }
  return out;
}
